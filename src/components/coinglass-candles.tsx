"use client";
import { useEffect, useRef, useState } from "react";
import { bindCoinglassPriceCopy } from "./coinglass-price-copy";
import {
  createChart,
  CandlestickSeries,
  ColorType,
  LineStyle,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
  type AutoscaleInfo,
} from "lightweight-charts";
import type { Candle } from "../domain/market";
import {
  coinglassVolumeColorIndex,
  type CoinglassOverlay,
  type CoinglassParams,
  type CoinglassPreview,
} from "../domain/coinglass";
import type { ChartPalette } from "./chart";
import { CoinGlassLevelsRenderer } from "../indicators/coinglass-levels-renderer";
export function CoinglassCandles({
  bars,
  palette,
  params,
  report,
  baseline,
}: {
  bars: Candle[];
  palette: ChartPalette;
  params: CoinglassParams;
  report: CoinglassPreview;
  baseline?: CoinglassPreview;
}) {
  const host = useRef<HTMLDivElement>(null);
  const [copyStatus, setCopyStatus] = useState("");
  const chart = useRef<IChartApi | null>(null);
  const series = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const levelsRenderer = useRef<CoinGlassLevelsRenderer | null>(null);
  useEffect(() => {
    if (!host.current) return;
    const c = createChart(host.current, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: palette.background },
        textColor: palette.text,
      },
      grid: {
        vertLines: { color: palette.grid },
        horzLines: { color: palette.grid },
      },
      rightPriceScale: {
        borderColor: palette.grid,
        minimumWidth: 104,
        alignLabels: true,
      },
      timeScale: {
        borderColor: palette.grid,
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 2,
      },
    });
    chart.current = c;
    series.current = c.addSeries(CandlestickSeries, {
      upColor: palette.up,
      downColor: palette.down,
      wickUpColor: palette.up,
      wickDownColor: palette.down,
      borderVisible: false,
    });
    const renderer = new CoinGlassLevelsRenderer();
    series.current.attachPrimitive(renderer);
    levelsRenderer.current = renderer;
    return () => {
      series.current?.detachPrimitive(renderer);
      levelsRenderer.current = null;
      series.current = null;
      chart.current = null;
      c.remove();
    };
  }, [palette]);
  useEffect(() => {
    const currentPrice = bars.at(-1)?.close ?? 1;
    const precision = currentPrice < 0.01 ? 8 : currentPrice < 1 ? 6 : currentPrice < 10 ? 4 : 2;
    series.current?.applyOptions({
      priceFormat: { type: "price", precision, minMove: 10 ** -precision },
    });
    series.current?.setData(
      bars.map((b) => ({ ...b, time: b.time as UTCTimestamp })),
    );
    chart.current?.timeScale().fitContent();
  }, [bars, palette]);
  useEffect(() => {
    const s = series.current;
    if (!s) return;
    const currentLevels = report.points.length
      ? report.points
      : report.result.levels;
    const minIntensity = currentLevels.reduce(
      (min, level) => Math.min(min, level.intensity),
      Infinity,
    );
    const maxIntensity = currentLevels.reduce(
      (max, level) => Math.max(max, level.intensity),
      0,
    );
    const overlay: CoinglassOverlay = {
      id: "settings-preview",
      result: report.result,
      params,
      points: report.points,
    };
    levelsRenderer.current?.configure([overlay], bars, palette);
    const levels = report.result.levels;
    const previous =
      baseline?.result.levels.filter(
        (p) => !levels.some((v) => v.price === p.price),
      ) ?? [];
    const prices = [...levels, ...previous].map((l) => l.price);
    s.applyOptions({
      autoscaleInfoProvider: (original: () => AutoscaleInfo | null) => {
        const info = original();
        if (!info?.priceRange || !prices.length) return info;
        return {
          ...info,
          priceRange: {
            minValue: Math.min(info.priceRange.minValue, ...prices),
            maxValue: Math.max(info.priceRange.maxValue, ...prices),
          },
        };
      },
    });
    const lines = [
      ...levels.map((l, i) => {
        const colorIndex = coinglassVolumeColorIndex(
          l.intensity,
          minIntensity,
          maxIntensity,
        );
        return s.createPriceLine({
          price: l.price,
          color: params.volumeColors[colorIndex],
          lineVisible: false,
          axisLabelVisible: params.showLevels && params.showLabels,
          title: params.showLevels && params.showLabels ? `CG #${i + 1}` : "",
        });
      }),
      ...previous.map((l) =>
        s.createPriceLine({
          price: l.price,
          color: "#94a3b8",
          lineWidth: 1,
          lineStyle: LineStyle.Dotted,
          axisLabelVisible: true,
          title: "Удалится",
        }),
      ),
    ];
    return () => {
      if (series.current === s) lines.forEach((l) => s.removePriceLine(l));
    };
  }, [report, baseline, params, palette, bars]);
  useEffect(() => {
    if (!host.current || !chart.current || !series.current) return;
    return bindCoinglassPriceCopy(
      host.current,
      chart.current,
      series.current,
      [
        ...(params.showLabels ? report.result.levels.map((l) => l.price) : []),
        ...(baseline?.result.levels
          .filter((l) => !report.result.levels.some((v) => v.price === l.price))
          .map((l) => l.price) ?? []),
      ],
      setCopyStatus,
    );
  }, [report, baseline, params.showLabels, palette]);
  return (
    <>
      {copyStatus && <p role="status">{copyStatus}</p>}
      <div
        className="cg-candles"
        ref={host}
        aria-label="Предпросмотр уровней на свечном графике"
      />
    </>
  );
}
