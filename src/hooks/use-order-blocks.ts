"use client";
import { useMemo } from "react";
import type { CandleResponse, Timeframe } from "../domain/market";
import type { IndicatorInstance } from "../domain/workspace";
import {
  computeOrderBlocks,
  type OrderBlockResult,
} from "../indicators/order-blocks";
import {
  normalizeOrderBlockParams,
  type OrderBlockParams,
} from "../indicators/order-blocks-settings";

export interface OrderBlockOverlay {
  id: string;
  params: OrderBlockParams;
  result: OrderBlockResult;
}

export function useOrderBlocks(
  timeframe: Timeframe,
  main: CandleResponse | undefined,
  indicators: IndicatorInstance[],
): OrderBlockOverlay[] {
  const signature = JSON.stringify(
    indicators.filter(
      (i) =>
        i.definitionId === "sonarlab-ob" &&
        i.enabled &&
        (!i.timeframes || i.timeframes.includes(timeframe)),
    ),
  );
  return useMemo(
    () =>
      (JSON.parse(signature) as IndicatorInstance[]).map((i) => {
        const params = normalizeOrderBlockParams(i.params);
        return {
          id: i.id,
          params,
          result: computeOrderBlocks(main?.data ?? [], params),
        };
      }),
    [main, signature],
  );
}
