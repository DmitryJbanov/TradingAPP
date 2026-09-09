import { test } from "node:test";
import assert from "node:assert/strict";
import type { Candle } from "../src/domain/market";
import {
  computeOrderBlocks,
  maxOrderBlocks,
} from "../src/indicators/order-blocks";
import {
  normalizeOrderBlockParams,
  orderBlockDefaults,
} from "../src/indicators/order-blocks-settings";
import { OrderBlocksRenderer } from "../src/indicators/order-blocks-renderer";
import type { SeriesAttachedParameter, Time } from "lightweight-charts";

// Construct opens from a prescribed four-bar percentage change, independently
// of the implementation. Flat candle bodies cannot be picked as OB sources.
function fromRoc(values: number[]): Candle[] {
  const bars: Candle[] = [];
  for (let i = 0; i < values.length; i++) {
    const open = i < 4 ? 100 : bars[i - 4].open * (1 + values[i] / 100);
    bars.push({
      time: 1_700_000_000 + i * 3600,
      open,
      close: open,
      high: open + 1,
      low: open - 1,
      volume: 10,
    });
  }
  return bars;
}
function fixture(side: "bullish" | "bearish" = "bullish", length = 15) {
  const values = Array<number>(length).fill(0);
  values[5] = side === "bullish" ? -2 : 2;
  values[11] = side === "bullish" ? 2 : -2;
  const bars = fromRoc(values);
  bars[7] = {
    ...bars[7],
    close: side === "bullish" ? 99 : 101,
    high: 110,
    low: 90,
  };
  return bars;
}

test("Sonarlab ROC, first crossing, shared cooldown and source candle match Pine", () => {
  for (const side of ["bullish", "bearish"] as const) {
    const bars = fixture(side);
    const original = structuredClone(bars);
    assert.equal(
      computeOrderBlocks(bars.slice(0, 11), { sens: 100 }).blocks.length,
      0,
    );
    const result = computeOrderBlocks(bars, { sens: 100 });
    assert.deepEqual(result.roc.slice(0, 5), [null, null, null, null, 0]);
    assert.equal(result.roc[5], side === "bullish" ? -2 : 2);
    assert.deepEqual(result.blocks, [
      {
        id: `${bars[11].time}:${side}`,
        side,
        startTime: bars[7].time,
        createdAt: bars[11].time,
        top: 110,
        bottom: 90,
      },
    ]);
    assert.equal(result.events[0].time, bars[11].time);
    assert.equal(result.events[0].side, side);
    assert.deepEqual(bars, original);
  }
  const values = Array<number>(18).fill(0);
  values[5] = -2;
  values[10] = 2;
  values[16] = -2;
  const bars = fromRoc(values);
  bars[6] = { ...bars[6], close: bars[6].open - 1, high: 150, low: 50 };
  bars[12] = { ...bars[12], close: bars[12].open + 1, high: 150, low: 50 };
  assert.equal(
    computeOrderBlocks(bars.slice(0, 16), { sens: 100 }).blocks.length,
    0,
  );
  const result = computeOrderBlocks(bars, { sens: 100 });
  assert.equal(result.blocks.length, 1);
  assert.equal(result.blocks[0].createdAt, bars[16].time);
});

test("Sonarlab uses strict ROC crossings, inclusive previous threshold and 4..15 source search", () => {
  const values = Array<number>(13).fill(0);
  values[5] = -2;
  values[11] = 1;
  values[12] = 2;
  const bars = fromRoc(values);
  bars[8] = { ...bars[8], close: bars[8].open - 1, high: 150, low: 50 };
  // A matching body within the last three bars must not be selected.
  bars[10].close = bars[10].open - 1;
  assert.equal(
    computeOrderBlocks(bars.slice(0, 12), { sens: 100 }).blocks.length,
    0,
  );
  assert.equal(
    computeOrderBlocks(bars, { sens: 100 }).blocks[0].startTime,
    bars[8].time,
  );

  const fallback = fixture();
  fallback[7].close = fallback[7].open;
  fallback[11] = { ...fallback[11], high: 150, low: 50 };
  const block = computeOrderBlocks(fallback, { sens: 100 }).blocks[0];
  assert.equal(block.startTime, fallback[11].time);
  assert.equal(block.top, 150);
  assert.equal(block.bottom, 50);
});

test("Sonarlab Close mitigation uses previous close; Wick uses current extreme in both directions", () => {
  for (const side of ["bullish", "bearish"] as const) {
    const bars = fixture(side);
    bars[12] = {
      ...bars[12],
      close: side === "bullish" ? 89 : 111,
      low: 88,
      high: 112,
    };
    assert.equal(
      computeOrderBlocks(bars.slice(0, 13), { sens: 100 }).blocks.length,
      1,
    );
    assert.equal(
      computeOrderBlocks(bars.slice(0, 13), {
        sens: 100,
        OBMitigationType: "Wick",
      }).blocks.length,
      0,
    );
    const removed = computeOrderBlocks(bars.slice(0, 14), { sens: 100 });
    assert.equal(removed.blocks.length, 0);
    assert.equal(
      removed.events.at(-1)?.time,
      bars[13].time,
      "source still alerts on deletion bar",
    );
    bars[12].close = side === "bullish" ? 90 : 110;
    assert.equal(
      computeOrderBlocks(bars.slice(0, 14), { sens: 100 }).blocks.length,
      1,
      "equal close preserves zone",
    );
    bars[12].low = 90;
    bars[12].high = 110;
    assert.equal(
      computeOrderBlocks(bars.slice(0, 13), {
        sens: 100,
        OBMitigationType: "Wick",
      }).blocks.length,
      1,
      "equal wick preserves zone",
    );
  }
});

