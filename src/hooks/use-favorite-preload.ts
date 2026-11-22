import { useEffect } from "react";
import { cachedPairValue, fetchCandles } from "./pair-cache";
import type { Timeframe, CandleResponse } from "../domain/market";
import type { MarketExchange } from "../domain/exchanges";

// Background history only: no indicators, collectors or expensive Pine workers.
export function useFavoritePreload(
  favorites: string[],
  exchange: MarketExchange,
  timeframe: Timeframe,
  count: number,
  enabled: boolean,
  current = "",
) {
  const signature = favorites.join("|");
  useEffect(() => {
    if (!enabled) return;
    let stopped = false,
      index = 0;
    const pairs = [...new Set(favorites)].filter((pair) => pair !== current && (exchange === "finam" ? pair.startsWith("FINAM:") : !pair.startsWith("FINAM:")));
    const worker = async () => {
      // Give the active chart and its indicators priority on first render.
      await new Promise((resolve) => setTimeout(resolve, 1200));
      while (!stopped && index < pairs.length) {
        const symbol = pairs[index++];
        const url = `/api/candles?symbol=${encodeURIComponent(symbol)}&interval=${timeframe}&count=${count}&exchange=${exchange}`;
        if (cachedPairValue<CandleResponse>(symbol, url, 60000)) continue;
        if (document.visibilityState !== "visible") {
          index--;
          await new Promise((resolve) => setTimeout(resolve, 1500));
          continue;
        }
        try {
          await fetchCandles(url, { priority: "low" });
        } catch {}
        await new Promise((resolve) => setTimeout(resolve, exchange === "finam" ? 2000 : 250));
      }
    };
    void worker();
    void worker();
    return () => {
      stopped = true;
    };
  }, [signature, exchange, timeframe, count, enabled, current]);
}
