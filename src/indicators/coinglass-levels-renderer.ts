import type {
  IPrimitivePaneRenderer,
  IPrimitivePaneView,
  ISeriesPrimitive,
  Logical,
  MouseEventParams,
  SeriesAttachedParameter,
  Time,
} from "lightweight-charts";
import type { CoinglassOverlay } from "../domain/coinglass";
import type { Candle } from "../domain/market";
import { coinglassVolumeColorIndex } from "../domain/coinglass";

type ProfilePalette = { background: string; grid: string; text: string };
const defaultPalette: ProfilePalette = {
  background: "#101318",
  grid: "#303740",
  text: "#e5e9f0",
};

/** Render liquidation levels as price/time cells on the candle chart. */
export class CoinGlassLevelsRenderer implements ISeriesPrimitive<Time> {
  private attachment: SeriesAttachedParameter<Time> | null = null;
  private overlays: CoinglassOverlay[] = [];
  private bars: Candle[] = [];
  private palette = defaultPalette;
  private cursorPrice: number | null = null;
  private readonly view: IPrimitivePaneView = {
    zOrder: () => "bottom",
    renderer: () => this.renderer,
  };
  private readonly profileView: IPrimitivePaneView = {
    zOrder: () => "top",
    renderer: () => this.profileRenderer,
  };
  private readonly renderer: IPrimitivePaneRenderer = {
    draw: (target) => {
      const attachment = this.attachment;
      if (!attachment || !this.bars.length || !this.overlays.length) return;
      target.useMediaCoordinateSpace(({ context, mediaSize }) => {
        const { chart, series } = attachment;
        const timeScale = chart.timeScale();
        const x1 = timeScale.logicalToCoordinate(0 as Logical);
        const x2 = timeScale.logicalToCoordinate((this.bars.length - 1) as Logical);
        const xNext = this.bars.length > 1
          ? timeScale.logicalToCoordinate(1 as Logical)
          : null;
        if (x1 === null || x2 === null) return;
        const barWidth = xNext === null ? timeScale.options().barSpacing : Math.abs(xNext - x1);
        const left = Math.max(0, Math.min(x1, x2) - barWidth / 2);
        const right = Math.min(mediaSize.width, Math.max(x1, x2) + barWidth / 2);
        if (right <= left) return;

        context.save();
        context.beginPath();
        context.rect(0, 0, mediaSize.width, mediaSize.height);
        context.clip();
        for (const overlay of this.overlays) {
          if (!overlay.params.showLevels) continue;
          const levels = (overlay.points?.length
            ? overlay.points
            : overlay.result.levels).filter(
            (level) =>
              Number.isFinite(level.price) &&
              level.price > 0 &&
              Number.isFinite(level.intensity) &&
              level.intensity >= 0,
          );
          const maxIntensity = levels.reduce(
            (max, level) => Math.max(max, level.intensity),
            0,
          );
          const minIntensity = levels.reduce(
            (min, level) => Math.min(min, level.intensity),
            Infinity,
          );
          const ordered = [...levels].sort((a, b) => a.price - b.price);
          ordered.forEach((level, index) => {
            const previous = ordered[index - 1]?.price;
            const next = ordered[index + 1]?.price;
            const halfStep = Math.max(level.price * 0.0005, 1e-8);
            const low = previous === undefined ? level.price - ((next ?? level.price + halfStep) - level.price) / 2 : (previous + level.price) / 2;
            const high = next === undefined ? level.price + (level.price - (previous ?? level.price - halfStep)) / 2 : (level.price + next) / 2;
            const y1 = series.priceToCoordinate(low);
            const y2 = series.priceToCoordinate(high);
            if (y1 === null || y2 === null) return;
            const top = Math.max(0, Math.min(y1, y2));
            const bottom = Math.min(mediaSize.height, Math.max(y1, y2));
            if (bottom <= top) return;
            const colorIndex = coinglassVolumeColorIndex(
              level.intensity,
              minIntensity,
              maxIntensity,
            );
            const color = overlay.params.volumeColors[colorIndex];
            context.fillStyle = color;
            context.globalAlpha = overlay.params.volumeOpacities[colorIndex] / 100;
            context.fillRect(left, top, right - left + 0.5, bottom - top + 0.5);
          });
        }
        context.restore();
      });
    },
  };
  private readonly profileRenderer: IPrimitivePaneRenderer = {
    draw: (target) => {
      const attachment = this.attachment;
      if (!attachment || !this.overlays.length) return;
      target.useMediaCoordinateSpace(({ context, mediaSize }) => {
        const { series } = attachment;
        const width = Math.min(180, Math.max(96, mediaSize.width * 0.22));
        const left = Math.max(0, mediaSize.width - width);
        const laneWidth = width / this.overlays.length;

        context.save();
        context.beginPath();
        context.rect(0, 0, mediaSize.width, mediaSize.height);
        context.clip();
        context.globalAlpha = 0.9;
        context.fillStyle = this.palette.background;
        context.fillRect(left, 0, mediaSize.width - left, mediaSize.height);
        context.globalAlpha = 1;
        context.strokeStyle = this.palette.grid;
        context.beginPath();
        context.moveTo(left + 0.5, 0);
        context.lineTo(left + 0.5, mediaSize.height);
        context.stroke();

        this.overlays.forEach((overlay, overlayIndex) => {
          const levels = (overlay.points?.length
            ? overlay.points
            : overlay.result.levels)
            .filter(
              (level) =>
                Number.isFinite(level.price) &&
                level.price > 0 &&
                Number.isFinite(level.intensity) &&
                level.intensity >= 0,
            )
            .sort((a, b) => a.price - b.price);
          const minIntensity = levels.reduce(
            (min, level) => Math.min(min, level.intensity),
            Infinity,
          );
          const maxIntensity = levels.reduce(
            (max, level) => Math.max(max, level.intensity),
            0,
          );
          const laneLeft = left + overlayIndex * laneWidth;
          const laneRight = laneLeft + laneWidth;
          const calloutWidth = laneWidth >= 120 ? Math.min(92, laneWidth * 0.48) : 0;
          const histogramRight = laneRight - calloutWidth - (calloutWidth ? 8 : 0);
          const center = (laneLeft + histogramRight) / 2;
          const histogramWidth = Math.max(12, (histogramRight - laneLeft - 16) / 2);
          const currentPrice = this.bars.at(-1)?.close || overlay.result.currentPrice;
          const above = levels.filter((level) => level.price > currentPrice);
          const below = levels.filter((level) => level.price < currentPrice).reverse();
          const aboveTotal = above.reduce((sum, level) => sum + level.intensity, 0);
          const belowTotal = below.reduce((sum, level) => sum + level.intensity, 0);
          const maxCumulative = Math.max(aboveTotal, belowTotal, 1);
          if (overlayIndex > 0) {
            context.beginPath();
            context.moveTo(laneLeft + 0.5, 0);
            context.lineTo(laneLeft + 0.5, mediaSize.height);
            context.stroke();
          }

          context.fillStyle = this.palette.text;
          context.font = "10px sans-serif";
          context.textBaseline = "top";
          context.fillText("КУМ. ОБЪЁМ", laneLeft + 6, 5, Math.max(0, laneWidth - 12));
          context.font = "600 11px sans-serif";
          const totalLabel = `↑$${new Intl.NumberFormat("en-US", {
            notation: "compact",
            maximumFractionDigits: 1,
          }).format(aboveTotal)} ↓$${new Intl.NumberFormat("en-US", {
            notation: "compact",
            maximumFractionDigits: 1,
          }).format(belowTotal)}`;
          context.fillText(totalLabel, laneLeft + 6, 19, Math.max(0, laneWidth - 12));

          const levelIndexes = new Map(
            levels.map((level, index) => [level, index] as const),
          );
          const drawSide = (side: typeof above, direction: "up" | "down") => {
            let cumulative = 0;
            side.forEach((level) => {
              cumulative += level.intensity;
              const index = levelIndexes.get(level) ?? 0;
              const previous = levels[index - 1]?.price;
              const next = levels[index + 1]?.price;
              const halfStep = Math.max(level.price * 0.0005, 1e-8);
              const low = previous === undefined
                ? level.price - ((next ?? level.price + halfStep) - level.price) / 2
                : (previous + level.price) / 2;
              const high = next === undefined
                ? level.price + (level.price - (previous ?? level.price - halfStep)) / 2
                : (level.price + next) / 2;
              const y1 = series.priceToCoordinate(low);
              const y2 = series.priceToCoordinate(high);
              if (y1 === null || y2 === null) return;
              const top = Math.max(34, 0, Math.min(y1, y2));
              const bottom = Math.min(mediaSize.height, Math.max(y1, y2));
              if (bottom <= top || maxCumulative <= 0) return;

              const colorIndex = coinglassVolumeColorIndex(
                level.intensity,
                minIntensity,
                maxIntensity,
              );
              const barWidth = Math.max(1, histogramWidth * (cumulative / maxCumulative));
              context.fillStyle = overlay.params.volumeColors[colorIndex];
              context.globalAlpha = overlay.params.volumeOpacities[colorIndex] / 100;
              context.fillRect(
                direction === "up" ? center : center - barWidth,
                top,
                barWidth,
                bottom - top,
              );
              context.globalAlpha = 1;
            });
          };
          drawSide(above, "up");
          drawSide(below, "down");

          const currentY = series.priceToCoordinate(currentPrice);
          if (currentY !== null) {
            context.strokeStyle = this.palette.text;
            context.globalAlpha = 0.8;
            context.beginPath();
            context.moveTo(laneLeft, currentY);
            context.lineTo(laneRight, currentY);
            context.stroke();
            context.globalAlpha = 1;
          }

          if (this.cursorPrice !== null && currentPrice > 0 && levels.length) {
            const distance = Math.abs(this.cursorPrice / currentPrice - 1);
            const upperBound = currentPrice * (1 + distance);
            const lowerBound = currentPrice * Math.max(0, 1 - distance);
            const upperCumulative = levels.reduce(
              (sum, level) =>
                level.price > currentPrice && level.price <= upperBound
                  ? sum + level.intensity
                  : sum,
              0,
            );
            const lowerCumulative = levels.reduce(
              (sum, level) =>
                level.price < currentPrice && level.price >= lowerBound
                  ? sum + level.intensity
                  : sum,
              0,
            );
            const delta = upperCumulative - lowerCumulative;
            const distanceText = `${this.cursorPrice >= currentPrice ? "+" : "−"}${(
              distance * 100
            ).toFixed(2)}%`;
            const deltaText = `ΔΣ ${delta >= 0 ? "+" : "−"}$${new Intl.NumberFormat(
              "en-US",
              { notation: "compact", maximumFractionDigits: 1 },
            ).format(Math.abs(delta))}`;
            const cursorY = series.priceToCoordinate(this.cursorPrice);
            const boxWidth = calloutWidth;
            if (cursorY !== null && boxWidth >= 80) {
              const boxLeft = laneRight - boxWidth - 4;
              const boxHeight = 32;
              const boxTop = Math.max(
                35,
                Math.min(cursorY - boxHeight / 2, mediaSize.height - boxHeight),
              );
              context.fillStyle = this.palette.background;
              context.globalAlpha = 0.96;
              context.fillRect(boxLeft, boxTop, boxWidth, boxHeight);
              context.globalAlpha = 1;
              context.strokeStyle = this.palette.text;
              context.strokeRect(boxLeft + 0.5, boxTop + 0.5, boxWidth - 1, boxHeight - 1);
              context.fillStyle = this.palette.text;
              context.font = "10px sans-serif";
              context.textBaseline = "top";
              context.textAlign = "right";
              context.fillText(distanceText, boxLeft + boxWidth - 5, boxTop + 4, boxWidth - 10);
              context.fillText(deltaText, boxLeft + boxWidth - 5, boxTop + 17, boxWidth - 10);
              context.textAlign = "left";
            }
          }
        });
        context.restore();
      });
    },
  };

  attached(attachment: SeriesAttachedParameter<Time>) {
    this.attachment = attachment;
    attachment.chart.subscribeCrosshairMove(this.onCrosshairMove);
    attachment.requestUpdate();
  }

  detached() {
    this.attachment?.chart.unsubscribeCrosshairMove(this.onCrosshairMove);
    this.attachment = null;
    this.overlays = [];
    this.bars = [];
  }

  private readonly onCrosshairMove = (event: MouseEventParams<Time>) => {
    const price = event.point && event.paneIndex === 0
      ? this.attachment?.series.coordinateToPrice(event.point.y) ?? null
      : null;
    this.cursorPrice = typeof price === "number" && Number.isFinite(price) ? price : null;
    this.attachment?.requestUpdate();
  };

  configure(
    overlays: CoinglassOverlay[],
    bars: Candle[],
    palette: ProfilePalette = defaultPalette,
  ) {
    this.overlays = overlays;
    this.bars = bars;
    this.palette = palette;
    this.attachment?.requestUpdate();
  }

  paneViews() {
    return [this.view, this.profileView];
  }
}
