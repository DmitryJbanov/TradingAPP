import type {
  IPrimitivePaneRenderer,
  IPrimitivePaneView,
  ISeriesPrimitive,
  Logical,
  SeriesAttachedParameter,
  Time,
} from "lightweight-charts";
import {
  heatmapColumnIndex,
  heatmapColor,
  type HeatmapParams,
} from "../domain/heatmap";
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
  private cellValues = new Map<number, number>();
  private hoverColumns: [number, number, number][] = [];
  private hoverRows: (readonly [number | null, number | null])[] = [];
  private logicalBounds?: Map<number, [number, number]>;
  private image?: OffscreenCanvas;
  private imageKey = "";
  private styles = new Map<number, { color: string; alpha: number }>();
  private paneSize = { width: 0, height: 0 };
  private views: IPrimitivePaneView[] = [
    {
      zOrder: () => "bottom",
      renderer: () => this.renderer(),
    },
  ];

  attached(attachment: SeriesAttachedParameter<Time>) {
    this.attachment = attachment;
    attachment.requestUpdate();
  }

  detached() {
    this.attachment = null;
    this.layer = undefined;
    this.bars = [];
    this.cellValues.clear();
    this.logicalBounds = undefined;
    this.image = undefined;
    this.styles.clear();
    this.hoverColumns = [];
    this.hoverRows = [];
  }

  configure(layer: CoinGlassHeatmapLayer | undefined, bars: Candle[]) {
    if (this.layer !== layer) {
      this.cellValues = new Map();
      for (const [x, y, value] of layer?.cells ?? [])
        this.cellValues.set(x * layer!.axis.length + y, value);
      this.styles.clear();
      this.imageKey = "";
      this.logicalBounds = undefined;
    }
    if (
      this.bars.length !== bars.length ||
      this.bars.some((bar, i) => bar.time !== bars[i].time)
    ) {
      this.logicalBounds = undefined;
      this.imageKey = "";
    }
    this.layer = layer;
    this.bars = bars;
    this.hoverColumns = [];
    this.hoverRows = [];
    this.attachment?.requestUpdate();
  }

  paneViews() {
    return this.views;
  }

  /** Look up the historical cell using the same screen bounds as the rendered heatmap. */
  liquidityAt(x: number, y: number) {
    const layer = this.layer;
    if (
      !layer ||
      x < 0 ||
      y < 0 ||
      x >= this.paneSize.width ||
      y >= this.paneSize.height
    )
      return;
    const column = this.hoverColumns.find(
      ([, left, right]) => x >= left && x < right,
    );
    if (!column) return;
    const row = this.hoverRows.findIndex(
      ([a, b]) =>
        a !== null && b !== null && y >= Math.min(a, b) && y < Math.max(a, b),
    );
    if (row < 0) return;
    const value = this.cellValues.get(column[0] * layer.axis.length + row);
    if (value === undefined || value <= 0) return;
    return { price: layer.axis[row], value };
  }

  private renderer(): IPrimitivePaneRenderer {
    return {
      draw: (target) => {
        const attachment = this.attachment,
          layer = this.layer,
          bars = this.bars;
        if (!attachment || !layer || !bars.length || !layer.cells.length)
          return;
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
            let lo = 0,
              hi = bars.length;
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
              const step =
                bars.length > 1
                  ? bars.at(-1)!.time - bars.at(-2)!.time || 1
                  : 1;
              return bars.length - 1 + (time - bars.at(-1)!.time) / step;
            }
            const before = bars[lo - 1],
              after = bars[lo];
            return (
              lo - 1 + (time - before.time) / (after.time - before.time || 1)
            );
          };
          if (!this.logicalBounds) {
            const centers = new Map<number, number>();
            if (layer.times.length) {
              for (const candle of layer.times)
                centers.set(candle.x, logicalAt(candle.time));
              const knownX = [...centers.keys()].sort((a, b) => a - b);
              for (let i = 1; i < knownX.length; i++) {
                const left = knownX[i - 1],
                  right = knownX[i];
                for (let x = left + 1; x < right; x++)
                  centers.set(
                    x,
                    centers.get(left)! +
                      ((centers.get(right)! - centers.get(left)!) *
                        (x - left)) /
                        (right - left),
                  );
              }
            } else {
              for (let x = 0; x < layer.columns; x++)
                centers.set(
                  x,
                  (x * Math.max(1, bars.length - 1)) /
                    Math.max(1, layer.columns - 1),
                );
            }
            const sortedX = [...centers.keys()].sort((a, b) => a - b);
            const xBounds = new Map<number, [number, number]>();
            sortedX.forEach((x, i) => {
              const center = centers.get(x)!;
              const previous = centers.get(sortedX[i - 1]);
              const next = centers.get(sortedX[i + 1]);
              const half =
                next !== undefined
                  ? next - center
                  : center - (previous ?? center - 1);
              xBounds.set(x, [
                previous === undefined
                  ? center - half / 2
                  : (previous + center) / 2,
                next === undefined ? center + half / 2 : (center + next) / 2,
              ]);
            });
            this.logicalBounds = xBounds;
          }
          const columnCoordinates = new Map<number, [number, number]>();
          for (const [x, bounds] of this.logicalBounds) {
            const start = Math.max(-0.5, bounds[0]);
            const end = Math.min(bars.length - 0.5, bounds[1]);
            if (end <= start) continue;
            const left = coordinateAt(start),
              right = coordinateAt(end);
            if (left !== null && right !== null)
              columnCoordinates.set(x, [left, right]);
          }
          const yBounds = layer.axis.map((price, index) => {
            const low = index
              ? (layer.axis[index - 1] + price) / 2
              : price - (layer.axis[index + 1] - price) / 2;
            const high =
              index + 1 < layer.axis.length
                ? (price + layer.axis[index + 1]) / 2
                : price + (price - layer.axis[index - 1]) / 2;
            return [
              series.priceToCoordinate(low),
              series.priceToCoordinate(high),
            ] as const;
          });
          this.paneSize = mediaSize;
          this.hoverColumns = [...columnCoordinates].map(
            ([index, [left, right]]) => [index, left, right],
          );
          this.hoverRows = yBounds;
          const ratioX = context.getTransform?.().a ?? 1;
          const ratioY = context.getTransform?.().d ?? 1;
          const key = JSON.stringify([
            mediaSize.width,
            mediaSize.height,
            ratioX,
            ratioY,
            coordinateAt(0),
            coordinateAt(1),
            yBounds,
          ]);
          if (this.image && this.imageKey === key) {
            context.drawImage(this.image, 0, 0, this.image.width / ratioX, this.image.height / ratioY);
            return;
          }
          const width = Math.ceil(mediaSize.width * ratioX),
            height = Math.ceil(mediaSize.height * ratioY);
          if (typeof OffscreenCanvas !== "undefined") {
            if (
              !this.image ||
              this.image.width !== width ||
              this.image.height !== height
            )
              this.image = new OffscreenCanvas(width, height);
          }
          const bitmapContext = this.image?.getContext("2d");
          const paint = bitmapContext ?? context;
          if (bitmapContext) {
            bitmapContext.setTransform(ratioX, 0, 0, ratioY, 0, 0);
            bitmapContext.clearRect(0, 0, mediaSize.width, mediaSize.height);
          }
          paint.save();
          paint.beginPath();
          paint.rect(0, 0, mediaSize.width, mediaSize.height);
          paint.clip();
          const candidates: number[] = [];
          const columnIndex = heatmapColumnIndex(layer.cells);
          for (const [x, [left, right]] of columnCoordinates) {
            if (right <= 0 || left >= mediaSize.width) continue;
            for (const index of columnIndex.get(x) ?? [])
              candidates.push(index);
          }
          // Preserve source order, including overlapping fractional cell edges.
          candidates.sort((a, b) => a - b);
          for (const index of candidates) {
            const [xIndex, yIndex, value] = layer.cells[index];
            const xRange = columnCoordinates.get(xIndex),
              yRange = yBounds[yIndex];
            if (!xRange || !yRange || yRange[0] === null || yRange[1] === null)
              continue;
            const [x1, x2] = xRange;
            if (x1 === null || x2 === null || x2 <= 0 || x1 >= mediaSize.width)
              continue;
            const left = Math.max(0, x1),
              right = Math.min(mediaSize.width, x2);
            const top = Math.max(0, Math.min(yRange[0], yRange[1]));
            const bottom = Math.min(
              mediaSize.height,
              Math.max(yRange[0], yRange[1]),
            );
            if (right <= left || bottom <= top) continue;
            let style = this.styles.get(index);
            if (!style) {
              const strength = layer.intensity(value);
              const relative =
                layer.threshold >= 1
                  ? 1
                  : Math.max(
                      0,
                      (strength - layer.threshold) / (1 - layer.threshold),
                    );
              style = {
                alpha: 0.18 + relative * 0.7,
                color: heatmapColor(Math.min(1, strength * 1.12), layer.scheme),
              };
              this.styles.set(index, style);
            }
            paint.globalAlpha = style.alpha;
            paint.fillStyle = style.color;
            paint.fillRect(left, top, right - left + 0.5, bottom - top + 0.5);
          }
          paint.restore();
          if (this.image && bitmapContext) {
            this.imageKey = key;
            context.drawImage(this.image, 0, 0, this.image.width / ratioX, this.image.height / ratioY);
          }
        });
      },
    };
  }
}
