import { test } from "node:test";
import assert from "node:assert/strict";
import { createPineQueue } from "../src/indicators/pine-queue";
import { runPine } from "../src/indicators/pine-runtime";
import type { Candle } from "../src/domain/market";

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
