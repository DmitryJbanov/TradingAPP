import type {
  ISeriesPrimitive,
  IPrimitivePaneView,
  IPrimitivePaneRenderer,
  SeriesAttachedParameter,
  Time,
  Logical,
} from "lightweight-charts";
import {
  coordinateAtFractionalLogical,
  drawingHandles,
  fibLevels,
  logicalAtTime,
  type Drawing,
} from "../domain/drawings";
import type { Candle } from "../domain/market";
type ProfileData = {
  low: number;
  high: number;
  rows: number;
  bins: number[];
  up: number[];
  down: number[];
  max: number;
  poc: number;
  vaLow: number;
  vaHigh: number;
  developing: { time: number; poc: number; vah: number; val: number }[];
};
export class DrawingsRenderer implements ISeriesPrimitive<Time> {
  private attachment: SeriesAttachedParameter<Time> | null = null;
  private drawings: Drawing[] = [];
  private bars: Candle[] = [];
  private profileBars: Candle[] = [];
  private interval = 3600;
  private tickSize = 0.01;
  private profileCache = new WeakMap<
    Drawing,
    { bars: Candle[]; data: ProfileData }
  >();
  private selectedId?: string;
  private hoverId?: string;
  private view: IPrimitivePaneView = {
    zOrder: () => "top",
    renderer: () => this.renderer,
  };
  private renderer: IPrimitivePaneRenderer = {
    draw: (target) => {
      const a = this.attachment;
      if (!a || !this.bars.length) return;
      target.useMediaCoordinateSpace(({ context: c, mediaSize: size }) => {
        c.save();
        c.beginPath();
        c.rect(0, 0, size.width, size.height);
        c.clip();
        for (const d of this.drawings) {
          const points = d.points.map((p) => ({
            x: coordinateAtFractionalLogical(a.chart.timeScale(),
              logicalAtTime(this.bars, p.time, this.interval)),
            y: a.series.priceToCoordinate(p.price),
          }));
          if (points.some((p) => p.x === null || p.y === null)) continue;
          const [p, q = p] = points as { x: number; y: number }[];
          c.strokeStyle = d.color;
          c.fillStyle = d.color;
          c.lineWidth = d.width ?? 2;
          c.lineJoin = "round";
          c.lineCap = "round";
          const line = (x: number, y: number, x2: number, y2: number) => {
            c.beginPath();
            c.moveTo(x, y);
            c.lineTo(x2, y2);
            c.stroke();
          };
          if (d.tool === "horizontal") {
            line(0, p.y, size.width, p.y);
            if (d.showPrice !== false) {
              c.font = "11px ui-monospace, monospace";
              c.textAlign = "right";
              c.fillText(
                d.points[0].price.toPrecision(8),
                size.width - 6,
                p.y - 5,
              );
              c.textAlign = "left";
            }
          }
          if (d.tool === "vertical") line(p.x, 0, p.x, size.height);
          if (d.tool === "text") {
            c.font = `${Math.max(12, 12 + (d.width ?? 2) * 2)}px sans-serif`;
            c.fillText(d.text ?? "Текст", p.x, p.y);
          }
          if (d.tool === "brush") {
            const strokePoints = points as { x: number; y: number }[];
            c.save();
            c.beginPath();
            c.moveTo(strokePoints[0].x, strokePoints[0].y);
            for (let i = 1; i < strokePoints.length - 1; i++) {
              const current = strokePoints[i], next = strokePoints[i + 1];
              c.quadraticCurveTo(current.x, current.y, (current.x + next.x) / 2, (current.y + next.y) / 2);
            }
            const last = strokePoints[strokePoints.length - 1];
            c.lineTo(last.x, last.y);
            // A light outer stroke softens the edge like a marker without hiding candles.
            c.globalAlpha = 0.18;
            c.lineWidth = (d.width ?? 2) + 2;
            c.stroke();
            c.globalAlpha = 1;
            c.lineWidth = d.width ?? 2;
            c.stroke();
            c.restore();
          }
          if (d.tool === "trend" || d.tool === "arrow") {
            line(p.x, p.y, q.x, q.y);
            if (d.tool === "arrow") {
              const angle = Math.atan2(q.y - p.y, q.x - p.x), size = 10 + (d.width ?? 2);
              c.beginPath(); c.moveTo(q.x - size * Math.cos(angle - Math.PI / 6), q.y - size * Math.sin(angle - Math.PI / 6));
              c.lineTo(q.x, q.y); c.lineTo(q.x - size * Math.cos(angle + Math.PI / 6), q.y - size * Math.sin(angle + Math.PI / 6)); c.stroke();
            }
          }
          if (d.tool === "channel" && points.length >= 3) {
            const third = points[2] as {x:number;y:number}, offset = third.y - p.y;
            line(p.x, p.y, q.x, q.y); line(p.x, p.y + offset, q.x, q.y + offset);
            c.save(); c.globalAlpha = 0.07; c.beginPath(); c.moveTo(p.x,p.y); c.lineTo(q.x,q.y);
            c.lineTo(q.x,q.y+offset); c.lineTo(p.x,p.y+offset); c.closePath(); c.fill(); c.restore();
          }
          if (d.tool === "ruler") {
            c.fillStyle =
              d.points[1].price >= d.points[0].price ? "#26a69a" : "#ef5350";
            c.strokeStyle = c.fillStyle;
            c.globalAlpha = 0.18;
            c.fillRect(p.x, p.y, q.x - p.x, q.y - p.y);
            c.globalAlpha = 1;
            c.strokeRect(p.x, p.y, q.x - p.x, q.y - p.y);
            line(p.x, p.y, q.x, q.y);
            const delta = d.points[1].price - d.points[0].price,
              percent = d.points[0].price
                ? (100 * delta) / d.points[0].price
                : 0;
            const bars = Math.abs(
              logicalAtTime(this.bars, d.points[1].time, this.interval) -
                logicalAtTime(this.bars, d.points[0].time, this.interval),
            );
            const hours = Math.abs(d.points[1].time - d.points[0].time) / 3600;
            const text =
              (delta >= 0 ? "+" : "") +
              delta.toPrecision(6) +
              " · " +
              percent.toFixed(2) +
              "% · " +
              Math.round(bars) +
              " свечей · " +
              (hours >= 24
                ? (hours / 24).toFixed(1) + " дн."
                : hours.toFixed(1) + " ч.");
            c.font = "24px ui-monospace,monospace";
            const width = c.measureText(text).width + 32;
            const x = Math.max(
                2,
                Math.min(size.width - width, (p.x + q.x - width) / 2),
              ),
              y = Math.max(
                48,
                Math.min(
                  size.height - 12,
                  delta < 0 ? Math.max(p.y, q.y) + 48 : Math.min(p.y, q.y) - 8,
                ),
              );
            c.fillStyle = "#182029";
            c.fillRect(x, y - 40, width, 48);
            c.fillStyle = "#ffffff";
            c.fillText(text, x + 16, y - 8);
          }
          if (d.tool === "rectangle") {
            c.globalAlpha = 0.15;
            c.fillRect(p.x, p.y, q.x - p.x, q.y - p.y);
            c.globalAlpha = 1;
            c.strokeRect(p.x, p.y, q.x - p.x, q.y - p.y);
          }
          if (d.tool === "volume-profile") {
            const data = this.profileData(d);
            const { low, high, rows, bins, up, down, max, poc, vaLow, vaHigh } =
              data;
            if (high <= low) continue;
            const endX = d.profile?.autoExtendRight
              ? (a.chart
                  .timeScale()
                  .logicalToCoordinate((this.bars.length - 1) as Logical) ??
                q.x)
              : q.x;
            const rangeLeft = Math.min(p.x, q.x),
              rangeRight = Math.max(p.x, q.x, endX);
            const width = rangeRight - rangeLeft;
            if (!max) {
              if (d.id === this.selectedId || d.id === this.hoverId)
                c.strokeRect(
                  Math.min(p.x, q.x),
                  Math.min(p.y, q.y),
                  width,
                  Math.abs(q.y - p.y),
                );
              continue;
            }
            const settings = d.profile;
            const fullWidth = width * ((settings?.widthPercent ?? 100) / 100),
              right = rangeRight,
              anchor = settings?.placement === "right" ? right : rangeLeft;
            const deltaMax = Math.max(
              ...up.map((v, i) => Math.abs(v - down[i])),
            );
            const alpha = (key: string) =>
              ((settings?.opacity ?? 50) / 100) *
              ((settings?.colorOpacity?.[key] ?? 100) / 100);
            c.globalAlpha = alpha("boxColor");
            if (settings?.showBox) {
              c.fillStyle = settings.boxColor ?? "#000000";
              const yHigh = a.series.priceToCoordinate(high),
                yLow = a.series.priceToCoordinate(low);
              if (yHigh !== null && yLow !== null)
                c.fillRect(
                  rangeLeft,
                  Math.min(yHigh, yLow),
                  width,
                  Math.abs(yLow - yHigh),
                );
            }
            if (settings?.showHistogram !== false)
              bins.forEach((value, i) => {
                const y1 = a.series.priceToCoordinate(
                    low + ((i + 1) / rows) * (high - low),
                  ),
                  y2 = a.series.priceToCoordinate(
                    low + (i / rows) * (high - low),
                  );
                if (y1 === null || y2 === null || !value) return;
                const delta = up[i] - down[i],
                  magnitude =
                    settings?.volume === "delta" ? Math.abs(delta) : value;
                const w =
                    (fullWidth * magnitude) /
                    (settings?.volume === "delta" ? deltaMax || 1 : max),
                  left = settings?.placement === "right" ? anchor - w : anchor,
                  h = Math.max(0.5, Math.abs(y2 - y1) * 0.85),
                  top = Math.min(y1, y2);
                const va =
                  settings?.showValueArea !== false &&
                  i >= vaLow &&
                  i <= vaHigh;
                const upColor = va
                    ? (settings?.valueAreaUpColor ?? "#42a5f5")
                    : (settings?.upColor ?? d.color),
                  downColor = va
                    ? (settings?.valueAreaDownColor ?? "#90caf9")
                    : (settings?.downColor ?? "#ef7185");
                if (
                  settings?.volume === "delta" ||
                  settings?.volume === "total"
                ) {
                  c.globalAlpha = alpha(
                    settings.volume === "delta" && delta < 0
                      ? va
                        ? "valueAreaDownColor"
                        : "downColor"
                      : va
                        ? "valueAreaUpColor"
                        : "upColor",
                  );
                  c.fillStyle =
                    settings.volume === "delta" && delta < 0
                      ? downColor
                      : upColor;
                  c.fillRect(left, top, w, h);
                } else {
                  c.globalAlpha = alpha(va ? "valueAreaUpColor" : "upColor");
                  c.fillStyle = upColor;
                  c.fillRect(left, top, (w * up[i]) / value, h);
                  c.globalAlpha = alpha(
                    va ? "valueAreaDownColor" : "downColor",
                  );
                  c.fillStyle = downColor;
                  c.fillRect(
                    left + (w * up[i]) / value,
                    top,
                    (w * down[i]) / value,
                    h,
                  );
                }
                if (settings?.showValues && h >= 9 && w >= 20) {
                  c.save();
                  c.globalAlpha =
                    (settings?.colorOpacity?.valuesColor ?? 100) / 100;
                  c.font = "10px ui-monospace,monospace";
                  c.fillStyle = settings.valuesColor ?? "#999999";
                  const format = new Intl.NumberFormat("en", {
                    notation: "compact",
                    maximumFractionDigits: 1,
                  });
                  const text =
                    settings.volume === "delta"
                      ? format.format(delta)
                      : settings.volume === "total"
                        ? format.format(value)
                        : `${format.format(up[i])} / ${format.format(down[i])}`;
                  c.fillText(text, left + 3, top + h - 1, Math.max(1, w - 6));
                  c.restore();
                }
              });
            c.globalAlpha = 1;
            const left = rangeLeft,
              lineEnd =
                d.profile?.extendLevels === true ? size.width : left + width;
            const line = (
              price: number,
              label: string,
              color: string,
              style?: string,
            ) => {
              const y = a.series.priceToCoordinate(price);
              if (y === null) return;
              c.globalAlpha =
                (settings?.colorOpacity?.[label.toLowerCase() + "Color"] ??
                  100) / 100;
              c.strokeStyle = color;
              c.lineWidth = settings?.levelWidths?.[label.toLowerCase()] ?? 1;
              c.setLineDash(
                style === "dotted" ? [1, 4] : style === "dashed" ? [6, 4] : [],
              );
              c.beginPath();
              c.moveTo(left, y);
              c.lineTo(lineEnd, y);
              c.stroke();
              c.setLineDash([]);
              c.font = "10px ui-monospace, monospace";
              c.fillStyle = color;
              if (d.profile?.showLabels === false) return;
              if (d.profile?.extendLevels !== true)
                c.fillText(label, lineEnd + 4, y + 3);
              else {
                c.textAlign = "right";
                c.fillText(label, lineEnd - 4, y + 3);
                c.textAlign = "left";
              }
            };
            if (d.profile?.showPoc !== false)
              line(
                low + ((poc + 0.5) / rows) * (high - low),
                "POC",
                d.profile?.pocColor ?? "#ffb74d",
                d.profile?.pocStyle,
              );
            {
              if ((d.profile?.showVal ?? d.profile?.showValueArea) !== false)
                line(
                  low + (vaLow / rows) * (high - low),
                  "VAL",
                  d.profile?.valColor ?? d.profile?.valueAreaColor ?? "#4caf50",
                  d.profile?.valStyle,
                );
              if ((d.profile?.showVah ?? d.profile?.showValueArea) !== false)
                line(
                  low + ((vaHigh + 1) / rows) * (high - low),
                  "VAH",
                  d.profile?.vahColor ?? d.profile?.valueAreaColor ?? "#f23645",
                  d.profile?.vahStyle,
                );
            }
            for (const [enabled, field, color] of [
              [
                settings?.developingPoc,
                "poc",
                settings?.developingPocColor ?? "#999999",
              ],
              [
                settings?.developingVa,
                "vah",
                settings?.developingVaColor ?? "#147c88",
              ],
              [
                settings?.developingVa,
                "val",
                settings?.developingVaColor ?? "#147c88",
              ],
            ] as const) {
              if (!enabled) continue;
              c.globalAlpha =
                (settings?.colorOpacity?.[
                  field === "poc" ? "developingPocColor" : "developingVaColor"
                ] ?? 100) / 100;
              c.strokeStyle = color;
              c.lineWidth = 1;
              c.setLineDash([]);
              c.beginPath();
              let previous: { x: number; y: number } | undefined;
              for (const point of data.developing) {
                const x = coordinateAtFractionalLogical(a.chart.timeScale(),
                  logicalAtTime(this.bars, point.time, this.interval));
                const y = a.series.priceToCoordinate(point[field]);
                if (x === null || y === null) continue;
                if (previous) {
                  c.lineTo(x, previous.y);
                  c.lineTo(x, y);
                } else c.moveTo(x, y);
                previous = { x, y };
              }
              c.stroke();
            }
            c.globalAlpha = 1;
            if (d.id === this.selectedId || d.id === this.hoverId)
              c.strokeRect(
                Math.min(p.x, q.x),
                Math.min(p.y, q.y),
                width,
                Math.abs(q.y - p.y),
              );
          }
          if (d.tool === "fibonacci")
            for (const ratio of fibLevels) {
              const y = p.y + (q.y - p.y) * ratio;
              line(Math.min(p.x, q.x), y, Math.max(p.x, q.x), y);
              c.font = "11px ui-monospace, monospace";
              c.fillText(
                `${(ratio * 100).toFixed(1)}% · ${(d.points[0].price + ((d.points[1] ?? d.points[0]).price - d.points[0].price) * ratio).toPrecision(6)}`,
                Math.max(2, Math.min(p.x, q.x) + 4),
                y - 4,
              );
            }
          if (d.id === this.selectedId || d.id === this.hoverId) {
            c.fillStyle = "#ffffff";
            const handles = drawingHandles(d)
              .map((point) => ({
                x: coordinateAtFractionalLogical(a.chart.timeScale(),
                  logicalAtTime(this.bars, point.time, this.interval)),
                y: a.series.priceToCoordinate(point.price),
              }))
              .filter((p) => p.x !== null && p.y !== null)
              .map((p) => ({ x: Number(p.x), y: Number(p.y) }));
            for (const v of handles) {
              c.beginPath();
              c.arc(v.x, v.y, d.id === this.selectedId ? 4 : 3, 0, Math.PI * 2);
              c.fill();
              c.strokeStyle = d.color;
              c.lineWidth = 1;
              c.stroke();
            }
          }
        }
        c.restore();
      });
    },
  };
  attached(a: SeriesAttachedParameter<Time>) {
    this.attachment = a;
    a.requestUpdate();
  }
  detached() {
    this.attachment = null;
  }
  paneViews() {
    return [this.view];
  }
  configure(
    drawings: Drawing[],
    bars: Candle[],
    interval: number,
    selectedId?: string,
    hoverId?: string,
    tickSize = 0.01,
    profileBars: Candle[] = bars,
  ) {
    if (this.profileBars !== profileBars || this.interval !== interval) this.profileCache = new WeakMap();
    this.profileBars = profileBars;
    this.drawings = drawings;
    this.bars = bars;
    this.interval = interval;
    this.selectedId = selectedId;
    this.hoverId = hoverId;
    if (this.tickSize !== tickSize) this.profileCache = new WeakMap();
    this.tickSize = tickSize;
    this.attachment?.requestUpdate();
  }
  profileData(drawing: Drawing): ProfileData {
    const cached = this.profileCache.get(drawing);
    if (cached?.bars === this.bars) return cached.data;
    let low = Math.min(drawing.points[0].price, drawing.points[1].price);
    let high = Math.max(drawing.points[0].price, drawing.points[1].price);
    if (drawing.profile?.autoExtendRight === true) {
      const start = Math.min(drawing.points[0].time, drawing.points[1].time);
      for (const bar of this.bars)
        if (bar.time >= start) {
          low = Math.min(low, bar.low);
          high = Math.max(high, bar.high);
        }
    }
    const rows =
      drawing.profile?.rowLayout === "ticks"
        ? Math.max(
            1,
            Math.min(
              500,
              Math.ceil(
                (high - low) /
                  ((drawing.profile.ticksPerRow ?? 1) * this.tickSize),
              ),
            ),
          )
        : (drawing.profile?.rows ?? 150);
    const bins = Array.from({ length: rows }, () => 0);
    const up = Array.from({ length: rows }, () => 0);
    const down = Array.from({ length: rows }, () => 0);
    const developing: ProfileData["developing"] = [];
    const bounds = () => {
      const max = Math.max(...bins),
        poc = max ? bins.indexOf(max) : 0;
      const target =
        bins.reduce((sum, v) => sum + v, 0) *
        ((drawing.profile?.valueArea ?? 70) / 100);
      let area = bins[poc],
        vaLow = poc,
        vaHigh = poc;
      while (area < target && (vaLow > 0 || vaHigh < rows - 1)) {
        const below = vaLow > 0 ? bins[vaLow - 1] : -1;
        const above = vaHigh < rows - 1 ? bins[vaHigh + 1] : -1;
        const addAbove =
          above > below || (above === below && vaHigh - poc <= poc - vaLow);
        const next = addAbove ? above : below;
        if (area + next > target) break;
        area += next;
        if (addAbove) vaHigh++;
        else vaLow--;
      }
      return { max, poc, vaLow, vaHigh };
    };
    if (high > low) {
      const start = Math.min(drawing.points[0].time, drawing.points[1].time);
      const end =
        drawing.profile?.autoExtendRight === true
          ? Infinity
          : Math.max(drawing.points[0].time, drawing.points[1].time) +
            (drawing.profile?.endInterval ?? this.interval);
      const lowerStep =
        this.profileBars.length > 1
          ? this.profileBars[1].time - this.profileBars[0].time
          : this.interval;
      const covered =
        this.profileBars.length > 0 &&
        this.profileBars[0].time <= start &&
        this.profileBars.at(-1)!.time + lowerStep >=
          Math.min(
            end,
            this.bars.at(-1)!.time + this.interval,
            Date.now() / 1000,
          );
      const source = covered ? this.profileBars : this.bars;
      for (const bar of source) {
        if (
          bar.time < start ||
          bar.time >= end ||
          bar.high < low ||
          bar.low > high
        )
          continue;
        const first = Math.max(
          0,
          Math.min(
            rows - 1,
            Math.floor(((Math.max(low, bar.low) - low) / (high - low)) * rows),
          ),
        );
        const last = Math.max(
          0,
          Math.min(
            rows - 1,
            Math.floor(
              ((Math.min(high, bar.high) - low) / (high - low)) * rows,
            ),
          ),
        );
        for (let i = first; i <= last; i++) {
          const rowLow = low + (i / rows) * (high - low),
            rowHigh = low + ((i + 1) / rows) * (high - low);
          const volume =
            bar.high > bar.low
              ? (bar.volume *
                  Math.max(
                    0,
                    Math.min(rowHigh, bar.high) - Math.max(rowLow, bar.low),
                  )) /
                (bar.high - bar.low)
              : bar.volume;
          bins[i] += volume;
          (bar.close >= bar.open ? up : down)[i] += volume;
        }
        if (drawing.profile?.developingPoc || drawing.profile?.developingVa) {
          const state = bounds();
          developing.push({
            time: bar.time,
            poc: low + ((state.poc + 0.5) / rows) * (high - low),
            vah: low + ((state.vaHigh + 1) / rows) * (high - low),
            val: low + (state.vaLow / rows) * (high - low),
          });
        }
      }
    }
    const { max, poc, vaLow, vaHigh } = bounds();
    const data = {
      low,
      high,
      rows,
      bins,
      up,
      down,
      max,
      poc,
      vaLow,
      vaHigh,
      developing,
    };
    this.profileCache.set(drawing, { bars: this.bars, data });
    return data;
  }
}
