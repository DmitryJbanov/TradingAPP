import {
  intervals,
  type Candle,
  type Quote,
  type Instrument,
  type Timeframe,
} from "./market";
function hash(s: string) {
  return [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
}
/** Fixed 15-minute base process makes all timeframe closes and OHLC aggregates consistent. */
export function demoCandles(
  item: Instrument,
  tf: Timeframe,
  now = Date.now(),
): Candle[] {
  const step = intervals[tf],
    end = Math.floor(now / 1000 / step) * step,
    seed = hash(item.symbol);
  const currentBase = Math.floor(now / 1000 / 900),
    width = step / 900;
  const value = (n: number) =>
    item.seed *
    (1 +
      0.026 * Math.sin(n * 0.011 + seed) +
      0.014 * Math.sin(n * 0.041 + seed) +
      0.009 * Math.cos(n * 0.089 + seed));
  return Array.from({ length: 400 }, (_, i) => {
    const time = end - (399 - i) * step,
      first = time / 900,
      last = Math.min(first + width - 1, currentBase);
    let high = -Infinity,
      low = Infinity,
      volume = 0;
    for (let n = first; n <= last; n++) {
      const a = value(n - 1),
        b = value(n),
        pad = item.seed * (0.0005 + 0.001 * Math.abs(Math.sin(n + seed)));
      high = Math.max(high, a + pad, b + pad);
      low = Math.min(low, a - pad, b - pad);
      volume += 100 + Math.abs(Math.sin(n + seed)) * 9000;
    }
    return {
      time,
      open: value(first - 1),
      close: value(last),
      high,
      low,
      volume,
    };
  });
}
export function demoQuote(item: Instrument, now = Date.now()): Quote {
  const bars = demoCandles(item, "15m", now),
    last = bars.at(-1)!,
    prev = bars.at(-97)!,
    day = bars.slice(-96);
  return {
    ...item,
    price: last.close,
    change: (last.close / prev.close - 1) * 100,
    volume: item.seed * ((hash(item.symbol) % 400000) + 10000),
    high: Math.max(...day.map((x) => x.high)),
    low: Math.min(...day.map((x) => x.low)),
    source: "demo",
    provider: "Demo",
    asOf: new Date(now).toISOString(),
  };
}
