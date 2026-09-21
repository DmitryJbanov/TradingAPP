import { test } from "node:test";
import assert from "node:assert/strict";
import {
  computeStochRsi,
  normalizeStochRsiParams,
  stochRsiDefaults,
} from "../src/indicators/stoch-rsi";
import type { Candle } from "../src/domain/market";

const bars = (values: number[]): Candle[] =>
  values.map((close, i) => ({
    time: 1000 + i * 60,
    open: 10,
    high: Math.max(10, close),
    low: close,
    close,
    volume: 1,
  }));
const near = (value: number | null, expected: number) =>
  assert.ok(
    value !== null && Math.abs(value - expected) < 1e-8,
    `${value} != ${expected}`,
  );

test("Stoch RSI follows Wilder RSI, stochastic and independent K/D SMA warmups", () => {
  const result = computeStochRsi(bars([1, 2, 1, 3, 2, 4, 1]), {
    lengthRSI: 2,
    lengthStoch: 3,
    smoothK: 3,
    smoothD: 2,
  });
  assert.deepEqual(
    result.slice(0, 5).map((p) => p.k),
    [null, null, null, null, null],
  );
  near(result[5].k, 64.1025641025641);
  near(result[6].k, 30.76923076923077);
  assert.equal(result[5].d, null);
  near(result[6].d, 47.43589743589744);
});

test("flat prices and a flat RSI do not produce infinity or fabricated oscillator values", () => {
  for (const values of [
    Array(60).fill(10),
    Array.from({ length: 60 }, (_, i) => i + 1),
  ])
    assert.ok(
      computeStochRsi(bars(values)).every((p) => p.k === null && p.d === null),
    );
  assert.deepEqual(computeStochRsi([]), []);
});

test("source selection and current-candle recalculation preserve historical values", () => {
  const history = bars([1, 2, 1, 3, 2, 4, 1]);
  const params = { lengthRSI: 2, lengthStoch: 3, smoothK: 1, smoothD: 1 };
  const before = computeStochRsi(history, params);
  const after = computeStochRsi(
    [...history.slice(0, -1), { ...history.at(-1)!, close: 8 }],
    params,
  );
  assert.deepEqual(before.slice(0, -1), after.slice(0, -1));
  assert.notEqual(before.at(-1)!.k, after.at(-1)!.k);
  assert.ok(
    computeStochRsi(history, { ...params, source: "open" }).every(
      (p) => p.k === null,
    ),
  );
  assert.deepEqual(
    normalizeStochRsiParams({
      smoothK: 0,
      smoothD: NaN,
      lengthRSI: 1.5,
      source: "invalid",
    }),
    stochRsiDefaults,
  );
});
