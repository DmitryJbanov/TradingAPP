export const exchanges = {
  binance: "Binance",
  okx: "OKX",
  bybit: "Bybit",
  mexc: "MEXC",
} as const;
export type MarketExchange = keyof typeof exchanges;
export const isMarketExchange = (value: unknown): value is MarketExchange =>
  typeof value === "string" && Object.hasOwn(exchanges, value);
export const marketSymbol = (symbol: string) =>
  symbol.replace(/^(FUTURES|SPOT):/, "");
