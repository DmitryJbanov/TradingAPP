import { test } from "node:test";
import assert from "node:assert/strict";
import {
  fractionalLogicalAtCoordinate,
  coordinateAtFractionalLogical,
  logicalAtTime,
  timeAtLogical,
  readDrawings,
  type Drawing,
  defaultProfile,
  drawingHandles,
  resizedDrawingPoints,
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
test("drawing coordinates preserve positions between candle centers", () => {
  const scale = {
    coordinateToLogical: (x: number) => Math.round(x / 20),
    logicalToCoordinate: (i: number) => Number.isInteger(i) ? i * 20 : 0,
  } as unknown as Parameters<typeof fractionalLogicalAtCoordinate>[0];
  for (const x of [-9, 0, 7, 19, 25, 88]) {
    const logical = fractionalLogicalAtCoordinate(scale, x);
    assert.notEqual(logical, null);
    assert.ok(Math.abs(coordinateAtFractionalLogical(scale, logical!)! - x) < 1e-9);
  }
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
test("line, arrow and parallel channel validate, move and resize their handles", () => {
  const points = [{time:100,price:10},{time:280,price:20},{time:100,price:15}];
  for (const tool of ["trend", "arrow", "channel"] as const) {
    const d: Drawing = {id:tool, tool, color:"#ffffff", points: tool === "channel" ? points : points.slice(0,2)};
    assert.equal(readDrawings([d]).length,1);
    assert.equal(drawingHandles(d).length,tool === "channel" ? 3 : 2);
    assert.deepEqual(resizedDrawingPoints(d, 1, {time:340,price:25})[1], {time:340,price:25});
  }
  assert.equal(readDrawings([{id:"bad",tool:"channel",color:"#ffffff",points:points.slice(0,2)}]).length,0);
});
test("profile delta uses lower timeframe candles for the full original range on every chart timeframe", () => {
  const renderer = new DrawingsRenderer();
  const main = [{time:100,open:100,high:110,low:90,close:105,volume:140}] as Candle[];
  const lower = [
    {time:100,open:100,high:110,low:90,close:105,volume:100},
    {time:160,open:105,high:110,low:90,close:100,volume:40},
  ] as Candle[];
  const drawing: Drawing = {id:"p",tool:"volume-profile",color:"#ffffff",points:[{time:100,price:110},{time:100,price:90}],profile:{...defaultProfile,rows:10,autoExtendRight:false,endInterval:120}};
  renderer.configure([drawing],main,3600,undefined,undefined,.01,lower);
  const first = renderer.profileData(drawing);
  assert.ok(Math.abs(first.up.reduce((a,b)=>a+b,0)-100)<1e-6);
  assert.ok(Math.abs(first.down.reduce((a,b)=>a+b,0)-40)<1e-6);
  renderer.configure([drawing],main,14400,undefined,undefined,.01,lower);
  const second = renderer.profileData(drawing);
  assert.deepEqual(second.up,first.up); assert.deepEqual(second.down,first.down);
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
    ["brush", "horizontal", "vertical", "rectangle", "fibonacci", "trend", "arrow", "channel"] as const
  ).map((tool) => ({
    id: tool,
    tool,
    color: "#ff0000",
    points: tool === "channel" ? [{time:100,price:10},{time:280,price:30},{time:100,price:20}] : [
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
