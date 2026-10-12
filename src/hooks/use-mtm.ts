"use client";
import { cachedCompute, fetchCandles } from "./pair-cache";
import { useMemo } from "react";
import type { CandleResponse, Timeframe } from "../domain/market";
import type { IndicatorInstance } from "../domain/workspace";
import { computeMtm } from "../indicators/mtm";

export function useMtm(
  timeframe: Timeframe,
  main: CandleResponse | undefined,
  indicators: IndicatorInstance[],
) {
  const signature = JSON.stringify(
    indicators.filter(
      (i) =>
        i.definitionId === "mtm" &&
        i.enabled &&
        (!i.timeframes || i.timeframes.includes(timeframe)),
    ),
  );
  return useMemo(
    () =>
      (JSON.parse(signature) as IndicatorInstance[]).map((i) => ({
        id: i.id,
        points: cachedCompute(
          main,
          timeframe,
          "computeMtm",
          [i.period, i.params],
          () =>
            computeMtm(main?.data ?? [], {
              period: i.period,
              maPeriod: Number(
                (i.params as { maPeriod?: number } | undefined)?.maPeriod,
              ),
            }),
        ),
      })),
    [signature, main],
  );
}
