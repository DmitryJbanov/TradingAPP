import {
  candleIntervals,
  type Candle,
  type CandleInterval,
  type CandleResponse,
  type Instrument,
  type MarketResponse,
} from "../domain/market";
import {
  exchanges,
  marketSymbol,
  type MarketExchange,
} from "../domain/exchanges";
import { SymbolError } from "./symbol-service";
import { loadBinanceHistory } from "./binance-history";

type Contract = Instrument & {
  id: string;
  tickSize: number;
  contractSize: number;
};
type Json = (url: string) => Promise<any>;
const roots = {
  binance: "https://fapi.binance.com",
  okx: "https://www.okx.com",
  bybit: "https://api.bybit.com",
  mexc: "https://contract.mexc.com",
};
const cache = new Map<string, { expires: number; value: unknown }>();
const pending = new Map<string, Promise<any>>();
async function cached<T>(
  key: string,
  ttl: number,
  load: () => Promise<T>,
  force = false,
): Promise<T> {
  const entry = cache.get(key);
  if (!force && entry && entry.expires > Date.now()) return entry.value as T;
  if (pending.has(key)) return pending.get(key)!;
  const task = load()
    .then((value) => {
      if (cache.size >= 100) cache.delete(cache.keys().next().value!);
      cache.set(key, { expires: Date.now() + ttl, value });
      return value;
    })
    .finally(() => pending.delete(key));
  pending.set(key, task);
  return task;
}
export async function exchangeJson(url: string) {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(15000),
    headers: { Accept: "application/json" },
  });
  if (!response.ok)
    throw new SymbolError(
      `Биржа временно недоступна (HTTP ${response.status})`,
    );
  const data = (await response.json()) as any;
  if (
    (data.code !== undefined &&
      String(data.code) !== "0" &&
      data.success !== true) ||
    (data.retCode !== undefined && data.retCode !== 0) ||
    data.success === false
  )
    throw new SymbolError(
      String(data.retMsg ?? data.msg ?? data.message ?? "Ошибка биржи"),
    );
  return data;
}
export async function exchangeContracts(
  exchange: MarketExchange,
  json: Json = exchangeJson,
): Promise<Contract[]> {
  return cached(`contracts:${exchange}`, 3600000, async () => {
    let raw: any[];
    if (exchange === "binance")
      raw = (
        await json(`${roots.binance}/fapi/v1/exchangeInfo`)
      ).symbols.filter(
        (x: any) => x.status === "TRADING" && x.contractType === "PERPETUAL",
      );
    else if (exchange === "okx")
      raw = (
        await json(`${roots.okx}/api/v5/public/instruments?instType=SWAP`)
      ).data.filter((x: any) => x.state === "live" && x.ctType === "linear");
    else if (exchange === "mexc")
      raw = (await json(`${roots.mexc}/api/v1/contract/detail`)).data.filter(
        (x: any) => x.state === 0,
      );
    else {
      raw = [];
      let cursor = "";
      for (let page = 0; page < 10; page++) {
        const result = (
          await json(
            `${roots.bybit}/v5/market/instruments-info?category=linear&limit=1000${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`,
          )
        ).result;
        raw.push(
          ...result.list.filter(
            (x: any) =>
              x.status === "Trading" && x.contractType === "LinearPerpetual",
          ),
        );
        if (!result.nextPageCursor || result.nextPageCursor === cursor) break;
        cursor = result.nextPageCursor;
      }
    }
    return raw
      .map((x: any): Contract => {
        const [okxBase, okxQuote] = String(x.instId ?? "").split("-");
        const base = x.baseAsset ?? x.baseCoin ?? okxBase,
          quote = x.quoteAsset ?? x.quoteCoin ?? okxQuote;
        return {
          symbol: `FUTURES:${base}${quote}`,
          base,
          quote,
          name: x.fullName ?? base,
          category: "crypto",
          sector: "Perpetual",
          seed: 0,
          id: x.instId ?? x.symbol,
          tickSize: Number(
            x.tickSz ??
              x.priceUnit ??
              x.priceFilter?.tickSize ??
              x.filters?.find((f: any) => f.filterType === "PRICE_FILTER")
                ?.tickSize,
          ),
          contractSize: exchange === "mexc" ? Number(x.contractSize) : 1,
        };
      })
      .filter((x: Contract) => x.quote === "USDT" || x.quote === "USDC");
  });
}
export async function exchangeMarkets(
  exchange: MarketExchange,
  force = false,
  json: Json = exchangeJson,
): Promise<MarketResponse> {
  return cached(
    `quotes:${exchange}`,
    10000,
    async () => {
      const contracts = await exchangeContracts(exchange, json);
      const response = await json(
        exchange === "binance"
          ? `${roots.binance}/fapi/v1/ticker/24hr`
          : exchange === "okx"
            ? `${roots.okx}/api/v5/market/tickers?instType=SWAP`
            : exchange === "bybit"
              ? `${roots.bybit}/v5/market/tickers?category=linear`
              : `${roots.mexc}/api/v1/contract/ticker`,
      );
      const raw: any[] =
        exchange === "binance"
          ? response
          : exchange === "bybit"
            ? response.result.list
            : response.data;
      const byId = new Map(raw.map((x) => [x.symbol ?? x.instId, x]));
      const asOf = new Date().toISOString(),
        provider = `${exchanges[exchange]} Futures`;
      const data = contracts.flatMap((contract) => {
        const x = byId.get(contract.id);
        if (!x) return [];
        const price = Number(x.lastPrice ?? x.last),
          open = Number(x.open24h);
        const change =
          exchange === "binance"
            ? Number(x.priceChangePercent)
            : exchange === "okx"
              ? (price / open - 1) * 100
              : Number(x.price24hPcnt ?? x.riseFallRate) * 100;
        const volume =
          exchange === "okx"
            ? Number(x.volCcy24h) * price
            : Number(x.quoteVolume ?? x.turnover24h ?? x.amount24);
        const {
          id: _,
          tickSize: __,
          contractSize: ___,
          ...instrument
        } = contract;
        return Number.isFinite(price) && price > 0
          ? [
              {
                ...instrument,
                price,
                change: Number.isFinite(change) ? change : 0,
                volume: Number.isFinite(volume) && volume >= 0 ? volume : 0,
                high: Number(
                  x.highPrice ?? x.highPrice24h ?? x.high24h ?? x.high24Price,
                ),
                low: Number(
                  x.lowPrice ?? x.lowPrice24h ?? x.low24h ?? x.lower24Price,
                ),
                source: "live" as const,
                provider,
                asOf,
              },
            ]
          : [];
      });
      return { data: data.sort((a, b) => b.volume - a.volume), asOf };
    },
    force,
  );
}
export async function exchangeSearch(exchange: MarketExchange, query: string) {
  const q = query.toUpperCase().replace(/[\s/_-]/g, "");
  if (q.length > 40 || !/^[A-Z0-9:]*$/.test(q))
    throw new SymbolError("Недопустимый запрос поиска", 400);
  const rows = (await exchangeContracts(exchange)).filter((x) =>
    x.symbol.includes(q),
  );
  return {
    data: rows
      .slice(0, 60)
      .map(({ id: _, tickSize: __, contractSize: ___, ...x }) => ({
        ...x,
        market: "futures",
      })),
    total: rows.length,
  };
}
export function aggregateExchangeBars(
  bars: Candle[],
  interval: CandleInterval,
): Candle[] {
  const step = candleIntervals[interval],
    result = new Map<number, Candle>();
  for (const bar of [...bars].sort((a, b) => a.time - b.time)) {
    const time = Math.floor(bar.time / step) * step;
    const current = result.get(time);
    if (current) {
      current.high = Math.max(current.high, bar.high);
      current.low = Math.min(current.low, bar.low);
      current.close = bar.close;
      current.volume += bar.volume;
    } else result.set(time, { ...bar, time });
  }
  return [...result.values()];
}
const nativeIntervals: Record<
  Exclude<MarketExchange, "binance">,
  Partial<Record<CandleInterval, string>>
