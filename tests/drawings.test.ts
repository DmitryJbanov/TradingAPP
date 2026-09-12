import { test } from "node:test";
import assert from "node:assert/strict";
import {
  logicalAtTime,
  timeAtLogical,
  readDrawings,
  type Drawing,
} from "../src/domain/drawings";
import { DrawingsRenderer } from "../src/components/drawings-renderer";
import type { Candle } from "../src/domain/market";
import type { SeriesAttachedParameter, Time } from "lightweight-charts";
const bars = [100, 160, 280, 340].map((time) => ({
  time,
  open: 10,
  high: 12,
  low: 8,
  close: 11,
  volume: 1,
})) as Candle[];
test("drawing anchors round-trip across gaps, fractional candles and history growth", () => {
  for (const logical of [-2, 0, 0.25, 1.5, 2, 3, 5.75]) {
    const time = timeAtLogical(bars, logical, 60);
    assert.ok(Math.abs(logicalAtTime(bars, time, 60) - logical) < 1e-9);
  }
  const time = timeAtLogical(bars, 1.5, 60);
  const grown = [{ ...bars[0], time: 40 }, ...bars];
  assert.equal(logicalAtTime(grown, time, 60), 2.5);
});
test("stored drawing validation rejects corrupt and unbounded objects", () => {
  const d: Drawing = {
    id: "a",
    tool: "rectangle",
    color: "#ff0000",
    points: [
      { time: 100, price: 10 },
      { time: 160, price: 20 },
    ],
  };
  assert.deepEqual(
    readDrawings([
      d,
      null,
      { ...d, tool: "unknown" },
      { ...d, color: "red" },
      { ...d, points: [{ time: NaN, price: 2 }] },
    ]),
    [d],
  );
  assert.equal(readDrawings(Array(250).fill(d)).length, 200);
  assert.equal(
    readDrawings([{ ...d, points: Array(2001).fill(d.points[0]) }]).length,
    0,
  );
});
test("drawing primitive paints every tool and a one-point Fibonacci preview without errors", () => {
  const renderer = new DrawingsRenderer();
  const calls: string[] = [];
  const ctx = new Proxy(
    {},
    {
      set: () => true,
      get:
        (_, name) =>
        (...args: unknown[]) => {
          for (const arg of args)
            if (typeof arg === "number") assert.ok(Number.isFinite(arg));
          calls.push(String(name));
        },
    },
  );
  let offset = 0;
  renderer.attached({
    chart: {
      timeScale: () => ({
        logicalToCoordinate: (x: number) => x * 20 + offset,
      }),
    },
    series: { priceToCoordinate: (p: number) => p * 2 },
    requestUpdate: () => {},
  } as unknown as SeriesAttachedParameter<Time>);
  const drawings = (
    ["brush", "horizontal", "vertical", "rectangle", "fibonacci"] as const
  ).map((tool) => ({
    id: tool,
    tool,
    color: "#ff0000",
    points: [
      { time: 100, price: 10 },
      { time: 280, price: 30 },
    ],
  }));
  renderer.configure(
    [...drawings, { ...drawings[4], points: [drawings[4].points[0]] }],
    bars,
    60,
  );
  const draw = renderer.paneViews()[0].renderer()!.draw;
  const target = {
    useMediaCoordinateSpace: (callback: any) =>
      callback({ context: ctx, mediaSize: { width: 500, height: 300 } }),
  } as any;
  draw(target);
  offset = 50;
  draw(target);
  assert.ok(calls.includes("fillText"));
  assert.ok(calls.includes("strokeRect"));
  assert.ok(calls.includes("clip"));
  renderer.configure([], bars, 60);
  calls.length = 0;
  draw(target);
  assert.ok(!calls.includes("stroke"));
  renderer.detached();
});
