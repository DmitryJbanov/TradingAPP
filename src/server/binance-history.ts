import type { Candle, CandleInterval } from "../domain/market";
export const binanceEndpoint = (symbol: string) =>
  symbol === "HYPEUSDT"
    ? {
        root: "https://fapi.binance.com",
        path: "/fapi/v1",
        name: "Binance Futures",
      }
    : {
        root: "https://data-api.binance.vision",
        path: "/api/v3",
        name: "Binance",
      };
/** Backward pagination; partial history stays LIVE and is explicitly marked. */
export async function loadBinanceHistory(
  symbol: string,
  interval: CandleInterval,
  count: number,
  json: (url: string) => Promise<unknown>,
): Promise<{ bars: Candle[]; warning?: string }> {
  const endpoint = binanceEndpoint(symbol),
    byTime = new Map<number, Candle>();
  let endTime: number | undefined, warning: string | undefined;
  for (let page = 0; page < 5 && byTime.size < count; page++) {
    const limit = Math.min(1000, count - byTime.size),
      query = new URLSearchParams({ symbol, interval, limit: String(limit) });
    if (endTime !== undefined) query.set("endTime", String(endTime));
    try {
      const data = await json(
        `${endpoint.root}${endpoint.path}/klines?${query}`,
      );
      if (!Array.isArray(data)) throw Error("Invalid response");
      if (!data.length) break;
      const batch = data.map((row: unknown): Candle => {
        if (!Array.isArray(row)) throw Error("Invalid row");
        const [time, open, high, low, close, volume] = row.map(Number);
        if (
          ![time, open, high, low, close, volume].every(Number.isFinite) ||
          !Number.isInteger(time) ||
          time < 0 ||
          low <= 0 ||
          volume < 0 ||
          high < Math.max(open, close) ||
          low > Math.min(open, close)
        )
          throw Error("Invalid OHLCV");
        return { time: time / 1000, open, high, low, close, volume };
      });
      const size = byTime.size;
      for (const bar of batch)
        if (endTime === undefined || bar.time * 1000 <= endTime)
          byTime.set(bar.time, bar);
      if (byTime.size === size) break;
      endTime = Math.min(...batch.map((b) => b.time * 1000)) - 1;
      if (batch.length < limit) break;
    } catch (e) {
      if (!byTime.size) throw e;
      warning = "Не удалось загрузить старую часть истории";
      break;
    }
  }
  const bars = [...byTime.values()]
    .sort((a, b) => a.time - b.time)
    .slice(-count);
  if (!bars.length) throw Error("Empty history");
  if (bars.length < count)
    warning = `${warning ?? "Доступна неполная история"}: ${bars.length} из ${count} свечей.`;
  return { bars, warning };
}
