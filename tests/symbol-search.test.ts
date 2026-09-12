import { test } from "node:test";
import assert from "node:assert/strict";
import { parseExchangeSymbols } from "../src/server/symbol-service";
import { handleApi } from "../src/server/market-service";

const active = {
  symbol: "ZZZUSDC",
  baseAsset: "ZZZ",
  quoteAsset: "USDC",
  status: "TRADING",
  contractType: "PERPETUAL",
};
test("exchange parser excludes inactive/unsupported markets and separates spot/futures", () => {
  const symbols = [
    active,
    { ...active, status: "BREAK" },
    { ...active, symbol: "HYPEUSDT" },
  ];
  assert.deepEqual(
    parseExchangeSymbols({ symbols }, "spot").map((x) => x.symbol),
    ["ZZZUSDC", "SPOT:HYPEUSDT"],
  );
  assert.deepEqual(
    parseExchangeSymbols({ symbols }, "futures").map((x) => x.symbol),
    ["FUTURES:ZZZUSDC", "HYPEUSDT"],
  );
  assert.equal(
    parseExchangeSymbols(
      { symbols: [{ ...active, contractType: "CURRENT_QUARTER" }] },
      "futures",
    ).length,
    0,
  );
  assert.equal(
    parseExchangeSymbols(
      { symbols: [{ ...active, isSpotTradingAllowed: false }] },
      "spot",
    ).length,
    0,
  );
});
test("dynamic search, direct candle URLs and polling work outside curated catalog", async () => {
  const original = globalThis.fetch;
  const calls: string[] = [];
  let failFutures = true,
    failCandles = false;
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    calls.push(url.href);
    if (url.pathname.endsWith("exchangeInfo")) {
      if (url.hostname === "fapi.binance.com" && failFutures)
        return new Response("", { status: 503 });
      return Response.json({ symbols: [active] });
    }
    if (failCandles) return new Response("", { status: 503 });
    assert.equal(url.searchParams.get("symbol"), "ZZZUSDC");
    return Response.json([
      [1700000000000, "10", "12", "9", "11", "100"],
      [1700000060000, "11", "13", "10", "12", "200"],
    ]);
  };
  const call = (path: string) => handleApi(new Request("http://local" + path));
  try {
    const partial = (await (
      await call("/api/symbols?q=zzz%2Fusdc")
    ).json()) as any;
    assert.equal(partial.total, 1);
    assert.match(partial.warning, /futures/);
    failFutures = false;
    const results = (await (
      await call("/api/symbols?q=zzz-usdc")
    ).json()) as any;
    assert.equal(results.total, 2);
    for (const symbol of ["ZZZUSDC", "FUTURES:ZZZUSDC"]) {
      for (const route of ["candles", "candles/latest"]) {
        const response = await call(
          `/api/${route}?symbol=${encodeURIComponent(symbol)}&interval=4h&refresh=1`,
        );
        assert.equal(response.status, 200);
        const body = (await response.json()) as any;
        assert.equal(body.instrument.symbol, symbol);
        assert.equal(body.source, "live");
        assert.equal(body.data.at(-1).close, 12);
        assert.equal(
          body.provider,
          symbol.startsWith("FUTURES:") ? "Binance Futures" : "Binance",
        );
      }
    }
    assert.ok(
      calls.some((url) => url.includes("fapi/v1/klines?symbol=ZZZUSDC")),
    );
    assert.equal((await call("/api/candles?symbol=NOTLISTED")).status, 400);
    assert.equal((await call("/api/symbols?q=ZZZ&market=invalid")).status, 400);
    failCandles = true;
    const failure = await call("/api/candles?symbol=ZZZUSDC&refresh=1");
    assert.equal(failure.status, 503);
    assert.ok(((await failure.json()) as any).error);
  } finally {
    globalThis.fetch = original;
  }
});
