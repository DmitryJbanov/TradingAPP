"use client";
import { useEffect, useState } from "react";
import {
  calculationParams,
  selectionKey,
  type CoinglassParams,
  type CoinglassPreview,
} from "../domain/coinglass";

/** An obsolete response is never presented or applied for new slider values. */
export function useCoinglassPreview(
  symbol: string,
  snapshotId: string | undefined,
  params: CoinglassParams,
  enabled = true,
) {
  const key =
    snapshotId && enabled ? selectionKey(symbol, snapshotId, params) : "";
  const source = JSON.stringify([symbol, snapshotId]);
  const payload = JSON.stringify({
    symbol,
    snapshotId,
    params: calculationParams(params),
  });
  const [state, setState] = useState<{
    key: string;
    source?: string;
    data?: CoinglassPreview;
    error?: string;
  }>({ key: "" });
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!key) return;
    const controller = new AbortController();
    let active = true;
    const timer = setTimeout(async () => {
      try {
        const response = await fetch("/api/coinglass/preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: payload,
          signal: controller.signal,
        });
        const body = (await response.json()) as CoinglassPreview & {
          error?: string;
        };
        if (!response.ok) throw Error(body.error || `HTTP ${response.status}`);
        if (active) setState({ key, source, data: body });
      } catch (e) {
        if (active)
          setState({
            key,
            error: e instanceof Error ? e.message : "Ошибка расчёта",
          });
      }
    }, 180);
    return () => {
      active = false;
      clearTimeout(timer);
      controller.abort();
    };
  }, [key, source, payload, retry]);
  return {
    data: key && state.key === key ? state.data : undefined,
    previousData: key && state.source === source ? state.data : undefined,
    error: key && state.key === key ? state.error : undefined,
    loading: !!key && (state.key !== key || (!state.data && !state.error)),
    retry: () => {
      setState({ key: "" });
      setRetry((n) => n + 1);
    },
  };
}

/** Refresh age badges without impure reads during render. */
export function useSnapshotClock() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(timer);
  }, []);
  return now;
}
