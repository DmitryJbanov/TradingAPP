"use client";
import { bindCoinglassPriceCopy } from "./coinglass-price-copy";
import type { CoinglassOverlay } from "../domain/coinglass";
import { DrawingTools, type DrawingChart } from "./drawing-tools";
import { bindFutureTimeScale } from "./future-time-scale";
import { WhaleChartOverlay } from "./whale-chart-overlay";
import { whaleCandleTime, type WhaleChartPoint } from "../domain/whale-chart";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  createChart,
  CandlestickSeries,
  HistogramSeries,
  LineSeries,
  createSeriesMarkers,
  ColorType,
  CrosshairMode,
  LineStyle,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from "lightweight-charts";
import {
  candleIntervals,
  deviation,
  priceFormat,
  type Candle,
  type Timeframe,
} from "../domain/market";
import type { VmcPane } from "../hooks/use-vmc";
import { VmcRenderer, type VmcChartData } from "../indicators/vmc-renderer";
import type { OrderBlockOverlay } from "../hooks/use-order-blocks";
import { OrderBlocksRenderer } from "../indicators/order-blocks-renderer";
import { PriceOverlaysRenderer } from "../indicators/price-overlays-renderer";
import type { PriceOverlay } from "../hooks/use-overlays";
import type { PineResult } from "../domain/pine-scripts";
import { PineVisualRenderer } from "../indicators/pine-visual-renderer";
import { PineDrawingsRenderer } from "../indicators/pine-drawings-renderer";
import {
  CoinGlassHeatmapRenderer,
  type CoinGlassHeatmapLayer,
} from "../indicators/coinglass-heatmap-renderer";
import { CoinGlassLevelsRenderer } from "../indicators/coinglass-levels-renderer";
import { coinglassVolumeColorIndex } from "../domain/coinglass";
import type { StochRsiPane } from "../hooks/use-stoch-rsi";
import {
  StochRsiRenderer,
  type StochRsiChartData,
} from "../indicators/stoch-rsi-renderer";
import type {
  CustomSeriesOptions,
  Time,
  WhitespaceData,
} from "lightweight-charts";
type VmcSeries = ISeriesApi<
  "Custom",
  Time,
  VmcChartData | WhitespaceData<Time>,
  CustomSeriesOptions
>;

