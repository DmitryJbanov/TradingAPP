import type { ITimeScaleApi, Logical, Time } from "lightweight-charts";
import type { Candle, Timeframe } from "./market";
export const drawingTools = {
  brush: "Кисть",
  trend: "Линия тренда",
  arrow: "Стрелка",
  channel: "Параллельный канал",
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
    endInterval?: number;
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
    showHistogram?: boolean;
    showValues?: boolean;
    valuesColor?: string;
    showVah?: boolean;
    showVal?: boolean;
    vahColor?: string;
    valColor?: string;
    pocStyle?: "solid" | "dashed" | "dotted";
    vahStyle?: "solid" | "dashed" | "dotted";
    valStyle?: "solid" | "dashed" | "dotted";
    developingPoc?: boolean;
    developingVa?: boolean;
    developingPocColor?: string;
    developingVaColor?: string;
    boxColor?: string;
    showBox?: boolean;
    colorOpacity?: Record<string, number>;
    levelWidths?: Record<string, number>;
    timeframes?: Timeframe[];
  };
}
export const defaultProfile: NonNullable<Drawing["profile"]> = {
  rows: 400,
  valueArea: 70,
  showPoc: true,
  showValueArea: true,
  autoExtendRight: true,
  rowLayout: "rows",
  volume: "delta",
  placement: "left",
  widthPercent: 40,
  opacity: 85,
  upColor: "#006064",
  downColor: "#880e4f",
  valueAreaUpColor: "#00acc1",
  valueAreaDownColor: "#e91e63",
  pocColor: "#2962ff",
  vahColor: "#f23645",
  valColor: "#4caf50",
  pocStyle: "dotted",
  vahStyle: "dotted",
  valStyle: "dotted",
  showLabels: false,
  showHistogram: true,
  showVah: true,
  showVal: true,
  showBox: false,
  developingPoc: false,
  developingVa: false,
};
export const fibLevels = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];
/** Lightweight Charts rounds coordinateToLogical to a candle; interpolate between candle centers. */
export function fractionalLogicalAtCoordinate(scale: ITimeScaleApi<Time>, x: number): number | null {
  const index = scale.coordinateToLogical(x);
  if (index === null) return null;
  const center = scale.logicalToCoordinate(index);
  const next = scale.logicalToCoordinate((index + 1) as Logical);
  if (center === null || next === null || next === center) return null;
  return index + (x - center) / (next - center);
}
export function coordinateAtFractionalLogical(scale: ITimeScaleApi<Time>, value: number): number | null {
  const index = Math.floor(value);
  const center = scale.logicalToCoordinate(index as Logical);
  const next = scale.logicalToCoordinate((index + 1) as Logical);
  if (center === null || next === null) return null;
  return center + (next - center) * (value - index);
}
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
            ? 1 : d.tool === "channel" ? 3 : 2) &&
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
    .slice(-200)
    .map((d) =>
      d.tool !== "volume-profile"
        ? d
        : {
            ...d,
            profile: {
              ...defaultProfile,
              ...d.profile,
              showVah: d.profile?.showVah ?? d.profile?.showValueArea ?? true,
              showVal: d.profile?.showVal ?? d.profile?.showValueArea ?? true,
            },
          },
    );
}

function validProfileStyle(p: NonNullable<Drawing["profile"]>) {
  return (
    (p.endInterval === undefined || (Number.isFinite(p.endInterval) && p.endInterval > 0 && p.endInterval <= 604800)) &&
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
      p.valuesColor,
      p.vahColor,
      p.valColor,
      p.developingPocColor,
      p.developingVaColor,
      p.boxColor,
    ].every((v) => v === undefined || /^#[0-9a-f]{6}$/i.test(v)) &&
    (p.colorOpacity === undefined ||
      (!!p.colorOpacity &&
        typeof p.colorOpacity === "object" &&
        Object.entries(p.colorOpacity).every(
          ([key, v]) =>
            [
              "upColor",
              "downColor",
              "valueAreaUpColor",
              "valueAreaDownColor",
              "valuesColor",
              "pocColor",
              "vahColor",
              "valColor",
              "developingPocColor",
              "developingVaColor",
              "boxColor",
            ].includes(key) &&
            Number.isFinite(v) &&
            v >= 0 &&
            v <= 100,
        ))) &&
    (p.levelWidths === undefined ||
      (!!p.levelWidths &&
        typeof p.levelWidths === "object" &&
        Object.entries(p.levelWidths).every(
          ([key, v]) =>
            ["poc", "vah", "val"].includes(key) && [1, 2, 3, 4].includes(v),
        ))) &&
    [p.pocStyle, p.vahStyle, p.valStyle].every(
      (v) => v === undefined || ["solid", "dashed", "dotted"].includes(v),
    ) &&
    (p.timeframes === undefined ||
      (Array.isArray(p.timeframes) &&
        p.timeframes.length <= 10 &&
        p.timeframes.every((v) =>
          [
            "1m",
            "3m",
            "5m",
            "15m",
            "30m",
            "1h",
            "2h",
            "4h",
            "1d",
            "1w",
          ].includes(v),
        ))) &&
    [
      p.showLabels,
      p.extendLevels,
      p.showHistogram,
      p.showValues,
      p.showVah,
      p.showVal,
      p.developingPoc,
      p.developingVa,
      p.showBox,
    ].every((v) => v === undefined || typeof v === "boolean")
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
  return ["fibonacci", "trend", "arrow", "channel"].includes(d.tool) ? d.points : [];
}
export function resizedDrawingPoints(
  d: Drawing,
  corner: number,
  p: DrawingPoint,
): DrawingPoint[] {
  if (["fibonacci", "trend", "arrow", "channel"].includes(d.tool))
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
