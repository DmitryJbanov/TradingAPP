"use client";
import { useMemo } from "react";
import type { CandleResponse, Timeframe } from "../domain/market";
import type { IndicatorInstance } from "../domain/workspace";
import { computeStochRsi } from "../indicators/stoch-rsi";
export interface StochRsiPane {
  id: string;
  points: ReturnType<typeof computeStochRsi>;
}
export function useStochRsi(
  timeframe: Timeframe,
  main: CandleResponse | undefined,
  indicators: IndicatorInstance[],
): StochRsiPane[] {
  const signature = JSON.stringify(
    indicators.filter(
      (i) =>
        i.definitionId === "stoch-rsi" &&
        i.enabled &&
        (!i.timeframes || i.timeframes.includes(timeframe)),
    ),
  );
  return useMemo(
    () =>
      (JSON.parse(signature) as IndicatorInstance[]).map((i) => ({
        id: i.id,
        points: computeStochRsi(main?.data ?? [], i.params),
      })),
    [signature, main],
  );
}
