import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { sma, ema, rma, rsi, stochastic } from "../src/indicators/pine-math";
import {
  computeVmc,
  divergences,
  alignValues,
  heikinAshiDirection,
  waveTrend,
  schaff,
} from "../src/indicators/vmc";
import {
  vmcDefaults,
  vmcFields,
  normalizeVmcParams,
} from "../src/indicators/vmc-settings";
import { demoCandles } from "../src/domain/demo";
import { catalog } from "../src/domain/catalog";
import { handleApi } from "../src/server/market-service";
import type { Candle } from "../src/domain/market";
import { VmcRenderer } from "../src/indicators/vmc-renderer";
import { vmcStyleDefaults } from "../src/indicators/vmc-settings";
import type { Time } from "lightweight-charts";
const candle = (time: number, close = 10): Candle => ({
  time,
  open: close - 1,
  high: close + 2,
  low: close - 2,
  close,
  volume: 10,
});
const near = (a: number | null | undefined, b: number) =>
  assert.ok(typeof a === "number" && Math.abs(a - b) < 1e-9, `${a} != ${b}`);

test("Pine averages seed correctly and na never becomes a zero observation", () => {
  assert.deepEqual(sma([1, 2, null, 3, 4], 3), [null, null, null, 2, 3]);
  assert.deepEqual(ema([null, 2, 4, 8], 3), [null, 2, 3, 5.5]);
  const avg = rma([1, 2, 3, 4, 5], 3);
  assert.deepEqual(avg.slice(0, 3), [null, null, 2]);
  near(avg[3], 8 / 3);
  near(avg[4], 31 / 9);
  // RSI(3): changes +1,+1,-1 -> gain 2/3, loss 1/3.
  near(rsi([1, 2, 3, 2], 3)[3], 200 / 3);
  assert.deepEqual(stochastic([10, 20, 15, 30], 3), [null, 100, 50, 100]);
});
test("WaveTrend hand-calculated short vector", () => {
  const p = normalizeVmcParams({
    ...vmcDefaults,
    wtMASource: "close",
    wtChannelLen: 3,
    wtAverageLen: 3,
    wtMALen: 2,
  });
  const w = waveTrend(
    [candle(0, 10), candle(1, 12), candle(2, 14), candle(3, 13)],
    p,
  );

  assert.equal(w.wt1[0], null);
  near(w.wt1[1], 400 / 3);
  near(w.wt1[2], 350 / 3);
  near(w.wt1[3], 215 / 3);
  assert.equal(w.wt2[1], null);
  near(w.wt2[2], 125);
  near(w.wt2[3], 565 / 6);
  near(w.fast[3], -22.5);
});
test("all 84 Pine inputs remain represented and settings reject corrupt stored values", () => {
  const source = readFileSync("references/vmc2-original.pine", "utf8");
  const names = [...source.matchAll(/^(\w+)\s*=\s*input\(/gm)].map((m) => m[1]);
  assert.equal(names.length, 84);
  assert.deepEqual(
    vmcFields
      .filter((f) => f.key !== "mtfMode")
      .map((f) => f.key)
      .sort(),
    names.sort(),
  );
  const p = normalizeVmcParams({
    wtChannelLen: 0,
    rsiLen: Infinity,
    wtMASource: "bad",
    rsiSRC: "__proto__",
    sommiVwapTF: "__proto__",
    wtShow: "false",
    colorWT1blue: "url(foo)",
    rsiOversold: 30,
  });
  assert.equal(p.wtChannelLen, 1);
  assert.equal(p.rsiLen, 14);
  assert.equal(p.wtMASource, "hlc3");
  assert.equal(p.sommiVwapTF, "720");
  assert.equal(p.wtShow, true);
  assert.equal(p.rsiOversold, 30);
  assert.equal(p.colorWT1blue, vmcDefaults.colorWT1blue);
});
test("divergence is confirmed two bars after pivot, compares price and oscillator", () => {
  const values = [0, 1, 5, 1, 0, 1, 4, 1, 0];
  const bars = values.map((_, i) => ({
    ...candle(i),
    high: i === 2 ? 20 : i === 6 ? 25 : 15,
  }));
  const div = divergences(values, bars, 3, -3, true);
  assert.equal(div[6].bear, false);
  assert.equal(div[7].bear, false);
  assert.equal(div[8].bear, true);
  assert.equal(div[8].top?.index, 6);
  assert.equal(div[8].previousTop?.index, 2);
  assert.deepEqual(
    divergences(values.slice(0, 8), bars.slice(0, 8), 3, -3, true),
    div.slice(0, 8),
  );
  const hiddenBars = bars.map((b, i) => ({
    ...b,
    high: i === 2 ? 25 : i === 6 ? 20 : b.high,
  }));
  const hidden = divergences(
    [0, 1, 4, 1, 0, 1, 5, 1, 0],
    hiddenBars,
    3,
    -3,
    true,
  );
  assert.equal(hidden[8].hiddenBear, true);
});
test("MTF historical merge, lookahead and closed-candle mode", () => {
  const chart = [0, 60, 120, 180, 240, 300, 360, 420].map((t) => candle(t));
  const high = [candle(0), candle(240)];
  assert.deepEqual(
    alignValues(chart, 60, high, 240, [10, 20], false, false, 1000),
    [null, null, null, 10, 10, 10, 10, 20],
  );
  assert.deepEqual(
    alignValues(chart, 60, high, 240, [10, 20], true, false, 1000),
    [10, 10, 10, 10, 20, 20, 20, 20],
  );
  assert.deepEqual(
    alignValues(chart.slice(0, 5), 60, high, 240, [10, 999], true, true, 270),
    [null, null, null, 10, 10],
  );
  const small = [0, 60, 120, 180].map((t) => candle(t));
  assert.deepEqual(
    alignValues([candle(0)], 240, small, 60, [1, 2, 3, 4], true, false, 1000),
    [1],
  );
  assert.deepEqual(
    alignValues([candle(0)], 240, small, 60, [1, 2, 3, 4], false, false, 1000),
    [4],
  );
});
test("Heikin Ashi uses recursive synthetic open", () => {
  const bars = [
    { time: 0, open: 10, high: 16, low: 8, close: 14, volume: 1 },
    { time: 1, open: 14, high: 18, low: 12, close: 16, volume: 1 },
  ];
  assert.deepEqual(heikinAshiDirection(bars), [0, 1]);
});
test("whole VMC produces finite or null values, deterministic signals and stable prefixes", () => {
  const now = Date.parse("2026-09-07T10:37:00Z"),
    bars = demoCandles(catalog[0], "1h", now);
  const a = computeVmc(bars, vmcDefaults, { interval: "1h", now: now / 1000 });
  assert.equal(a.points.length, 400);
  assert.ok(a.events.length > 0);
  assert.equal(a.warnings.length, 0);
  assert.ok(
    a.points.every((p) =>
      Object.values(p.values).every((v) => v === null || Number.isFinite(v)),
    ),
  );
  assert.ok(a.points.some((p) => p.segments.length > 0));
  const prefix = computeVmc(bars.slice(0, 200), vmcDefaults, {
    interval: "1h",
    now: bars[199].time + 3600,
  });
  assert.deepEqual(
    prefix.points.map((p) => p.values),
    a.points.slice(0, 200).map((p) => p.values),
  );
  assert.deepEqual(
    prefix.events,
    a.events.filter((e) => e.time <= bars[199].time),
  );
  for (const point of a.points)
    for (const segment of point.segments)
      assert.equal(segment.confirmedAt - point.time, 7200);
  const changed = computeVmc(bars, { ...vmcDefaults, wtChannelLen: 20 });
  assert.notEqual(
    a.points.at(-1)!.values.wt2,
    changed.points.at(-1)!.values.wt2,
  );
  const flat = computeVmc(
    Array.from({ length: 100 }, (_, i) => ({
      time: i,
      open: 10,
      close: 10,
      high: 10,
      low: 10,
      volume: 0,
    })),
  );
  assert.ok(
    flat.points.every((p) =>
      Object.values(p.values).every((v) => v === null || Number.isFinite(v)),
    ),
  );
  assert.deepEqual(computeVmc([]).points, []);
});
test("MTF calculation loads all requested contexts and reports absent histories", () => {
  const now = Date.parse("2026-09-07T10:37:00Z"),
    bars = demoCandles(catalog[0], "1h", now);
  const params = {
    ...vmcDefaults,
    sommiFlagShow: true,
    sommiDiamondShow: true,
    sommiShowVwap: true,
    macdWTColorsShow: true,
    mtfMode: "confirmed",
  };
  const result = computeVmc(bars, params, {
    interval: "1h",
    histories: {
      "4h": demoCandles(catalog[0], "4h", now),
      "12h": demoCandles(catalog[0], "12h", now),
    },
    now: now / 1000,
  });
  assert.equal(result.warnings.length, 0);
  assert.ok(result.points.at(-1)!.values.sommi !== null);
  assert.ok(result.points.some((p) => p.wt1Color !== vmcDefaults.colorWT1blue));
  const missing = computeVmc(bars, params, { interval: "1h", now: now / 1000 });
  assert.equal(missing.warnings.length, 2);
  assert.ok(missing.points.every((p) => p.values.sommi === null));
});
test("new API candle intervals and explicit demo provenance", async () => {
  for (const tf of ["30m", "2h", "8h", "12h"]) {
    const r = await handleApi(
      new Request(
        `http://local/api/candles?symbol=BTCUSDT&interval=${tf}&demo=1`,
      ),
    );
    assert.equal(r.status, 200);
    const d = (await r.json()) as any;
    assert.equal(d.source, "demo");
    assert.equal(d.data.length, 400);
  }
  assert.equal(
    (await handleApi(new Request("http://local/api/candles?interval=720")))
      .status,
    400,
  );
});

test("MFI and Schaff hand-calculated vectors", () => {
  const bars = [10, 12, 14, 13].map((v, i) => candle(i, v));
  const result = computeVmc(bars, { ...vmcDefaults, rsiMFIperiod: 2 });
  assert.deepEqual(
    result.points.map((p) => p.values.mfi),
    [null, 35, 35, 35],
  );
  assert.deepEqual(
    schaff(
      [10, 12, 14, 13],
      normalizeVmcParams({
        tcfastLength: 1,
        tcslowLength: 3,
        tclength: 2,
        tcfactor: 0.5,
      }),
    ),
    [0, 50, 75, 37.5],
  );
});

test("custom renderer handles warm-up, markers and clipping without invalid coordinates", () => {
  const result = computeVmc(
    demoCandles(catalog[0], "1h", Date.parse("2026-09-07T10:37:00Z")),
  );
  const renderer = new VmcRenderer(vmcDefaults, vmcStyleDefaults, "#ffffff", 1);
  const data = result.points.map((point, index) => ({
    time: point.time as Time,
    point,
    index,
  }));
  for (const point of data)
    assert.ok(renderer.priceValueBuilder(point).every(Number.isFinite));
  renderer.update({
    bars: data.map((originalData, i) => ({
      x: i * 3,
      time: i,
      originalData,
      barColor: "#fff",
    })),
    barSpacing: 3,
    visibleRange: { from: 0, to: data.length },
  });
  let drawingCalls = 0;
  const check = (...args: unknown[]) => {
    drawingCalls++;
    for (const x of args)
      if (typeof x === "number") assert.ok(Number.isFinite(x));
  };
  const context = new Proxy({} as CanvasRenderingContext2D, {
    get: () => check,
    set: () => true,
  });
  const target = {
    useMediaCoordinateSpace: (callback: (scope: unknown) => void) =>
      callback({ context, mediaSize: { width: 800, height: 250 } }),
  };
  renderer
    .renderer()
    .draw(
      target as Parameters<ReturnType<VmcRenderer["renderer"]>["draw"]>[0],
      (value) =>
        (125 - value) as ReturnType<
          Parameters<ReturnType<VmcRenderer["renderer"]>["draw"]>[1]
        >,
      false,
    );
  assert.ok(drawingCalls > 100);
  renderer.destroy();
});