export interface ChartPalette {
  background: string;
  grid: string;
  up: string;
  down: string;
  text: string;
}
export const defaultPalette: ChartPalette = {
  background: "#000000",
  grid: "#303030",
  up: "#00c087",
  down: "#f23645",
  text: "#a0a0a0",
};
export function MarketChart({
  bars,
  symbol,
  palette,
  timeframe,
  timezone = "Europe/Moscow",
  tickSize = 0.01,
  resetKey,
  vmcPanes,
  stochRsiPanes = [],
  orderBlocks,
  priceOverlays,
  historyCount,
  coinglass = [],
  heatmapLevels = [],
  heatmapLayer,
  mtmPanes = [],
  pineResults = [],
  indicatorNames = {},
  whalePoints = [],
}: {
  bars: Candle[];
  symbol: string;
  palette: ChartPalette;
  timeframe: Timeframe;
  timezone?: string;
  tickSize?: number;
  resetKey: number;
  vmcPanes: VmcPane[];
  stochRsiPanes?: StochRsiPane[];
  orderBlocks: OrderBlockOverlay[];
  priceOverlays: PriceOverlay[];
  historyCount: number;
  coinglass?: CoinglassOverlay[];
  heatmapLevels?: { price: number; value: number }[];
  heatmapLayer?: CoinGlassHeatmapLayer;
  mtmPanes?: {
    id: string;
    points: { time: number; value: number; average: number }[];
  }[];
  pineResults?: PineResult[];
  indicatorNames?: Record<string, string>;
  whalePoints?: WhaleChartPoint[];
}) {
  const [drawingApi, setDrawingApi] = useState<DrawingChart>();
  const [copyStatus, setCopyStatus] = useState("");
  const chartContainer = useRef<HTMLDivElement>(null);
  const [chartHeight, setChartHeight] = useState<number>();
  useEffect(() => {
    const container = chartContainer.current;
    if (!container) return;
    const update = () =>
      setChartHeight(
        Math.max(
          390,
          window.innerHeight -
            container.getBoundingClientRect().top -
            window.scrollY -
            12,
        ),
      );
    const observer = new ResizeObserver(update);
    observer.observe(container.closest(".chart-workspace") ?? container);
    update();
    window.addEventListener("resize", update);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
    };
  }, []);
  const host = useRef<HTMLDivElement>(null),
    chart = useRef<IChartApi | null>(null),
    series = useRef<ISeriesApi<"Candlestick"> | null>(null),
    futureAxis = useRef<ISeriesApi<"Line"> | null>(null),
    current = useRef(0);
  const vmcSeries = useRef(
    new Map<string, { series: VmcSeries; renderer: VmcRenderer }>(),
  );
  const stochSeries = useRef(
    new Map<
      string,
      ISeriesApi<
        "Custom",
        Time,
        StochRsiChartData | WhitespaceData<Time>,
        CustomSeriesOptions
      >
    >(),
  );
  const mtmSeries = useRef(
    new Map<
      string,
      { value: ISeriesApi<"Line">; average: ISeriesApi<"Line"> }
    >(),
  );
  const orderBlocksRenderer = useRef<OrderBlocksRenderer | null>(null);
  const priceOverlaysRenderer = useRef<PriceOverlaysRenderer | null>(null);
  const heatmapRenderer = useRef<CoinGlassHeatmapRenderer | null>(null);
  const coinglassLevelsRenderer = useRef<CoinGlassLevelsRenderer | null>(null);
  const fitted = useRef("");
  const selectedWhale = whalePoints.find((point) => point.selected);
  const whaleTime = selectedWhale?.time;
  const whaleId = selectedWhale?.id;
  const [cursor, setCursor] = useState<{
    x: number;
    y: number;
    price: number;
    percent: number | null;
  } | null>(null);
  const [pineTooltip, setPineTooltip] = useState<{
    x: number;
    y: number;
    text: string;
  } | null>(null);
  const [cursorTime, setCursorTime] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const [ohlc, setOhlc] = useState<Candle | null>(null);
  useEffect(() => {
    if (!host.current) return;
    const c = createChart(host.current, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: palette.background },
        textColor: palette.text,
        fontFamily: "ui-monospace, monospace",
        fontSize: 12,
        attributionLogo: true,
      },
      grid: {
        vertLines: { color: palette.grid },
        horzLines: { color: palette.grid },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: {
          style: LineStyle.Dashed,
          color: "#8994a5",
          labelBackgroundColor: "#364153",
        },
        horzLine: {
          style: LineStyle.Dashed,
          color: "#8994a5",
          labelBackgroundColor: "#364153",
        },
      },
      rightPriceScale: {
        borderColor: palette.grid,
        minimumWidth: 90,
        scaleMargins: { top: 0.13, bottom: 0.23 },
      },
      timeScale: {
        borderColor: palette.grid,
        timeVisible: true,
        secondsVisible: false,
        ignoreWhitespaceIndices: false,
        rightOffset: 8,
        barSpacing: 8,
        minBarSpacing: 0.05,
      },
      handleScale: {
        axisPressedMouseMove: { time: true, price: true },
        axisDoubleClickReset: { time: true, price: true },
        mouseWheel: true,
        pinch: true,
      },
      handleScroll: {
        mouseWheel: true,
        pressedMouseMove: true,
        horzTouchDrag: true,
        vertTouchDrag: true,
      },
    });
    const s = c.addSeries(CandlestickSeries, {
      upColor: palette.up,
      downColor: palette.down,
      lastValueVisible: false,
      borderVisible: false,
      wickUpColor: palette.up,
      wickDownColor: palette.down,
    });
    chart.current = c;
    series.current = s;
    futureAxis.current = c.addSeries(LineSeries, {
      visible: false,
      lastValueVisible: false,
      priceLineVisible: false,
      autoscaleInfoProvider: () => null,
    });
    const drawingContext: DrawingChart = {
      chart: c,
      series: s,
      container: host.current.parentElement!,
    };
    setDrawingApi(drawingContext);
    const obRenderer = new OrderBlocksRenderer();
    s.attachPrimitive(obRenderer);
    orderBlocksRenderer.current = obRenderer;
    const overlaysRenderer = new PriceOverlaysRenderer();
    s.attachPrimitive(overlaysRenderer);
    priceOverlaysRenderer.current = overlaysRenderer;
    const hmRenderer = new CoinGlassHeatmapRenderer();
    s.attachPrimitive(hmRenderer);
    heatmapRenderer.current = hmRenderer;
    const cgLevelsRenderer = new CoinGlassLevelsRenderer();
    s.attachPrimitive(cgLevelsRenderer);
    coinglassLevelsRenderer.current = cgLevelsRenderer;
    c.subscribeCrosshairMove((p) => {
      const hovered = String(p.hoveredObjectId ?? "");
      setPineTooltip(
        p.point && hovered.startsWith("pine-tooltip:")
          ? {
              x: p.point.x,
              y:
                p.point.y +
                c
                  .panes()
                  .slice(0, p.paneIndex ?? 0)
                  .reduce((height, pane) => height + pane.getHeight(), 0),
              text: hovered.slice(13),
            }
          : null,
      );
      if (!p.point || !p.time || p.point.x < 0 || p.point.y < 0) {
        setCursor(null);
        setOhlc(null);
        setCursorTime(null);
        return;
      }
      setCursorTime(Number(p.time));
      const price = p.paneIndex === 0 ? s.coordinateToPrice(p.point.y) : null;
      if (price === null) setCursor(null);
      if (price !== null)
        setCursor({
          x: p.point.x,
          y: p.point.y,
          price,
          percent: deviation(price, current.current),
        });
      const bar = p.seriesData.get(s);
      setOhlc(
        bar && "open" in bar
          ? ({ ...bar, time: Number(bar.time), volume: 0 } as Candle)
          : null,
      );
    });
    return () => {
      drawingContext.disposed = true;
      vmcSeries.current.clear();
      stochSeries.current.clear();
      mtmSeries.current.clear();
      s.detachPrimitive(obRenderer);
      s.detachPrimitive(overlaysRenderer);
      s.detachPrimitive(hmRenderer);
      s.detachPrimitive(cgLevelsRenderer);
      priceOverlaysRenderer.current = null;
      heatmapRenderer.current = null;
      coinglassLevelsRenderer.current = null;
      orderBlocksRenderer.current = null;
      c.remove();
      chart.current = null;
      series.current = null;
      futureAxis.current = null;
    };
    // One chart per workspace pane; updates below preserve independent axis scaling.
  }, []);
  useEffect(() => {
    const dateAt = (time: Time) =>
      new Date(
        typeof time === "number"
          ? time * 1000
          : typeof time === "string"
            ? time
            : Date.UTC(time.year, time.month - 1, time.day),
      );
    const zone = timezone === "UTC" ? "UTC" : "Europe/Moscow";
    const format = (time: Time, options: Intl.DateTimeFormatOptions) =>
      new Intl.DateTimeFormat("ru-RU", { ...options, timeZone: zone }).format(
        dateAt(time),
      );
    chart.current?.applyOptions({
      localization: {
        timeFormatter: (time: Time) =>
          format(time, {
            day: "2-digit",
            month: "short",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          }) + (zone === "UTC" ? " UTC" : " МСК"),
      },
      timeScale: {
        tickMarkFormatter: (time: Time, type: number) =>
          format(
            time,
            type === 0
              ? { year: "numeric" }
              : type === 1
                ? { month: "short" }
                : type === 2
                  ? { day: "numeric", month: "short" }
                  : { hour: "2-digit", minute: "2-digit" },
          ),
      },
    });
  }, [timezone]);
  useEffect(() => {
    chart.current?.applyOptions({
      layout: {
        background: { type: ColorType.Solid, color: palette.background },
        textColor: palette.text,
      },
      grid: {
        vertLines: { color: palette.grid },
        horzLines: { color: palette.grid },
      },
    });
    series.current?.applyOptions({
      upColor: palette.up,
      downColor: palette.down,
      wickUpColor: palette.up,
      wickDownColor: palette.down,
    });
  }, [palette]);
  useEffect(() => {
    if (!bars.length) {
      series.current?.setData([]);
      futureAxis.current?.setData([]);
      current.current = 0;
      setCursor(null);
      setOhlc(null);
      return;
    }
    current.current = bars.at(-1)!.close;
    const p = current.current;
    const precision = p < 0.01 ? 8 : p < 1 ? 6 : p < 10 ? 4 : 2;
    series.current?.applyOptions({
      priceFormat: { type: "price", precision, minMove: 10 ** -precision },
    });
    const candles = bars.map((b, index) => {
      const color = priceOverlays
        .map((o) => o.result.candleColors?.[index])
        .filter(Boolean)
        .at(-1);
      return {
        ...b,
        time: b.time as UTCTimestamp,
        ...(color ? { color, wickColor: color, borderColor: color } : {}),
      };
    });
    const lastTime = Number(bars.at(-1)!.time);
    const interval = candleIntervals[timeframe];
    series.current?.setData(candles);
    const stopFutureAxis =
      chart.current && futureAxis.current
        ? bindFutureTimeScale(
            chart.current,
            futureAxis.current,
            lastTime,
            interval,
          )
        : undefined;
    setCursor(null);
    const entryTime = whaleCandleTime(bars, whaleTime, interval);
    const hasWhaleTime = entryTime !== null;
    // Apply the viewport after candle history is installed. The overlay only
    // projects coordinates; it must not race the chart's history/reset fit.
    const fitKey = hasWhaleTime
      ? `${timeframe}:${resetKey}:${whaleId}:${whaleTime}:${bars[0].time}`
      : `${timeframe}:${historyCount}:${resetKey}`;
    const fitFrame = requestAnimationFrame(() => {
      if (fitted.current === fitKey || !chart.current || drawingApi?.disposed)
        return;
      const entryIndex =
        entryTime !== null
          ? chart.current.timeScale().timeToIndex(entryTime as UTCTimestamp)
          : null;
      if (entryIndex !== null) {
        chart.current?.timeScale().setVisibleLogicalRange({
          from: entryIndex - 50,
          to: entryIndex + 50,
        });
      } else {
        chart.current?.timeScale().setVisibleRange({
          from: bars[0].time as UTCTimestamp,
          to: (lastTime + interval * 8) as UTCTimestamp,
        });
      }
      if (!hasWhaleTime || entryIndex !== null) fitted.current = fitKey;
    });
    return () => {
      cancelAnimationFrame(fitFrame);
      stopFutureAxis?.();
    };
  }, [
    bars,
    palette,
    priceOverlays,
    timeframe,
    historyCount,
    resetKey,
    whaleTime,
    whaleId,
    drawingApi,
  ]);
  useEffect(() => {
    priceOverlaysRenderer.current?.configure(priceOverlays, palette.text);
  }, [priceOverlays, palette.text]);
  useEffect(() => {
    heatmapRenderer.current?.configure(heatmapLayer, bars);
  }, [heatmapLayer, bars]);
  useEffect(() => {
    coinglassLevelsRenderer.current?.configure(coinglass, bars, palette);
  }, [coinglass, bars, palette]);
  useEffect(() => {
    orderBlocksRenderer.current?.configure(orderBlocks);
  }, [orderBlocks]);
  useEffect(() => {
    chart.current
      ?.panes()
      .forEach((_, index) =>
        chart.current
          ?.priceScale("right", index)
          .applyOptions({ autoScale: true }),
      );
  }, [timeframe, resetKey]);
  useEffect(() => {
    const c = chart.current;
    if (!c) return;
    const hadPanes = vmcSeries.current.size > 0;
    const ids = new Set(vmcPanes.map((p) => p.id));
    for (const [id, entry] of vmcSeries.current)
      if (!ids.has(id)) {
        c.removeSeries(entry.series);
        vmcSeries.current.delete(id);
      }
    vmcPanes.forEach((pane, index) => {
      let entry = vmcSeries.current.get(pane.id);
      if (!entry) {
        const renderer = new VmcRenderer(
          pane.params,
          pane.style,
          palette.text,
          index + 1,
        );
        const s = c.addCustomSeries(renderer, {}, c.panes().length);
        entry = { series: s, renderer };
        vmcSeries.current.set(pane.id, entry);
        s.priceScale().applyOptions({
          scaleMargins: { top: 0.12, bottom: 0.08 },
          autoScale: true,
        });
        s.getPane().setStretchFactor(1);
      }
      entry.renderer.configure(
        pane.params,
        pane.style,
        palette.text,
        index + 1,
      );
      if (entry.series.getPane().paneIndex() !== index + 1)
        entry.series.getPane().moveTo(index + 1);
      entry.series.setData(
        pane.result.points.map((point, index) => ({
          time: point.time as UTCTimestamp,
          point,
          index,
        })),
      );
    });
    if (!hadPanes && vmcPanes.length) c.panes()[0]?.setStretchFactor(2.5);
  }, [vmcPanes, palette]);
  useEffect(() => {
    const c = chart.current;
    if (!c) return;
    const ids = new Set(stochRsiPanes.map((p) => p.id));
    for (const [id, s] of stochSeries.current) {
      if (!ids.has(id)) {
        c.removeSeries(s);
        stochSeries.current.delete(id);
      }
    }
    stochRsiPanes.forEach((pane, index) => {
      let s = stochSeries.current.get(pane.id);
      if (!s) {
        s = c.addCustomSeries(new StochRsiRenderer(), {}, c.panes().length);
        stochSeries.current.set(pane.id, s);
        s.priceScale().applyOptions({
          scaleMargins: { top: 0.08, bottom: 0.08 },
        });
        s.getPane().setStretchFactor(1);
      }
      const paneIndex = vmcPanes.length + index + 1;
      if (s.getPane().paneIndex() !== paneIndex) s.getPane().moveTo(paneIndex);
      s.setData(
        pane.points.map((point) => ({
          time: point.time as UTCTimestamp,
          point,
        })),
      );
    });
    if (stochRsiPanes.length) c.panes()[0]?.setStretchFactor(2.5);
  }, [stochRsiPanes, vmcPanes]);
  useEffect(() => {
    const c = chart.current;
    if (!c) return;
    const ids = new Set(mtmPanes.map((pane) => pane.id));
    for (const [id, entry] of mtmSeries.current) {
      if (!ids.has(id)) {
        c.removeSeries(entry.value);
        c.removeSeries(entry.average);
        mtmSeries.current.delete(id);
      }
    }
    mtmPanes.forEach((pane, index) => {
      let entry = mtmSeries.current.get(pane.id);
      if (!entry) {
        const paneIndex = c.panes().length;
        entry = {
          value: c.addSeries(
            LineSeries,
            {
              color: "#36a2eb",
              lineWidth: 2,
              priceLineVisible: false,
              lastValueVisible: false,
            },
            paneIndex,
          ),
          average: c.addSeries(
            LineSeries,
            {
              color: "#ff9f43",
              lineWidth: 2,
              priceLineVisible: false,
              lastValueVisible: false,
            },
            paneIndex,
          ),
        };
        entry.value
          .priceScale()
          .applyOptions({ scaleMargins: { top: 0.08, bottom: 0.08 } });
        entry.value.getPane().setStretchFactor(1);
        mtmSeries.current.set(pane.id, entry);
      }
      const paneIndex = vmcPanes.length + stochRsiPanes.length + index + 1;
      if (entry.value.getPane().paneIndex() !== paneIndex) {
        entry.value.getPane().moveTo(paneIndex);
        entry.average.getPane().moveTo(paneIndex);
      }
      entry.value.setData(
        pane.points.map((point) => ({
          time: point.time as UTCTimestamp,
          value: point.value,
          color: point.value >= point.average ? "#26a69a" : "#ef5350",
        })),
      );
      entry.average.setData(
        pane.points.map((point) => ({
          time: point.time as UTCTimestamp,
          value: point.average,
          color: point.value >= point.average ? "#26a69a" : "#ef5350",
        })),
      );
    });
    if (mtmPanes.length) c.panes()[0]?.setStretchFactor(2.5);
  }, [mtmPanes, vmcPanes.length, stochRsiPanes.length]);
  useEffect(() => {
    const c = chart.current,
      s = series.current;
    if (!c || !s) return;
    const added: ISeriesApi<"Line">[] = [];
    const detached: (() => void)[] = [];
    for (const result of pineResults) {
      const paneIndex = result.overlay ? 0 : c.panes().length;
      const separateScale =
        !result.overlay || result.scale === "left" || result.scale === "none";
      if (result.scale === "left")
        c.applyOptions({ leftPriceScale: { visible: true } });
      const visual = new PineVisualRenderer(result, bars, result.overlay);
      const owner = !separateScale
        ? s
        : c.addSeries(
            LineSeries,
            {
              priceScaleId:
                result.scale === "left"
                  ? "left"
                  : result.scale === "none"
                    ? "pine:" + result.id
                    : "right",
              priceFormat: {
                type:
                  result.format === "percent"
                    ? "percent"
                    : result.format === "volume"
                      ? "volume"
                      : "price",
                precision: result.precision ?? 2,
                minMove: 10 ** -(result.precision ?? 2),
              },
              color: "transparent",
              lineVisible: false,
              lastValueVisible: false,
              priceLineVisible: false,
              crosshairMarkerVisible: false,
              autoscaleInfoProvider: () => {
                const range = visual.priceRange();
                return range ? { priceRange: range } : null;
              },
            },
            paneIndex,
          );
      if (separateScale) {
        (owner as ISeriesApi<"Line">).setData(
          bars.map((b) => ({ time: b.time as UTCTimestamp, value: 0 })),
        );
        if (!result.overlay) owner.getPane().setStretchFactor(1);
        added.push(owner as ISeriesApi<"Line">);
      }
      const attach = (
        target: typeof owner,
        graphics: PineVisualRenderer,
        overlay: boolean,
      ) => {
        target.attachPrimitive(graphics);
        const objects = new PineDrawingsRenderer();
        const select = (items: Record<string, unknown>[] | undefined) =>
          (items ?? []).filter(
            (item) =>
              item.visible !== false &&
              (item.force_overlay === true || result.overlay) === overlay,
          );
        objects.configure(
          {
            boxes: select(result.drawings.boxes),
            lines: select(result.drawings.lines),
            labels: select(result.drawings.labels),
            polylines: select(result.drawings.polylines),
            linefills: select(result.drawings.linefills),
            tables: select(result.drawings.tables),
          },
          bars,
        );
        target.attachPrimitive(objects);
        detached.push(() => {
          target.detachPrimitive(graphics);
          target.detachPrimitive(objects);
        });
      };
      attach(owner, visual, result.overlay);
      if (!result.overlay)
        attach(s, new PineVisualRenderer(result, bars, true), true);
    }
    const markers = createSeriesMarkers(
      s,
      pineResults
        .flatMap((r) => r.markers)
        .filter((marker) => marker.visible !== false)
        .sort((a, b) => a.time - b.time)
        .map((m) => ({ ...m, time: m.time as UTCTimestamp })),
    );
    return () => {
      if (chart.current === c) {
        markers.detach();
        detached.forEach((detach) => detach());
        added.forEach((p) => c.removeSeries(p));
      }
    };
  }, [
    pineResults,
    bars,
    vmcPanes.length,
    stochRsiPanes.length,
    mtmPanes.length,
  ]);
  useEffect(() => {
    const s = series.current;
    if (!s) return;
    const lines = coinglass.flatMap((overlay) => {
      const levels = overlay.result.levels.filter(
        (level) => Number.isFinite(level.price) && level.price > 0,
      );
      const volumes = (overlay.points?.length ? overlay.points : levels).map(
        (level) => level.intensity,
      );
      const maxIntensity = volumes.reduce(
        (max, volume) => Math.max(max, volume),
        0,
      );
      const minIntensity = volumes.reduce(
        (min, value) => Math.min(min, value),
        Infinity,
      );
      return levels.map((level, index) => {
        const colorIndex = coinglassVolumeColorIndex(
          level.intensity,
          minIntensity,
          maxIntensity,
        );
        return s.createPriceLine({
          price: level.price,
          color: overlay.params.volumeColors[colorIndex],
          lineVisible: overlay.params.showLevels,
          axisLabelVisible:
            overlay.params.showLevels && overlay.params.showLabels,
          title:
            overlay.params.showLevels && overlay.params.showLabels
              ? `CG #${index + 1}`
              : "",
        });
      });
    });
    return () => {
      if (series.current === s)
        lines.forEach((line) => s.removePriceLine(line));
    };
  }, [coinglass]);
  useEffect(() => {
    const s = series.current;
    if (!s) return;
    const lines = heatmapLevels.map((l, i) =>
      s.createPriceLine({
        price: l.price,
        color: "#f5b942",
        lineWidth: 1,
        lineStyle: LineStyle.Dotted,
        lineVisible: true,
        axisLabelVisible: true,
        title: `HM #${i + 1}`,
      }),
    );
    return () => {
      if (series.current === s) lines.forEach((l) => s.removePriceLine(l));
    };
  }, [heatmapLevels]);
  useEffect(() => {
    if (!host.current || !chart.current || !series.current) return;
    return bindCoinglassPriceCopy(
      host.current,
      chart.current,
      series.current,
      [
        ...heatmapLevels.map((l) => l.price),
        ...coinglass
          .filter((o) => o.params.showLabels)
          .flatMap((o) => o.result.levels.map((l) => l.price)),
      ],
      setCopyStatus,
    );
  }, [coinglass, heatmapLevels]);
  const readouts = useMemo(() => {
    const time = cursorTime ?? bars.at(-1)?.time;
    if (time === undefined) return [];
    const values: Record<string, string[]> = {};
    function at<T extends { time: number }>(points: T[]): T | undefined {
      let lo = 0,
        hi = points.length;
      while (lo < hi) {
        const mid = (lo + hi) >>> 1;
        if (points[mid].time < time!) lo = mid + 1;
        else hi = mid;
      }
      return points[lo]?.time === time ? points[lo] : undefined;
    }
    const value = (v: number | null | undefined) =>
      v != null && Number.isFinite(v) ? v.toFixed(2) : "—";
    vmcPanes.forEach((p) => {
      const row = at(p.result.points);
      values[p.id] = Object.entries(row?.values ?? {}).map(
        ([k, v]) => `${k.toUpperCase()} ${value(v)}`,
      );
    });
    stochRsiPanes.forEach((p) => {
      const row = at(p.points);
      values[p.id] = [`K ${value(row?.k)}`, `D ${value(row?.d)}`];
    });
    mtmPanes.forEach((p) => {
      const row = at(p.points);
      values[p.id] = [`MTM ${value(row?.value)}`, `MA ${value(row?.average)}`];
    });
    pineResults.forEach((r) => {
      values[r.id] = r.plots
        .filter((p) => p.visible !== false)
        .map((p) => `${p.title} ${value(at(p.points)?.value)}`);
    });
    orderBlocks.forEach((r) => {
      const i = bars.findIndex((b) => b.time === time);
      values[r.id] = [`ROC ${value(r.result.roc[i])}`];
    });
    priceOverlays.forEach((r) => {
      values[r.id] = r.result.lines
        .filter((l) => time >= l.from && time <= l.to)
        .slice(-6)
        .map(
          (l) =>
            `${l.text ?? "Уровень"} ${priceFormat(l.endPrice === undefined || l.to === l.from ? l.price : l.price + ((l.endPrice - l.price) * (time - l.from)) / (l.to - l.from))}`,
        );
    });
    return Object.entries(indicatorNames).map(([id, name]) => ({
      id,
      name,
      values: values[id]?.join(" · ") || "—",
    }));
  }, [
    cursorTime,
    bars,
    vmcPanes,
    stochRsiPanes,
    mtmPanes,
    pineResults,
    orderBlocks,
    priceOverlays,
    indicatorNames,
  ]);
  const last = bars.at(-1);
  const closeTime = last ? last.time + candleIntervals[timeframe] : 0;
  const remaining = Math.max(0, Math.ceil(closeTime - now / 1000));
  const countdown = remaining
    ? `${Math.floor(remaining / 3600)
        .toString()
        .padStart(2, "0")}:${Math.floor((remaining % 3600) / 60)
        .toString()
        .padStart(2, "0")}:${(remaining % 60).toString().padStart(2, "0")}`
    : "00:00:00";
  const priceY =
    last && series.current
      ? series.current.priceToCoordinate(last.close)
      : null;
  const showCumulativeVolume = coinglass.some(
    (overlay) => overlay.params.showCumulativeVolume,
  );
  const percentage =
    cursor?.percent == null
      ? "—"
      : `${cursor.percent >= 0 ? "+" : ""}${cursor.percent.toFixed(2)}%`;
  const heatmapHover =
    cursor && heatmapLayer
      ? heatmapRenderer.current?.liquidityAt(cursor.x, cursor.y)
      : undefined;
  const b = ohlc ?? bars.at(-1);
  return (
    <div className="chart-layout">
      {copyStatus && (
        <div role="status" className="notice">
          {copyStatus}
        </div>
      )}
      {drawingApi && (
        <DrawingTools
          key={`${symbol}:${timeframe}`}
          api={drawingApi}
          bars={bars}
          symbol={symbol}
          timeframe={timeframe}
          tickSize={tickSize}
        />
      )}
      <div
        className="chart-container"
        ref={chartContainer}
        style={{
          height: chartHeight,
          background: palette.background,
        }}
      >
        {drawingApi && whalePoints.length > 0 && (
          <WhaleChartOverlay
            api={drawingApi}
            bars={bars}
            timeframe={timeframe}
            points={whalePoints}
          />
        )}
        <div className="chart-ohlc" style={{ color: palette.text }}>
          {b && (
            <>
              O <b>{priceFormat(b.open)}</b> H <b>{priceFormat(b.high)}</b> L{" "}
              <b>{priceFormat(b.low)}</b> C{" "}
              <b
                style={{ color: b.close >= b.open ? palette.up : palette.down }}
              >
                {priceFormat(b.close)}
              </b>
            </>
          )}
        </div>
        <div
          className="chart-indicator-values"
          aria-label="Значения индикаторов у курсора"
        >
          {readouts
            .filter(
              (r) =>
                r.values &&
                !r.values.split(" · ").every((value) => value.endsWith("—")),
            )
            .map((r) => (
              <div key={r.id}>
                <b>{r.name}</b>
                <span>{r.values}</span>
              </div>
            ))}
        </div>
        {last && priceY !== null && (
          <div
            className="current-price-clock"
            aria-label={`Текущая цена ${priceFormat(last.close)}, до закрытия свечи ${countdown}`}
            title={`Текущая цена · до закрытия свечи ${timeframe}`}
            style={{
              top: Math.max(
                40,
                Math.min(
                  priceY - 17,
                  (series.current?.getPane().getHeight() ?? 500) - 36,
                ),
              ),
              width: Math.max(90, series.current?.priceScale().width() ?? 90),
              background: palette.up,
              color: palette.background,
            }}
          >
            <b>{priceFormat(last.close)}</b>
            <time>{countdown}</time>
          </div>
        )}
        <div
          className="chart-canvas"
          ref={host}
          role="img"
          aria-label="Свечной график. Перетаскивайте шкалы цены и времени для независимого масштабирования."
        />
        {pineTooltip && (
          <div
            role="tooltip"
            style={{
              position: "absolute",
              pointerEvents: "none",
              zIndex: 25,
              left: Math.max(
                4,
                Math.min(
                  pineTooltip.x + 12,
                  (host.current?.clientWidth ?? 800) - 300,
                ),
              ),
              top: Math.max(
                4,
                Math.min(
                  pineTooltip.y + 12,
                  (chartHeight ?? host.current?.clientHeight ?? 600) - 80,
                ),
              ),
              maxWidth: 280,
              padding: "8px 10px",
              border: "1px solid var(--border)",
              borderRadius: 6,
              background: "var(--card)",
              color: "var(--foreground)",
              whiteSpace: "pre-wrap",
              fontSize: 12,
            }}
          >
            {pineTooltip.text}
          </div>
        )}
        {cursor && (
          <>
            <div
              className="cursor-axis-price"
              style={{
                top: Math.max(0, cursor.y - 11),
                width: Math.max(90, series.current?.priceScale().width() ?? 90),
              }}
            >
              {priceFormat(cursor.price)}
            </div>
            <div
              className="cursor-percent"
              style={{
                left: Math.max(
                  3,
                  Math.min(
                    cursor.x - 42,
                    (host.current?.clientWidth ?? 500) - 200,
                  ),
                ),
                bottom: 30,
              }}
            >
              {percentage}
            </div>
            {!showCumulativeVolume && (
              <div
                className="cursor-price"
                style={{
                  top: Math.max(
                    45,
                    Math.min(
                      cursor.y + 10,
                      (host.current?.clientHeight ?? 500) - 90,
                    ),
                  ),
                  right: 95,
                }}
              >
                {percentage}
              </div>
            )}
          </>
        )}
        {cursor && heatmapHover && (
          <div
            className="heatmap-cursor-tooltip"
            role="tooltip"
            style={{
              left: Math.max(
                4,
                Math.min(
                  cursor.x + 14,
                  (host.current?.clientWidth ?? 500) - 250,
                ),
              ),
              top: Math.max(
                4,
                Math.min(
                  cursor.y + 14,
                  (series.current?.getPane().getHeight() ?? 500) - 62,
                ),
              ),
            }}
          >
            <b>Model 3 · Цена ${priceFormat(heatmapHover.price)}</b>
            <span>
              Ликвидность:{" "}
              {new Intl.NumberFormat("ru-RU", {
                maximumFractionDigits: 2,
              }).format(heatmapHover.value)}{" "}
              USD
            </span>
          </div>
        )}
        <a
          className="chart-attribution"
          href="https://www.tradingview.com/"
          target="_blank"
          rel="noreferrer"
        >
          Charts by TradingView
        </a>
      </div>
    </div>
  );
}
