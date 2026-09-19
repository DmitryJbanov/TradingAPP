import { test } from "node:test";
import assert from "node:assert/strict";
import { nearestLevelPrice } from "../src/components/coinglass-price-copy";
import { supportedIndicators } from "../src/domain/shared-indicators";

test("CoinGlass label hit-test chooses the nearest visible level and ignores invalid prices", () => {
  assert.equal(
    nearestLevelPrice([100, 105, NaN, -1], 104, (p) => p),
    105,
  );
  assert.equal(
    nearestLevelPrice([100], 112, (p) => p),
    undefined,
  );
  assert.equal(
    nearestLevelPrice([100], 100, () => null),
    undefined,
  );
  assert.equal(
    nearestLevelPrice([100], 0, () => -1),
    undefined,
  );
});

test("indicator icons survive stored settings and older instances stay supported", () => {
  const items = [
    { id: "a", definitionId: "vmc", enabled: true, icon: "waves" },
    { id: "b", definitionId: "vmc", enabled: true },
  ];
  assert.deepEqual(
    supportedIndicators(JSON.parse(JSON.stringify(items))),
    items,
  );
});
