import type {
  ISeriesPrimitive,
  IPrimitivePaneView,
  IPrimitivePaneRenderer,
  SeriesAttachedParameter,
  Time,
  Logical,
} from "lightweight-charts";
import type { PriceOverlay } from "../hooks/use-overlays";
/** Bar/price coordinates keep overlays synchronized with independent axis scaling. */
export class PriceOverlaysRenderer implements ISeriesPrimitive<Time> {
  private attachment: SeriesAttachedParameter<Time> | null = null;
  private overlays: PriceOverlay[] = [];
  private textColor = "#dce4ef";
  private views: IPrimitivePaneView[] = [false, true].map((foreground) => ({
    zOrder: () => (foreground ? "normal" : "bottom"),
    renderer: () => this.renderer(foreground),
  }));
  attached(a: SeriesAttachedParameter<Time>) {
    this.attachment = a;
    a.requestUpdate();
  }
  detached() {
    this.attachment = null;
    this.overlays = [];
  }
  configure(overlays: PriceOverlay[], textColor: string) {
    this.overlays = overlays;
    this.textColor = textColor;
    this.attachment?.requestUpdate();
  }
  paneViews() {
    return this.views;
  }
  private renderer(foreground: boolean): IPrimitivePaneRenderer {
    return {
      draw: (target) => {
        const a = this.attachment;
        if (!a) return;
        target.useMediaCoordinateSpace(({ context: ctx, mediaSize: size }) => {
          const x = (v: number) =>
              a.chart.timeScale().logicalToCoordinate(v as Logical),
            y = (v: number) => a.series.priceToCoordinate(v);
          ctx.save();
          ctx.beginPath();
          ctx.rect(0, 0, size.width, size.height);
          ctx.clip();
          ctx.lineWidth = 1;
          for (const overlay of this.overlays) {
            for (const box of overlay.result.boxes) {
              const x1 = x(box.from),
                x2 = x(box.to),
                y1 = y(box.top),
                y2 = y(box.bottom);
              if (
                x1 === null ||
                x2 === null ||
                y1 === null ||
                y2 === null ||
                ![x1, x2, y1, y2].every(Number.isFinite) ||
                x2 < 0 ||
                x1 > size.width
              )
                continue;
              const left = Math.max(-1, x1),
                right = Math.min(size.width + 1, x2),
                top = Math.max(-1, Math.min(y1, y2)),
                bottom = Math.min(size.height + 1, Math.max(y1, y2));
              if (bottom <= top || right <= left) continue;
              if (!foreground) {
                ctx.globalAlpha = box.opacity;
                ctx.fillStyle = box.color;
                ctx.fillRect(left, top, right - left, bottom - top);
                ctx.globalAlpha = 0.6;
                if (box.border) {
                  ctx.strokeStyle = box.border;
                  ctx.setLineDash([2, 3]);
                  ctx.strokeRect(left, top, right - left, bottom - top);
                }
                ctx.globalAlpha = 1;
                ctx.setLineDash([]);
              } else if (box.text && right - left > 25 && bottom - top > 10) {
                ctx.save();
                ctx.beginPath();
                ctx.rect(left, top, right - left, bottom - top);
                ctx.clip();
                ctx.fillStyle = this.textColor;
                ctx.font = "11px ui-monospace, monospace";
                ctx.textAlign = "center";
                ctx.textBaseline = "middle";
                ctx.fillText(
                  box.text,
                  (left + right) / 2,
                  (top + bottom) / 2,
                  right - left - 4,
                );
                ctx.restore();
              }
            }
            if (!foreground) continue;
            for (const line of overlay.result.lines) {
              const x1 = x(line.from),
                x2 = x(line.to),
                y1 = y(line.price),
                y2 = y(line.endPrice ?? line.price);
              if (
                x1 === null ||
                x2 === null ||
                y1 === null ||
                y2 === null ||
                ![x1, x2, y1, y2].every(Number.isFinite) ||
                x2 < 0 ||
                x1 > size.width
              )
                continue;
              ctx.strokeStyle = line.color;
              ctx.setLineDash(
                line.dash === "Dashed"
                  ? [5, 4]
                  : line.dash === "Dotted"
                    ? [2, 3]
                    : [],
              );
              ctx.beginPath();
              ctx.moveTo(x1, y1);
              ctx.lineTo(x2, y2);
              ctx.stroke();
              ctx.setLineDash([]);
              if (line.text) {
                ctx.fillStyle = line.color;
                ctx.font = `${line.size === "normal" ? 13 : line.size === "small" ? 12 : 10}px ui-monospace, monospace`;
                ctx.textAlign = "center";
                ctx.textBaseline = "bottom";
                const at = line.group ? (x1 + x2) / 2 : x2 - 35;
                ctx.fillText(
                  line.text,
                  Math.max(40, Math.min(size.width - 45, at)),
                  (y1 + y2) / 2 - 3,
                );
              }
            }
            for (const label of overlay.result.labels) {
              const px = x(label.at),
                py = y(label.price);
              if (
                px === null ||
                py === null ||
                ![px, py].every(Number.isFinite) ||
                px < -30 ||
                px > size.width + 30
              )
                continue;
              ctx.fillStyle = label.color;
              ctx.font = "11px ui-monospace, monospace";
              ctx.textAlign = "center";
              ctx.textBaseline = label.below ? "top" : "bottom";
              ctx.fillText(label.text, px, py + (label.below ? 7 : -7));
            }
          }
          ctx.restore();
        });
      },
    };
  }
}
