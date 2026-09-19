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
  type LineWidth,
  type AutoscaleInfo,
} from "lightweight-charts";
import type { Candle } from "../domain/market";
import type { CoinglassParams, CoinglassPreview } from "../domain/coinglass";
import type { ChartPalette } from "./chart";
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
    });
    chart.current = c;
    series.current = c.addSeries(CandlestickSeries, {
      upColor: palette.up,
      downColor: palette.down,
      wickUpColor: palette.up,
      wickDownColor: palette.down,
      borderVisible: false,
    });
    return () => {
      series.current = null;
      chart.current = null;
      c.remove();
    };
  }, [palette]);
  useEffect(() => {
    series.current?.setData(
      bars.map((b) => ({ ...b, time: b.time as UTCTimestamp })),
    );
    chart.current?.timeScale().fitContent();
  }, [bars, palette]);
  useEffect(() => {
    const s = series.current;
    if (!s) return;
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
      ...levels.map((l, i) =>
        s.createPriceLine({
          price: l.price,
          color:
            l.price >= report.result.currentPrice
              ? params.aboveColor
              : params.belowColor,
          lineWidth: params.lineWidth as LineWidth,
          lineStyle: LineStyle.Dashed,
          axisLabelVisible: params.showLabels,
          title: params.showLabels ? `CG #${i + 1}` : "",
        }),
      ),
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
  }, [report, baseline, params, palette]);
  useEffect(() => {
    if (!host.current || !chart.current || !series.current) return;
    return bindCoinglassPriceCopy(
      host.current,
      chart.current,
      series.current,
      params.showLabels ? report.result.levels.map((l) => l.price) : [],
      setCopyStatus,
    );
  }, [report, params.showLabels, palette]);
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
