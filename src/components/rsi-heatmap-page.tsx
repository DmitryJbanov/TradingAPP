"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import { SiteHeader } from "./site-header";
import { useResource } from "../hooks/use-resource";
import "./rsi-heatmap.css";
import { catalog } from "../domain/catalog";

import {
  rsiRowsForPeriod,
  type RsiPeriod as Period,
  type RsiRow as Row,
} from "../domain/rsi-heatmap";

type Job = {
  id: string;
  state: string;
  message: string;
  params: { period: Period };
  result?: {
    snapshotId: string;
    period: Period;
    count: number;
    rsiRevision?: number;
    order?: string;
  };
};
type Snapshot = {
  snapshot: {
    rows: Row[];
    period: Period;
    collectedAt: string;
    count: number;
    rsiRevision?: number;
    order?: string;
  };
};
const periods: { value: Period; label: string }[] = [
  { value: "4h", label: "4 часа" },
  { value: "24h", label: "24 часа" },
  { value: "1w", label: "Неделя" },
];
const fmt = (value: number | null, suffix = "") =>
  value == null
    ? "—"
    : `${value.toLocaleString("ru-RU", { maximumFractionDigits: 2 })}${suffix}`;
const coinName = (row: Row) =>
  (row.name && row.name !== row.symbol ? row.name : undefined) ||
  catalog.find(
    (item) =>
      item.base === row.symbol ||
      item.symbol === row.symbol ||
      item.symbol === `${row.symbol}USDT`,
  )?.name ||
  row.symbol;

function rsiDot(value: number) {
  return value >= 70
    ? "rsi-dot-high"
    : value >= 60
      ? "rsi-dot-strong"
      : value < 30
        ? "rsi-dot-oversold"
        : value < 40
          ? "rsi-dot-low"
          : "rsi-dot-mid";
}

