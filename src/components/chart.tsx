"use client";
import { bindCoinglassPriceCopy } from "./coinglass-price-copy";
import type { CoinglassOverlay } from "../domain/coinglass";
import type { LineWidth } from "lightweight-charts";
import { DrawingTools, type DrawingChart } from "./drawing-tools";
import { useEffect, useRef, useState } from "react";
import {
  createChart,
  CandlestickSeries,
  HistogramSeries,
  LineSeries,
  ColorType,
  CrosshairMode,
  LineStyle,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from "lightweight-charts";
import {
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
  background: "#101318",
  grid: "#20262f",
  up: "#44d7a8",
  down: "#ef7185",
  text: "#8f9bab",
};
export function MarketChart({
  bars,
  symbol,
  palette,
  timeframe,
  resetKey,
  vmcPanes,
  stochRsiPanes = [],
  orderBlocks,
  priceOverlays,
  historyCount,
  coinglass = [],
  heatmapLevels = [],
  mtmPanes = [],
}: {
  bars: Candle[];
  symbol: string;
  palette: ChartPalette;
  timeframe: Timeframe;
  resetKey: number;
  vmcPanes: VmcPane[];
  stochRsiPanes?: StochRsiPane[];
  orderBlocks: OrderBlockOverlay[];
  priceOverlays: PriceOverlay[];
  historyCount: number;
  coinglass?: CoinglassOverlay[];
  heatmapLevels?: { price: number; value: number }[];
  mtmPanes?: {
    id: string;
    points: { time: number; value: number; average: number }[];
  }[];
}) {
  const [drawingApi, setDrawingApi] = useState<DrawingChart>();
  const [copyStatus, setCopyStatus] = useState("");
  const host = useRef<HTMLDivElement>(null),
    chart = useRef<IChartApi | null>(null),
    series = useRef<ISeriesApi<"Candlestick"> | null>(null),
    volume = useRef<ISeriesApi<"Histogram"> | null>(null),
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
  const fitted = useRef("");
  const [cursor, setCursor] = useState<{
    x: number;
    y: number;
    price: number;
    percent: number | null;
  } | null>(null);
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
      borderVisible: false,
      wickUpColor: palette.up,
      wickDownColor: palette.down,
    });
    const v = c.addSeries(HistogramSeries, {
      priceScaleId: "volume",
      priceFormat: { type: "volume" },
      lastValueVisible: false,
      priceLineVisible: false,
    });
    c.priceScale("volume").applyOptions({
      scaleMargins: { top: 0.85, bottom: 0 },
    });
    chart.current = c;
    series.current = s;
    volume.current = v;
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
    c.subscribeCrosshairMove((p) => {
      if (!p.point || !p.time || p.point.x < 0 || p.point.y < 0) {
        setCursor(null);
        setOhlc(null);
        return;
      }
      const price = p.paneIndex === 0 ? s.coordinateToPrice(p.point.y) : null;
      if (price === null) setCursor(null);
      if (price !== null)
        setCursor({
          x: p.point.x,
          y: p.point.y,
          price,
          percent: deviation(current.current, price),
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
      priceOverlaysRenderer.current = null;
      orderBlocksRenderer.current = null;
      c.remove();
      chart.current = null;
      series.current = null;
      volume.current = null;
    };
    // One chart per workspace pane; updates below preserve independent axis scaling.
  }, []);
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
      volume.current?.setData([]);
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
    series.current?.setData(
      bars.map((b, index) => {
        const color = priceOverlays
          .map((o) => o.result.candleColors?.[index])
          .filter(Boolean)
          .at(-1);
        return {
          ...b,
          time: b.time as UTCTimestamp,
          ...(color ? { color, wickColor: color, borderColor: color } : {}),
        };
      }),
    );
    volume.current?.setData(
      bars.map((b) => ({
        time: b.time as UTCTimestamp,
        value: b.volume,
        color: (b.close >= b.open ? palette.up : palette.down) + "38",
      })),
    );
    setCursor(null);
    const fitKey = `${timeframe}:${historyCount}:${resetKey}`;
    if (fitted.current !== fitKey) {
      chart.current?.timeScale().fitContent();
      fitted.current = fitKey;
    }
  }, [bars, palette, priceOverlays, timeframe, historyCount, resetKey]);
  useEffect(() => {
    priceOverlaysRenderer.current?.configure(priceOverlays, palette.text);
  }, [priceOverlays, palette.text]);
  useEffect(() => {
    orderBlocksRenderer.current?.configure(orderBlocks);
  }, [orderBlocks]);
  useEffect(() => {
    chart.current?.timeScale().fitContent();
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
    const s = series.current;
    if (!s) return;
    const lines = coinglass.flatMap((overlay) =>
      overlay.result.levels
        .filter((level) => Number.isFinite(level.price) && level.price > 0)
        .map((level, index) =>
          s.createPriceLine({
            price: level.price,
            color:
              level.price >= overlay.result.currentPrice
                ? overlay.params.aboveColor
                : overlay.params.belowColor,
            lineWidth: overlay.params.lineWidth as LineWidth,
            lineStyle: LineStyle.Dashed,
            axisLabelVisible: overlay.params.showLabels,
            title: overlay.params.showLabels ? `CG #${index + 1}` : "",
          }),
        ),
    );
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
  const b = ohlc ?? bars.at(-1);
  return (
    <>
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
        />
      )}
      <div
        className="chart-container"
        style={{
          background: palette.background,
          ...(vmcPanes.length + stochRsiPanes.length + mtmPanes.length
            ? {
                height:
                  560 +
                  (vmcPanes.length + stochRsiPanes.length + mtmPanes.length) *
                    230,
              }
            : {}),
        }}
      >
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
          className="chart-canvas"
          ref={host}
          role="img"
          aria-label="Свечной график. Перетаскивайте шкалы цены и времени для независимого масштабирования."
        />
        {cursor && (
          <>
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
              {cursor.percent === null
                ? "—"
                : `${cursor.percent >= 0 ? "+" : ""}${cursor.percent.toFixed(2)}%`}
            </div>
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
              Δ к текущей {cursor.percent?.toFixed(2) ?? "—"}%
            </div>
          </>
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
    </>
  );
}
