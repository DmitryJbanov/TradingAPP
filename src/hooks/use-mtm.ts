"use client";
import { useMemo } from "react";
import type { CandleResponse, Timeframe } from "../domain/market";
import type { IndicatorInstance } from "../domain/workspace";

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
      (JSON.parse(signature) as IndicatorInstance[]).map((i) => {
        const bars = main?.data ?? [],
          period = Math.max(1, Math.min(100, i.period || 60));
        const values = bars.map((bar, index) =>
          index >= period ? bar.close - bars[index - period].close : null,
        );
        const maPeriod = Math.max(
          1,
          Math.min(
            100,
            Number((i.params as { maPeriod?: number } | undefined)?.maPeriod) ||
              60,
          ),
        );
        const points = bars.flatMap((bar, index) => {
          const value = values[index];
          if (value === null) return [];
          const window = values
            .slice(Math.max(period, index - maPeriod + 1), index + 1)
            .filter((x): x is number => x !== null);
          return [
            {
              time: bar.time,
              value,
              average: window.reduce((sum, x) => sum + x, 0) / window.length,
            },
          ];
        });
        return { id: i.id, points };
      }),
    [signature, main],
  );
}
