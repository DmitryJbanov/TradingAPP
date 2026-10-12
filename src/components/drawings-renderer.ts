import type {
  ISeriesPrimitive,
  IPrimitivePaneView,
  IPrimitivePaneRenderer,
  SeriesAttachedParameter,
  Time,
  Logical,
} from "lightweight-charts";
import {
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
};
export class DrawingsRenderer implements ISeriesPrimitive<Time> {
  private attachment: SeriesAttachedParameter<Time> | null = null;
  private drawings: Drawing[] = [];
  private bars: Candle[] = [];
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
            x: a.chart
              .timeScale()
              .logicalToCoordinate(
                logicalAtTime(this.bars, p.time, this.interval) as Logical,
              ),
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
            c.beginPath();
            points.forEach((v, i) =>
              i ? c.lineTo(v.x!, v.y!) : c.moveTo(v.x!, v.y!),
            );
            c.stroke();
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
            const { low, high, rows, bins, up, down, max, poc, vaLow, vaHigh } =
              this.profileData(d);
            if (high <= low) continue;
            const width = Math.max(0, Math.abs(q.x - p.x));
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
              right = Math.max(p.x, q.x),
              anchor =
                settings?.placement === "right" ? right : Math.min(p.x, q.x);
            const deltaMax = Math.max(
              ...up.map((v, i) => Math.abs(v - down[i])),
            );
            c.globalAlpha = (settings?.opacity ?? 50) / 100;
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
                h = Math.max(1, Math.abs(y2 - y1)),
                top = Math.min(y1, y2);
              const va =
                settings?.showValueArea !== false && i >= vaLow && i <= vaHigh;
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
                c.fillStyle =
                  settings.volume === "delta" && delta < 0
                    ? downColor
                    : upColor;
                c.fillRect(left, top, w, h);
              } else {
                c.fillStyle = upColor;
                c.fillRect(left, top, (w * up[i]) / value, h);
                c.fillStyle = downColor;
                c.fillRect(
                  left + (w * up[i]) / value,
                  top,
                  (w * down[i]) / value,
                  h,
                );
              }
            });
            c.globalAlpha = 1;
            const left = Math.min(p.x, q.x),
              lineEnd =
                d.profile?.extendLevels === true ? size.width : left + width;
            const line = (price: number, label: string, color: string) => {
              const y = a.series.priceToCoordinate(price);
              if (y === null) return;
              c.strokeStyle = color;
              c.beginPath();
              c.moveTo(left, y);
              c.lineTo(lineEnd, y);
              c.stroke();
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
              );
            if (d.profile?.showValueArea !== false) {
              line(
                low + (vaLow / rows) * (high - low),
                "VAL",
                d.profile?.valueAreaColor ?? "#42a5f5",
              );
              line(
                low + ((vaHigh + 1) / rows) * (high - low),
                "VAH",
                d.profile?.valueAreaColor ?? "#42a5f5",
              );
            }
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
                x: a.chart
                  .timeScale()
                  .logicalToCoordinate(
                    logicalAtTime(
                      this.bars,
                      point.time,
                      this.interval,
                    ) as Logical,
                  ),
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
  ) {
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
    if (high > low) {
      const start = Math.min(drawing.points[0].time, drawing.points[1].time);
      const end =
        drawing.profile?.autoExtendRight === true
          ? Infinity
          : Math.max(drawing.points[0].time, drawing.points[1].time);
      for (const bar of this.bars) {
        if (
          bar.time < start ||
          bar.time > end ||
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
          const volume = bar.volume / (last - first + 1);
          bins[i] += volume;
          (bar.close >= bar.open ? up : down)[i] += volume;
        }
      }
    }
    const max = Math.max(...bins);
    const poc = max ? bins.indexOf(max) : 0;
    const target =
      bins.reduce((sum, value) => sum + value, 0) *
      ((drawing.profile?.valueArea ?? 70) / 100);
    let valueArea = bins[poc],
      vaLow = poc,
      vaHigh = poc;
    while (valueArea < target && (vaLow > 0 || vaHigh < rows - 1)) {
      if (
        vaLow === 0 ||
        (vaHigh < rows - 1 && bins[vaHigh + 1] > bins[vaLow - 1])
      )
        valueArea += bins[++vaHigh];
      else valueArea += bins[--vaLow];
    }
    const data = { low, high, rows, bins, up, down, max, poc, vaLow, vaHigh };
    this.profileCache.set(drawing, { bars: this.bars, data });
    return data;
  }
}