> = {
  okx: {
    "1m": "1m",
    "3m": "3m",
    "5m": "5m",
    "15m": "15m",
    "30m": "30m",
    "1h": "1H",
    "2h": "2H",
    "4h": "4H",
    "1d": "1Dutc",
    "1w": "1Wutc",
  },
  bybit: {
    "1m": "1",
    "3m": "3",
    "5m": "5",
    "15m": "15",
    "30m": "30",
    "1h": "60",
    "2h": "120",
    "4h": "240",
    "12h": "720",
    "1d": "D",
    "1w": "W",
  },
  mexc: {
    "1m": "Min1",
    "5m": "Min5",
    "15m": "Min15",
    "30m": "Min30",
    "1h": "Min60",
    "4h": "Hour4",
    "8h": "Hour8",
    "1d": "Day1",
    "1w": "Week1",
  },
};
export async function loadExchangeHistory(
  exchange: MarketExchange,
  contract: Pick<Contract, "id" | "contractSize">,
  interval: CandleInterval,
  count: number,
  json: Json = exchangeJson,
): Promise<{ bars: Candle[]; warning?: string }> {
  if (exchange === "binance")
    return loadBinanceHistory(`FUTURES:${contract.id}`, interval, count, json);
  const native = nativeIntervals[exchange][interval]
    ? interval
    : interval === "3m"
      ? "1m"
      : interval === "2h"
        ? "1h"
        : "4h";
  const ratio = candleIntervals[interval] / candleIntervals[native],
    target = count * ratio + (ratio > 1 ? ratio : 0);
  const byTime = new Map<number, Candle>();
  let end: number | undefined, warning: string | undefined;
  for (
    let page = 0;
    page <
      Math.ceil(
        target /
          (exchange === "okx" ? 100 : exchange === "bybit" ? 1000 : 2000),
      ) +
        2 && byTime.size < target;
    page++
  ) {
    const limit = Math.min(
      exchange === "okx" ? 100 : exchange === "bybit" ? 1000 : 2000,
      target - byTime.size,
    );
    try {
      const url =
        exchange === "okx"
          ? `${roots.okx}/api/v5/market/${end === undefined ? "candles" : "history-candles"}?instId=${encodeURIComponent(contract.id)}&bar=${nativeIntervals.okx[native]}&limit=${limit}${end === undefined ? "" : `&after=${end * 1000}`}`
          : exchange === "bybit"
            ? `${roots.bybit}/v5/market/kline?category=linear&symbol=${encodeURIComponent(contract.id)}&interval=${nativeIntervals.bybit[native]}&limit=${limit}${end === undefined ? "" : `&end=${end * 1000}`}`
            : `${roots.mexc}/api/v1/contract/kline/${encodeURIComponent(contract.id)}?interval=${nativeIntervals.mexc[native]}${end === undefined ? (count === 2 ? `&start=${Math.floor(Date.now() / 1000) - candleIntervals[interval] * 4}` : "") : `&end=${end}`}`;
      const response = await json(url);
      const raw = exchange === "bybit" ? response.result.list : response.data;
      const batch: Candle[] =
        exchange === "mexc"
          ? raw.time.map((time: number, i: number) => ({
              time: Number(time),
              open: Number(raw.open[i]),
              high: Number(raw.high[i]),
              low: Number(raw.low[i]),
              close: Number(raw.close[i]),
              volume: Number(raw.vol[i]) * contract.contractSize,
            }))
          : raw.map((x: any[]) => ({
              time: Number(x[0]) / 1000,
              open: Number(x[1]),
              high: Number(x[2]),
              low: Number(x[3]),
              close: Number(x[4]),
              volume: Number(x[exchange === "okx" ? 6 : 5]),
            }));
      if (!batch.length) break;
      if (
        batch.some(
          (b) =>
            !Object.values(b).every(Number.isFinite) ||
            !Number.isInteger(b.time) ||
            b.low <= 0 ||
            b.volume < 0 ||
            b.high < Math.max(b.open, b.close) ||
            b.low > Math.min(b.open, b.close),
        )
      )
        throw new Error("Некорректные свечи биржи");
      const size = byTime.size;
      for (const bar of batch)
        if (end === undefined || bar.time <= end) byTime.set(bar.time, bar);
      if (size === byTime.size) break;
      end = Math.min(...batch.map((b) => b.time)) - 1;
      if (batch.length < limit) break;
    } catch (error) {
      if (!byTime.size) throw error;
      warning = "Не удалось загрузить старую часть истории";
      break;
    }
  }
  const sorted = [...byTime.values()].sort((a, b) => a.time - b.time);
  let bars = ratio > 1 ? aggregateExchangeBars(sorted, interval) : sorted;
  // The oldest aggregated bucket may be incomplete because pagination began inside it.
  if (ratio > 1 && bars.length && sorted[0].time !== bars[0].time)
    bars = bars.slice(1);
  bars = bars.slice(-count);
  if (!bars.length) throw new SymbolError("Биржа не вернула свечи");
  if (bars.length < count)
    warning = `${warning ?? "Доступна неполная история"}: ${bars.length} из ${count} свечей.`;
  return { bars, warning };
}
export async function exchangeCandles(
  exchange: MarketExchange,
  symbol: string,
  interval: CandleInterval,
  count: number,
  force = false,
): Promise<CandleResponse> {
  if (!/^(?:FUTURES:|SPOT:)?[A-Z0-9]{3,40}$/.test(symbol))
    throw new SymbolError("Недопустимый инструмент", 400);
  return cached(
    `candles:${exchange}:${symbol}:${interval}:${count}`,
    count === 2 ? 1500 : 15000,
    async () => {
      const contract = (await exchangeContracts(exchange)).find(
        (x) => marketSymbol(x.symbol) === marketSymbol(symbol),
      );
      if (!contract)
        throw new SymbolError(
          `${marketSymbol(symbol)}: бессрочный контракт отсутствует на ${exchanges[exchange]}`,
          404,
        );
      const { bars, warning } = await loadExchangeHistory(
        exchange,
        contract,
        interval,
        count,
      );
      const { id: _, tickSize, contractSize: __, ...instrument } = contract;
      return {
        instrument: { ...instrument, symbol },
        tickSize:
          Number.isFinite(tickSize) && tickSize > 0 ? tickSize : undefined,
        data: bars,
        source: "live",
        exchange,
        provider: `${exchanges[exchange]} Futures`,
        asOf: new Date().toISOString(),
        warning,
      };
    },
    force,
  );
}
