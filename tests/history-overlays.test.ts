import { test } from "node:test";
import assert from "node:assert/strict";
import { demoCandles } from "../src/domain/demo";
import { catalog } from "../src/domain/catalog";
import { candleCount } from "../src/domain/history";
import { handleApi, markets } from "../src/server/market-service";
import {
  binanceEndpoint,
  loadBinanceHistory,
} from "../src/server/binance-history";
import { computeDrz, deltaPivot } from "../src/indicators/drz";
import { computeSmc, requiredSmcIntervals } from "../src/indicators/smc";
import {
  normalizeDrzParams,
  drzDefaults,
  drzFields,
} from "../src/indicators/drz-settings";
import {
  normalizeSmcParams,
  smcDefaults,
  smcFields,
} from "../src/indicators/smc-settings";
import { vmcDefaults } from "../src/indicators/vmc-settings";
import { PriceOverlaysRenderer } from "../src/indicators/price-overlays-renderer";
import { emptyOverlay } from "../src/indicators/overlay-model";
import type { Candle } from "../src/domain/market";
import type { SeriesAttachedParameter, Time } from "lightweight-charts";
const now = Date.parse("2026-09-09T15:37:00Z");
const bar = (
  i: number,
  open: number,
  high: number,
  low: number,
  close: number,
  volume = 10,
): Candle => ({ time: i * 3600, open, high, low, close, volume });
test("history count boundaries and consistent demo overlaps", async () => {
  assert.equal(candleCount("4000"), 1000);
  assert.equal(candleCount(4001), 1000);
  for (const count of [300, 777, 1000, 4000]) {
    const r = await handleApi(
      new Request(
        `http://local/api/candles?symbol=HYPEUSDT&count=${count}&demo=1`,
      ),
    );
    assert.equal(r.status, 200);
    assert.equal(((await r.json()) as any).data.length, count);
  }
  for (const count of ["299", "4001", "NaN", "", "301.5"])
    assert.equal(
      (
        await handleApi(
          new Request(`http://local/api/candles?count=${count}&demo=1`),
        )
      ).status,
      400,
    );
  assert.deepEqual(
    demoCandles(catalog[0], "1h", now, 300),
    demoCandles(catalog[0], "1h", now, 4000).slice(-300),
  );
});
test("Binance pagination and partial history do not lose recent candles", async () => {
  const rows = Array.from({ length: 4000 }, (_, i) => [
      i * 3600000,
      "10",
      "12",
      "9",
      "11",
      "5",
    ]),
    calls: URL[] = [];
  const get = async (url: string) => {
    const u = new URL(url);
    calls.push(u);
    return rows
      .filter((r) => +r[0] <= +(u.searchParams.get("endTime") ?? Infinity))
      .slice(-Number(u.searchParams.get("limit")));
  };
  const r = await loadBinanceHistory("HYPEUSDT", "1h", 4000, get);
  assert.equal(r.bars.length, 4000);
  assert.equal(calls.length, 4);
  assert.equal(r.warning, undefined);
  assert.equal(calls[0].hostname, "fapi.binance.com");
  assert.equal(
    calls[1].searchParams.get("endTime"),
    String(3000 * 3600000 - 1),
  );
  assert.ok(r.bars.every((b, i) => !i || b.time > r.bars[i - 1].time));
  let page = 0;
  const partial = await loadBinanceHistory(
    "BTCUSDT",
    "1h",
    4000,
    async (url) => {
      if (page++) throw Error("timeout");
      return get(url);
    },
  );
  assert.equal(partial.bars.length, 1000);
  assert.match(partial.warning!, /1000.*4000/);
  assert.equal(binanceEndpoint("BTCUSDT").name, "Binance");
  assert.equal(
    (
      await loadBinanceHistory("BTCUSDT", "1h", 4000, async () =>
        rows.slice(-1000),
      )
    ).bars.length,
    1000,
  );
});
test("VMC screenshot defaults and normalization of indicator settings", () => {
  const expected = {
    wtGoldShow: false,
    wtMASource: "close",
    wtChannelLen: 9,
    wtAverageLen: 12,
    wtMALen: 3,
    obLevel: 5,
    obLevel2: 45,
    obLevel3: 0,
    osLevel: 0,
    osLevel2: -45,
    osLevel3: 0,
    wtShowHiddenDiv: true,
    wtDivOSLevel: -45,
    wtDivOBLevel_addshow: false,
    rsiShow: false,
    stochShow: false,
    stochUseLog: false,
  };
  for (const [k, v] of Object.entries(expected))
    assert.equal((vmcDefaults as any)[k], v, k);
  assert.deepEqual(normalizeDrzParams({}), drzDefaults);
  assert.deepEqual(normalizeSmcParams({}), smcDefaults);
  assert.equal(drzFields.length, Object.keys(drzDefaults).length);
  assert.equal(smcFields.length, Object.keys(smcDefaults).length);
  assert.equal(
    normalizeDrzParams({ maximum_zones: 999, delta_smooth: NaN }).maximum_zones,
    200,
  );
  assert.equal(
    normalizeSmcParams({ equalHighsLowsThresholdInput: -1 })
      .equalHighsLowsThresholdInput,
    0,
  );
});
test("DRZ exact delta/EMA/cumulative and pivot confirmation vectors", () => {
  const b = [
    bar(0, 10, 12, 9, 11, 10),
    bar(1, 11, 12, 9, 10, 6),
    bar(2, 10, 11, 9, 10, 20),
  ];
  assert.deepEqual(
    computeDrz(b, { delta_smooth: 1 }, { tickSize: 0.01 }).cumulative,
    [10, 4, 4],
  );
  assert.deepEqual(
    computeDrz(b, { delta_smooth: 3 }, { tickSize: 0.01 }).delta,
    [10, 2, 1],
  );
  assert.equal(deltaPivot([1, 2, 5, 4, 3], 2, 2, true), true);
  assert.equal(deltaPivot([1, 2, 5, 5, 3], 2, 2, true), false);
  assert.equal(deltaPivot([1, 2, 5, 4], 2, 2, true), false);
});
test("DRZ zone limits, settings and stable signal prefixes on 4000 candles", () => {
  const bars = demoCandles(catalog[0], "1h", now, 4000),
    p = { ...drzDefaults, tick_size: 0.01 };
  const r = computeDrz(bars, p),
    prefix = computeDrz(bars.slice(0, 1000), p);
  assert.ok(r.zones.length > 0 && r.zones.length <= 8);
  assert.ok(r.boxes.length > 0);
  assert.deepEqual(
    prefix.signals,
    r.signals.filter((s) => s.index < 1000),
  );
  assert.equal(
    computeDrz(bars, { ...p, show_zone_boxes: false }).boxes.length,
    0,
  );
  assert.notDeepEqual(
    computeDrz(bars, { ...p, atr_multiplier: 0.7 }).zones,
    r.zones,
  );
  assert.ok(
    r.zones.every(
      (z) => z.positive >= 0 && z.positive <= 100 && z.top >= z.bottom,
    ),
  );
});
test("SMC exact FVG creation and mitigation", () => {
  const bars = [
      bar(0, 9, 10, 8, 9),
      bar(1, 9, 13, 9, 12),
      bar(2, 12, 14, 11, 13),
    ],
    p = { showFairValueGapsInput: true, fairValueGapsThresholdInput: false };
  const r = computeSmc(bars, p);
  assert.equal(r.gaps.length, 1);
  assert.equal(r.gaps[0].top, 11);
  assert.equal(r.gaps[0].bottom, 10);
  assert.equal(r.signals.at(-1)?.type, "Bullish FVG");
  assert.equal(computeSmc([...bars, bar(3, 13, 14, 9, 10)], p).gaps.length, 0);
});
test("SMC confirmed HTF waits for higher candle closing", () => {
  const higher = [
      bar(0, 9, 10, 8, 9),
      bar(4, 9, 13, 9, 12),
      bar(8, 12, 14, 11, 13),
    ],
    bars = Array.from({ length: 12 }, (_, i) => bar(i, 12, 14, 11, 13));
  const p = {
    showFairValueGapsInput: true,
    fairValueGapsThresholdInput: false,
    fairValueGapsTimeframeInput: "4h",
    mtfMode: "confirmed",
  };
  assert.equal(
    computeSmc(bars.slice(0, 11), p, {
      interval: "1h",
      histories: { "4h": higher },
      now: 11 * 3600,
    }).gaps.length,
    0,
  );
  assert.equal(
    computeSmc(bars, p, {
      interval: "1h",
      histories: { "4h": higher },
      now: 12 * 3600,
    }).signals.find((s) => s.type === "Bullish FVG")?.index,
    11,
  );
  assert.deepEqual(
    requiredSmcIntervals({ ...p, showMonthlyLevelsInput: true }, "1h").sort(),
    ["1d", "4h"],
  );
});
test("SMC structures, present mode, visibility and stable prefixes", () => {
  const bars = demoCandles(catalog[0], "1h", now, 4000),
    params = {
      showTrendInput: true,
      showPremiumDiscountZonesInput: true,
      showSwingsInput: true,
      showSwingOrderBlocksInput: true,
    };
  const full = computeSmc(bars, params),
    prefix = computeSmc(bars.slice(0, 1000), params);
  assert.ok(full.signals.some((s) => s.type.includes("BOS")));
  assert.ok(full.signals.some((s) => s.type.includes("CHoCH")));
  assert.deepEqual(
    prefix.signals,
    full.signals.filter((s) => s.index < 1000),
  );
  assert.ok(full.boxes.some((b) => b.text === "Premium"));
  assert.equal(full.candleColors!.length, 4000);
  assert.ok(
    computeSmc(bars, { ...params, modeInput: "Present" }).lines.length <
      full.lines.length,
  );
  assert.equal(
    computeSmc(bars, {
      ...params,
      showInternalsInput: false,
      showStructureInput: false,
    }).lines.filter((l) => l.text === "BOS" || l.text === "CHoCH").length,
    0,
  );
});
test("SMC internal BOS/CHoCH and mitigation at known bars", () => {
  const bars = Array.from({ length: 21 }, (_, i) => bar(i, 10, 12, 8, 10));
  bars[1] = bar(1, 10, 12, 5, 8);
  bars[7] = bar(7, 10, 18, 8, 16);
  bars[13] = bar(13, 10, 20, 8, 19);
  bars[14] = bar(14, 10, 12, 6, 8);
  bars[20] = bar(20, 10, 11, 4, 5);
  const r = computeSmc(bars);
  for (const [index, type] of [
    [13, "Internal Bullish BOS"],
    [14, "Internal Bullish OB Breakout"],
    [20, "Internal Bearish CHoCH"],
  ])
    assert.ok(r.signals.some((s) => s.index === index && s.type === type));
});
test("HYPE ticker uses Futures and never joins the spot batch", async () => {
  const original = globalThis.fetch,
    urls: URL[] = [];
  globalThis.fetch = async (input) => {
    const u = new URL(String(input));
    urls.push(u);
    return Response.json(
      u.hostname === "fapi.binance.com"
        ? {
            lastPrice: "42",
            priceChangePercent: "3.5",
            quoteVolume: "1000000",
            highPrice: "43",
            lowPrice: "39",
            closeTime: now,
          }
        : [],
    );
  };
  try {
    const r = await markets({ DATA_MODE: "auto" }, true),
      h = r.data.find((q) => q.symbol === "HYPEUSDT")!;
    assert.equal(h.price, 42);
    assert.equal(h.source, "live");
    assert.equal(h.provider, "Binance Futures");
    assert.ok(
      !JSON.parse(
        urls
          .find((u) => u.searchParams.has("symbols"))!
          .searchParams.get("symbols")!,
      ).includes("HYPEUSDT"),
    );
  } finally {
    globalThis.fetch = original;
  }
});
test("SMC previous calendar month includes leap February", () => {
  const start = Date.parse("2024-01-01T00:00:00Z") / 1000,
    daily = Array.from({ length: 65 }, (_, i) => ({
      ...bar(i, 10, 12 + i, 8, 10),
      time: start + i * 86400,
    }));
  const r = computeSmc(
    daily,
    { showMonthlyLevelsInput: true },
    { interval: "1d" },
  );
  assert.equal(r.lines.find((l) => l.text === "PMH")?.price, 71);
  assert.equal(r.lines.find((l) => l.text === "PML")?.price, 8);
});
test("price overlay primitive follows both axes, clips and clears", () => {
  const renderer = new PriceOverlaysRenderer(),
    rectangles: number[][] = [];
  let scale = 10,
    offset = 0,
    inverted = false;
  renderer.attached({
    chart: {
      timeScale: () => ({
        logicalToCoordinate: (n: number) => n * scale + offset,
      }),
    },
    series: {
      priceToCoordinate: (n: number) => (inverted ? n * 2 : 400 - n * 2),
    },
    requestUpdate() {},
  } as unknown as SeriesAttachedParameter<Time>);
  const result = emptyOverlay();
  result.boxes.push({
    from: 1,
    to: 10,
    top: 110,
    bottom: 90,
    color: "#ff0000",
    opacity: 0.2,
  });
  renderer.configure([{ id: "x", name: "test", result }], "#fff");
  const ctx = new Proxy(
    { fillRect: (...v: number[]) => rectangles.push(v) },
    { get: (t, k) => (k in t ? t[k as keyof typeof t] : () => {}) },
  );
  const draw = renderer.paneViews()[0].renderer()!.draw,
    target = {
      useMediaCoordinateSpace: (cb: (scope: unknown) => void) =>
        cb({ context: ctx, mediaSize: { width: 500, height: 400 } }),
    } as unknown as Parameters<typeof draw>[0];
  draw(target);
  assert.deepEqual(rectangles.pop(), [10, 180, 90, 40]);
  scale = 20;
  offset = -30;
  inverted = true;
  draw(target);
  assert.deepEqual(rectangles.pop(), [-1, 180, 171, 40]);
  renderer.configure([], "#fff");
  draw(target);
  assert.equal(rectangles.length, 0);
  renderer.detached();
  draw(target);
  assert.equal(rectangles.length, 0);
});
