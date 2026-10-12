import type {
  ISeriesPrimitive,
  IPrimitivePaneView,
  IPrimitivePaneRenderer,
  ISeriesPrimitiveAxisView,
  SeriesAttachedParameter,
  Time,
  UTCTimestamp,
  Logical,
} from "lightweight-charts";
import type { Candle } from "../domain/market";
import { whaleCandleTime, type WhaleChartPoint } from "../domain/whale-chart";

type Anchor = WhaleChartPoint & { candleTime: number };
export type WhaleHit = { point: Anchor; x: number; y: number };

/** Draw in the candle pane itself, using its native time and price coordinates. */
export class WhaleTradesRenderer implements ISeriesPrimitive<Time> {
  private attachment: SeriesAttachedParameter<Time> | null = null;
  private anchors: Anchor[] = [];
  private selected: Anchor | undefined;
  private readonly renderer: IPrimitivePaneRenderer = {
    draw: (target) =>
      target.useMediaCoordinateSpace(({ context: ctx, mediaSize: size }) => {
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, 0, size.width, size.height);
        ctx.clip();
        for (const point of this.anchors) {
          const projected = this.project(point);
          if (!projected) continue;
          const { x, y } = projected;
          if (x < 0 || x > size.width) continue;
          ctx.strokeStyle = point.color;
          ctx.lineWidth = 1;
          if (point.selected) {
            ctx.setLineDash([4, 4]);
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, size.height);
            if (point.id.startsWith("position:")) {
              ctx.moveTo(x, y);
              ctx.lineTo(size.width, y);
            }
            ctx.stroke();
            ctx.setLineDash([]);
          }
          if (y < 0 || y > size.height) continue;
          ctx.beginPath();
          ctx.arc(x, y, point.selected ? 7 : 5, 0, Math.PI * 2);
          ctx.fillStyle = point.color;
          ctx.fill();
          ctx.strokeStyle = "#fff";
          ctx.lineWidth = point.selected ? 2 : 1;
          ctx.stroke();
          ctx.font = "600 11px sans-serif";
          const label = `${point.label} #${point.id.slice(-6)}`;
          const half = ctx.measureText(label).width / 2;
          const labelX = Math.max(half + 3, Math.min(x, size.width - half - 3));
          ctx.textAlign = "center";
          ctx.textBaseline = "bottom";
          ctx.lineWidth = 3;
          ctx.strokeStyle = "#111";
          ctx.strokeText(label, labelX, Math.max(16, y - 12));
          ctx.fillText(label, labelX, Math.max(16, y - 12));
        }
        ctx.restore();
      }),
  };
  private readonly panes: IPrimitivePaneView[] = [
    {
      zOrder: () => "top",
      renderer: () => this.renderer,
    },
  ];
  private readonly timeLabels: ISeriesPrimitiveAxisView[] = [
    {
      coordinate: () => this.selectedX() ?? -10000,
      text: () =>
        this.selected?.time === undefined
          ? ""
          : new Date(this.selected.time * 1000).toLocaleString("ru-RU", {
              timeZone: "UTC",
              day: "2-digit",
              month: "2-digit",
              year: "2-digit",
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
            }) + " UTC",
      textColor: () => "#fff",
      backColor: () => this.selected?.color ?? "#444",
      visible: () => {
        const x = this.selectedX();
        return (
          x !== null &&
          x >= 0 &&
          x <= (this.attachment?.chart.timeScale().width() ?? 0)
        );
      },
      tickVisible: () => true,
    },
  ];
  attached(attachment: SeriesAttachedParameter<Time>) {
    this.attachment = attachment;
    attachment.requestUpdate();
  }
  detached() {
    this.attachment = null;
  }
  configure(points: WhaleChartPoint[], bars: Candle[], interval: number) {
    this.anchors = points.flatMap((point) => {
      const candleTime = whaleCandleTime(bars, point.time, interval);
      return candleTime === null ||
        !Number.isFinite(point.price) ||
        point.price <= 0
        ? []
        : [{ ...point, candleTime }];
    });
    this.selected = this.anchors.find((point) => point.selected);
    this.attachment?.requestUpdate();
  }
  private selectedX() {
    return this.selected && this.attachment
      ? this.attachment.chart
          .timeScale()
          .timeToCoordinate(this.selected.candleTime as UTCTimestamp)
      : null;
  }
  private project(point: Anchor): WhaleHit | null {
    if (!this.attachment) return null;
    const x = this.attachment.chart
      .timeScale()
      .timeToCoordinate(point.candleTime as UTCTimestamp);
    const y = this.attachment.series.priceToCoordinate(point.price);
    return x !== null && y !== null && Number.isFinite(x) && Number.isFinite(y)
      ? { point, x, y }
      : null;
  }
  findAt(x: number, y: number): WhaleHit | null {
    // Selected points win if several fills overlap on the same candle.
    const ordered = this.selected
      ? [this.selected, ...this.anchors]
      : this.anchors;
    for (const point of ordered) {
      const hit = this.project(point);
      if (hit && Math.hypot(hit.x - x, hit.y - y) <= 12) return hit;
    }
    return null;
  }
  hitTest(x: number, y: number) {
    const hit = this.findAt(x, y);
    return hit
      ? {
          externalId: `whale:${hit.point.id}`,
          cursorStyle: "pointer",
          zOrder: "top" as const,
        }
      : null;
  }
  autoscaleInfo(start: Logical, end: Logical) {
    if (!this.selected || !this.attachment) return null;
    const index = this.attachment.chart
      .timeScale()
      .timeToIndex(this.selected.candleTime as UTCTimestamp);
    return index !== null && index >= start && index <= end
      ? {
          priceRange: {
            minValue: this.selected.price,
            maxValue: this.selected.price,
          },
        }
      : null;
  }
  paneViews() {
    return this.panes;
  }
  timeAxisViews() {
    return this.timeLabels;
  }
}
