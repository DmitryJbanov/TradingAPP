import { test } from "node:test";
import assert from "node:assert/strict";
import type {
  Logical,
  SeriesAttachedParameter,
  Time,
} from "lightweight-charts";
import type { Candle } from "../src/domain/market";
import {
  whaleCandleTime,
  type WhaleChartPoint,
} from "../src/domain/whale-chart";
import { WhaleTradesRenderer } from "../src/indicators/whale-trades-renderer";

const bars = [1000, 1060, 1120, 1240].map((time) => ({
  time,
  open: 10,
  close: 10,
  high: 12,
  low: 8,
  volume: 1,
})) as Candle[];
const point: WhaleChartPoint = {
  id: "position:BTC:Long",
  address: "0x" + "1".repeat(40),
  coin: "BTC",
  time: 1095,
  price: 11,
  label: "Вход Long",
  pnl: 2,
  size: 1,
  color: "#22ab94",
  selected: true,
};

test("execution belongs to its actual candle, never the nearest edge or a gap", () => {
  assert.equal(whaleCandleTime(bars, 1095, 60), 1060);
  assert.equal(whaleCandleTime(bars, 1120, 60), 1120);
  for (const time of [999, 1190, 1300, NaN, undefined])
    assert.equal(whaleCandleTime(bars, time, 60), null);
  assert.equal(whaleCandleTime([], 1095, 60), null);
  assert.equal(whaleCandleTime(bars.slice(2), 1095, 60), null);
  assert.equal(whaleCandleTime(bars, 1095, 120), 1060);
});

test("native marker, time label and hit target follow candle coordinates during pan/zoom/backfill", () => {
  const renderer = new WhaleTradesRenderer();
  let x = 350,
    index = 42;
  const requestedTimes: number[] = [];
  renderer.attached({
    chart: {
      timeScale: () => ({
        timeToCoordinate: (time: number) => {
          requestedTimes.push(time);
          return x;
        },
        timeToIndex: () => index,
        width: () => 1000,
      }),
    },
    series: { priceToCoordinate: (price: number) => 200 - price },
    requestUpdate: () => {},
  } as unknown as SeriesAttachedParameter<Time>);
  renderer.configure([point], bars, 60);
  const axis = renderer.timeAxisViews()[0];
  for (const next of [350, 800, 120]) {
    x = next;
    assert.equal(axis.coordinate(), next);
    assert.equal(axis.visible?.(), true);
    assert.equal(renderer.findAt(next, 189)?.point.time, 1095);
    assert.equal(
      renderer.hitTest(next, 189)?.externalId,
      "whale:position:BTC:Long",
    );
    assert.equal(renderer.findAt(next + 30, 189), null);
    const circles: number[][] = [];
    const ctx = new Proxy(
      {
        arc: (...args: number[]) => circles.push(args),
        measureText: () => ({ width: 100 }),
      },
      { get: (object, key) => Reflect.get(object, key) ?? (() => {}) },
    );
    renderer
      .paneViews()[0]
      .renderer()!
      .draw({
        useMediaCoordinateSpace: (draw: (scope: unknown) => void) =>
          draw({ context: ctx, mediaSize: { width: 1000, height: 500 } }),
      } as never);
    assert.deepEqual(circles[0].slice(0, 2), [next, 189]);
  }
  assert.ok(requestedTimes.every((time) => time === 1060));
  assert.deepEqual(renderer.autoscaleInfo(40 as Logical, 44 as Logical), {
    priceRange: { minValue: 11, maxValue: 11 },
  });
  index = 500; // Extra timestamps from a Pine series do not become candle indices.
  assert.equal(renderer.autoscaleInfo(40 as Logical, 44 as Logical), null);
  x = -50;
  assert.equal(axis.visible?.(), false);
  assert.equal(axis.coordinate(), -50); // Never clamp the marker to the left edge.
  renderer.configure([point], bars.slice(2), 60);
  assert.equal(renderer.findAt(x, 189), null);
  renderer.configure([point], bars, 60);
  assert.equal(renderer.findAt(x, 189)?.point.candleTime, 1060);
  renderer.detached();
  assert.equal(axis.visible?.(), false);
});
