"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import type {
  CandleInterval,
  CandleResponse,
  Timeframe,
} from "../domain/market";
import type { IndicatorInstance } from "../domain/workspace";
import { computeDrz } from "../indicators/drz";
import { computeSmc, requiredSmcIntervals } from "../indicators/smc";
import type { OverlayResult } from "../indicators/overlay-model";
export interface PriceOverlay {
  id: string;
  name: string;
  result: OverlayResult;
}
export function useOverlays(
  symbol: string,
  timeframe: Timeframe,
  main: CandleResponse | undefined,
  indicators: IndicatorInstance[],
  count: number,
  refreshToken: number,
) {
  const signature = JSON.stringify(
    indicators.filter(
      (i) =>
        ["drz", "smc"].includes(i.definitionId) &&
        i.enabled &&
        (!i.timeframes || i.timeframes.includes(timeframe)),
    ),
  );
  const active = useMemo(
    () => JSON.parse(signature) as IndicatorInstance[],
    [signature],
  );
  const requests = [
    ...new Set(
      active
        .filter((i) => i.definitionId === "smc")
        .flatMap((i) => requiredSmcIntervals(i.params, timeframe)),
    ),
  ]
    .sort()
    .join(",");
  const key = `${symbol}:${timeframe}:${count}:${main?.source}:${main?.provider}:${main?.asOf}:${requests}:${refreshToken}`,
    lastRefresh = useRef(refreshToken);
  const [state, setState] = useState<{
    key: string;
    histories: Partial<Record<CandleInterval, CandleResponse["data"]>>;
    warnings: string[];
  }>({ key: "", histories: {}, warnings: [] });
  useEffect(() => {
    if (!main || !requests) return;
    const abort = new AbortController(),
      force = lastRefresh.current !== refreshToken;
    lastRefresh.current = refreshToken;
    const frames = requests.split(",") as CandleInterval[];
    void Promise.allSettled(
      frames.map(async (tf) => {
        const response = await fetch(
          `/api/candles?symbol=${encodeURIComponent(symbol)}&interval=${tf}&count=${count}${main.source === "demo" ? "&demo=1" : ""}${force ? "&refresh=1" : ""}`,
          { signal: abort.signal },
        );
        if (!response.ok) throw Error(`HTTP ${response.status}`);
        const data = (await response.json()) as CandleResponse;
        if (data.source !== main.source || data.provider !== main.provider)
          throw Error("Несовместимые источники");
        return { tf, data };
      }),
    ).then((results) => {
      if (abort.signal.aborted) return;
      const histories: Partial<Record<CandleInterval, CandleResponse["data"]>> =
          {},
        warnings: string[] = [];
      results.forEach((r, i) => {
        if (r.status === "fulfilled") {
          histories[r.value.tf] = r.value.data.data;
          if (r.value.data.source !== "demo" && r.value.data.warning)
            warnings.push(`SMC ${r.value.tf}: ${r.value.data.warning}`);
        } else
          warnings.push(
            `SMC ${frames[i]}: история недоступна; зависимые элементы скрыты.`,
          );
      });
      setState({ key, histories, warnings });
    });
    return () => abort.abort();
  }, [key]);
  const ready = state.key === key;
  const overlays = useMemo<PriceOverlay[]>(
    () =>
      active.map((i) => ({
        id: i.id,
        name: i.definitionId.toUpperCase(),
        result:
          i.definitionId === "drz"
            ? computeDrz(main?.data ?? [], i.params, {
                tickSize: main?.tickSize,
              })
            : computeSmc(main?.data ?? [], i.params, {
                interval: timeframe,
                histories: ready ? state.histories : {},
                now: main ? Date.parse(main.asOf) / 1000 : undefined,
              }),
      })),
    [active, main, timeframe, ready, state.histories],
  );
  return {
    overlays,
    loading: !!main && !!requests && !ready,
    warnings: [
      ...new Set([
        ...(ready ? state.warnings : []),
        ...overlays.flatMap((o) => o.result.warnings),
      ]),
    ],
  };
}
