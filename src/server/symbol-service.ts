import { instrument } from "../domain/catalog";
import type { Instrument } from "../domain/market";

export class SymbolError extends Error {
  constructor(
    message: string,
    public status = 503,
  ) {
    super(message);
  }
}
export interface SearchInstrument extends Instrument {
  market: "spot" | "futures";
}
const entries = new Map<
  string,
  { expires: number; data: SearchInstrument[] }
>();
const pending = new Map<string, Promise<SearchInstrument[]>>();
export function upstreamSymbol(symbol: string) {
  return symbol.replace(/^(FUTURES|SPOT):/, "");
}
export function parseExchangeSymbols(
  data: unknown,
  market: "spot" | "futures",
): SearchInstrument[] {
  const rows = (data as { symbols?: unknown[] })?.symbols;
  if (!Array.isArray(rows)) throw new SymbolError("Некорректный каталог биржи");
  return rows.flatMap((value) => {
    const row = value as Record<string, unknown>;
    if (
      !row ||
      row.status !== "TRADING" ||
      (market === "spot" && row.isSpotTradingAllowed === false) ||
      (market === "futures" && row.contractType !== "PERPETUAL") ||
      typeof row.symbol !== "string" ||
      !/^[A-Z0-9]{2,30}$/.test(row.symbol) ||
      typeof row.baseAsset !== "string" ||
      typeof row.quoteAsset !== "string"
    )
      return [];
    // Keep the existing HYPE perpetual URL; prefix every other futures symbol.
    const symbol =
      market === "futures" && row.symbol !== "HYPEUSDT"
        ? `FUTURES:${row.symbol}`
        : market === "spot" && row.symbol === "HYPEUSDT"
          ? "SPOT:HYPEUSDT"
          : row.symbol;
    return [
      {
        symbol,
        base: row.baseAsset,
        quote: row.quoteAsset,
        name: `${row.baseAsset} / ${row.quoteAsset}`,
        category: "crypto" as const,
        sector: market === "spot" ? "Spot" : "Perpetual",
        seed: 1,
        market,
      },
    ];
  });
}
async function exchange(market: "spot" | "futures") {
  const cached = entries.get(market);
  if (cached && cached.expires > Date.now()) return cached.data;
  if (pending.has(market)) return pending.get(market)!;
  const task = (async () => {
    const url =
      market === "spot"
        ? "https://data-api.binance.vision/api/v3/exchangeInfo"
        : "https://fapi.binance.com/fapi/v1/exchangeInfo";
    const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!response.ok)
      throw new SymbolError(`Каталог ${market}: HTTP ${response.status}`);
    const data = parseExchangeSymbols(await response.json(), market);
    entries.set(market, { data, expires: Date.now() + 3600000 });
    return data;
  })().finally(() => pending.delete(market));
  pending.set(market, task);
  return task;
}
export async function searchSymbols(
  query: string,
  market: string,
  demo = false,
) {
  const q = query.toUpperCase().replace(/[\s/_-]/g, "");
  if (
    q.length > 40 ||
    !/^[A-Z0-9:]*$/.test(q) ||
    !["all", "spot", "futures"].includes(market)
  )
    throw new SymbolError("Некорректные параметры поиска", 400);
  if (demo)
    throw new SymbolError("Поиск биржевых пар недоступен в режиме DEMO");
  const markets: ("spot" | "futures")[] =
    market === "all" ? ["spot", "futures"] : [market as "spot" | "futures"];
  const results = await Promise.allSettled(markets.map(exchange));
  const warnings: string[] = [];
  const rows = results.flatMap((result, index) => {
    if (result.status === "fulfilled") return result.value;
    warnings.push(`Каталог ${markets[index]} недоступен`);
    return [];
  });
  if (results.every((r) => r.status === "rejected"))
    throw new SymbolError(warnings.join(". "));
  const matches = rows
    .filter(
      (row) => (row.base + row.quote).includes(q) || row.symbol.includes(q),
    )
    .sort(
      (a, b) =>
        Number(b.base + b.quote === q) - Number(a.base + a.quote === q) ||
        a.symbol.localeCompare(b.symbol),
    );
  return {
    data: matches.slice(0, 60),
    total: matches.length,
    warning: warnings.join(". ") || undefined,
  };
}
export async function resolveInstrument(
  symbol: string,
  demo = false,
): Promise<Instrument> {
  const known = instrument(symbol);
  if (known) return known;
  if (demo || !/^(?:(?:FUTURES|SPOT):)?[A-Z0-9]{2,30}$/.test(symbol))
    throw new SymbolError("Неизвестная торговая пара", 400);
  let rows: SearchInstrument[];
  try {
    rows = await exchange(symbol.startsWith("FUTURES:") ? "futures" : "spot");
  } catch {
    throw new SymbolError(
      "Не удалось проверить пару: каталог биржи недоступен",
    );
  }
  const found = rows.find((row) => row.symbol === symbol);
  if (!found) throw new SymbolError("Активная торговая пара не найдена", 400);
  return found;
}
