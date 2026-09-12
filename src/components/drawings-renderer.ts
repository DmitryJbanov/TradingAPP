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
