import type { Candle } from "../domain/market";
import { rma } from "./pine-math";
export interface OverlayLine {
  from: number;
  to: number;
  price: number;
  endPrice?: number;
  color: string;
  dash?: string;
  text?: string;
  size?: string;
  group?: string;
}
export interface OverlayBox {
  from: number;
  to: number;
  top: number;
  bottom: number;
  color: string;
  opacity: number;
  text?: string;
  border?: string;
}
export interface OverlayLabel {
  at: number;
  price: number;
  text: string;
  color: string;
  below?: boolean;
  size?: string;
  group?: string;
}
export interface OverlaySignal {
  index: number;
  time: number;
  type: string;
}
export interface OverlayResult {
  boxes: OverlayBox[];
  lines: OverlayLine[];
  labels: OverlayLabel[];
  signals: OverlaySignal[];
  warnings: string[];
  candleColors?: (string | undefined)[];
}
export const emptyOverlay = (): OverlayResult => ({
  boxes: [],
  lines: [],
  labels: [],
  signals: [],
  warnings: [],
});
export const trueRanges = (bars: Candle[]) =>
  bars.map((b, i) =>
    Math.max(
      b.high - b.low,
      i ? Math.abs(b.high - bars[i - 1].close) : 0,
      i ? Math.abs(b.low - bars[i - 1].close) : 0,
    ),
  );
export const atr = (bars: Candle[], length: number) =>
  rma(trueRanges(bars), length);
export function logicalIndex(
  bars: Candle[],
  time: number,
  step: number,
): number {
  if (!bars.length) return 0;
  let lo = 0,
    hi = bars.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (bars[mid].time < time) lo = mid + 1;
    else hi = mid;
  }
  if (!lo) return (time - bars[0].time) / step;
  if (lo === bars.length) return lo - 1 + (time - bars.at(-1)!.time) / step;
  return (
    lo - 1 + (time - bars[lo - 1].time) / (bars[lo].time - bars[lo - 1].time)
  );
}
