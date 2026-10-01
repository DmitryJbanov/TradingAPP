import {
  candleIntervals,
  type Candle,
  type CandleInterval,
  type Timeframe,
} from "../domain/market";
import { emptyOverlay, logicalIndex, type OverlayResult } from "./overlay-model";
import { normalizeFvgParams } from "./fvg-settings";

interface Gap {
  from: number;
  createdAt: number;
  top: number;
  bottom: number;
  bias: 1 | -1;
  edge: number;
  mitigatedAt?: number;
}
interface FvgContext {
  interval?: Timeframe;
  histories?: Partial<Record<CandleInterval, Candle[]>>;
  now?: number;
}

export function requiredFvgIntervals(raw: unknown, interval: Timeframe) {
  const timeframe = normalizeFvgParams(raw).timeframe;
  if (timeframe === "Chart") return [];
  const frame = timeframe as CandleInterval;
  return candleIntervals[frame] > candleIntervals[interval] ? [frame] : [];
}

export function computeFvg(
  bars: Candle[],
  raw: unknown = {},
  context: FvgContext = {},
): OverlayResult {
  const p = normalizeFvgParams(raw),
    result = emptyOverlay();
  if (!bars.length) return result;

  const interval = context.interval ?? "1h",
    step = candleIntervals[interval],
    timeframe = p.timeframe === "Chart" ? interval : (p.timeframe as CandleInterval),
    gapStep = candleIntervals[timeframe],
    source = timeframe === interval ? bars : context.histories?.[timeframe],
    now = context.now ?? bars.at(-1)!.time + step;
  if (gapStep < step) {
    result.warnings.push("FVG: выберите текущий или старший таймфрейм.");
    return result;
  }
  if (!source?.length) {
    result.warnings.push(`FVG: история ${timeframe} недоступна.`);
    return result;
  }

  const events = new Map<number, number>();
  for (let j = 2; j < source.length; j++) {
    if (timeframe !== interval && source[j].time + gapStep > now) continue;
    const available =
        timeframe === interval ? source[j].time : source[j].time + gapStep - step,
      at = Math.ceil(logicalIndex(bars, available, step));
    if (at >= 0 && at < bars.length) events.set(at, j);
  }

  const gaps: Gap[] = [];
  let relativeGapSum = 0,
    candidateCount = 0;
  for (let i = 0; i < bars.length; i++) {
    const bar = bars[i];
    for (const gap of gaps) {
      if (gap.mitigatedAt !== undefined || gap.createdAt >= i) continue;
      if (gap.bias === 1) {
        if (bar.low <= gap.bottom) gap.mitigatedAt = i;
        else if (p.dynamic) gap.edge = Math.max(gap.bottom, Math.min(gap.edge, bar.low));
      } else if (bar.high >= gap.top) gap.mitigatedAt = i;
      else if (p.dynamic)
        gap.edge = Math.min(gap.top, Math.max(gap.edge, bar.high));
    }

    const j = events.get(i);
    if (j === undefined) continue;
    const current = source[j],
      previous = source[j - 1],
      earlier = source[j - 2],
      bull = current.low > earlier.high && previous.close > earlier.high,
      bear = current.high < earlier.low && previous.close < earlier.low;
    if (!bull && !bear) continue;
    const top = bull ? current.low : earlier.low,
      bottom = bull ? earlier.high : current.high,
      relativeSize = (100 * (top - bottom)) / Math.max(Math.abs(bottom), 1e-12),
      threshold = p.auto_threshold
        ? candidateCount
          ? relativeGapSum / candidateCount
          : 0
        : p.threshold_percent;
    relativeGapSum += relativeSize;
    candidateCount++;
    if (relativeSize < threshold) continue;
    const from = Math.max(0, logicalIndex(bars, previous.time, step));
    gaps.push({
      from,
      createdAt: i,
      top,
      bottom,
      bias: bull ? 1 : -1,
      edge: bull ? top : bottom,
    });
    if (gaps.length > 500) gaps.shift();
    result.signals.push({
      index: i,
      time: bar.time,
      type: bull ? "Bullish FVG" : "Bearish FVG",
    });
  }

  const right = bars.length - 1 + 100;
  const active = gaps.filter((gap) => gap.mitigatedAt === undefined);
  if (p.show_current_gaps)
    for (const gap of active) {
      const color = gap.bias === 1 ? p.bullish_color : p.bearish_color,
        top = gap.bias === 1 && p.dynamic ? gap.edge : gap.top,
        bottom = gap.bias === -1 && p.dynamic ? gap.edge : gap.bottom;
      result.boxes.push({
        from: gap.from,
        to: right,
        top,
        bottom,
        color,
        opacity: 0.25,
        border: color,
      });
    }
  if (p.show_historical_gaps)
    for (const gap of gaps) {
      if (gap.mitigatedAt === undefined) continue;
      const color =
        gap.bias === 1
          ? p.historical_bullish_color
          : p.historical_bearish_color;
      result.boxes.push({
        from: gap.from,
        to: gap.mitigatedAt,
        top: gap.top,
        bottom: gap.bottom,
        color,
        opacity: 0.25,
        border: color,
      });
    }
  if (p.show_current_gaps)
    for (const gap of active.slice(Math.max(0, active.length - p.unmitigated_levels)))
      result.lines.push({
        from: gap.from,
        to: right,
        price: gap.bias === 1 ? gap.bottom : gap.top,
        color: gap.bias === 1 ? p.bullish_color : p.bearish_color,
        dash: "Dashed",
      });
  if (p.show_mitigated_levels)
    for (const gap of gaps) {
      if (gap.mitigatedAt === undefined) continue;
      result.lines.push({
        from: gap.mitigatedAt,
        to: right,
        price: gap.bias === 1 ? gap.bottom : gap.top,
        color:
          gap.bias === 1
            ? p.historical_bullish_color
            : p.historical_bearish_color,
        dash: "Dotted",
      });
    }
  return result;
}
