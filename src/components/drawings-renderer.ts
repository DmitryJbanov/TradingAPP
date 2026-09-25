import type {
  ISeriesPrimitive,
  IPrimitivePaneView,
  IPrimitivePaneRenderer,
  SeriesAttachedParameter,
  Time,
  Logical,
} from "lightweight-charts";
import { fibLevels, logicalAtTime, type Drawing } from "../domain/drawings";
import type { Candle } from "../domain/market";
export class DrawingsRenderer implements ISeriesPrimitive<Time> {
  private attachment: SeriesAttachedParameter<Time> | null = null;
  private drawings: Drawing[] = [];
  private bars: Candle[] = [];
  private interval = 3600;
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
          c.lineWidth = 2;
          c.lineJoin = "round";
          c.lineCap = "round";
          const line = (x: number, y: number, x2: number, y2: number) => {
            c.beginPath();
            c.moveTo(x, y);
            c.lineTo(x2, y2);
            c.stroke();
          };
          if (d.tool === "horizontal") line(0, p.y, size.width, p.y);
          if (d.tool === "vertical") line(p.x, 0, p.x, size.height);
          if (d.tool === "brush") {
            c.beginPath();
            points.forEach((v, i) =>
              i ? c.lineTo(v.x!, v.y!) : c.moveTo(v.x!, v.y!),
            );
            c.stroke();
          }
          if (d.tool === "rectangle") {
            c.globalAlpha = 0.15;
            c.fillRect(p.x, p.y, q.x - p.x, q.y - p.y);
            c.globalAlpha = 1;
            c.strokeRect(p.x, p.y, q.x - p.x, q.y - p.y);
          }
          if (d.tool === "volume-profile") {
            const low = Math.min(d.points[0].price, d.points[1].price),
              high = Math.max(d.points[0].price, d.points[1].price),
              rows = d.profile?.rows ?? 150;
            if (high <= low) continue;
            const start = Math.min(d.points[0].time, d.points[1].time),
              end = Math.max(d.points[0].time, d.points[1].time),
              bins = Array.from({ length: rows }, () => 0),
              up = Array.from({ length: rows }, () => 0),
              down = Array.from({ length: rows }, () => 0);
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
                  Math.floor(
                    ((Math.max(low, bar.low) - low) / (high - low)) * rows,
                  ),
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
            const max = Math.max(...bins),
              width = Math.max(0, Math.abs(q.x - p.x));
            if (!max) continue;
            const poc = bins.indexOf(max),
              target =
                bins.reduce((sum, value) => sum + value, 0) *
                ((d.profile?.valueArea ?? 70) / 100);
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
            c.globalAlpha = 0.5;
            bins.forEach((value, i) => {
              const y1 = a.series.priceToCoordinate(
                  low + ((i + 1) / rows) * (high - low),
                ),
                y2 = a.series.priceToCoordinate(
                  low + (i / rows) * (high - low),
                );
              if (y1 === null || y2 === null) return;
              const barWidth = (width * value) / max,
                left = Math.min(p.x, q.x),
                height = Math.max(1, y2 - y1);
              c.fillStyle = d.color;
              c.fillRect(left, y1, (barWidth * up[i]) / (value || 1), height);
              c.fillStyle =
                d.profile?.showValueArea !== false && i >= vaLow && i <= vaHigh
                  ? "#42a5f5"
                  : "#ef7185";
              c.fillRect(
                left + (barWidth * up[i]) / (value || 1),
                y1,
                (barWidth * down[i]) / (value || 1),
                height,
              );
              if (i === poc && d.profile?.showPoc !== false) {
                c.fillStyle = "#ffb74d";
                c.fillRect(
                  left,
                  y1,
                  barWidth,
                  Math.max(1, Math.min(2, height)),
                );
              }
            });
            c.globalAlpha = 1;
            const line = (price: number, label: string, color: string) => {
              const y = a.series.priceToCoordinate(price);
              if (y === null) return;
              c.strokeStyle = color;
              c.beginPath();
              c.moveTo(Math.min(p.x, q.x), y);
              c.lineTo(Math.min(p.x, q.x) + width, y);
              c.stroke();
              c.font = "10px ui-monospace, monospace";
              c.fillStyle = color;
              c.fillText(label, Math.min(p.x, q.x) + width + 4, y + 3);
            };
            if (d.profile?.showPoc !== false)
              line(low + ((poc + 0.5) / rows) * (high - low), "POC", "#ffb74d");
            if (d.profile?.showValueArea !== false) {
              line(low + (vaLow / rows) * (high - low), "VAL", "#42a5f5");
              line(
                low + ((vaHigh + 1) / rows) * (high - low),
                "VAH",
                "#42a5f5",
              );
            }
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
  configure(drawings: Drawing[], bars: Candle[], interval: number) {
    this.drawings = drawings;
    this.bars = bars;
    this.interval = interval;
    this.attachment?.requestUpdate();
  }
}
