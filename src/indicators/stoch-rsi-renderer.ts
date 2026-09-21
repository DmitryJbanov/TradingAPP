import {
  customSeriesDefaultOptions,
  type CustomData,
  type CustomSeriesWhitespaceData,
  type ICustomSeriesPaneView,
  type ICustomSeriesPaneRenderer,
  type PaneRendererCustomData,
  type Time,
} from "lightweight-charts";
import type { StochRsiPoint } from "./stoch-rsi";

export interface StochRsiChartData extends CustomData {
  point: StochRsiPoint;
}
export class StochRsiRenderer
  implements ICustomSeriesPaneView<Time, StochRsiChartData>
{
  private data: PaneRendererCustomData<Time, StochRsiChartData> | null = null;
  defaultOptions() {
    return {
      ...customSeriesDefaultOptions,
      priceLineVisible: false,
      lastValueVisible: false,
      priceFormat: { type: "price" as const, precision: 2, minMove: 0.01 },
    };
  }
  isWhitespace(
    data: StochRsiChartData | CustomSeriesWhitespaceData<Time>,
  ): data is CustomSeriesWhitespaceData<Time> {
    return !("point" in data);
  }
  update(data: PaneRendererCustomData<Time, StochRsiChartData>) {
    this.data = data;
  }
  priceValueBuilder(data: StochRsiChartData) {
    return [0, 100, data.point.k ?? 50];
  }
  renderer(): ICustomSeriesPaneRenderer {
    return {
      draw: (target, toY) => {
        const data = this.data;
        if (!data?.visibleRange) return;
        target.useMediaCoordinateSpace(({ context: ctx, mediaSize: size }) => {
          const y = (value: number) => toY(value) ?? 0;
          ctx.save();
          ctx.fillStyle = "rgba(33,150,243,0.1)";
          ctx.fillRect(0, y(80), size.width, y(20) - y(80));
          for (const level of [20, 50, 80]) {
            ctx.strokeStyle =
              level === 50 ? "rgba(120,123,134,0.5)" : "#787B86";
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(0, y(level));
            ctx.lineTo(size.width, y(level));
            ctx.stroke();
          }
          const bars = data.bars.slice(
            Math.max(0, data.visibleRange!.from - 1),
            data.visibleRange!.to + 1,
          );
          for (const key of ["k", "d"] as const) {
            ctx.strokeStyle = key === "k" ? "#2962FF" : "#FF6D00";
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            let connected = false;
            for (const bar of bars) {
              const value = bar.originalData.point[key];
              if (value === null) {
                connected = false;
                continue;
              }
              if (connected) ctx.lineTo(bar.x, y(value));
              else ctx.moveTo(bar.x, y(value));
              connected = true;
            }
            ctx.stroke();
          }
          ctx.restore();
        });
      },
    };
  }
}
