import type {
  IPrimitivePaneRenderer,
  IPrimitivePaneView,
  ISeriesPrimitive,
  Logical,
  SeriesAttachedParameter,
  Time,
} from "lightweight-charts";
import { heatmapColor, type HeatmapParams } from "../domain/heatmap";
import type { Candle } from "../domain/market";

export interface CoinGlassHeatmapLayer {
  axis: number[];
  columns: number;
  times: { x: number; time: number }[];
  cells: [number, number, number][];
  intensity: (value: number) => number;
  threshold: number;
  scheme: HeatmapParams["scheme"];
}

/** Draw cells in chart coordinates so the overlay follows the chart's time and price scales. */
export class CoinGlassHeatmapRenderer implements ISeriesPrimitive<Time> {
  private attachment: SeriesAttachedParameter<Time> | null = null;
  private layer?: CoinGlassHeatmapLayer;
  private bars: Candle[] = [];
  private views: IPrimitivePaneView[] = [{
    zOrder: () => "bottom",
    renderer: () => this.renderer(),
  }];

  attached(attachment: SeriesAttachedParameter<Time>) {
    this.attachment = attachment;
    attachment.requestUpdate();
  }

  detached() {
    this.attachment = null;
    this.layer = undefined;
    this.bars = [];
  }

  configure(layer: CoinGlassHeatmapLayer | undefined, bars: Candle[]) {
    this.layer = layer;
    this.bars = bars;
    this.attachment?.requestUpdate();
  }

  paneViews() { return this.views; }

  private renderer(): IPrimitivePaneRenderer {
    return {
      draw: target => {
        const attachment = this.attachment, layer = this.layer, bars = this.bars;
        if (!attachment || !layer || !bars.length || !layer.cells.length) return;
        target.useMediaCoordinateSpace(({ context, mediaSize }) => {
          const { chart, series } = attachment;
          const timeScale = chart.timeScale();
          // Lightweight Charts 5.0.9 returns zero for fractional logical indices.
          // Interpolate between integer candle coordinates for sub-candle cells.
          const coordinateAt = (logical: number) => {
            const index = Math.floor(logical);
            const left = timeScale.logicalToCoordinate(index as Logical);
            const right = timeScale.logicalToCoordinate((index + 1) as Logical);
            return left === null || right === null
              ? null
              : left + (right - left) * (logical - index);
          };
          const logicalAt = (time: number) => {
            let lo = 0, hi = bars.length;
            while (lo < hi) {
              const mid = (lo + hi) >>> 1;
              if (bars[mid].time < time) lo = mid + 1;
              else hi = mid;
            }
            if (lo === 0) {
              const step = (bars[1]?.time ?? bars[0].time + 1) - bars[0].time;
              return (time - bars[0].time) / step;
            }
            if (lo === bars.length) {
              const step = bars.length > 1 ? bars.at(-1)!.time - bars.at(-2)!.time || 1 : 1;
              return bars.length - 1 + (time - bars.at(-1)!.time) / step;
            }
            const before = bars[lo - 1], after = bars[lo];
            return lo - 1 + (time - before.time) / (after.time - before.time || 1);
          };
          const centers = new Map<number, number>();
          if (layer.times.length) {
            for (const candle of layer.times)
              centers.set(candle.x, logicalAt(candle.time));
            const knownX = [...centers.keys()].sort((a, b) => a - b);
            for (let i = 1; i < knownX.length; i++) {
              const left = knownX[i - 1], right = knownX[i];
              for (let x = left + 1; x < right; x++)
                centers.set(x, centers.get(left)! + (centers.get(right)! - centers.get(left)!) * (x - left) / (right - left));
            }
          } else {
            for (let x = 0; x < layer.columns; x++)
              centers.set(x, x * Math.max(1, bars.length - 1) / Math.max(1, layer.columns - 1));
          }
          const sortedX = [...centers.keys()].sort((a, b) => a - b);
          const xBounds = new Map<number, [number, number]>();
          sortedX.forEach((x, i) => {
            const center = centers.get(x)!;
            const previous = centers.get(sortedX[i - 1]);
            const next = centers.get(sortedX[i + 1]);
            const half = next !== undefined ? next - center : center - (previous ?? center - 1);
            xBounds.set(x, [previous === undefined ? center - half / 2 : (previous + center) / 2,
              next === undefined ? center + half / 2 : (center + next) / 2]);
          });
          const columnCoordinates = new Map<number, [number, number]>();
          for (const [x, bounds] of xBounds) {
            const start = Math.max(-0.5, bounds[0]);
            const end = Math.min(bars.length - 0.5, bounds[1]);
            if (end <= start) continue;
            const left = coordinateAt(start), right = coordinateAt(end);
            if (left !== null && right !== null) columnCoordinates.set(x, [left, right]);
          }
          const yBounds = layer.axis.map((price, index) => {
            const low = index ? (layer.axis[index - 1] + price) / 2 : price - (layer.axis[index + 1] - price) / 2;
            const high = index + 1 < layer.axis.length ? (price + layer.axis[index + 1]) / 2 : price + (price - layer.axis[index - 1]) / 2;
            return [series.priceToCoordinate(low), series.priceToCoordinate(high)] as const;
          });
          context.save();
          context.beginPath();
          context.rect(0, 0, mediaSize.width, mediaSize.height);
          context.clip();
          for (const [xIndex, yIndex, value] of layer.cells) {
            const xRange = columnCoordinates.get(xIndex), yRange = yBounds[yIndex];
            if (!xRange || !yRange || yRange[0] === null || yRange[1] === null) continue;
            const [x1, x2] = xRange;
            if (x1 === null || x2 === null || x2 <= 0 || x1 >= mediaSize.width) continue;
            const left = Math.max(0, x1), right = Math.min(mediaSize.width, x2);
            const top = Math.max(0, Math.min(yRange[0], yRange[1]));
            const bottom = Math.min(mediaSize.height, Math.max(yRange[0], yRange[1]));
            if (right <= left || bottom <= top) continue;
            const strength = layer.intensity(value);
            const relative = layer.threshold >= 1 ? 1 : Math.max(0, (strength - layer.threshold) / (1 - layer.threshold));
            context.globalAlpha = 0.18 + relative * 0.7;
            context.fillStyle = heatmapColor(Math.min(1, strength * 1.12), layer.scheme);
            context.fillRect(left, top, right - left + 0.5, bottom - top + 0.5);
          }
          context.restore();
        });
      },
    };
  }
}
