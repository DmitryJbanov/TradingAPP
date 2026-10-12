import { test } from "node:test";
import assert from "node:assert/strict";
import { rsiRowsForPeriod, type RsiRow } from "../src/domain/rsi-heatmap";
test("RSI periods share the same top50, CoinGlass rank order and missing values", () => {
  const rows: RsiRow[] = [
    {
      rank: 2,
      symbol: "LOW",
      marketCap: 10,
      price: 1,
      change1h: 0,
      change24h: 0,
      rsi: 42,
      rsiValues: { "4h": 42, "24h": 58, "1w": null },
    },
    {
      rank: 1,
      symbol: "BIG",
      marketCap: 100,
      price: 1,
      change1h: 0,
      change24h: 0,
      rsi: 80,
      rsiValues: { "4h": 80, "24h": 35, "1w": 20 },
    },
  ];
  const weekly = rsiRowsForPeriod(rows, "1w", "4h");
  assert.deepEqual(
    weekly.map((r) => r.symbol),
    ["BIG", "LOW"],
  );
  assert.deepEqual(
    weekly.map((r) => r.rsi),
    [20, null],
  );
  assert.deepEqual(
    rsiRowsForPeriod(rows, "24h", "4h").map((r) => r.rsi),
    [35, 58],
  );
  assert.equal(rows[0].rsi, 42);
  assert.equal(
    rsiRowsForPeriod([{ ...rows[0], rsiValues: undefined }], "1w", "4h")[0].rsi,
    null,
  );
});
