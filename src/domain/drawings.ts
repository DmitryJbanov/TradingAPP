import type { Candle } from "./market";
export const drawingTools = {
  brush: "Кисть",
  horizontal: "Горизонтальная линия",
  vertical: "Вертикальная линия",
  rectangle: "Прямоугольник",
  fibonacci: "Фибоначчи",
  "volume-profile": "Fixed Range Volume Profile",
} as const;
export type DrawingTool = keyof typeof drawingTools;
export interface DrawingPoint {
  time: number;
  price: number;
}
export interface Drawing {
  id: string;
  tool: DrawingTool;
  color: string;
  points: DrawingPoint[];
  profile?: {
    rows: number;
    valueArea: number;
    showPoc: boolean;
    showValueArea: boolean;
  };
}
export const fibLevels = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];
/** Interpolate in candle space, preserving anchors as timestamps across history updates. */
export function timeAtLogical(
  bars: Candle[],
  logical: number,
  interval: number,
): number {
  const index = Math.floor(logical);
  const at = (i: number) =>
    i < 0
      ? bars[0].time + i * interval
      : i >= bars.length
        ? bars.at(-1)!.time + (i - bars.length + 1) * interval
        : bars[i].time;
  return at(index) + (at(index + 1) - at(index)) * (logical - index);
}
export function logicalAtTime(
  bars: Candle[],
  time: number,
  interval: number,
): number {
  if (time < bars[0].time) return (time - bars[0].time) / interval;
  if (time >= bars.at(-1)!.time)
    return bars.length - 1 + (time - bars.at(-1)!.time) / interval;
  let lo = 0,
    hi = bars.length - 1;
  while (hi - lo > 1) {
    const mid = Math.floor((hi + lo) / 2);
    if (bars[mid].time <= time) lo = mid;
    else hi = mid;
  }
  return lo + (time - bars[lo].time) / (bars[hi].time - bars[lo].time);
}
export function readDrawings(raw: unknown): Drawing[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (d): d is Drawing =>
        !!d &&
        typeof d.id === "string" &&
        Object.hasOwn(drawingTools, d.tool) &&
        /^#[0-9a-f]{6}$/i.test(d.color) &&
        Array.isArray(d.points) &&
        d.points.length >=
          (d.tool === "horizontal" || d.tool === "vertical" ? 1 : 2) &&
        d.points.length <= 2000 &&
        d.points.every(
          (p: DrawingPoint) =>
            p && Number.isFinite(p.time) && Number.isFinite(p.price),
        ) &&
        (!d.profile ||
          (Number.isInteger(d.profile.rows) &&
            d.profile.rows >= 10 &&
            d.profile.rows <= 200 &&
            Number.isFinite(d.profile.valueArea) &&
            d.profile.valueArea >= 1 &&
            d.profile.valueArea <= 100 &&
            typeof d.profile.showPoc === "boolean" &&
            typeof d.profile.showValueArea === "boolean")),
    )
    .slice(-200);
}
