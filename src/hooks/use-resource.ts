"use client";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import {
  candleCachePair,
  cachedPairValue,
  saveCandles,
  clearPairCache,
} from "./pair-cache";
import type { CandleResponse } from "../domain/market";
import { useProfiles } from "../components/profile-provider";
/** Abort and generation guard prevent a slow previous symbol from replacing the active one. */
export function useResource<T>(url: string, period = 30000, enabled = true) {
  const pair = candleCachePair(url);
  const initialCache = pair ? cachedPairValue<T>(pair, url) : undefined;
  const [data, setData] = useState<T | undefined>(initialCache);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(!initialCache);
  const controller = useRef<AbortController | null>(null);
  const version = useRef(0);
  const inFlight = useRef(false);
  const loadedUrl = useRef(initialCache ? url : "");
  const refresh = useCallback(
    async (force = false) => {
      controller.current?.abort();
      const abort = new AbortController();
      controller.current = abort;
      const id = ++version.current;
      inFlight.current = true;
      setLoading(true);
      try {
        const r = await fetch(
          url + (force ? (url.includes("?") ? "&" : "?") + "refresh=1" : ""),
          { signal: abort.signal },
        );
        if (!r.ok) {
          const body = (await r.json().catch(() => ({}))) as { error?: string };
          throw Error(body.error || `HTTP ${r.status}`);
        }
        const next = await r.json();
        if (id === version.current) {
          loadedUrl.current = url;
          if (pair) saveCandles(url, next as CandleResponse);
          setData(next as T);
          setError("");
        }
      } catch (e) {
        if (!abort.signal.aborted && id === version.current)
          setError(e instanceof Error ? e.message : "Нет связи с сервером");
      } finally {
        if (id === version.current) {
          inFlight.current = false;
          setLoading(false);
        }
      }
    },
    [url, pair],
  );
  useEffect(() => {
    const cached = pair ? cachedPairValue<T>(pair, url) : undefined;
    loadedUrl.current = cached ? url : "";
    setData(cached);
    setError("");
    setLoading(!cached);
    if (!enabled) {
      setLoading(false);
      return;
    }
    if (!cached) void refresh();
    const timer =
      period > 0
        ? setInterval(() => {
            if (document.visibilityState === "visible" && !inFlight.current)
              void refresh();
          }, period)
        : null;
    return () => {
      if (timer !== null) clearInterval(timer);
      controller.current?.abort();
      version.current++;
    };
  }, [refresh, period, enabled]);
  return {
    data: loadedUrl.current === url ? data : initialCache,
    error,
    loading,
    refresh,
  };
}
export function useStored<T>(key: string, initial: T) {
  const profiles = useProfiles();
  const saveProfile = profiles?.setValue;
  const lastProfile = useRef(profiles?.active);
  if (lastProfile.current !== profiles?.active) {
    clearPairCache();
    lastProfile.current = profiles?.active;
  }
  const [value, setValue] = useState<T>(() => {
    if (profiles) return profiles.getValue(key, initial);
    if (typeof window !== "undefined") {
      try {
        const stored = localStorage.getItem(key);
        if (stored !== null) return JSON.parse(stored) as T;
      } catch {}
    }
    return initial;
  });
  const current = useRef(value);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (profiles) {
      const next = profiles.getValue(key, initial);
      current.current = next;
      setValue(next);
      setReady(true);
      return;
    }
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        const stored = JSON.parse(raw) as T;
        current.current = stored;
        setValue(stored);
      }
    } catch {}
    setReady(true);
  }, [key, profiles?.active, profiles?.settings]);
  useEffect(() => {
    if (ready && !profiles)
      try {
        localStorage.setItem(key, JSON.stringify(value));
      } catch {}
  }, [key, value, ready, profiles]);
  const update = useCallback<Dispatch<SetStateAction<T>>>(
    (next) => {
      const resolved =
        typeof next === "function"
          ? (next as (old: T) => T)(current.current)
          : next;
      current.current = resolved;
      setValue(resolved);
      saveProfile?.(key, resolved);
    },
    [key, saveProfile],
  );
  return [value, update] as const;
}
