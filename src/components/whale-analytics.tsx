"use client";
import { useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Choice } from "./controls";
import { useResource } from "../hooks/use-resource";
import type {
  WhaleMarketSnapshot,
  WhaleMarketResponse,
  WhalePosition,
} from "../domain/whales";

const format = (value: number, digits = 2) =>
  value.toLocaleString("ru-RU", { maximumFractionDigits: digits });
const money = (value: number) =>
  value.toLocaleString("en-US", { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 2 });

export function WhaleAnalytics({
  market,
  loading,
  error,
}: {
  market?: WhaleMarketSnapshot;
  loading: boolean;
  error?: string;
}) {
  const [coin, setCoin] = useState("all");
  const [period, setPeriod] = useState("day");
  const selected = useResource<WhaleMarketResponse>(
    `/api/coinglass/whales-market?coin=${encodeURIComponent(coin)}&interval=${period}`,
    5000,
    coin !== "all" || period !== "day",
  );
  const rows = market?.positions ?? [];
  const ready = !!market;
  const groups = market?.coinRatios ?? [];
  const coins = groups.map((g) => g.coin);
  const source =
    (coin === "all" && period === "day" ? market : selected.data?.snapshot)
      ?.history ?? [];
  const current = source.at(-1);
  const end = source.at(-1)?.time ?? Date.now();
  const points = source.map((p) => ({
    ...p,
    ratio: p.short ? p.long / p.short : null,
  }));
  const longRows = rows.filter((p) => p.side === "Long"),
    shortRows = rows.filter((p) => p.side === "Short");
  const metrics = [
    ["Позиции", "value"],
    ["Маржа", "margin"],
    ["Прибыль / убыток (PnL)", "pnl"],
    ["Комиссия Funding", "funding"],
  ] as const;
  return (
    <div className="whale-overview-dashboard">
      <div className="whale-market-summary">
        {metrics.map(([label, key]) => {
          const sum = (items: WhalePosition[]) =>
            items.reduce((s, p) => s + (p[key] ?? 0), 0);
          const long = sum(longRows),
            short = sum(shortRows);
          const percent = long + short > 0 ? (long / (long + short)) * 100 : 0;
          const bar = key === "value" || key === "margin";
          return (
            <section className="panel whale-summary-row" key={key}>
              <div>
                <span>{label}</span>
                <strong>{ready ? money(long + short) : "—"}</strong>
              </div>
              <div>
                <span>{label} Long</span>
                <strong>
                  {ready ? money(long) : "—"}
                  {bar && ready && long + short > 0 && (
                    <small> ({format(percent)}%)</small>
                  )}
                </strong>
              </div>
              <div>
                <span>{label} Short</span>
                <strong>
                  {ready ? money(short) : "—"}
                  {bar && ready && long + short > 0 && (
                    <small> ({format(100 - percent)}%)</small>
                  )}
                </strong>
              </div>
              {bar && (
                <div
                  className="whale-split-track"
                  aria-label={
                    ready && long + short > 0
                      ? `Доля Long ${format(percent)}%`
                      : "Нет данных о соотношении сторон"
                  }
                  style={{
                    background:
                      ready && long + short > 0 ? undefined : "var(--border)",
                  }}
                >
                  <i style={{ width: `${percent}%` }} />
                </div>
              )}
            </section>
          );
        })}
      </div>
      <section className="panel whale-section whale-history-panel">
        <div className="whale-section-heading">
          <h2>Соотношение трейдеров Long / Short</h2>
        </div>
        <div className="whale-filters">
          <Choice
            label="Монета для соотношения трейдеров"
            value={coin}
            onChange={setCoin}
            items={[
              ["all", "Все монеты"],
              ...coins.sort().map((c) => [c, c] as [string, string]),
            ]}
          />
          <Choice
            label="Период истории трейдеров"
            value={period}
            onChange={setPeriod}
            items={[
              ["minute", "1 минута"],
              ["hour", "1 час"],
              ["day", "1 день"],
            ]}
          />
        </div>
        <div className="whale-trader-stats">
          <div>
            <span>Трейдеры Long</span>
            <strong>{current ? format(current.long, 0) : "—"}</strong>
          </div>
          <div>
            <span>Трейдеры Short</span>
            <strong>{current ? format(current.short, 0) : "—"}</strong>
          </div>
          <div>
            <span>Соотношение Long / Short</span>
            <strong>
              {current?.short ? format(current.long / current.short, 4) : "—"}
            </strong>
          </div>
        </div>
        <div className="whale-chart-legend">
          <span>
            <i /> Трейдеры
          </span>
          <span>
            <i /> Long / Short
          </span>
        </div>
        <div
          className="whale-trader-chart"
          role="img"
          aria-label="История количества трейдеров и соотношения Long/Short"
        >
          {points.length ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={points}
                margin={{ top: 12, right: 4, bottom: 4, left: 0 }}
              >
                <CartesianGrid
                  stroke="var(--border)"
                  strokeDasharray="3 3"
                  vertical={false}
                />
                <XAxis
                  dataKey="time"
                  type="number"
                  domain={
                    points.length === 1
                      ? [end - 300000, end + 300000]
                      : ["dataMin", "dataMax"]
                  }
                  tick={{ fill: "var(--muted-foreground)", fontSize: 10 }}
                  tickFormatter={(v) =>
                    new Date(v).toLocaleString(
                      "ru-RU",
                      period !== "day"
                        ? { hour: "2-digit", minute: "2-digit" }
                        : { day: "2-digit", month: "2-digit" },
                    )
                  }
                  minTickGap={35}
                />
                <YAxis
                  yAxisId="ratio"
                  width={48}
                  domain={["auto", "auto"]}
                  tick={{ fill: "var(--muted-foreground)", fontSize: 10 }}
                  tickFormatter={(v) => format(v)}
                />
                <YAxis
                  yAxisId="traders"
                  orientation="right"
                  width={38}
                  allowDecimals={false}
                  tick={{ fill: "var(--muted-foreground)", fontSize: 10 }}
                />
                <Tooltip
                  contentStyle={{
                    background: "var(--card)",
                    border: "1px solid var(--border)",
                    borderRadius: 6,
                    color: "var(--foreground)",
                    fontSize: 12,
                  }}
                  labelFormatter={(v) =>
                    new Date(Number(v)).toLocaleString("ru-RU")
                  }
                  formatter={(value, name) => [
                    value == null
                      ? "—"
                      : format(Number(value), name === "Трейдеры" ? 0 : 4),
                    name,
                  ]}
                />
                <Line
                  yAxisId="traders"
                  dataKey="total"
                  name="Трейдеры"
                  stroke="#00cddd"
                  strokeWidth={1.5}
                  dot={points.length === 1}
                  isAnimationActive={false}
                />
                <Line
                  yAxisId="ratio"
                  dataKey="ratio"
                  name="Long / Short"
                  stroke="var(--foreground)"
                  strokeWidth={1.5}
                  dot={points.length === 1}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <p className="empty-state">
              {selected.error ||
                selected.data?.error ||
                error ||
                (selected.loading || selected.data?.loading || loading
                  ? "Загружаем историю…"
                  : "Ожидаем первый полный снимок выборки.")}
            </p>
          )}
        </div>
        <p className="whale-source">
          История трейдеров CoinGlass · интервал{" "}
          {period === "day"
            ? "1 день"
            : period === "hour"
              ? "1 час"
              : "1 минута"}
          .
        </p>
      </section>
      <section className="panel whale-section whale-coin-ratios">
        <div className="whale-section-heading">
          <h2>Long / Short по монетам</h2>
          <span className="muted">По количеству трейдеров</span>
        </div>
        <div className="whale-coin-bars">
          {groups.map((g) => {
            const percent = g.longPercent;
            return (
              <button
                key={g.coin}
                className={`whale-coin-bar ${coin === g.coin ? "selected" : ""}`}
                onClick={() => setCoin(g.coin)}
                title={`${g.coin}: Long ${g.long}, Short ${g.short}. Показать историю.`}
              >
                <b>{g.coin}</b>
                <span className="whale-coin-bar-track">
                  <span className="long" style={{ width: `${percent}%` }}>
                    {percent >= 12 ? `${format(percent)}%` : ""}
                  </span>
                  <span
                    className="short"
                    style={{ width: `${100 - percent}%` }}
                  >
                    {percent <= 88 ? `${format(100 - percent)}%` : ""}
                  </span>
                </span>
              </button>
            );
          })}
          {!groups.length && (
            <p className="empty-state">
              {ready
                ? "В выборке нет открытых позиций."
                : "Загружаем распределение позиций…"}
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
