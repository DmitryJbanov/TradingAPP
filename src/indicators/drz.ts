/** Adapted from Delta Reaction Zones [BOSWaves], MPL-2.0, © BOSWaves. */
import type { Candle } from "../domain/market";
import { ema, finite } from "./pine-math";
import { atr, emptyOverlay, type OverlayResult } from "./overlay-model";
import { normalizeDrzParams } from "./drz-settings";
export interface DeltaZone {
  from: number;
  lower: boolean;
  top: number;
  bottom: number;
  mid: number;
  positive: number;
  net: number | null;
  lastTouch: number;
}
export interface DrzResult extends OverlayResult {
  zones: DeltaZone[];
  delta: number[];
  cumulative: number[];
}
export function deltaPivot(
  values: (number | null)[],
  at: number,
  length: number,
  high: boolean,
): boolean {
  const value = values[at];
  if (at < length || at + length >= values.length || !finite(value))
    return false;
  for (let i = at - length; i <= at + length; i++) {
    if (i === at) continue;
    const other = values[i];
    if (
      !finite(other) ||
      (high ? other > value : other < value) ||
      (i > at && other === value)
    )
      return false;
  }
  return true;
}
export function computeDrz(
  bars: Candle[],
  raw: unknown = {},
  context: { tickSize?: number } = {},
): DrzResult {
  const p = normalizeDrzParams(raw),
    result: DrzResult = {
      ...emptyOverlay(),
      zones: [],
      delta: [],
      cumulative: [],
    };
  if (!bars.length) return result;
  const price = bars.at(-1)!.close,
    autoTick = context.tickSize;
  const tick =
    p.tick_size > 0
      ? p.tick_size
      : autoTick && autoTick > 0
        ? autoTick
        : 10 ** -(price < 0.01 ? 8 : price < 1 ? 6 : price < 10 ? 4 : 2);
  if (!p.tick_size && !autoTick)
    result.warnings.push(
      "DRZ: размер тика оценён по цене; для точного объединения зон задайте его в настройках.",
    );
  const delta = ema(
    bars.map(
      (b) =>
        Math.sign(b.close - b.open) *
        (Number.isFinite(b.volume) ? b.volume : 0),
    ),
    p.delta_smooth,
  ).map((v) => v ?? 0);
  let total = 0;
  const cumulative = delta.map((v) => (total += v));
  result.delta = delta;
  result.cumulative = cumulative;
  const source =
    p.pivot_source === "Cumulative Delta RoC"
      ? cumulative.map((v, i) =>
          i >= p.roc_length ? v - cumulative[i - p.roc_length] : null,
        )
      : cumulative;
  const widths = atr(bars, p.atr_length),
    pos = [0],
    neg = [0];
  delta.forEach((d, i) => {
    pos.push(pos[i] + Math.max(d, 0));
    neg.push(neg[i] + Math.max(-d, 0));
  });
  let zones: DeltaZone[] = [];
  for (let i = 0; i < bars.length; i++) {
    const at = i - p.pivot_length;
    for (const lower of [false, true]) {
      if (
        !deltaPivot(source, at, p.pivot_length, !lower) ||
        !finite(widths[at])
      )
        continue;
      const anchor = lower ? bars[at].low : bars[at].high,
        half = widths[at]! * p.atr_multiplier,
        ready = at + 1 >= p.impulse_window;
      const a = ready ? pos[at + 1] - pos[at + 1 - p.impulse_window] : 0,
        b = ready ? neg[at + 1] - neg[at + 1 - p.impulse_window] : 0;
      const z: DeltaZone = {
        from: at,
        lower,
        top: anchor + half,
        bottom: anchor - half,
        mid: anchor,
        positive: a + b > 0 ? (100 * a) / (a + b) : 50,
        net: ready ? a - b : null,
        lastTouch: i,
      };
      const gap = p.merge_gap_ticks * tick;
      const existing = p.merge_zones
        ? [...zones]
            .reverse()
            .find(
              (o) =>
                o.lower === lower &&
                z.bottom - gap <= o.top + gap &&
                z.top + gap >= o.bottom - gap,
            )
        : undefined;
      if (existing) {
        const w1 = Math.max(Math.abs(existing.net ?? 0), 1),
          w2 = Math.max(Math.abs(z.net ?? 0), 1);
        existing.positive =
          (existing.positive * w1 + z.positive * w2) / (w1 + w2);
        existing.net =
          existing.net === null || z.net === null ? null : existing.net + z.net;
        existing.top = Math.max(existing.top, z.top);
        existing.bottom = Math.min(existing.bottom, z.bottom);
        existing.mid = (existing.top + existing.bottom) / 2;
        existing.from = Math.min(existing.from, at);
        existing.lastTouch = i;
      } else {
        zones.push(z);
        if (zones.length > p.maximum_zones) zones.shift();
      }
    }
    const bar = bars[i];
    zones = zones.filter((z) => {
      if (bar.high >= z.bottom && bar.low <= z.top) z.lastTouch = i;
      return z.lower ? bar.close >= z.bottom : bar.close <= z.top;
    });
    if (i)
      for (const lower of [true, false]) {
        if (
          !zones.some(
            (z) =>
              z.lower === lower &&
              (lower
                ? bars[i - 1].close < z.mid && bar.close > z.mid
                : bars[i - 1].close > z.mid && bar.close < z.mid),
          )
        )
          continue;
        const text = lower ? "RC" : "RE";
        result.signals.push({ index: i, time: bar.time, type: text });
        if (p.show_signals)
          result.labels.push({
            at: i,
            price: lower ? bar.low : bar.high,
            below: lower,
            text,
            color: lower ? p.lower_zone_color : p.upper_zone_color,
          });
      }
  }
  const right = bars.length - 1 + p.extend_bars;
  for (const z of zones) {
    const color = z.lower ? p.lower_zone_color : p.upper_zone_color;
    result.lines.push({
      from: z.from,
      to: right,
      price: z.mid,
      color: "#787b86",
      dash: "Dashed",
    });
    if (!p.show_zone_boxes) continue;
    result.boxes.push({
      from: z.from,
      to: right,
      top: z.top,
      bottom: z.bottom,
      color,
      opacity: 0.25,
      border: "#787b86",
      text:
        z.positive >= 60
          ? "SELL FLOW"
          : 100 - z.positive >= 60
            ? "BUY FLOW"
            : "MIXED",
    });
    const cap = Math.max(1, Math.min(Math.floor((right - z.from) * 0.5), 300));
    for (const positive of [false, true]) {
      const pct = positive ? z.positive : 100 - z.positive,
        top = positive ? z.mid : z.top,
        bottom = positive ? z.bottom : z.mid,
        c = positive ? p.lower_zone_color : p.upper_zone_color;
      result.boxes.push({
        from: z.from,
        to: Math.min(
          right,
          z.from + Math.max(pct > 0 ? 1 : 0, Math.round((cap * pct) / 100)),
        ),
        top,
        bottom,
        color: c,
        opacity: 0.6,
      });
      result.boxes.push({
        from: right,
        to: right + 10,
        top,
        bottom,
        color: c,
        opacity: 0.6,
        text: `${pct.toFixed(1)}%`,
      });
    }
    result.boxes.push({
      from: right + 10,
      to: right + 10 + p.stats_box_bars,
      top: z.top,
      bottom: z.bottom,
      color,
      opacity: 0.18,
      text: `Δ ${z.net === null ? "—" : z.net.toFixed(2)}`,
    });
  }
  result.zones = zones;
  result.labels = result.labels.slice(-500);
  if (
    bars.length <
    Math.max(p.impulse_window, p.atr_length) + 2 * p.pivot_length
  )
    result.warnings.push(
      "DRZ: увеличьте количество свечей для прогрева периодов.",
    );
  return result;
}
