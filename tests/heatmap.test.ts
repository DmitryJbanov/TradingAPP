import { test } from "node:test";
import assert from "node:assert/strict";
import {
  heatmapDefaults,
  heatmapParams,
  parseHeatmap,
  heatmapModel,
  heatmapColor,
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
    { ...fixture, range: "7d" },
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
  globalThis.fetch = async (input) => {
    paths.push(String(input));
    return Response.json({ job: { state: "queued" } });
  };
  const cfg = {
    DATA_MODE: "demo",
    COINGLASS_SERVICE_URL: "http://collector:8090",
  };
  try {
    const run = (symbol: string, origin = "http://local") =>
      handleApi(
        new Request("http://local/api/coinglass/heatmap-run", {
          method: "POST",
          headers: { "Content-Type": "application/json", Origin: origin },
          body: JSON.stringify({ symbol }),
        }),
        cfg,
      );
    assert.equal((await run("BTCUSDT")).status, 202);
    assert.equal(paths.at(-1), "http://collector:8090/heatmap/jobs");
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
