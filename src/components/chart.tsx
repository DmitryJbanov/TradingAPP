"use client";
import { useEffect, useRef, useState } from "react";
import {
  createChart,
  CandlestickSeries,
  HistogramSeries,
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
  palette,
  timeframe,
  resetKey,
  vmcPanes,
  orderBlocks,
  priceOverlays,
  historyCount,
}: {
  bars: Candle[];
  palette: ChartPalette;
  timeframe: Timeframe;
  resetKey: number;
  vmcPanes: VmcPane[];
  orderBlocks: OrderBlockOverlay[];
  priceOverlays: PriceOverlay[];
  historyCount: number;
}) {
  const host = useRef<HTMLDivElement>(null),
    chart = useRef<IChartApi | null>(null),
    series = useRef<ISeriesApi<"Candlestick"> | null>(null),
    volume = useRef<ISeriesApi<"Histogram"> | null>(null),
    current = useRef(0);
  const vmcSeries = useRef(
    new Map<string, { series: VmcSeries; renderer: VmcRenderer }>(),
  );
  const orderBlocksRenderer = useRef<OrderBlocksRenderer | null>(null);
  const priceOverlaysRenderer = useRef<PriceOverlaysRenderer | null>(null);
  const fitted = useRef("");
  const [indicatorCursor, setIndicatorCursor] = useState<
    Record<string, VmcChartData["point"]>
  >({});
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
    const obRenderer = new OrderBlocksRenderer();
    s.attachPrimitive(obRenderer);
    orderBlocksRenderer.current = obRenderer;
    const overlaysRenderer = new PriceOverlaysRenderer();
    s.attachPrimitive(overlaysRenderer);
    priceOverlaysRenderer.current = overlaysRenderer;
    c.subscribeCrosshairMove((p) => {
      const values: Record<string, VmcChartData["point"]> = {};
      vmcSeries.current.forEach((entry, id) => {
        const d = p.seriesData.get(entry.series);
        if (d && "point" in d) values[id] = (d as VmcChartData).point;
      });
      setIndicatorCursor(values);
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
      vmcSeries.current.clear();
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
  const b = ohlc ?? bars.at(-1);
  return (
    <>
      <div
        className="chart-container"
        style={{
          background: palette.background,
          ...(vmcPanes.length ? { height: 560 + vmcPanes.length * 230 } : {}),
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
              title="(Текущая цена / цена курсора − 1) × 100"
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
      {vmcPanes.length > 0 && (
        <div className="vmc-readouts">
          {vmcPanes.map((pane, index) => {
            const point = indicatorCursor[pane.id] ?? pane.result.points.at(-1);
            return (
              <div key={pane.id}>
                <b>VMC #{index + 1}</b>
                {point &&
                  Object.entries(point.values)
                    .filter(
                      ([key]) => key !== "sommi" || pane.params.sommiShowVwap,
                    )
                    .map(([key, v]) => (
                      <span key={key}>
                        {key.toUpperCase()}{" "}
                        <strong>{v?.toFixed(2) ?? "—"}</strong>
                      </span>
                    ))}
              </div>
            );
          })}
        </div>
      )}
      {orderBlocks.length > 0 && (
        <div className="vmc-readouts">
          {orderBlocks.map((overlay, index) => {
            const event = overlay.result.events.at(-1);
            return (
              <div key={overlay.id}>
                <b>Sonarlab OB #{index + 1}</b>
                <span>
                  Бычьи зоны{" "}
                  <strong>
                    {
                      overlay.result.blocks.filter((b) => b.side === "bullish")
                        .length
                    }
                  </strong>
                </span>
                <span>
                  Медвежьи зоны{" "}
                  <strong>
                    {
                      overlay.result.blocks.filter((b) => b.side === "bearish")
                        .length
                    }
                  </strong>
                </span>
                <span>
                  Последний сигнал:{" "}
                  <strong>
                    {event
                      ? `${event.side === "bullish" ? "Buy" : "Sell"} · ${new Date(event.time * 1000).toISOString().slice(0, 16).replace("T", " ")} UTC`
                      : "—"}
                  </strong>
                </span>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
