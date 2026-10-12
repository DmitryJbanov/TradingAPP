"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import type { MouseEventParams } from "lightweight-charts";
import {
  readWhaleSelection,
  whaleChartPoints,
  type WhaleChartPoint,
  type WhaleChartSelection,
} from "../domain/whale-chart";
import type {
  WhaleProfileResponse,
  WhaleMarketResponse,
} from "../domain/whales";
import { candleIntervals, type Candle, type Timeframe } from "../domain/market";
import {
  WhaleTradesRenderer,
  type WhaleHit,
} from "../indicators/whale-trades-renderer";
import { useResource } from "../hooks/use-resource";
import type { DrawingChart } from "./drawing-tools";
import "./whale-chart-overlay.css";

export function useWhaleChart(symbol: string) {
  const [selection, setSelection] = useState<WhaleChartSelection>();
  useEffect(
    () => setSelection(readWhaleSelection(window.location.search, symbol)),
    [symbol],
  );
  const resource = useResource<WhaleProfileResponse>(
    `/api/coinglass/whales-profile?address=${selection?.address ?? ""}&fill=${encodeURIComponent(selection?.fill ?? "")}`,
    15000,
    !!selection,
  );
  const market = useResource<WhaleMarketResponse>(
    "/api/coinglass/whales-market",
    15000,
    !!selection?.position,
  );
  const marketPosition = market.data?.snapshot?.positions.find(
    (p) =>
      p.address === selection?.address &&
      p.coin === selection?.coin &&
      p.side === selection?.position &&
      (!selection.positionId || p.positionId === selection.positionId),
  );
  const points = useMemo(
    () => whaleChartPoints(resource.data?.profile, selection, marketPosition),
    [resource.data?.profile, selection, marketPosition],
  );
  const selected = points.find((p) => p.selected);
  return {
    selection,
    points,
    selected,
    resource: {
      ...resource,
      error: resource.error || market.error || market.data?.error || "",
    },
    positionLoading:
      !!selection?.positionId &&
      !marketPosition &&
      (market.loading || market.data?.loading),
    clear: () => {
      setSelection(undefined);
      const url = new URL(window.location.href);
      for (const key of ["whale", "coin", "fill", "position", "positionId"])
        url.searchParams.delete(key);
      window.history.replaceState(null, "", url);
    },
  };
}

export function WhaleChartOverlay({
  api,
  bars,
  timeframe,
  points,
}: {
  api: DrawingChart;
  bars: Candle[];
  timeframe: Timeframe;
  points: WhaleChartPoint[];
}) {
  const renderer = useMemo(() => new WhaleTradesRenderer(), [api]);
  const [hover, setHover] = useState<WhaleHit | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const keepTooltip = () => clearTimeout(hideTimer.current);
  const hideTooltip = () => {
    keepTooltip();
    hideTimer.current = setTimeout(() => setHover(null), 250);
  };
  useEffect(() => {
    if (api.disposed) return;
    api.series.attachPrimitive(renderer);
    const onPointer = (event: MouseEventParams) => {
      if (
        !event.point ||
        (event.paneIndex !== undefined &&
          event.paneIndex !== api.series.getPane().paneIndex())
      ) {
        hideTooltip();
        return;
      }
      const hit = renderer.findAt(event.point.x, event.point.y);
      if (hit) {
        keepTooltip();
        setHover(hit);
      } else hideTooltip();
    };
    const onRange = () => {
      keepTooltip();
      setHover(null);
    };
    api.chart.subscribeCrosshairMove(onPointer);
    api.chart.subscribeClick(onPointer);
    api.chart.timeScale().subscribeVisibleLogicalRangeChange(onRange);
    return () => {
      keepTooltip();
      if (api.disposed) return;
      api.chart.unsubscribeCrosshairMove(onPointer);
      api.chart.unsubscribeClick(onPointer);
      api.chart.timeScale().unsubscribeVisibleLogicalRangeChange(onRange);
      api.series.detachPrimitive(renderer);
    };
  }, [api, renderer]);
  useEffect(() => {
    renderer.configure(points, bars, candleIntervals[timeframe]);
    setHover((previous) =>
      previous ? renderer.findAt(previous.x, previous.y) : null,
    );
  }, [renderer, points, bars, timeframe]);
  if (!hover || api.disposed) return null;
  const active = hover.point;
  const { width, height } = api.chart.paneSize(
    api.series.getPane().paneIndex(),
  );
  return (
    <div className="whale-chart-overlay">
      <div
        className="whale-chart-tooltip"
        role="tooltip"
        style={{
          left: Math.max(4, Math.min(hover.x + 16, width - 280)),
          top: Math.max(4, Math.min(hover.y + 16, height - 190)),
        }}
        onMouseEnter={keepTooltip}
        onMouseLeave={hideTooltip}
        onFocusCapture={keepTooltip}
        onBlurCapture={hideTooltip}
      >
        <b>
          {active.coin} · {active.label}
        </b>
        <span>ID: {active.id}</span>
        <span>
          Цена: $
          {active.price.toLocaleString("ru-RU", { maximumFractionDigits: 8 })} ·
          Количество: {active.size.toLocaleString("ru-RU")}
        </span>
        <span>
          {new Date(active.time! * 1000).toLocaleString("ru-RU", {
            timeZone: "UTC",
          })}{" "}
          UTC
        </span>
        <strong
          className={
            active.pnl != null && active.pnl < 0 ? "negative" : "positive"
          }
        >
          {active.id.startsWith("position:") ? "Текущий" : "Закрытый"} PnL:{" "}
          {active.pnl == null
            ? "—"
            : `$${active.pnl.toLocaleString("ru-RU", { maximumFractionDigits: 2 })}`}
        </strong>
        <a href={`/whales/${active.address}`}>
          Профиль кита {active.address.slice(0, 8)}…{active.address.slice(-4)}
        </a>
      </div>
    </div>
  );
}
