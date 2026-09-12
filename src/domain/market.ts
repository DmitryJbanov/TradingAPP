export type Category = "crypto" | "stocks" | "indices" | "forex";
export type Timeframe = "15m" | "1h" | "4h" | "1d";
export type CandleInterval = Timeframe | "30m" | "2h" | "8h" | "12h";
export const candleIntervals: Record<CandleInterval, number> = {
  "15m": 900,
  "30m": 1800,
  "1h": 3600,
  "2h": 7200,
  "4h": 14400,
  "8h": 28800,
  "12h": 43200,
  "1d": 86400,
};
export type Source = "live" | "demo" | "stale";
export interface Instrument {
  symbol: string;
  base: string;
  name: string;
  category: Category;
  sector: string;
  quote: string;
  seed: number;
}
export interface Quote extends Instrument {
  price: number;
  change: number;
  volume: number;
  high: number;
  low: number;
  source: Source;
  provider: string;
  asOf: string;
}
export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}
export interface MarketResponse {
  data: Quote[];
  asOf: string;
  warning?: string;
}
export interface CandleResponse {
  instrument?: Instrument;
  /** Exchange PRICE_FILTER tickSize; may be absent when metadata is unavailable. */
  tickSize?: number;
  data: Candle[];
  source: Source;
  provider: string;
  asOf: string;
  warning?: string;
}
export interface LogEntry {
  id: number;
  time: string;
  level: "INFO" | "WARN" | "ERROR";
  message: string;
}
export const intervals: Record<Timeframe, number> = {
  "15m": 900,
  "1h": 3600,
  "4h": 14400,
  "1d": 86400,
};
export const categoryNames: Record<Category, string> = {
  crypto: "Криптовалюты",
  stocks: "Акции",
  indices: "Индексы",
  forex: "Валюты",
};
export function deviation(current: number, cursor: number) {
  return cursor > 0 ? (current / cursor - 1) * 100 : null;
}
export function priceFormat(n: number) {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: n < 1 ? 6 : n < 10 ? 4 : 2,
  }).format(n);
}
export function compact(n: number) {
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 2,
  }).format(n);
}
