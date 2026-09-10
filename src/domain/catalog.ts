import type { Instrument } from "./market";
const coins: [string, string, number, string][] = [
  ["BTC", "Bitcoin", 97432, "Layer 1"],
  ["ETH", "Ethereum", 3241, "Layer 1"],
  ["SOL", "Solana", 184, "Layer 1"],
  ["HYPE", "Hyperliquid · Perpetual", 40, "DeFi"],
  ["BNB", "BNB", 682, "Layer 1"],
  ["XRP", "XRP", 2.34, "Payments"],
  ["DOGE", "Dogecoin", 0.247, "Meme"],
  ["ADA", "Cardano", 0.72, "Layer 1"],
  ["AVAX", "Avalanche", 34.1, "Layer 1"],
  ["LINK", "Chainlink", 19.8, "DeFi"],
  ["SUI", "Sui", 3.42, "Layer 1"],
  ["DOT", "Polkadot", 5.8, "Layer 1"],
  ["LTC", "Litecoin", 104, "Payments"],
  ["TRX", "TRON", 0.24, "Layer 1"],
  ["TON", "Toncoin", 4.8, "Layer 1"],
  ["SHIB", "Shiba Inu", 0.000018, "Meme"],
  ["PEPE", "Pepe", 0.0000092, "Meme"],
  ["UNI", "Uniswap", 9.4, "DeFi"],
  ["AAVE", "Aave", 264, "DeFi"],
  ["NEAR", "NEAR Protocol", 4.2, "Layer 1"],
  ["APT", "Aptos", 8.1, "Layer 1"],
  ["ARB", "Arbitrum", 0.62, "Layer 2"],
  ["OP", "Optimism", 1.3, "Layer 2"],
  ["RENDER", "Render", 5.4, "AI"],
  ["FET", "Artificial Superintelligence", 0.81, "AI"],
  ["INJ", "Injective", 18, "DeFi"],
  ["ATOM", "Cosmos", 6.2, "Layer 1"],
  ["FIL", "Filecoin", 3.8, "Storage"],
  ["ICP", "Internet Computer", 8.9, "Layer 1"],
  ["BCH", "Bitcoin Cash", 362, "Payments"],
  ["ETC", "Ethereum Classic", 24, "Layer 1"],
];
export const catalog: Instrument[] = coins.map(
  ([base, name, seed, sector]) => ({
    symbol: base + "USDT",
    base,
    name,
    seed,
    sector,
    category: "crypto",
    quote: "USDT",
  }),
);
for (const [base, name, seed] of [
  ["AAPL", "Apple", 224],
  ["MSFT", "Microsoft", 428],
  ["NVDA", "NVIDIA", 137],
  ["AMZN", "Amazon", 219],
  ["GOOGL", "Alphabet", 192],
  ["META", "Meta Platforms", 608],
  ["TSLA", "Tesla", 342],
  ["NFLX", "Netflix", 980],
] as [string, string, number][])
  catalog.push({
    symbol: base,
    base,
    name,
    seed,
    category: "stocks",
    sector: "Technology",
    quote: "USD",
  });
for (const [base, name, seed] of [
  ["SPX", "S&P 500", 5980],
  ["IXIC", "NASDAQ Composite", 19340],
  ["DJI", "Dow Jones", 43200],
] as [string, string, number][])
  catalog.push({
    symbol: base,
    base,
    name,
    seed,
    category: "indices",
    sector: "US index",
    quote: "USD",
  });
for (const [base, name, seed] of [
  ["EURUSD", "Euro / US Dollar", 1.08],
  ["GBPUSD", "British Pound / US Dollar", 1.29],
  ["USDJPY", "US Dollar / Japanese Yen", 149],
] as [string, string, number][])
  catalog.push({
    symbol: base,
    base,
    name,
    seed,
    category: "forex",
    sector: "Major",
    quote: base.slice(3),
  });
export function instrument(symbol: string): Instrument | undefined {
  return catalog.find((x) => x.symbol === symbol);
}
