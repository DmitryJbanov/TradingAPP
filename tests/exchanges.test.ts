import { test } from "node:test";
import assert from "node:assert/strict";
import {
  aggregateExchangeBars,
  exchangeContracts,
  exchangeMarkets,
  loadExchangeHistory,
} from "../src/server/exchange-service";
import { isMarketExchange, marketSymbol } from "../src/domain/exchanges";
import { handleApi } from "../src/server/market-service";

test("market exchange validation is an allowlist and preserves canonical favorites", async () => {
  assert.ok(isMarketExchange("okx"));
  assert.ok(!isMarketExchange("https://evil.example"));
  assert.equal(marketSymbol("FUTURES:BTCUSDT"), "BTCUSDT");
  assert.equal(
    (await handleApi(new Request("http://local/api/candles?exchange=invalid")))
      .status,
    400,
  );
});
test("exchange candles normalize timestamps and base volume, aggregate unsupported frames", async () => {
  const calls: string[] = [];
  const fetchOkx = async (url: string) => {
    calls.push(url);
    return {
      data: [
        ["120000", "10", "14", "9", "12", "400", "4", "48"],
        ["60000", "9", "11", "8", "10", "200", "2", "20"],
      ],
    };
  };
  const okx = await loadExchangeHistory(
    "okx",
    { id: "BTC-USDT-SWAP", contractSize: 1 },
    "1m",
    2,
    fetchOkx,
  );
  assert.deepEqual(
    okx.bars.map((x) => [x.time, x.volume]),
    [
      [60, 2],
      [120, 4],
    ],
  );
  assert.match(calls[0], /instId=BTC-USDT-SWAP/);
  const mexc = await loadExchangeHistory(
    "mexc",
    { id: "BTC_USDT", contractSize: 0.0001 },
    "1m",
    2,
    async () => ({
      data: {
        time: [60, 120],
        open: [9, 10],
        high: [11, 14],
        low: [8, 9],
        close: [10, 12],
        vol: [20000, 40000],
      },
    }),
  );
  assert.deepEqual(mexc.bars, okx.bars);
  const bybit = await loadExchangeHistory(
    "bybit",
    { id: "BTCUSDT", contractSize: 1 },
    "1m",
    2,
    async () => ({
      result: {
        list: [
          ["120000", "10", "14", "9", "12", "4"],
          ["60000", "9", "11", "8", "10", "2"],
        ],
      },
    }),
  );
  assert.deepEqual(bybit.bars, okx.bars);
  const aggregated = aggregateExchangeBars(
    [
      { time: 0, open: 10, high: 12, low: 9, close: 11, volume: 2 },
      { time: 60, open: 11, high: 14, low: 10, close: 12, volume: 3 },
      { time: 180, open: 12, high: 13, low: 11, close: 13, volume: 1 },
    ],
    "3m",
  );
  assert.deepEqual(aggregated[0], {
    time: 0,
    open: 10,
    high: 14,
    low: 9,
    close: 12,
    volume: 5,
  });
});
test("exchange pagination retains historical candles and deduplicates page edges", async () => {
  let page = 0;
  const result = await loadExchangeHistory(
    "bybit",
    { id: "BTCUSDT", contractSize: 1 },
    "1m",
    1001,
    async (url) => {
      page++;
      if (page === 2) assert.match(url, /end=59999000/);
      const times =
        page === 1 ? Array.from({ length: 1000 }, (_, i) => 1999 - i) : [999];
      return {
        result: {
          list: times.map((t) => [
            String(t * 60000),
            "10",
            "11",
            "9",
            "10",
            "1",
          ]),
        },
      };
    },
  );
  assert.equal(page, 2);
  assert.equal(result.bars.length, 1001);
  assert.equal(result.bars[0].time, 999 * 60);
  await assert.rejects(
    loadExchangeHistory(
      "okx",
      { id: "BTC-USDT-SWAP", contractSize: 1 },
      "1m",
      2,
      async () => ({ data: [["60000", "10", "9", "8", "12", "1", "1"]] }),
    ),
  );
});
test("catalogs and quotes normalize all futures providers", async () => {
  const mock = async (url: string): Promise<any> => {
    if (url.includes("exchangeInfo"))
      return {
        symbols: [
          {
            symbol: "BTCUSDT",
            baseAsset: "BTC",
            quoteAsset: "USDT",
            status: "TRADING",
            contractType: "PERPETUAL",
            filters: [{ filterType: "PRICE_FILTER", tickSize: "0.1" }],
          },
        ],
      };
    if (url.includes("public/instruments"))
      return {
        data: [
          {
            instId: "BTC-USDT-SWAP",
            state: "live",
            ctType: "linear",
            tickSz: "0.1",
          },
          { instId: "BTC-USD-SWAP", state: "live", ctType: "inverse" },
        ],
      };
    if (url.includes("instruments-info"))
      return {
        result: {
          list: [
            {
              symbol: "BTCUSDT",
              baseCoin: "BTC",
              quoteCoin: "USDT",
              contractType: "LinearPerpetual",
              status: "Trading",
              priceFilter: { tickSize: "0.1" },
            },
          ],
        },
      };
    if (url.includes("detail"))
      return {
        data: [
          {
            symbol: "BTC_USDT",
            baseCoin: "BTC",
            quoteCoin: "USDT",
            state: 0,
            priceUnit: 0.1,
            contractSize: 0.0001,
          },
        ],
      };
    if (url.includes("binance"))
      return [
        {
          symbol: "BTCUSDT",
          lastPrice: "100",
          priceChangePercent: "5",
          quoteVolume: "200",
          highPrice: "110",
          lowPrice: "90",
        },
      ];
    if (url.includes("okx"))
      return {
        data: [
          {
            instId: "BTC-USDT-SWAP",
            last: "100",
            open24h: "80",
            volCcy24h: "2",
            high24h: "110",
            low24h: "90",
          },
        ],
      };
    if (url.includes("bybit"))
      return {
        result: {
          list: [
            {
              symbol: "BTCUSDT",
              lastPrice: "100",
              price24hPcnt: "0.05",
              turnover24h: "200",
              highPrice24h: "110",
              lowPrice24h: "90",
            },
          ],
        },
      };
    return {
      data: [
        {
          symbol: "BTC_USDT",
          lastPrice: 100,
          riseFallRate: 0.05,
          amount24: 200,
          high24Price: 110,
          lower24Price: 90,
        },
      ],
    };
  };
  for (const exchange of ["binance", "okx", "bybit", "mexc"] as const) {
    const catalog = await exchangeContracts(exchange, mock);
    assert.equal(catalog.length, 1);
    assert.equal(catalog[0].symbol, "FUTURES:BTCUSDT");
    const response = await exchangeMarkets(exchange, true, mock),
      q = response.data[0];
    assert.equal(q.price, 100);
    assert.equal(q.volume, 200);
    assert.equal(q.low, 90);
    assert.equal(q.change, exchange === "okx" ? 25 : 5);
    assert.match(q.provider, new RegExp(exchange, "i"));
  }
});
