import { test } from "node:test";
import assert from "node:assert/strict";
import { createPineQueue } from "../src/indicators/pine-queue";
import { runPine } from "../src/indicators/pine-runtime";
import type { Candle } from "../src/domain/market";

test("Pine handles prefixed market symbols in main and security data", { timeout: 5000 }, async () => {
  const start = Date.UTC(2026, 0, 1) / 1000;
  const bars: Candle[] = Array.from({ length: 5 }, (_, i) => ({
    time: start + i * 86400, open: 0.1, high: 0.12 + i * 0.01,
    low: 0.09, close: 0.11 + i * 0.01, volume: 1000,
  }));
  const intraday = bars.flatMap(bar => Array.from({ length: 6 }, (_, i) => ({
    ...bar, time: bar.time + i * 14400,
  })));
  for (const symbol of ["FUTURES:STRKUSDT", "SPOT:STRKUSDT", "STRKUSDT"]) {
    const result = await runPine({ id: "prefix", name: "Prefix", kind: "indicator", source: `//@version=6
indicator("Prefix", overlay=true)
plot(close, title="Close")
plot(request.security(syminfo.tickerid, "D", high[1], lookahead=barmerge.lookahead_on), title="Previous high")
plot(syminfo.basecurrency == "STRK" ? 1 : 0, title="Base currency")` }, intraday, symbol, "4h", bars);
    assert.equal(result.plots.find(p => p.title === "Close")!.points.at(-1)!.value, bars.at(-1)!.close);
    assert.equal(result.plots.find(p => p.title === "Previous high")!.points.at(-1)!.value, bars.at(-2)!.high);
    assert.equal(result.plots.find(p => p.title === "Base currency")!.points.at(-1)!.value, 1);
  }
});

test("Pine finishes a slow calculation and coalesces live ticks", async () => {
  const completed: number[] = [];
  let release!: () => void;
  const blocked = new Promise<void>((resolve) => {
    release = resolve;
  });
  const queue = createPineQueue<number>(async (value) => {
    if (value === 1) await blocked;
    completed.push(value);
  });
  const done = queue.enqueue(1);
  await queue.enqueue(2);
  await queue.enqueue(3);
  assert.deepEqual(completed, []);
  release();
  await done;
  assert.deepEqual(completed, [1, 3]);
  queue.close();
  await queue.enqueue(4);
  assert.deepEqual(completed, [1, 3]);
});

test("Pine queue drops pending ticks when the instrument changes", async () => {
  const completed: number[] = [];
  let release!: () => void;
  const blocked = new Promise<void>((resolve) => {
    release = resolve;
  });
  const queue = createPineQueue<number>(async (value) => {
    await blocked;
    completed.push(value);
  });
  const done = queue.enqueue(1);
  await queue.enqueue(2);
  queue.close();
  release();
  await done;
  assert.deepEqual(completed, [1]);
});

test("Pine security previous daily high and future drawing coordinates", async () => {
  const start = Date.UTC(2026, 0, 1) / 1000;
  const daily: Candle[] = Array.from({ length: 100 }, (_, i) => ({
    time: start + i * 86400,
    open: 100 + i,
    high: 110 + i,
    low: 90 + i,
    close: 105 + i,
    volume: 100,
  }));
  const bars = daily.slice(-10).flatMap((bar) =>
    Array.from({ length: 6 }, (_, i) => ({
      ...bar,
      time: bar.time + i * 14400,
    })),
  );
  const result = await runPine(
    {
      id: "test",
      name: "SMC primitives",
      kind: "indicator",
      source: `//@version=6
indicator("SMC primitives", overlay=true)
prev = request.security(syminfo.tickerid, "D", high[1], barmerge.gaps_off, barmerge.lookahead_on)
plot(prev, "Previous day")
if barstate.islast
    box.new(bar_index - 2, high, bar_index + 5, low)
    line.new(bar_index - 2, high, bar_index + 5, high)
    label.new(bar_index, high, "BOS")
`,
    },
    bars,
    "BTCUSDT",
    "4h",
    daily,
  );
  assert.deepEqual(result.warnings, []);
  assert.equal(result.plots[0].points.at(-1)?.value, daily.at(-2)!.high);
  assert.equal(result.drawings.boxes.length, 1);
  assert.equal(result.drawings.lines.length, 1);
  assert.equal(result.drawings.labels.length, 1);
  assert.equal(result.drawings.boxes[0].xloc, "bt");
  assert.equal(
    result.drawings.boxes[0].right,
    (bars.at(-1)!.time + 5 * 14400) * 1000,
  );
  assert.equal(result.drawings.labels[0].x, bars.at(-1)!.time * 1000);
});

test("Pine input overrides change calculation and expose editable metadata", async () => {
  const bars: Candle[] = Array.from({ length: 10 }, (_, i) => ({
    time: 1_800_000_000 + i * 3600,
    open: i * 2,
    high: i * 2 + 1,
    low: i * 2 - 1,
    close: i * 2,
    volume: 1,
  }));
  const result = await runPine(
    {
      id: "input-test",
      name: "Input test",
      kind: "indicator",
      source: `//@version=6
indicator("Input test")
length = input.int(5, "Length", minval=1, maxval=8)
plot(ta.sma(close, length), "Average")
`,
    },
    bars,
    "BTCUSDT",
    "1h",
    bars,
    0.01,
    { inputs: { in_0: 3 } },
  );
  assert.equal(result.inputMeta[0].id, "in_0");
  assert.equal(result.inputMeta[0].title, "Length");
  assert.equal(result.plots[0].points.at(-1)?.value, 16);
});

test("Pine v4 runs nested security and Heikin Ashi with editable legacy inputs", async () => {
  const hourly: Candle[] = Array.from({ length: 200 }, (_, i) => ({
    time: 1767225600 + i * 3600, open: 100 + i, high: 104 + i,
    low: 98 + i, close: 102 + i, volume: 1000,
  }));
  const bars = hourly.filter((_, i) => i % 4 === 0);
  const result = await runPine({ id: "v4-mtf", name: "Legacy MTF", kind: "indicator", source: `//@version=4
study("Legacy MTF")
length = input(3, title="Length", type=input.integer, minval=1)
f_candle(tf) =>
    o = security(heikinashi(syminfo.tickerid), tf, open, barmerge.gaps_off, barmerge.lookahead_on)
    c = security(heikinashi(syminfo.tickerid), tf, close, barmerge.gaps_off, barmerge.lookahead_on)
    [o, c]
[a, b] = f_candle("60")
[c, d] = f_candle("720")
plot(a, title="HA open")
plot(b, title="HA close")
plot(d, title="12h close")
plot(sma(close, length), title="Average")` }, bars, "FUTURES:BTCUSDT", "4h", bars, 0.01,
    { inputs: { in_0: 2 } }, { "1h": hourly });
  assert.equal(result.inputMeta[0].type, "int");
  assert.equal(result.plots.find(p => p.title === "Average")!.points.at(-1)!.value, 296);
  for (const title of ["HA open", "HA close", "12h close"])
    assert.ok(result.plots.find(p => p.title === title)!.points.some(p => Number.isFinite(p.value)), title);
  assert.notEqual(result.plots.find(p => p.title === "HA open")!.points.at(-1)!.value, bars.at(-1)!.open);
});