function RsiChart({ rows, period }: { rows: Row[]; period: Period }) {
  const [hover, setHover] = useState<{ row: Row; x: number; y: number } | null>(
    null,
  );
  const svgRef = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState({ width: 1320, height: 700 });
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) setSize({ width, height });
    });
    observer.observe(svg);
    return () => observer.disconnect();
  }, []);
  const { width, height } = size;
  const left = 42,
    right = 10,
    top = 40,
    bottom = 8;
  const plotWidth = width - left - right,
    plotHeight = height - top - bottom;
  const y = (value: number) => top + ((90 - value) / 80) * plotHeight;
  const ticks = [90, 80, 70, 60, 50, 40, 30, 20, 10];
  const points = rows.filter(
    (row): row is Row & { rsi: number } =>
      row.rsi !== null && Number.isFinite(row.rsi),
  );
  const average = points.length
    ? points.reduce((sum, row) => sum + row.rsi, 0) / points.length
    : null;
  const bands = [
    { from: 70, to: 90, fill: "#4b1d24", label: "Перекупленность" },
    { from: 60, to: 70, fill: "#291b23", label: "Сильный" },
    { from: 40, to: 60, fill: "#11161d", label: "Нейтральный" },
    { from: 30, to: 40, fill: "#102b29", label: "Слабый" },
    { from: 10, to: 30, fill: "#12433b", label: "Перепроданность" },
  ];
  return (
    <div className="rsi-map-scroll">
      <div className="rsi-chart-wrap">
        <svg
          ref={svgRef}
          className="rsi-chart"
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={`График RSI для ${rows.length} инструментов`}
        >
          {bands.map((band) => (
            <g key={band.label}>
              <rect
                x={left}
                y={y(band.to)}
                width={plotWidth}
                height={y(band.from) - y(band.to)}
                fill={band.fill}
              />
              <text
                x={width - right - 5}
                y={(y(band.from) + y(band.to)) / 2 + 5}
                textAnchor="end"
                className="rsi-band-label"
              >
                {band.label}
              </text>
            </g>
          ))}
          {ticks.map((tick) => (
            <g key={tick}>
              <line
                x1={left}
                x2={width - right}
                y1={y(tick)}
                y2={y(tick)}
                className="rsi-grid-line"
              />
              <text
                x={left - 9}
                y={y(tick) + 4}
                textAnchor="end"
                className="rsi-axis-label"
              >
                {tick}
              </text>
            </g>
          ))}
          {points
            .filter((row) => row.rsi >= 10 && row.rsi <= 90)
            .map((row) => {
              const x = left + ((row.sourceRank ?? row.rank) * plotWidth) / 50;
              const pointY = y(row.rsi);
              const change =
                row.priceChanges?.[period] ??
                (period === "24h" ? row.change24h : null);
              const stemBase = change === null ? null : row.rsi - change;
              const labelY = Math.max(12, pointY - 12);
              const pair = row.symbol.endsWith("USDT")
                ? row.symbol
                : `${row.symbol}USDT`;
              return (
                <a
                  key={row.symbol}
                  href={`/pair/${encodeURIComponent(pair)}`}
                  className="rsi-point"
                  aria-label={`Открыть график ${coinName(row)}, цена $${fmt(row.price)}`}
                  onMouseEnter={(event) => {
                    const rect = event.currentTarget
                      .closest("svg")!
                      .getBoundingClientRect();
                    setHover({
                      row,
                      x: Math.min(
                        event.clientX - rect.left + 14,
                        rect.width - 210,
                      ),
                      y: Math.min(
                        Math.max(8, event.clientY - rect.top + 14),
                        rect.height - 90,
                      ),
                    });
                  }}
                  onMouseMove={(event) => {
                    const rect = event.currentTarget
                      .closest("svg")!
                      .getBoundingClientRect();
                    setHover({
                      row,
                      x: Math.min(
                        event.clientX - rect.left + 14,
                        rect.width - 210,
                      ),
                      y: Math.min(
                        Math.max(8, event.clientY - rect.top + 14),
                        rect.height - 90,
                      ),
                    });
                  }}
                  onMouseLeave={() => setHover(null)}
                  onFocus={() =>
                    setHover({
                      row,
                      x: 56,
                      y: Math.max(8, (pointY / height) * 500 - 64),
                    })
                  }
                  onBlur={() => setHover(null)}
                >
                  <title>{`${coinName(row)} · $${fmt(row.price)}`}</title>
                  {stemBase !== null && (
                    <line
                      x1={x}
                      x2={x}
                      y1={y(stemBase)}
                      y2={pointY}
                      className={`rsi-stem ${change !== null && change > 0 ? "rsi-stem-positive" : "rsi-stem-negative"}`}
                    />
                  )}
                  <circle
                    cx={x}
                    cy={pointY}
                    r="6"
                    className={`rsi-dot ${rsiDot(row.rsi)}`}
                  />
                  <text
                    x={x}
                    y={labelY}
                    textAnchor="middle"
                    className="rsi-point-label"
                  >
                    {row.symbol}
                  </text>
                </a>
              );
            })}
          {average !== null && (
            <>
              <line
                x1={left}
                x2={width - right}
                y1={y(average)}
                y2={y(average)}
                className="rsi-average-line"
              />
              <text
                x={width - right - 5}
                y={y(average) - 8}
                textAnchor="end"
                className="rsi-average-label"
              >
                Средний RSI : {fmt(average)}
              </text>
            </>
          )}
        </svg>
        {hover && (
          <div
            className="rsi-tooltip"
            role="tooltip"
            style={{ left: hover.x, top: hover.y }}
          >
            <strong>{coinName(hover.row)}</strong>
            <span>{hover.row.symbol}</span>
            <b>${fmt(hover.row.price)}</b>
            <span>
              Капитализация:{" "}
              {hover.row.marketCap
                ? `${new Intl.NumberFormat("ru-RU", { notation: "compact", maximumFractionDigits: 2 }).format(hover.row.marketCap)}`
                : "—"}
            </span>
            <div className="rsi-tooltip-values">
              <span>
                4 часа{" "}
                <b>
                  {fmt(
                    hover.row.rsiValues?.["4h"] ??
                      (period === "4h" ? hover.row.rsi : null),
                  )}
                </b>
              </span>
              <span>
                24 часа{" "}
                <b>
                  {fmt(
                    hover.row.rsiValues?.["24h"] ??
                      (period === "24h" ? hover.row.rsi : null),
                  )}
                </b>
              </span>
              <span>
                Неделя{" "}
                <b>
                  {fmt(
                    hover.row.rsiValues?.["1w"] ??
                      (period === "1w" ? hover.row.rsi : null),
                  )}
                </b>
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function RsiHeatmapPage() {
  const [period, setPeriod] = useState<Period>("4h");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const started = useRef(false);
  const legacyRefresh = useRef(false);
  const status = useResource<{ job?: Job }>(
    "/api/coinglass/rsi-heatmap-status",
    5000,
  );
  const job = status.data?.job;
  const snapshotId = job?.result?.snapshotId;
  const snapshot = useResource<Snapshot>(
    `/api/coinglass/rsi-heatmap-snapshot?symbol=TOP50&snapshotId=${snapshotId ?? ""}`,
    0,
    !!snapshotId,
  );

  async function refreshData(nextPeriod: Period = period) {
    if (submitting || ["queued", "running"].includes(job?.state ?? "")) return;
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch("/api/coinglass/rsi-heatmap-run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol: "TOP50",
          params: { period: nextPeriod },
        }),
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok)
        throw new Error(body.error || "Не удалось запустить сбор данных");
      await status.refresh(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }
  const refreshRef = useRef(refreshData);
  refreshRef.current = refreshData;
  useEffect(() => {
    const timer = setInterval(
      () => {
        if (document.visibilityState === "visible") void refreshRef.current();
      },
      15 * 60 * 1000,
    );
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!status.loading && !started.current && !job) {
      started.current = true;
      void refreshData();
    }
    // Load the first top-50 snapshot once when status is available.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status.loading, job]);
  useEffect(() => {
    if (snapshot.data?.snapshot.rsiRevision === 3) return;
    if (job?.state === "error" && job.result?.period)
      setPeriod(job.result.period);
    else if (job?.params.period) setPeriod(job.params.period);
  }, [
    job?.state,
    job?.params.period,
    job?.result?.period,
    snapshot.data?.snapshot.rsiRevision,
  ]);
  useEffect(() => {
    const current = snapshot.data?.snapshot;
    if (
      current?.rows.length &&
      (current.rsiRevision !== 3 || current.order !== "coinglass") &&
      !legacyRefresh.current &&
      !submitting &&
      !["queued", "running"].includes(job?.state ?? "")
    ) {
      legacyRefresh.current = true;
      void refreshData(current.period);
    }
    // Existing server snapshots predate the extra timeframe fields.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshot.data?.snapshot, job?.state, submitting]);

  const currentSnapshot = snapshot.data?.snapshot;
  const rows = useMemo(
    () =>
      rsiRowsForPeriod(
        currentSnapshot?.rows ?? [],
        period,
        currentSnapshot?.period ?? period,
      ),
    [currentSnapshot, period],
  );
  const collectedAt = snapshot.data?.snapshot.collectedAt;
  const busy = submitting || ["queued", "running"].includes(job?.state ?? "");

  return (
    <div className="terminal-shell">
      <SiteHeader active="rsi-heatmap" />
      <main className="dashboard rsi-page">
        {(error ||
          (!rows.length &&
            (status.error || snapshot.error || job?.state === "error"))) && (
          <div className="notice error">
            {error || status.error || snapshot.error || job?.message}
          </div>
        )}
        <section className="panel rsi-panel">
          <div className="rsi-toolbar">
            <div className="rsi-toolbar-title">
              <div>
                <h1 className="rsi-page-title">
                  RSI Тепловая Карта Крипторынка
                </h1>
                <small>
                  {rows.length
                    ? `Top ${rows.length} · обновлено ${collectedAt ? new Date(collectedAt).toLocaleString("ru-RU") : ""}`
                    : (job?.message ?? "Подключаемся к CoinGlass…")}
                </small>
              </div>
            </div>
            <div className="rsi-toolbar-actions">
              <span className="rsi-top-count">Top 50</span>
              <div className="rsi-periods" aria-label="Период RSI">
                {periods.map((item) => (
                  <button
                    key={item.value}
                    className={period === item.value ? "active" : ""}
                    onClick={() => {
                      setPeriod(item.value);
                      if (currentSnapshot?.rsiRevision !== 3)
                        void refreshData(item.value);
                    }}
                    disabled={busy}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
              <button
                className="button rsi-refresh"
                aria-label="Обновить RSI"
                title="Обновить"
                onClick={() => void refreshData()}
                disabled={busy}
              >
                <RefreshCw size={16} className={busy ? "spin" : ""} />
              </button>
            </div>
          </div>
          <div className="rsi-zone-legend" aria-label="Зоны RSI">
            {[
              ["Перекупленность", "#cf3044"],
              ["Сильный", "#882636"],
              ["Нейтральный", "#858789"],
              ["Слабый", "#175d54"],
              ["Перепроданность", "#22ab94"],
            ].map(([label, color]) => (
              <span key={label}>
                <i style={{ backgroundColor: color }} />
                {label}
              </span>
            ))}
          </div>
          {rows.length ? (
            <RsiChart rows={rows} period={period} />
          ) : (
            <div className="rsi-empty">
              {busy
                ? (job?.message ?? "Получаем данные…")
                : "Данные CoinGlass появятся после обновления."}
            </div>
          )}
        </section>
        <p className="rsi-source">
          Источник:{" "}
          <a
            href="https://www.coinglass.com/ru/pro/i/RsiHeatMap"
            target="_blank"
            rel="noreferrer"
          >
            CoinGlass RSI Heatmap
          </a>
        </p>
      </main>
    </div>
  );
}
