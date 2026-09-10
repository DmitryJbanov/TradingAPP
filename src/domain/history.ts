export const DEFAULT_CANDLE_COUNT = 1000;
export const validCandleCount = (v: unknown): v is number =>
  typeof v === "number" && Number.isInteger(v) && v >= 300 && v <= 4000;
export const candleCount = (v: unknown) =>
  validCandleCount(v) ? v : DEFAULT_CANDLE_COUNT;