test("Sonarlab signals honor switches and only the first alert call per bar", () => {
  const values = Array<number>(21).fill(0);
  values[5] = -2;
  values[11] = 2;
  values[17] = -2;
  const bars = fromRoc(values);
  bars[7] = { ...bars[7], close: 99, low: 50, high: 150 };
  bars[13] = { ...bars[13], close: bars[13].open + 1, low: 50, high: 150 };
  const result = computeOrderBlocks(bars, { sens: 100 });
  assert.equal(result.blocks.length, 2);
  assert.equal(result.events.filter((e) => e.time === bars[17].time).length, 1);
  assert.equal(
    result.events.find((e) => e.time === bars[17].time)?.side,
    "bearish",
  );
  const buyOnly = computeOrderBlocks(bars, { sens: 100, sell_alert: false });
  assert.ok(buyOnly.events.every((e) => e.side === "bullish"));
  assert.equal(buyOnly.events.at(-1)?.time, bars[20].time);
  assert.deepEqual(
    computeOrderBlocks(bars, { sens: 100, buy_alert: false, sell_alert: false })
      .events,
    [],
  );
});

test("Sonarlab caps boxes globally, evicts the oldest and replays the current candle without stale zones", () => {
  const values = Array<number>(200).fill(0);
  for (let i = 5; i < values.length; i += 6)
    values[i] = ((i - 5) / 6) % 2 === 0 ? -2 : 2;
  const bars = fromRoc(values).map((bar, i) => ({
    ...bar,
    close: bar.open + (i % 2 ? 1 : -1),
    high: 1000,
    low: 0,
  }));
  const result = computeOrderBlocks(bars, { sens: 100 });
  assert.equal(result.blocks.length, maxOrderBlocks);
  assert.equal(result.blocks[0].createdAt, bars[83].time);
  assert.equal(result.blocks.at(-1)?.createdAt, bars[197].time);
  const current = fixture().slice(0, 12);
  const first = computeOrderBlocks(current, {
    sens: 100,
    OBMitigationType: "Wick",
  });
  assert.equal(first.blocks.length, 1);
  const updated = structuredClone(current);
  updated[11].low = 89;
  assert.equal(
    computeOrderBlocks(updated, { sens: 100, OBMitigationType: "Wick" }).blocks
      .length,
    0,
  );
  assert.deepEqual(
    computeOrderBlocks(current, { sens: 100, OBMitigationType: "Wick" }),
    first,
  );
});

test("Sonarlab handles missing history, zero opens and invalid stored parameters", () => {
  assert.deepEqual(computeOrderBlocks([]), { blocks: [], events: [], roc: [] });
  const bars = fixture();
  bars[0].open = 0;
  bars[5].open = NaN;
  const result = computeOrderBlocks(bars);
  assert.equal(result.roc[4], null);
  assert.equal(result.roc[5], null);
  assert.equal(result.roc[9], null);
  assert.ok(
    result.roc.every((value) => value === null || Number.isFinite(value)),
  );
  const p = normalizeOrderBlockParams({
    sens: Infinity,
    OBMitigationType: "invalid",
    buy_alert: "false",
    sell_alert: false,
    col_bullish: "url(foo)",
    bullishTransparency: -5,
    bearishTransparency: 105,
    _v: "bad",
  });
  assert.deepEqual(p, {
    ...orderBlockDefaults,
    sell_alert: false,
    bullishTransparency: 0,
    bearishTransparency: 100,
  });
  assert.equal(normalizeOrderBlockParams({ sens: 0 }).sens, 1);
  assert.equal(normalizeOrderBlockParams({ sens: 1.9 }).sens, 2);
});

test("Sonarlab primitive extends right, follows price/time transforms and clears on removal", () => {
  const renderer = new OrderBlocksRenderer();
  const rectangles: number[][] = [];
  let updates = 0,
    x = -20,
    inverted = false;
  const attachment = {
    chart: { timeScale: () => ({ timeToCoordinate: () => x }) },
    series: {
      priceToCoordinate: (price: number) =>
        inverted ? price * 2 : 400 - price * 2,
    },
    requestUpdate: () => updates++,
  } as unknown as SeriesAttachedParameter<Time>;
  renderer.attached(attachment);
  renderer.configure([
    {
      id: "one",
      params: orderBlockDefaults,
      result: computeOrderBlocks(fixture(), { sens: 100 }),
    },
  ]);
  const draw = renderer.paneViews()[0].renderer()!.draw;
  const ctx = new Proxy(
    { fillRect: (...values: number[]) => rectangles.push(values) },
    {
      get(target, property) {
        return property in target
          ? target[property as keyof typeof target]
          : () => {};
      },
    },
  );
  const target = {
    useMediaCoordinateSpace: (callback: (scope: unknown) => void) =>
      callback({ context: ctx, mediaSize: { width: 500, height: 400 } }),
  } as unknown as Parameters<typeof draw>[0];
  draw(target);
  assert.deepEqual(rectangles.pop(), [0, 180, 500, 40]);
  x = 30;
  inverted = true;
  draw(target);
  assert.deepEqual(rectangles.pop(), [30, 180, 470, 40]);
  x = 600;
  draw(target);
  assert.equal(rectangles.length, 0);
  renderer.configure([]);
  x = 30;
  draw(target);
  assert.equal(rectangles.length, 0);
  renderer.detached();
  draw(target);
  assert.equal(rectangles.length, 0);
  assert.equal(updates, 3);
});
