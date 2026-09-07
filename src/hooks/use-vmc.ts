"use client";
import { useEffect, useMemo, useState, useRef } from "react";
import type {
  CandleInterval,
  CandleResponse,
  Timeframe,
} from "../domain/market";
import type { IndicatorInstance } from "../domain/workspace";
import {
  computeVmc,
  requiredVmcIntervals,
  type VmcResult,
} from "../indicators/vmc";
import {
  normalizeVmcParams,
  normalizeVmcStyle,
  type VmcParams,
  type VmcStyle,
} from "../indicators/vmc-settings";
export interface VmcPane {
  id: string;
  params: VmcParams;
  style: VmcStyle;
  result: VmcResult;
}
export function useVmc(
  symbol: string,
  timeframe: Timeframe,
  main: CandleResponse | undefined,
  indicators: IndicatorInstance[],
  refreshToken = 0,
) {
  const lastRefresh = useRef(refreshToken);
  const signature = JSON.stringify(
    indicators.filter(
      (i) =>
        i.definitionId === "vmc" &&
        i.enabled &&
        (!i.timeframes || i.timeframes.includes(timeframe)),
    ),
  );
  const active = useMemo(
    () =>
      (JSON.parse(signature) as IndicatorInstance[]).map((i) => ({
        id: i.id,
        params: normalizeVmcParams(i.params),
        style: normalizeVmcStyle(i.style),
      })),
    [signature],
  );
  const requests = [
    ...new Set(active.flatMap((i) => requiredVmcIntervals(i.params))),
  ]
    .filter((t) => t !== timeframe)
    .sort()
    .join(",");
  const key = `${symbol}:${timeframe}:${main?.source}:${main?.provider}:${main?.asOf}:${requests}:${refreshToken}`;
  const [state, setState] = useState<{
    key: string;
    histories: Partial<Record<CandleInterval, CandleResponse["data"]>>;
    warnings: string[];
  }>({ key: "", histories: {}, warnings: [] });
  useEffect(() => {
    if (!main || !requests) return;
    const force = lastRefresh.current !== refreshToken;
    lastRefresh.current = refreshToken;
    const abort = new AbortController();
    const tfs = requests.split(",") as CandleInterval[];
    void Promise.allSettled(
      tfs.map(async (tf) => {
        const response = await fetch(
          `/api/candles?symbol=${encodeURIComponent(symbol)}&interval=${tf}${main.source === "demo" ? "&demo=1" : ""}${force ? "&refresh=1" : ""}`,
          { signal: abort.signal },
        );
        if (!response.ok) throw Error(`${tf}: HTTP ${response.status}`);
        const data = (await response.json()) as CandleResponse;
        if (data.source !== main.source || data.provider !== main.provider)
          throw Error(`${tf}: источник отличается от основного графика`);
        return { tf, bars: data.data };
      }),
    ).then((results) => {
      if (abort.signal.aborted) return;
      const histories: Partial<Record<CandleInterval, CandleResponse["data"]>> =
          {},
        warnings: string[] = [];
      results.forEach((r, index) => {
        if (r.status === "fulfilled") histories[r.value.tf] = r.value.bars;
        else
          warnings.push(
            `${tfs[index]}: дополнительные свечи недоступны; сигналы по ним не показаны.`,
          );
      });
      setState({ key, histories, warnings });
    });
    return () => abort.abort();
  }, [key]);
  const ready = state.key === key;
  const panes = useMemo<VmcPane[]>(
    () =>
      active.map((i) => ({
        ...i,
        result: computeVmc(main?.data ?? [], i.params, {
          interval: timeframe,
          histories: ready ? state.histories : {},
          now: main ? Date.parse(main.asOf) / 1000 : undefined,
        }),
      })),
    [active, main, timeframe, ready, state.histories],
  );
  const warnings = [
    ...new Set([
      ...(ready ? state.warnings : []),
      ...panes.flatMap((i) => i.result.warnings),
    ]),
  ];
  return { panes, warnings, loading: !!main && !!requests && !ready };
}
