import type {
  IPrimitivePaneRenderer,
  IPrimitivePaneView,
  ISeriesPrimitive,
  Logical,
  SeriesAttachedParameter,
  Time,
} from "lightweight-charts";
import type { Candle } from "../domain/market";
import type { PineDrawing } from "../domain/pine-scripts";
import { logicalAtTime } from "../domain/drawings";

export class PineDrawingsRenderer implements ISeriesPrimitive<Time> {
  private attachment: SeriesAttachedParameter<Time> | null = null;
  private drawings: PineDrawing = { boxes: [], lines: [], labels: [] };
  private bars: Candle[] = [];
  private view: IPrimitivePaneView = {
    zOrder: () => "top",
    renderer: () => this.renderer,
  };
  private renderer: IPrimitivePaneRenderer = {
    draw: (target) => {
      const attached = this.attachment;
      if (!attached || !this.bars.length) return;
      const timeScale = attached.chart.timeScale();
      const x = (value: unknown, location: unknown) => {
        const n = Number(value);
        if (!Number.isFinite(n)) return null;
        return String(location).startsWith("bt") || location === "bar_time"
          ? timeScale.logicalToCoordinate(
              logicalAtTime(
                this.bars,
                n / 1000,
                this.bars.length > 1
                  ? this.bars[1].time - this.bars[0].time
                  : 60,
              ) as Logical,
            )
          : timeScale.logicalToCoordinate(n as Logical);
      };
      target.useMediaCoordinateSpace(({ context, mediaSize }) => {
        context.save();
        context.beginPath();
        context.rect(0, 0, mediaSize.width, mediaSize.height);
        context.clip();
        for (const box of this.drawings.boxes) {
          const left = x(box.left, box.xloc),
            right = x(box.right, box.xloc),
            top = attached.series.priceToCoordinate(Number(box.top)),
            bottom = attached.series.priceToCoordinate(Number(box.bottom));
          if (
            left === null ||
            right === null ||
            top === null ||
            bottom === null
          )
            continue;
          const extend = String(box.extend);
          const x1 =
            extend === "l" || extend === "both" ? 0 : Math.min(left, right);
          const x2 =
            extend === "r" || extend === "both"
              ? mediaSize.width
              : Math.max(left, right);
          const y1 = Math.min(top, bottom),
            y2 = Math.max(top, bottom);
          if (box.bgcolor && box.bgcolor !== "NaN") {
            context.fillStyle = String(box.bgcolor);
            context.fillRect(x1, y1, x2 - x1, y2 - y1);
          }
          if (box.border_color && box.border_color !== "NaN") {
            context.strokeStyle = String(box.border_color);
            context.lineWidth = Number(box.border_width) || 1;
            context.strokeRect(x1, y1, x2 - x1, y2 - y1);
          }
          if (box.text) {
            context.fillStyle = String(box.text_color || "#fff");
            context.font = "11px sans-serif";
            context.textAlign = "center";
            context.textBaseline = "middle";
            context.fillText(
              String(box.text),
              (x1 + x2) / 2,
              (y1 + y2) / 2,
              Math.max(0, x2 - x1 - 8),
            );
          }
        }
        for (const line of this.drawings.lines) {
          const x1 = x(line.x1, line.xloc),
            x2 = x(line.x2, line.xloc),
            y1 = attached.series.priceToCoordinate(Number(line.y1)),
            y2 = attached.series.priceToCoordinate(Number(line.y2));
          if (x1 === null || x2 === null || y1 === null || y2 === null)
            continue;
          const extend = String(line.extend);
          context.strokeStyle = String(line.color || "#99a5ff");
          context.lineWidth = Math.max(1, Number(line.width) || 1);
          context.setLineDash(
            String(line.style).includes("dotted")
              ? [2, 3]
              : String(line.style).includes("dashed")
                ? [6, 4]
                : [],
          );
          context.beginPath();
          context.moveTo(extend === "l" || extend === "both" ? 0 : x1, y1);
          context.lineTo(
            extend === "r" || extend === "both" ? mediaSize.width : x2,
            y2,
          );
          context.stroke();
        }
        context.setLineDash([]);
        for (const label of this.drawings.labels) {
          const px = x(label.x, label.xloc),
            py = attached.series.priceToCoordinate(Number(label.y));
          if (px === null || py === null || !label.text) continue;
          const text = String(label.text),
            color = String(label.textcolor || "#fff");
          context.font = "11px sans-serif";
          const width = context.measureText(text).width + 8;
          const hasBackground =
            label.color && label.color !== "NaN" && label.color !== "";
          context.fillStyle = String(label.color || "transparent");
          if (hasBackground)
            context.fillRect(px - width / 2, py - 9, width, 18);
          context.fillStyle = color;
          context.textAlign = "center";
          context.textBaseline = "middle";
          context.fillText(text, px, py);
        }
        context.restore();
      });
    },
  };

  attached(attachment: SeriesAttachedParameter<Time>) {
    this.attachment = attachment;
    attachment.requestUpdate();
  }
  detached() {
    this.attachment = null;
  }
  paneViews() {
    return [this.view];
  }
  configure(drawings: PineDrawing, bars: Candle[]) {
    this.drawings = drawings;
    this.bars = bars;
    this.attachment?.requestUpdate();
  }
}
