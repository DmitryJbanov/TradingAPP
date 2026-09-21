import type { Candle } from "../domain/market";
import { rsi, sma, stochastic } from "./pine-math";

export const stochSources = [
  "close",
  "open",
  "high",
  "low",
  "hl2",
  "hlc3",
  "ohlc4",
] as const;
export interface StochRsiParams {
  smoothK: number;
  smoothD: number;
  lengthRSI: number;
  lengthStoch: number;
  source: (typeof stochSources)[number];
}
export const stochRsiDefaults: StochRsiParams = {
  smoothK: 3,
  smoothD: 3,
  lengthRSI: 14,
  lengthStoch: 14,
  source: "close",
};
export function normalizeStochRsiParams(raw: unknown): StochRsiParams {
  const p = (raw && typeof raw === "object" ? raw : {}) as Record<
    string,
    unknown
  >;
  const length = (key: "smoothK" | "smoothD" | "lengthRSI" | "lengthStoch") =>
    typeof p[key] === "number" && Number.isInteger(p[key]) && p[key] >= 1
      ? (p[key] as number)
      : stochRsiDefaults[key];
  return {
    smoothK: length("smoothK"),
    smoothD: length("smoothD"),
    lengthRSI: length("lengthRSI"),
    lengthStoch: length("lengthStoch"),
    source: stochSources.includes(p.source as StochRsiParams["source"])
      ? (p.source as StochRsiParams["source"])
      : "close",
  };
}
export interface StochRsiPoint {
  time: number;
  k: number | null;
  d: number | null;
}
/** RSI (Wilder RMA), stochastic of RSI, then the two Pine SMA smoothings. */
export function computeStochRsi(
  bars: Candle[],
  raw: unknown = {},
): StochRsiPoint[] {
  const p = normalizeStochRsiParams(raw);
  const source = bars.map((b) => {
    switch (p.source) {
      case "hl2":
        return (b.high + b.low) / 2;
      case "hlc3":
        return (b.high + b.low + b.close) / 3;
      case "ohlc4":
        return (b.open + b.high + b.low + b.close) / 4;
      default:
        return b[p.source];
    }
  });
  const k = sma(stochastic(rsi(source, p.lengthRSI), p.lengthStoch), p.smoothK);
  const d = sma(k, p.smoothD);
  return bars.map((b, i) => ({ time: b.time, k: k[i], d: d[i] }));
}
