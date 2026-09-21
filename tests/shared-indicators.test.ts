import { test } from "node:test";
import assert from "node:assert/strict";
import {
  initialSharedIndicators,
  supportedIndicators,
} from "../src/domain/shared-indicators";
import { indicatorRegistry } from "../src/domain/workspace";
const vmc = {
  id: "custom",
  definitionId: "vmc",
  enabled: false,
  period: 9,
  color: "#123456",
  paneId: "oscillator",
  params: { wtChannelLen: 17 },
  style: { wtColor: "#abcdef" },
  timeframes: ["4h"],
};
test("shared selection preserves instance settings and overrides all per-symbol settings", () => {
  const shared = [vmc, { ...vmc, id: "second" }];
  for (const symbol of ["BTCUSDT", "ETHUSDT"])
    assert.deepEqual(
      initialSharedIndicators(shared, { [symbol]: [] }, symbol),
      shared,
    );
  assert.deepEqual(
    initialSharedIndicators([], { BTCUSDT: [vmc] }, "BTCUSDT"),
    [],
  );
});
test("migration prefers current pair then a usable legacy selection and removes placeholders", () => {
  const other = { ...vmc, id: "other" };
  const legacy = {
    BTCUSDT: [vmc, { ...vmc, definitionId: "nwe" }],
    ETHUSDT: [other],
  };
  assert.deepEqual(initialSharedIndicators(null, legacy, "ETHUSDT"), [other]);
  assert.deepEqual(initialSharedIndicators(null, legacy, "SOLUSDT"), [vmc]);
  assert.deepEqual(
    supportedIndicators([null, {}, { ...vmc, definitionId: "sma" }, vmc]),
    [vmc],
  );
  assert.deepEqual(initialSharedIndicators(null, null, "BTCUSDT"), []);
});
test("only rendered and calculated indicators remain in the catalog", () => {
  assert.deepEqual(indicatorRegistry.map((i) => i.id).sort(), [
    "coinglass",
    "coinglass-heatmap",
    "drz",
    "smc",
    "sonarlab-ob",
    "stoch-rsi",
    "vmc",
  ]);
  assert.ok(
    indicatorRegistry.every(
      (i) =>
        i.implemented &&
        (typeof i.compute === "function" || i.dataSource === "remote"),
    ),
  );
});
