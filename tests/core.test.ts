import { test } from "node:test";
import assert from "node:assert/strict";
import { catalog } from "../src/domain/catalog";
import { demoCandles, demoQuote } from "../src/domain/demo";
import { deviation, intervals, type Timeframe } from "../src/domain/market";
import { handleApi } from "../src/server/market-service";
import { sessionInfo } from "../src/components/sessions";

test("demo OHLC invariants and cross-timeframe current price", () => {
  const now = Date.parse("2026-09-06T15:37:00Z"),
    item = catalog[0],
    price = demoQuote(item, now).price;
  for (const tf of Object.keys(intervals) as Timeframe[]) {
    const bars = demoCandles(item, tf, now);
    assert.equal(bars.length, 400);
    assert.equal(bars.at(-1)!.close, price);
    for (let i = 0; i < bars.length; i++) {
      const b = bars[i];
      assert.ok(b.high >= Math.max(b.open, b.close));
      assert.ok(b.low <= Math.min(b.open, b.close));
      assert.ok(b.low > 0);
      if (i) assert.equal(b.time - bars[i - 1].time, intervals[tf]);
    }
  }
});
test("cursor deviation is current relative to cursor price", () => {
  assert.equal(deviation(110, 100), 10.000000000000009);
  assert.equal(deviation(100, 200), -50);
  assert.equal(deviation(100, 0), null);
});
test("sessions respect daylight saving and weekends", () => {
  assert.equal(
    sessionInfo(new Date("2026-07-06T12:00:00Z"), "Europe/London", 8, 17).begin,
    7,
  );
  assert.equal(
    sessionInfo(new Date("2026-01-05T12:00:00Z"), "Europe/London", 8, 17).begin,
    8,
  );
  assert.equal(
    sessionInfo(new Date("2026-09-06T12:00:00Z"), "Europe/London", 8, 17)
      .active,
    false,
  );
  assert.equal(
    sessionInfo(new Date("2026-07-06T12:00:00Z"), "America/New_York", 8, 17)
      .begin,
    12,
  );
});
test("API validates identifiers, methods and reports synthetic provenance", async () => {
  const call = (path: string, method = "GET") =>
    handleApi(new Request("http://local" + path, { method }), {
      DATA_MODE: "demo",
    });
  assert.equal((await call("/api/candles?symbol=UNKNOWN")).status, 400);
  assert.equal((await call("/api/candles?interval=__proto__")).status, 400);
  assert.equal((await call("/api/markets", "POST")).status, 405);
  assert.equal((await call("/api/unknown")).status, 404);
  const data = (await (await call("/api/markets")).json()) as any;
  assert.equal(data.data.length, 44);
  assert.ok(data.data.every((q: any) => q.source === "demo"));
  const bars = (await (
    await call("/api/candles?symbol=BTCUSDT&interval=4h")
  ).json()) as any;
  assert.equal(bars.source, "demo");
  assert.equal(bars.data.length, 400);
});
test("provider success mapping and failure fallback do not mislabel data", async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async () =>
      Response.json([
        {
          symbol: "BTCUSDT",
          lastPrice: "100",
          priceChangePercent: "2",
          quoteVolume: "500",
          highPrice: "103",
          lowPrice: "95",
          closeTime: 1700000000000,
        },
      ]);
    const live = (await (
      await handleApi(new Request("http://local/api/markets?refresh=1"))
    ).json()) as any;
    assert.equal(live.data[0].source, "live");
    assert.equal(live.data[0].price, 100);
    assert.equal(live.data[1].source, "demo");
    globalThis.fetch = async () =>
      new Response("rate limited", { status: 429 });
    const fallback = (await (
      await handleApi(new Request("http://local/api/markets?refresh=1"))
    ).json()) as any;
    assert.ok(fallback.data.every((x: any) => x.source === "demo"));
    assert.ok(fallback.warning.includes("Binance"));
    const bars = (await (
      await handleApi(
        new Request("http://local/api/candles?symbol=BTCUSDT&refresh=1"),
      )
    ).json()) as any;
    assert.equal(bars.source, "demo");
  } finally {
    globalThis.fetch = original;
  }
});
