"use client";
import { useCallback, useEffect, useRef, useState } from "react";
/** Abort and generation guard prevent a slow previous symbol from replacing the active one. */
export function useResource<T>(url: string, period = 30000) {
  const [data, setData] = useState<T>();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const controller = useRef<AbortController | null>(null);
  const version = useRef(0);
  const refresh = useCallback(
    async (force = false) => {
      controller.current?.abort();
      const abort = new AbortController();
      controller.current = abort;
      const id = ++version.current;
      setLoading(true);
      try {
        const r = await fetch(
          url + (force ? (url.includes("?") ? "&" : "?") + "refresh=1" : ""),
          { signal: abort.signal },
        );
        if (!r.ok) throw Error(`HTTP ${r.status}`);
        const next = await r.json();
        if (id === version.current) {
          setData(next as T);
          setError("");
        }
      } catch (e) {
        if (!abort.signal.aborted && id === version.current)
          setError(e instanceof Error ? e.message : "Нет связи с сервером");
      } finally {
        if (id === version.current) setLoading(false);
      }
    },
    [url],
  );
  useEffect(() => {
    setData(undefined);
    void refresh();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, period);
    return () => {
      clearInterval(timer);
      controller.current?.abort();
      version.current++;
    };
  }, [refresh, period]);
  return { data, error, loading, refresh };
}
export function useStored<T>(key: string, initial: T) {
  const [value, setValue] = useState(initial);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw) setValue(JSON.parse(raw));
    } catch {}
    setReady(true);
  }, [key]);
  useEffect(() => {
    if (ready)
      try {
        localStorage.setItem(key, JSON.stringify(value));
      } catch {}
  }, [key, value, ready]);
  return [value, setValue] as const;
}
