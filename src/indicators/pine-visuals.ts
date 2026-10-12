import type { Candle } from "../domain/market";
import type { PineDrawing, PinePlot, PineVisual } from "../domain/pine-scripts";
import { timeAtLogical } from "../domain/drawings";

interface RawPlot {
  title?: string;
  options?: Record<string, unknown>;
  data?: { time: number; value: unknown; options?: Record<string, unknown> }[];
}
export function collectPineVisuals(
  raw: Record<string, RawPlot>,
  bars: Candle[],
  step: number,
) {
  const plots: PinePlot[] = [],
    visuals: PineVisual[] = [];
  const drawings: PineDrawing = {
    boxes: [],
    lines: [],
    labels: [],
    polylines: [],
    linefills: [],
    tables: [],
  };
  const indices = new Map(bars.map((bar, index) => [bar.time, index]));
  const anchor = (item: Record<string, unknown>): Record<string, unknown> => {
    const copy = { ...item };
    if (item.xloc !== "bt" && item.xloc !== "bar_time") {
      copy.xloc = "bt";
      for (const key of ["left", "right", "x", "x1", "x2"])
        if (typeof item[key] === "number" && Number.isFinite(item[key]))
          copy[key] = timeAtLogical(bars, item[key], step) * 1000;
      if (Array.isArray(item.points))
        copy.points = item.points.map((p) => ({
          ...p,
          time: timeAtLogical(bars, Number(p.index), step) * 1000,
        }));
    }
    if (item.line1) copy.line1 = anchor(item.line1 as Record<string, unknown>);
    if (item.line2) copy.line2 = anchor(item.line2 as Record<string, unknown>);
    return copy;
  };
  const objectStyles: Record<string, keyof PineDrawing> = {
    drawing_box: "boxes",
    drawing_line: "lines",
    label: "labels",
    drawing_polyline: "polylines",
    linefill: "linefills",
    table: "tables",
  };
  for (const [id, entry] of Object.entries(raw)) {
    const options: Record<string, unknown> = Object.fromEntries(
        Object.entries(entry.options ?? {}).map(([key, value]) => [
          key,
          typeof value === "function" ? undefined : value,
        ]),
      ),
      kind = String(options.style ?? "line").replace(/^style_/, ""),
      title = entry.title ?? id;
    const data = entry.data ?? [];
    if (kind === "fill") {
      const first = raw[String(options.plot1)],
        second = raw[String(options.plot2)];
      if (first?.options?.force_overlay === true) options.force_overlay = true;
      if (first?.options?.offset === second?.options?.offset)
        options.offset = first?.options?.offset;
    }
    const objectKey = objectStyles[kind];
    if (objectKey) {
      const latest = data.at(-1)?.value;
      if (Array.isArray(latest))
        drawings[objectKey]!.push(
          ...latest
            .filter(
              (item) => item && typeof item === "object" && !item._deleted,
            )
            .map(anchor),
        );
      continue;
    }
    const visual: PineVisual = { id, title, kind, options, points: [] };
    const seen = new Set<number>();
    for (const point of data) {
      const index = indices.get(Math.floor(point.time / 1000));
      if (index === undefined) continue;
      const local: Record<string, unknown> = Object.fromEntries(
        Object.entries(point.options ?? {}).map(([key, value]) => [
          key,
          typeof value === "function" ? undefined : value,
        ]),
      );
      const offset = Number(local.offset ?? options.offset ?? 0);
      const time = timeAtLogical(
        bars,
        index +
          (Number.isFinite(offset)
            ? Math.max(-10000, Math.min(10000, offset))
            : 0),
        step,
      );
      if (seen.has(time)) continue;
      seen.add(time);
      visual.points.push({ time, value: point.value, options: local });
    }
    visual.points.sort((a, b) => a.time - b.time);
    visuals.push(visual);
    if (
      ![
        "fill",
        "background",
        "bgcolor",
        "barcolor",
        "shape",
        "char",
        "candle",
        "bar",
      ].includes(kind)
    ) {
      plots.push({
        title,
        style: kind as PinePlot["style"],
        color: String(
          options.color ??
            data.find((p) => typeof p.options?.color === "string")?.options
              ?.color ??
            "#2962ff",
        ),
        width: Math.max(
          1,
          Math.min(4, Number(options.linewidth) || 1),
        ) as PinePlot["width"],
        points: visual.points.map((p) => ({
          time: p.time,
          ...(typeof p.value === "number" && Number.isFinite(p.value)
            ? { value: p.value }
            : {}),
          ...(typeof p.options.color === "string"
            ? { color: p.options.color }
            : {}),
        })),
      });
    }
  }
  return { plots, visuals, drawings };
}
