import type {
  ISeriesPrimitive,
  IPrimitivePaneView,
  SeriesAttachedParameter,
  Time,
  Logical,
  ISeriesPrimitiveAxisView,
} from "lightweight-charts";
import type { Candle } from "../domain/market";
import type { PineResult, PineVisual } from "../domain/pine-scripts";
import { logicalAtTime, timeAtLogical } from "../domain/drawings";

const finite = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v);
const color = (v: unknown, fallback = "transparent") =>
  typeof v === "string" && v !== "NaN" && v !== "na" && v !== "" ? v : fallback;
const fontSize = (value: unknown) =>
  typeof value === "number"
    ? Math.max(6, Math.min(64, value))
    : ({ tiny: 8, small: 10, normal: 12, large: 16, huge: 22 }[
        String(value).replace(/^size_/, "")
      ] ?? 12);
type Point = PineVisual["points"][number];

/** Pine geometry uses the owning pane's price scale and the chart's time scale. */
export class PineVisualRenderer implements ISeriesPrimitive<Time> {
  private attachment: SeriesAttachedParameter<Time> | null = null;
  private visuals: PineVisual[] = [];
  private maps = new Map<string, Map<number, Point>>();
  private barsByTime = new Map<number, Candle>();
  private bars: Candle[] = [];
  private step = 60;
  constructor(
    private result: PineResult,
    bars: Candle[],
    private overlay: boolean,
  ) {
    this.configure(result, bars);
  }
  configure(result: PineResult, bars: Candle[]) {
    this.result = result;
    this.bars = bars;
    this.step = bars.length > 1 ? bars[1].time - bars[0].time : 60;
    this.barsByTime = new Map(bars.map((b) => [b.time, b]));
    this.visuals = (result.visuals ?? []).filter(
      (v) =>
        v.visible !== false &&
        (v.kind === "barcolor" ||
          v.options.force_overlay === true ||
          result.overlay) === this.overlay,
    );
    this.maps = new Map(
      (result.visuals ?? []).map((v) => [
        v.id,
        new Map(v.points.map((p) => [p.time, p])),
      ]),
    );
    this.attachment?.requestUpdate();
  }
  attached(attachment: SeriesAttachedParameter<Time>) {
    this.attachment = attachment;
    attachment.requestUpdate();
  }
  detached() {
    this.attachment = null;
  }
  paneViews(): IPrimitivePaneView[] {
    return [
      {
        zOrder: () => "bottom",
        renderer: () => ({
          draw: (target) =>
            target.useMediaCoordinateSpace(({ context, mediaSize }) =>
              this.draw(context, mediaSize.width, mediaSize.height, true),
            ),
        }),
      },
      {
        zOrder: () => "top",
        renderer: () => ({
          draw: (target) =>
            target.useMediaCoordinateSpace(({ context, mediaSize }) =>
              this.draw(context, mediaSize.width, mediaSize.height, false),
            ),
        }),
      },
    ];
  }
  autoscaleInfo() {
    const priceRange = this.priceRange();
    return priceRange ? { priceRange } : null;
  }
  priceAxisViews(): ISeriesPrimitiveAxisView[] {
    return this.visuals
      .filter((v) => this.shown(v) && v.options.trackprice === true)
      .flatMap((v) => {
        const point = v.points.findLast((p) => finite(p.value));
        if (!point || !finite(point.value)) return [];
        const value = point.value,
          background = color(point.options.color ?? v.options.color, "#2962ff");
        return [
          {
            coordinate: () =>
              this.attachment?.series.priceToCoordinate(value) ?? -10000,
            text: () =>
              value.toLocaleString("en-US", {
                maximumFractionDigits: this.result.precision ?? 2,
              }) + (this.result.format === "percent" ? "%" : ""),
            textColor: () =>
              /^#(?:[a-f][\da-f]){3}/i.test(background) ||
              background === "white"
                ? "#000000"
                : "#ffffff",
            backColor: () => background,
            visible: () => !!this.attachment,
          },
        ];
      });
  }
  private range() {
    const range = this.attachment?.chart.timeScale().getVisibleLogicalRange();
    return {
      from: range
        ? timeAtLogical(this.bars, range.from - 2, this.step)
        : -Infinity,
      to: range ? timeAtLogical(this.bars, range.to + 2, this.step) : Infinity,
    };
  }
  private shown(v: PineVisual) {
    return v.options.display !== "none" && v.options.display !== 0;
  }
  priceRange() {
    const { from, to } = this.range();
    let min = Infinity,
      max = -Infinity;
    const add = (n: unknown) => {
      if (finite(n)) {
        min = Math.min(min, n);
        max = Math.max(max, n);
      }
    };
    for (const v of this.visuals) {
      if (
        !this.shown(v) ||
        ["background", "bgcolor", "fill", "barcolor"].includes(v.kind)
      )
        continue;
      if (["area", "areabr", "histogram", "columns"].includes(v.kind))
        add(Number(v.options.histbase ?? 0));
      for (const p of this.window(v, from, to)) {
        const o = { ...v.options, ...p.options };
        if (
          ["shape", "char"].includes(v.kind) &&
          String(o.location).toLowerCase() !== "absolute"
        )
          continue;
        if (Array.isArray(p.value)) p.value.forEach(add);
        else add(p.value);
      }
    }
    for (const group of [
      this.result.drawings.boxes,
      this.result.drawings.lines,
      this.result.drawings.labels,
    ])
      for (const obj of group) {
        if (
          obj.visible === false ||
          (obj.force_overlay === true || this.result.overlay) !== this.overlay
        )
          continue;
        for (const key of ["top", "bottom", "y", "y1", "y2"]) add(obj[key]);
      }
    for (const obj of this.result.drawings.polylines ?? []) {
      if (
        obj.visible === false ||
        (obj.force_overlay === true || this.result.overlay) !== this.overlay ||
        !Array.isArray(obj.points)
      )
        continue;
      for (const point of obj.points) add(point.price);
    }
    if (!finite(min) || !finite(max)) return null;
    const pad =
      max === min ? Math.max(1, Math.abs(max) * 0.01) : (max - min) * 0.06;
    return { minValue: min - pad, maxValue: max + pad };
  }
  private window(v: PineVisual, from: number, to: number) {
    const points = v.points;
    let lo = 0,
      hi = points.length;
    while (lo < hi) {
      const m = (lo + hi) >>> 1;
      if (points[m].time < from) lo = m + 1;
      else hi = m;
    }
    let end = lo;
    while (end < points.length && points[end].time <= to) end++;
    const first = Math.max(
      0,
      lo - 1,
      v.options.show_last !== undefined &&
        Number.isFinite(Number(v.options.show_last))
        ? points.length - Math.max(0, Number(v.options.show_last))
        : 0,
    );
    return points.slice(first, Math.min(points.length, end + 1));
  }
  private draw(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    background: boolean,
  ) {
    const a = this.attachment;
    if (!a || !this.bars.length) return;
    const scale = a.chart.timeScale(),
      y = (n: unknown) => (finite(n) ? a.series.priceToCoordinate(n) : null);
    const x = (time: number) =>
      scale.logicalToCoordinate(
        logicalAtTime(this.bars, time, this.step) as Logical,
      );
    const barWidth =
      Math.abs(
        (x(this.bars[0].time + this.step) ?? 5) - (x(this.bars[0].time) ?? 0),
      ) || 5;
    const { from, to } = this.range();
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, width, height);
    ctx.clip();
    const ordered = this.result.explicitPlotOrder
      ? this.visuals
      : [...this.visuals].sort(
          (a, b) => (a.kind === "fill" ? -1 : 0) - (b.kind === "fill" ? -1 : 0),
        );
    for (const v of ordered) {
      if (
        !this.shown(v) ||
        ["background", "bgcolor"].includes(v.kind) !== background
      )
        continue;
      const points = this.window(v, from, to);
      const arrowMax =
        v.kind === "shape"
          ? v.points.reduce(
              (max, p) =>
                finite(p.value) ? Math.max(max, Math.abs(p.value)) : max,
              1,
            )
          : 1;
      let previous:
        | { x: number; y: number; base: number; time: number }
        | undefined;
      for (const p of points) {
        const px = x(p.time);
        if (px === null) continue;
        const o = { ...v.options, ...p.options };
        const paint = color(
          o.color,
          Object.hasOwn(o, "color") ? "transparent" : "#2962ff",
        );
        ctx.fillStyle = paint;
        ctx.strokeStyle = paint;
        ctx.lineWidth = Math.max(0.5, Math.min(20, Number(o.linewidth) || 1));
        ctx.globalAlpha =
          typeof o.transp === "number" &&
          !/^#[\da-f]{6}(?!ff$)[\da-f]{2}$/i.test(paint) &&
          !paint.startsWith("rgba")
            ? 1 - Math.max(0, Math.min(100, o.transp)) / 100
            : 1;
        ctx.setLineDash(
          /dotted/.test(String(o.linestyle))
            ? [2, 3]
            : /dashed/.test(String(o.linestyle))
              ? [6, 4]
              : [],
        );
        if (background) {
          if (p.value)
            ctx.fillRect(px - barWidth / 2, 0, barWidth + 0.5, height);
          continue;
        }
        if (v.kind === "fill") {
          const first = this.maps.get(String(o.plot1)),
            second = this.maps.get(String(o.plot2));
          const p1 = first?.get(p.time),
            p2 = second?.get(p.time),
            y1 = y(p1?.value),
            y2 = y(p2?.value);
          if (y1 === null || y2 === null) {
            if (o.fillgaps !== true) previous = undefined;
            continue;
          }
          if (previous) {
            if (o.gradient && finite(o.top_value) && finite(o.bottom_value)) {
              const top = y(o.top_value),
                bottom = y(o.bottom_value);
              if (top !== null && bottom !== null && top !== bottom) {
                const gradient = ctx.createLinearGradient(0, top, 0, bottom);
                gradient.addColorStop(0, color(o.top_color));
                gradient.addColorStop(1, color(o.bottom_color));
                ctx.fillStyle = gradient;
              }
            }
            ctx.beginPath();
            ctx.moveTo(previous.x, previous.y);
            ctx.lineTo(px, y1);
            ctx.lineTo(px, y2);
            ctx.lineTo(previous.x, previous.base);
            ctx.closePath();
            ctx.fill();
          }
          previous = { x: px, y: y1, base: y2, time: p.time };
          continue;
        }
        if (v.kind === "barcolor" || v.kind === "candle" || v.kind === "bar") {
          const bar = this.barsByTime.get(p.time);
          const values =
            v.kind === "barcolor" && p.value && bar
              ? [bar.open, bar.high, bar.low, bar.close]
              : p.value;
          if (!Array.isArray(values) || !values.every(finite)) continue;
          const [open, high, low, close] = values.map(y);
          if (open === null || high === null || low === null || close === null)
            continue;
          const half = Math.max(0.5, barWidth * 0.35);
          ctx.strokeStyle = color(o.wickcolor, paint);
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(px, high);
          ctx.lineTo(px, low);
          ctx.stroke();
          if (v.kind === "bar") {
            ctx.beginPath();
            ctx.moveTo(px - half, open);
            ctx.lineTo(px, open);
            ctx.moveTo(px, close);
            ctx.lineTo(px + half, close);
            ctx.stroke();
          } else {
            ctx.fillStyle = paint;
            ctx.fillRect(
              px - half,
              Math.min(open, close),
              2 * half,
              Math.max(1, Math.abs(close - open)),
            );
            ctx.strokeStyle = color(o.bordercolor, paint);
            ctx.strokeRect(
              px - half,
              Math.min(open, close),
              2 * half,
              Math.max(1, Math.abs(close - open)),
            );
          }
          continue;
        }
        if (v.kind === "char" || v.kind === "shape") {
          const loc = String(o.location ?? "abovebar").toLowerCase();
          if (
            loc === "absolute"
              ? !finite(p.value)
              : !p.value ||
                (typeof p.value === "number" && !Number.isFinite(p.value))
          )
            continue;
          const size = finite(o.height)
              ? Math.max(
                  Number(o.minheight) || 5,
                  (Number(o.height) * Math.abs(Number(p.value))) / arrowMax,
                )
              : fontSize(o.size),
            bar = this.barsByTime.get(p.time);
          const py =
            loc === "absolute"
              ? y(p.value)
              : loc === "top"
                ? size
                : loc === "bottom"
                  ? height - size
                  : !this.overlay ? (loc === "belowbar" ? height - size * 2 : size * 2) : y(loc === "belowbar" ? bar?.low : bar?.high);
          if (py === null) continue;
          const at =
            py + (loc === "belowbar" ? size : loc === "abovebar" ? -size : 0);
          ctx.font = `${size}px sans-serif`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          if (v.kind === "char") ctx.fillText(String(o.char ?? "★"), px, at);
          else
            this.symbol(
              ctx,
              String(o.shape ?? "circle")
                .replace(/^shape_/, "")
                .replace(/([a-z])(Up|Down)/g, "$1_$2")
                .toLowerCase(),
              px,
              at,
              size,
              paint,
              String(o.text ?? ""),
              color(o.textcolor, paint),
            );
          continue;
        }
        const py = y(p.value);
        if (py === null) {
          if (/br$/.test(v.kind)) previous = undefined;
          continue;
        }
        const base = y(Number(o.histbase ?? 0)) ?? height;
        if (["columns", "histogram"].includes(v.kind)) {
          const w = v.kind === "columns" ? barWidth * 0.8 : ctx.lineWidth;
          ctx.fillRect(
            px - w / 2,
            Math.min(py, base),
            w,
            Math.max(1, Math.abs(base - py)),
          );
        } else if (["circles", "cross"].includes(v.kind))
          this.symbol(
            ctx,
            v.kind === "cross" ? "cross" : "circle",
            px,
            py,
            Math.max(2, ctx.lineWidth * 2),
            paint,
            "",
            paint,
          );
        else if (previous) {
          const step = v.kind.startsWith("stepline");
          if (v.kind.startsWith("area")) {
            ctx.beginPath();
            ctx.moveTo(previous.x, previous.base);
            ctx.lineTo(previous.x, previous.y);
            ctx.lineTo(px, py);
            ctx.lineTo(px, base);
            ctx.closePath();
            ctx.fill();
          }
          ctx.beginPath();
          ctx.moveTo(previous.x, previous.y);
          if (step) {
            const middle = (previous.x + px) / 2;
            ctx.lineTo(middle, previous.y);
            ctx.lineTo(middle, py);
          }
          ctx.lineTo(px, py);
          ctx.stroke();
          if (v.kind === "stepline_diamond")
            this.symbol(ctx, "diamond", px, py, 4, paint, "", paint);
        }
        previous = { x: px, y: py, base, time: p.time };
      }
      ctx.globalAlpha = 1;
      if (v.options.trackprice === true) {
        const last = v.points.findLast((p) => finite(p.value)),
          py = y(last?.value);
        if (last && py !== null) {
          ctx.strokeStyle = color(
            last.options.color ?? v.options.color,
            "#2962ff",
          );
          ctx.setLineDash([3, 3]);
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(0, py);
          ctx.lineTo(width, py);
          ctx.stroke();
        }
      }
    }
    ctx.restore();
  }
  private symbol(
    ctx: CanvasRenderingContext2D,
    shape: string,
    x: number,
    y: number,
    size: number,
    paint: string,
    text: string,
    textcolor: string,
  ) {
    const r = size / 2;
    ctx.fillStyle = paint;
    ctx.strokeStyle = paint;
    ctx.beginPath();
    if (shape === "circle") ctx.arc(x, y, r, 0, 2 * Math.PI);
    else if (shape === "square" || shape.startsWith("label"))
      ctx.rect(x - r, y - r, size, size);
    else if (shape === "diamond") {
      ctx.moveTo(x, y - r);
      ctx.lineTo(x + r, y);
      ctx.lineTo(x, y + r);
      ctx.lineTo(x - r, y);
      ctx.closePath();
    } else if (shape.includes("triangle") || shape.includes("arrow")) {
      const direction = shape.includes("down") ? 1 : -1;
      ctx.moveTo(x, y + direction * r);
      ctx.lineTo(x - r, y - direction * r);
      ctx.lineTo(x + r, y - direction * r);
      ctx.closePath();
      if (shape.includes("arrow")) {
        ctx.moveTo(x, y - direction * r);
        ctx.lineTo(x, y - direction * size);
        ctx.stroke();
      }
    } else if (shape === "cross" || shape === "xcross") {
      const d = shape === "xcross" ? r : 0;
      ctx.moveTo(x - r, y - d);
      ctx.lineTo(x + r, y + d);
      ctx.moveTo(x - d, y + r);
      ctx.lineTo(x + d, y - r);
      ctx.stroke();
    } else {
      ctx.font = `${size}px sans-serif`;
      ctx.fillText(shape === "flag" ? "⚑" : "●", x, y);
    }
    ctx.fill();
    if (text) {
      ctx.fillStyle = textcolor;
      ctx.font = `${fontSize(size)}px sans-serif`;
      ctx.fillText(text, x, y + size);
    }
  }
}
