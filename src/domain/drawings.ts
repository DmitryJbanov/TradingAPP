import type { Candle } from "./market";
export const drawingTools = {
  brush: "Кисть",
  ruler: "Линейка",
  horizontal: "Горизонтальная линия",
  vertical: "Вертикальная линия",
  rectangle: "Прямоугольник",
  fibonacci: "Фибоначчи",
  "volume-profile": "Fixed Range Volume Profile",
  text: "Текст",
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
  width?: 1 | 2 | 3 | 4;
  text?: string;
  showPrice?: boolean;
  profile?: {
    rows: number;
    valueArea: number;
    showPoc: boolean;
    showValueArea: boolean;
    autoExtendRight?: boolean;
    rowLayout?: "rows" | "ticks";
    ticksPerRow?: number;
    volume?: "total" | "up-down" | "delta";
    placement?: "left" | "right";
    widthPercent?: number;
    opacity?: number;
    upColor?: string;
    downColor?: string;
    valueAreaUpColor?: string;
    valueAreaDownColor?: string;
    pocColor?: string;
    valueAreaColor?: string;
    showLabels?: boolean;
    extendLevels?: boolean;
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
          (d.tool === "horizontal" || d.tool === "vertical" || d.tool === "text"
            ? 1
            : 2) &&
        d.points.length <= 2000 &&
        (d.width === undefined || [1, 2, 3, 4].includes(d.width)) &&
        (d.text === undefined || typeof d.text === "string") &&
        (d.showPrice === undefined || typeof d.showPrice === "boolean") &&
        d.points.every(
          (p: DrawingPoint) =>
            p && Number.isFinite(p.time) && Number.isFinite(p.price),
        ) &&
        (!d.profile ||
          (Number.isInteger(d.profile.rows) &&
            d.profile.rows >= 10 &&
            d.profile.rows <= 500 &&
            Number.isFinite(d.profile.valueArea) &&
            d.profile.valueArea >= 1 &&
            d.profile.valueArea <= 100 &&
            typeof d.profile.showPoc === "boolean" &&
            typeof d.profile.showValueArea === "boolean" &&
            (d.profile.autoExtendRight === undefined ||
              typeof d.profile.autoExtendRight === "boolean") &&
            validProfileStyle(d.profile))),
    )
    .slice(-200);
}

function validProfileStyle(p: NonNullable<Drawing["profile"]>) {
  return (
    (!p.rowLayout || ["rows", "ticks"].includes(p.rowLayout)) &&
    (!p.volume || ["total", "up-down", "delta"].includes(p.volume)) &&
    (!p.placement || ["left", "right"].includes(p.placement)) &&
    (p.ticksPerRow === undefined ||
      (Number.isInteger(p.ticksPerRow) &&
        p.ticksPerRow >= 1 &&
        p.ticksPerRow <= 1000000)) &&
    (p.widthPercent === undefined ||
      (Number.isFinite(p.widthPercent) &&
        p.widthPercent >= 1 &&
        p.widthPercent <= 100)) &&
    (p.opacity === undefined ||
      (Number.isFinite(p.opacity) && p.opacity >= 0 && p.opacity <= 100)) &&
    [
      p.upColor,
      p.downColor,
      p.valueAreaUpColor,
      p.valueAreaDownColor,
      p.pocColor,
      p.valueAreaColor,
    ].every((v) => v === undefined || /^#[0-9a-f]{6}$/i.test(v)) &&
    [p.showLabels, p.extendLevels].every(
      (v) => v === undefined || typeof v === "boolean",
    )
  );
}
export function drawingHandles(d: Drawing): DrawingPoint[] {
  if (
    d.tool === "rectangle" ||
    d.tool === "volume-profile" ||
    d.tool === "brush"
  ) {
    const a =
      d.tool === "brush"
        ? {
            time: Math.min(...d.points.map((p) => p.time)),
            price: Math.max(...d.points.map((p) => p.price)),
          }
        : d.points[0];
    const b =
      d.tool === "brush"
        ? {
            time: Math.max(...d.points.map((p) => p.time)),
            price: Math.min(...d.points.map((p) => p.price)),
          }
        : d.points[1];
    if (!b) return [a];
    return [
      a,
      { time: b.time, price: a.price },
      b,
      { time: a.time, price: b.price },
    ];
  }
  return d.tool === "fibonacci" ? d.points.slice(0, 2) : [];
}
export function resizedDrawingPoints(
  d: Drawing,
  corner: number,
  p: DrawingPoint,
): DrawingPoint[] {
  if (d.tool === "fibonacci")
    return d.points.map((v, i) => (i === corner ? p : v));
  const handles = drawingHandles(d),
    a = handles[0],
    b = handles[2];
  if (!a || !b) return d.points;
  const nextA = {
    time: corner === 0 || corner === 3 ? p.time : a.time,
    price: corner === 0 || corner === 1 ? p.price : a.price,
  };
  const nextB = {
    time: corner === 1 || corner === 2 ? p.time : b.time,
    price: corner === 2 || corner === 3 ? p.price : b.price,
  };
  if (d.tool !== "brush") return [nextA, nextB];
  return d.points.map((v) => ({
    time:
      nextA.time +
      ((v.time - a.time) / (b.time - a.time || 1)) * (nextB.time - nextA.time),
    price:
      nextA.price +
      ((v.price - a.price) / (b.price - a.price || 1)) *
        (nextB.price - nextA.price),
  }));
}
