import { test } from "node:test";
import assert from "node:assert/strict";
import {
  heatmapDefaults,
  heatmapParams,
  parseHeatmap,
  heatmapModel,
  heatmapColor,
  heatmapRanges,
  parseHeatmapCandles,
  heatmapPriceIndex,
  heatmapFullView,
  panHeatmap,
  zoomHeatmap,
} from "../src/domain/heatmap";
import { handleApi } from "../src/server/market-service";
import fixture from "./fixtures/heatmap-btc.json";

test("heatmap validates axes, asset, indices, sizes and deduplicates by maximum", () => {
  const d = parseHeatmap(
    {
      ...fixture,
      liquidation_levels: [...fixture.liquidation_levels, [2, 1, 1]],
    },
    "BTC",
  );
  assert.equal(d.liquidation_levels.length, 6);
  assert.equal(
    d.liquidation_levels.find((c) => c[0] === 2 && c[1] === 1)?.[2],
    100,
  );
  for (const bad of [
    { ...fixture, symbol: "ETH" },
    { ...fixture, range: "invalid" },
    { ...fixture, y: [100, 99] },
    { ...fixture, y: [1, NaN] },
    { ...fixture, liquidation_levels: [[0, 3, 4]] },
    { ...fixture, liquidation_levels: [[0, 0, -2]] },
    { ...fixture, liquidation_levels: [] },
  ]) {
    assert.throws(() => parseHeatmap(bad, "BTC"));
  }
  assert.equal(
    parseHeatmap(
      {
        symbol: "BTC",
        range: "365d",
        y: [1, 2],
        price_levels: [{ x_index: 0, y_index: 1, liquidation_value: 3 }],
      },
      "BTC",
    ).liquidation_levels[0][2],
    3,
  );
});
test("heatmap preserves supported periods and defaults existing settings to 365d", () => {
  assert.equal(heatmapParams({}).range, "365d");
  for (const range of heatmapRanges) {
    assert.equal(heatmapParams({ range }).range, range);
    assert.equal(parseHeatmap({ ...fixture, range }, "BTC").range, range);
  }
});
test("heatmap keeps CoinGlass OHLC indices, validates candles and includes empty trailing columns", () => {
  const prices = [
    [1722676500, "96000", "97000", "95000", "96500", "100"],
    [1722676800, 96000, 95000, 94000, 96000], // invalid high
    [1722677100000, 96000, 96500, 95100, 96000], // milliseconds, doji
    [1722677400, 96000, 96500, 95100, 95500],
  ];
  const data = parseHeatmap({ ...fixture, prices }, "BTC");
  assert.deepEqual(
    data.candles.map((c) => c.x),
    [0, 2, 3],
  );
  assert.equal(data.candles[1].time, 1722677100);
  assert.equal(data.candles[0].high, 97000);
  assert.equal(data.candles[0].close, 96500);
  assert.equal(heatmapModel(data, heatmapDefaults).columns, 4);
  assert.equal(heatmapModel(data, heatmapDefaults).lastX, 2);
  assert.deepEqual(parseHeatmap(fixture, "BTC").candles, []);
  assert.deepEqual(
    parseHeatmapCandles([
      [1, true, 3, 1, 2],
      [1, "", 3, 1, 2],
      [1, 2, Infinity, 1, 2],
    ]),
    [],
  );
  assert.equal(heatmapParams({}).showCandles, true);
  assert.equal(heatmapParams({ showCandles: false }).showCandles, false);
});
test("heatmap candle prices align with non-uniform heatmap row centres", () => {
  const axis = [100, 110, 150];
  assert.equal(heatmapPriceIndex(axis, 100), 0);
  assert.equal(heatmapPriceIndex(axis, 110), 1);
  assert.equal(heatmapPriceIndex(axis, 130), 1.5);
  assert.equal(heatmapPriceIndex(axis, 150), 2);
  assert.equal(heatmapPriceIndex(axis, 90), -1);
  assert.equal(heatmapPriceIndex(axis, 190), 3);
});
test("heatmap navigation anchors zoom at cursor and bounds movement to the map", () => {
  const zoomed = zoomHeatmap(heatmapFullView, 0.5, 0.25, 0.75);
  assert.deepEqual(zoomed, { x: 0.125, y: 0.375, size: 0.5 });
  assert.equal(zoomed.x + 0.25 * zoomed.size, 0.25);
  assert.equal(zoomed.y + 0.75 * zoomed.size, 0.75);
  assert.deepEqual(panHeatmap(zoomed, 10, -10), { x: 0.5, y: 0, size: 0.5 });
  assert.deepEqual(zoomHeatmap(zoomed, 100), heatmapFullView);
  assert.equal(zoomHeatmap(zoomed, 0.0001).size, 0.01);
  assert.deepEqual(panHeatmap(heatmapFullView, 1, 1), heatmapFullView);
});
test("heatmap selects only latest-column levels and handles all scale endpoints", () => {
  const d = parseHeatmap(fixture, "BTC");
  const p = { ...heatmapDefaults, scale: "linear" as const, threshold: 0.5 };
  assert.deepEqual(heatmapModel(d, p).levels, [{ price: 96000, value: 100 }]);
  for (const scale of ["linear", "log", "percentile"] as const) {
    const m = heatmapModel(d, { ...p, scale, threshold: 1 });
    assert.equal(m.visible.length, 1);
    assert.equal(m.intensity(100), 1);
    assert.equal(m.intensity(0), 0);
    assert.ok(!heatmapColor(1, "fire").includes("NaN"));
  }
  assert.equal(
    heatmapParams({ limit: Infinity, threshold: NaN, scheme: "__proto__" })
      .limit,
    10,
  );
  assert.equal(heatmapParams({ scheme: "__proto__" }).scheme, "coinglass");
});
test("heatmap proxy uses isolated endpoints and preserves origin and symbol validation", async () => {
  const original = globalThis.fetch;
  const paths: string[] = [];
  const payloads: any[] = [];
  globalThis.fetch = async (input, init) => {
    paths.push(String(input));
    if (init?.body) payloads.push(JSON.parse(String(init.body)));
    return Response.json({ job: { state: "queued" } });
  };
  const cfg = {
    DATA_MODE: "demo",
    COINGLASS_SERVICE_URL: "http://collector:8090",
  };
  try {
    const run = (symbol: string, origin = "http://local", range?: string) =>
      handleApi(
        new Request("http://local/api/coinglass/heatmap-run", {
          method: "POST",
          headers: { "Content-Type": "application/json", Origin: origin },
          body: JSON.stringify({
            symbol,
            params: range ? { range } : undefined,
          }),
        }),
        cfg,
      );
    assert.equal((await run("BTCUSDT")).status, 202);
    assert.equal(paths.at(-1), "http://collector:8090/heatmap/jobs");
    assert.deepEqual(payloads.at(-1).params, { range: "365d" });
    for (const range of heatmapRanges) {
      assert.equal((await run("BTCUSDT", "http://local", range)).status, 202);
      assert.deepEqual(payloads.at(-1).params, { range });
    }
    assert.equal((await run("BTCUSDT", "http://local", "invalid")).status, 400);
    assert.equal((await run("BTCUSDT", "http://evil")).status, 403);
    assert.equal((await run("AAPL")).status, 400);
    assert.equal(
      (
        await handleApi(
          new Request(
            "http://local/api/coinglass/heatmap-status?symbol=BTCUSDT",
          ),
          cfg,
        )
      ).status,
      200,
    );
    assert.equal(
      paths.at(-1),
      "http://collector:8090/heatmap/status?asset=BTC",
    );
    assert.equal(
      (
        await handleApi(
          new Request(
            "http://local/api/coinglass/heatmap-snapshot?symbol=BTCUSDT&snapshotId=bad",
          ),
          cfg,
        )
      ).status,
      400,
    );
  } finally {
    globalThis.fetch = original;
  }
});
