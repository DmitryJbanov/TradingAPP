/** Adapted from Smart Money Concepts [LuxAlgo], CC BY-NC-SA-4.0, © LuxAlgo.
 * See references/smc-original.pine and docs/INDICATORS_DRZ_SMC.md.
 */
import {
  candleIntervals,
  type Candle,
  type CandleInterval,
  type Timeframe,
} from "../domain/market";
import { normalizeSmcParams, type SmcParams } from "./smc-settings";
import {
  atr,
  emptyOverlay,
  logicalIndex,
  trueRanges,
  type OverlayResult,
} from "./overlay-model";
import { finite } from "./pine-math";
interface Pivot {
  level: number;
  previous: number;
  at: number;
  crossed: boolean;
}
interface Structure {
  leg: number;
  bias: number;
  high: Pivot;
  low: Pivot;
}
export interface SmcBlock {
  top: number;
  bottom: number;
  at: number;
  bias: number;
  internal: boolean;
}
interface Gap {
  top: number;
  bottom: number;
  from: number;
  to: number;
  bias: number;
}
export interface SmcContext {
  interval?: Timeframe;
  histories?: Partial<Record<CandleInterval, Candle[]>>;
  now?: number;
}
export interface SmcResult extends OverlayResult {
  blocks: SmcBlock[];
  gaps: Gap[];
}
const pivot = (): Pivot => ({
  level: NaN,
  previous: NaN,
  at: 0,
  crossed: false,
});
const structure = (): Structure => ({
  leg: 0,
  bias: 0,
  high: pivot(),
  low: pivot(),
});
export function requiredSmcIntervals(
  raw: unknown,
  interval: Timeframe,
): CandleInterval[] {
  const p = normalizeSmcParams(raw),
    frames = new Set<CandleInterval>();
  if (p.showFairValueGapsInput && p.fairValueGapsTimeframeInput !== "Chart")
    frames.add(p.fairValueGapsTimeframeInput as CandleInterval);
  if (
    p.showDailyLevelsInput ||
    p.showWeeklyLevelsInput ||
    p.showMonthlyLevelsInput
  )
    frames.add("1d");
  frames.delete(interval);
  return [...frames];
}
export function computeSmc(
  bars: Candle[],
  raw: unknown = {},
  context: SmcContext = {},
): SmcResult {
  const p = normalizeSmcParams(raw),
    result: SmcResult = {
      ...emptyOverlay(),
      blocks: [],
      gaps: [],
      candleColors: [],
    };
  if (!bars.length) return result;
  const interval = context.interval ?? "1h",
    step = candleIntervals[interval],
    now = context.now ?? bars.at(-1)!.time + step;
  const swing = structure(),
    internal = structure(),
    equal = structure(),
    atrs = atr(bars, 200),
    ranges = trueRanges(bars),
    highs: number[] = [],
    lows: number[] = [];
  let rangeSum = 0,
    blocks: SmcBlock[] = [],
    gaps: Gap[] = [];
  let trailing = { top: NaN, bottom: NaN, at: 0, topAt: 0, bottomAt: 0 },
    drawn = { ...trailing },
    drawnBias = 0;
  const mono = p.styleInput === "Monochrome";
  const color = (bull: boolean, inner = false) =>
    mono
      ? bull
        ? "#b2b5be"
        : "#5d606b"
      : inner
        ? bull
          ? p.internalBullColorInput
          : p.internalBearColorInput
        : bull
          ? p.swingBullColorInput
          : p.swingBearColorInput;
  const signal = (i: number, type: string) =>
    result.signals.push({ index: i, time: bars[i].time, type });
  function retain(group: string) {
    if (p.modeInput === "Present") {
      result.lines = result.lines.filter((x) => x.group !== group);
      result.labels = result.labels.filter((x) => x.group !== group);
    }
  }
  const gapFrame =
    p.fairValueGapsTimeframeInput === "Chart"
      ? interval
      : (p.fairValueGapsTimeframeInput as CandleInterval);
  const gapStep = candleIntervals[gapFrame],
    gapBars = gapFrame === interval ? bars : context.histories?.[gapFrame],
    gapEvents = new Map<number, number>();
  if (p.showFairValueGapsInput) {
    if (gapStep < step)
      result.warnings.push("SMC: выберите текущий или старший таймфрейм FVG.");
    else if (!gapBars?.length)
      result.warnings.push(`SMC: история ${gapFrame} для FVG недоступна.`);
    else
      for (let j = 1; j < gapBars.length; j++) {
        const available =
          gapFrame === interval || p.mtfMode === "pine"
            ? gapBars[j].time
            : gapBars[j].time + gapStep - step;
        if (
          gapFrame !== interval &&
          p.mtfMode === "confirmed" &&
          gapBars[j].time + gapStep > now
        )
          continue;
        const at = Math.ceil(logicalIndex(bars, available, step));
        if (at >= 0 && at < bars.length) gapEvents.set(at, j);
      }
    if (gapFrame !== interval && p.mtfMode === "pine")
      result.warnings.push(
        "SMC FVG: Pine lookahead использует итоговые данные старшей свечи; история может перерисовываться.",
      );
  }
  let deltaSum = 0;
  for (let i = 0; i < bars.length; i++) {
    const b = bars[i];
    result.candleColors!.push(
      p.showTrendInput ? color(internal.bias === 1) : undefined,
    );
    rangeSum += i ? ranges[i] : 0;
    const volatility =
      p.orderBlockFilterInput === "Atr" ? atrs[i] : i ? rangeSum / i : null;
    const large = finite(volatility) && b.high - b.low >= 2 * volatility;
    highs.push(large ? b.low : b.high);
    lows.push(large ? b.high : b.low);
    if (p.showHighLowSwingsInput || p.showPremiumDiscountZonesInput) {
      trailing.top = Math.max(trailing.top, b.high);
      trailing.bottom = Math.min(trailing.bottom, b.low);
      if (trailing.top === b.high) trailing.topAt = i;
      if (trailing.bottom === b.low) trailing.bottomAt = i;
      drawn = { ...trailing };
      drawnBias = swing.bias;
    }
    // Source stores bearish top=currentHigh, bottom=last2Low; keep its mitigation semantics.
    gaps = gaps.filter((g) =>
      g.bias === 1 ? b.low >= g.bottom : b.high <= g.top,
    );
    const previous = new Map<Structure, [number, number]>(
      [swing, internal, equal].map((s) => [s, [s.high.level, s.low.level]]),
    );
    function update(
      s: Structure,
      length: number,
      kind: "swing" | "internal" | "equal",
    ) {
      if (i < length) return;
      const at = i - length;
      let max = -Infinity,
        min = Infinity;
      for (let k = at + 1; k <= i; k++) {
        max = Math.max(max, bars[k].high);
        min = Math.min(min, bars[k].low);
      }
      const leg = bars[at].high > max ? 0 : bars[at].low < min ? 1 : s.leg;
      if (leg === s.leg) return;
      s.leg = leg;
      const low = leg === 1,
        target = low ? s.low : s.high,
        level = low ? bars[at].low : bars[at].high;
      if (
        kind === "equal" &&
        finite(atrs[i]) &&
        Math.abs(target.level - level) <
          p.equalHighsLowsThresholdInput * atrs[i]!
      ) {
        const tag = low ? "EQL" : "EQH",
          group = `equal-${tag}`;
        retain(group);
        result.lines.push({
          from: target.at,
          to: at,
          price: target.level,
          endPrice: level,
          color: color(low),
          dash: "Dotted",
          text: tag,
          size: p.equalHighsLowsSizeInput,
          group,
        });
        signal(i, tag);
      }
      target.previous = target.level;
      target.level = level;
      target.at = at;
      target.crossed = false;
      if (kind === "swing") {
        trailing.at = at;
        if (low) {
          trailing.bottom = level;
          trailing.bottomAt = at;
        } else {
          trailing.top = level;
          trailing.topAt = at;
        }
        if (p.showSwingsInput) {
          const group = `swing-point-${low}`;
          retain(group);
          result.labels.push({
            at,
            price: level,
            text: low
              ? level < target.previous
                ? "LL"
                : "HL"
              : level > target.previous
                ? "HH"
                : "LH",
            color: color(low),
            below: low,
            group,
          });
        }
      }
    }
    update(swing, p.swingsLengthInput, "swing");
    update(internal, 5, "internal");
    if (p.showEqualHighsLowsInput)
      update(equal, p.equalHighsLowsLengthInput, "equal");
    function display(s: Structure, inner: boolean) {
      if (!i) return;
      for (const bull of [true, false]) {
        const target = bull ? s.high : s.low,
          previousLevel = previous.get(s)![bull ? 0 : 1];
        const cross = bull
          ? b.close > target.level && bars[i - 1].close <= previousLevel
          : b.close < target.level && bars[i - 1].close >= previousLevel;
        // Intentionally preserve the supplied Pine expression (including min(close, open-low)).
        const wick = b.high - Math.max(b.close, b.open),
          lower = Math.min(b.close, b.open - b.low);
        const confluence =
          !p.internalFilterConfluenceInput ||
          (bull ? wick > lower : wick < lower);
        if (
          !cross ||
          target.crossed ||
          (inner &&
            (target.level === (bull ? swing.high.level : swing.low.level) ||
              !confluence))
        )
          continue;
        const tag = s.bias === (bull ? -1 : 1) ? "CHoCH" : "BOS";
        target.crossed = true;
        s.bias = bull ? 1 : -1;
        signal(
          i,
          `${inner ? "Internal" : "Swing"} ${bull ? "Bullish" : "Bearish"} ${tag}`,
        );
        const selected = inner
          ? bull
            ? p.showInternalBullInput
            : p.showInternalBearInput
          : bull
            ? p.showSwingBullInput
            : p.showSwingBearInput;
        if (
          (inner ? p.showInternalsInput : p.showStructureInput) &&
          (selected === "All" || selected === tag)
        ) {
          const group = `structure-${inner}-${bull}`;
          retain(group);
          result.lines.push({
            from: target.at,
            to: i,
            price: target.level,
            color: color(bull, inner),
            dash: inner ? "Dashed" : "Solid",
            text: tag,
            size: inner ? p.internalStructureSize : p.swingStructureSize,
            group,
          });
        }
        if (
          inner ? p.showInternalOrderBlocksInput : p.showSwingOrderBlocksInput
        ) {
          let at = target.at;
          for (let j = target.at + 1; j < i; j++)
            if (bull ? lows[j] < lows[at] : highs[j] > highs[at]) at = j;
          blocks.unshift({
            at,
            top: highs[at],
            bottom: lows[at],
            bias: s.bias,
            internal: inner,
          });
          let count = 0;
          blocks = blocks.filter((o) => o.internal !== inner || ++count <= 100);
        }
      }
    }
    if (
      p.showInternalsInput ||
      p.showInternalOrderBlocksInput ||
      p.showTrendInput
    )
      display(internal, true);
    if (
      p.showStructureInput ||
      p.showSwingOrderBlocksInput ||
      p.showHighLowSwingsInput
    )
      display(swing, false);
    blocks = blocks.filter((ob) => {
      const broken =
        ob.bias === 1
          ? (p.orderBlockMitigationInput === "Close" ? b.close : b.low) <
            ob.bottom
          : (p.orderBlockMitigationInput === "Close" ? b.close : b.high) >
            ob.top;
      if (broken)
        signal(
          i,
          `${ob.internal ? "Internal" : "Swing"} ${ob.bias === 1 ? "Bullish" : "Bearish"} OB Breakout`,
        );
      return !broken;
    });
    const j = gapEvents.get(i);
    if (j !== undefined && gapBars) {
      const current = gapBars[j],
        last = gapBars[j - 1],
        earlier = gapBars[j - 2],
        delta = (last.close - last.open) / (last.open * 100);
      deltaSum += Math.abs(delta);
      if (!earlier) continue;
      const threshold = p.fairValueGapsThresholdInput
        ? i
          ? (deltaSum / i) * 2
          : Infinity
        : 0;
      const bull =
          current.low > earlier.high &&
          last.close > earlier.high &&
          delta > threshold,
        bear =
          current.high < earlier.low &&
          last.close < earlier.low &&
          -delta > threshold;
      if (bull || bear) {
        gaps.unshift({
          top: bull ? current.low : current.high,
          bottom: bull ? earlier.high : earlier.low,
          bias: bull ? 1 : -1,
          from: logicalIndex(bars, last.time, step),
          to:
            logicalIndex(bars, current.time, step) + p.fairValueGapsExtendInput,
        });
        signal(i, bull ? "Bullish FVG" : "Bearish FVG");
        gaps = gaps.slice(0, 200);
      }
    }
    if (result.lines.length > 500)
      result.lines.splice(0, result.lines.length - 500);
    if (result.labels.length > 500)
      result.labels.splice(0, result.labels.length - 500);
  }
  const right = bars.length - 1;
  for (const inner of [true, false])
    for (const ob of blocks
      .filter((b) => b.internal === inner)
      .slice(
        0,
        inner ? p.internalOrderBlocksSizeInput : p.swingOrderBlocksSizeInput,
      )) {
      const c = mono
        ? color(ob.bias === 1)
        : inner
          ? ob.bias === 1
            ? p.internalBullishOrderBlockColor
            : p.internalBearishOrderBlockColor
          : ob.bias === 1
            ? p.swingBullishOrderBlockColor
            : p.swingBearishOrderBlockColor;
      result.boxes.push({
        from: ob.at,
        to: right + 600,
        top: ob.top,
        bottom: ob.bottom,
        color: c,
        opacity: 0.2,
        border: inner ? undefined : c,
      });
    }
  for (const g of gaps) {
    const c =
      g.bias === 1
        ? p.fairValueGapsBullColorInput
        : p.fairValueGapsBearColorInput;
    result.boxes.push({
      from: g.from,
      to: g.to,
      top: g.top,
      bottom: g.bottom,
      color: c,
      opacity: 0.3,
      border: c,
    });
    result.lines.push({
      from: g.from,
      to: g.to,
      price: (g.top + g.bottom) / 2,
      color: c,
    });
  }
  const t = drawn;
  if (p.showHighLowSwingsInput) {
    if (finite(t.top))
      result.lines.push({
        from: t.topAt,
        to: right + 20,
        price: t.top,
        color: color(false),
        text: drawnBias === -1 ? "Strong High" : "Weak High",
      });
    if (finite(t.bottom))
      result.lines.push({
        from: t.bottomAt,
        to: right + 20,
        price: t.bottom,
        color: color(true),
        text: drawnBias === 1 ? "Strong Low" : "Weak Low",
      });
  }
  if (p.showPremiumDiscountZonesInput && finite(t.top) && finite(t.bottom))
    for (const [top, bottom, text, c] of [
      [
        t.top,
        0.95 * t.top + 0.05 * t.bottom,
        "Premium",
        mono ? color(false) : p.premiumZoneColorInput,
      ],
      [
        0.525 * t.top + 0.475 * t.bottom,
        0.525 * t.bottom + 0.475 * t.top,
        "Equilibrium",
        p.equilibriumZoneColorInput,
      ],
      [
        0.95 * t.bottom + 0.05 * t.top,
        t.bottom,
        "Discount",
        mono ? color(true) : p.discountZoneColorInput,
      ],
    ] as const)
      result.boxes.push({
        from: t.at,
        to: right,
        top,
        bottom,
        color: c,
        opacity: 0.2,
        text,
      });
  addPeriodLevels(
    result,
    bars,
    interval === "1d" ? bars : context.histories?.["1d"],
    p,
    step,
  );
  result.blocks = blocks;
  result.gaps = gaps;
  if (bars.length < Math.max(200, p.swingsLengthInput * 2))
    result.warnings.push(
      "SMC: увеличьте количество свечей для прогрева периодов.",
    );
  return result;
}
/** Calendar-based previous periods in UTC; months are not approximated by 30 days. */
function addPeriodLevels(
  result: OverlayResult,
  bars: Candle[],
  daily: Candle[] | undefined,
  p: SmcParams,
  step: number,
) {
  function period(time: number, unit: string) {
    const d = new Date(time * 1000);
    d.setUTCHours(0, 0, 0, 0);
    if (unit === "W") d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
    if (unit === "M") d.setUTCDate(1);
    return d.getTime() / 1000;
  }
  for (const [enabled, unit, style, c] of [
    [
      p.showDailyLevelsInput,
      "D",
      p.dailyLevelsStyleInput,
      p.dailyLevelsColorInput,
    ],
    [
      p.showWeeklyLevelsInput,
      "W",
      p.weeklyLevelsStyleInput,
      p.weeklyLevelsColorInput,
    ],
    [
      p.showMonthlyLevelsInput,
      "M",
      p.monthlyLevelsStyleInput,
      p.monthlyLevelsColorInput,
    ],
  ] as const) {
    if (!enabled) continue;
    if (!daily?.length) {
      result.warnings.push(`SMC: нет дневной истории для P${unit}H/P${unit}L.`);
      continue;
    }
    const current = period(bars.at(-1)!.time, unit),
      prior = [...daily].reverse().find((b) => period(b.time, unit) < current);
    if (!prior) {
      result.warnings.push(
        `SMC: недостаточно истории для P${unit}H/P${unit}L.`,
      );
      continue;
    }
    const start = period(prior.time, unit),
      selected = daily.filter((b) => period(b.time, unit) === start);
    if (
      unit !== "D" &&
      daily[0].time > start &&
      period(daily[0].time, unit) === start
    ) {
      result.warnings.push(
        `SMC: предыдущий период ${unit} загружен не полностью.`,
      );
      continue;
    }
    for (const high of [true, false]) {
      const extreme = selected.reduce((a, b) =>
          (high ? b.high > a.high : b.low < a.low) ? b : a,
        ),
        price = high ? extreme.high : extreme.low;
      const intraday = bars.find(
        (b) =>
          b.time >= extreme.time &&
          b.time < extreme.time + 86400 &&
          (high ? b.high : b.low) === price,
      );
      result.lines.push({
        from: Math.max(
          0,
          logicalIndex(bars, intraday?.time ?? extreme.time, step),
        ),
        to: bars.length - 1 + 20,
        price,
        color: c,
        dash: style,
        text: `P${unit}${high ? "H" : "L"}`,
      });
    }
  }
}
