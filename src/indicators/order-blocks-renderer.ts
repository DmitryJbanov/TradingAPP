import type {
  ISeriesPrimitive,
  IPrimitivePaneView,
  IPrimitivePaneRenderer,
  SeriesAttachedParameter,
  Time,
  UTCTimestamp,
} from "lightweight-charts";
import type { OrderBlockOverlay } from "../hooks/use-order-blocks";

/** A single primitive preserves catalog layering and shares the candles' price scale. */
export class OrderBlocksRenderer implements ISeriesPrimitive<Time> {
  private attachment: SeriesAttachedParameter<Time> | null = null;
  private overlays: OrderBlockOverlay[] = [];
  private readonly pane: IPrimitivePaneView = {
    zOrder: () => "bottom",
    renderer: () => this.renderer,
  };
  private readonly renderer: IPrimitivePaneRenderer = {
    draw: (target) => {
      const attachment = this.attachment;
      if (!attachment) return;
      target.useMediaCoordinateSpace(({ context: ctx, mediaSize: size }) => {
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, 0, size.width, size.height);
        ctx.clip();
        for (const overlay of this.overlays) {
          const p = overlay.params;
          for (const block of overlay.result.blocks) {
            const x = attachment.chart
              .timeScale()
              .timeToCoordinate(block.startTime as UTCTimestamp);
            const top = attachment.series.priceToCoordinate(block.top);
            const bottom = attachment.series.priceToCoordinate(block.bottom);
            if (
              x === null ||
              top === null ||
              bottom === null ||
              ![x, top, bottom].every(Number.isFinite) ||
              x > size.width
            )
              continue;
            const left = Math.max(0, x),
              y = Math.min(top, bottom),
              height = Math.abs(bottom - top);
            const bullish = block.side === "bullish";
            ctx.globalAlpha =
              1 -
              (bullish ? p.bullishTransparency : p.bearishTransparency) / 100;
            ctx.fillStyle = bullish ? p.col_bullish_ob : p.col_bearish_ob;
            ctx.fillRect(left, y, size.width - left, height);
            ctx.globalAlpha = 1;
            ctx.strokeStyle = bullish ? p.col_bullish : p.col_bearish;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(left, y);
            ctx.lineTo(size.width, y);
            ctx.moveTo(left, y + height);
            ctx.lineTo(size.width, y + height);
            if (x >= 0) {
              ctx.moveTo(x, y);
              ctx.lineTo(x, y + height);
            }
            ctx.stroke();
          }
        }
        ctx.restore();
      });
    },
  };
  attached(attachment: SeriesAttachedParameter<Time>) {
    this.attachment = attachment;
    attachment.requestUpdate();
  }
  detached() {
    this.attachment = null;
    this.overlays = [];
  }
  configure(overlays: OrderBlockOverlay[]) {
    this.overlays = overlays;
    this.attachment?.requestUpdate();
  }
  paneViews() {
    return [this.pane];
  }
}
