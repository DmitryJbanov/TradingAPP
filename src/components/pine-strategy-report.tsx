"use client";
import { Fragment, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { IndicatorInstance } from "../domain/workspace";
import type { PineResult, PineTrade } from "../domain/pine-scripts";
import {
  useStrategyBacktest,
  type StrategyRun,
} from "../hooks/use-strategy-backtest";
import "./pine-strategy-report.css";
const number = (value: number | undefined) =>
  value !== undefined && Number.isFinite(value)
    ? value.toLocaleString("ru-RU", { maximumFractionDigits: 2 })
    : "—";
const date = (time: number | undefined) =>
  time === undefined
    ? "Открыта"
    : new Date(time * 1000).toLocaleString("ru-RU", {
        timeZone: "Europe/Moscow",
      });
const frameName: Record<string, string> = {
  "15m": "15 минут",
  "1h": "1 час",
  "4h": "4 часа",
};
const day = (value: Date) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Moscow",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(value);
function statistics(s: NonNullable<PineResult["strategy"]>) {
  const closed = s.trades.filter((t) => t.exit !== undefined),
    wins = closed.filter((t) => (t.profit ?? 0) > 0),
    losses = closed.filter((t) => (t.profit ?? 0) < 0);
  const grossProfit =
      s.grossProfit ?? wins.reduce((sum, t) => sum + (t.profit ?? 0), 0),
    grossLoss = Math.abs(
      s.grossLoss ?? losses.reduce((sum, t) => sum + (t.profit ?? 0), 0),
    );
  let winningStreak = 0,
    losingStreak = 0,
    w = 0,
    l = 0;
  for (const t of [...closed].sort((a, b) => a.exit! - b.exit!)) {
    w = (t.profit ?? 0) > 0 ? w + 1 : 0;
    l = (t.profit ?? 0) < 0 ? l + 1 : 0;
    winningStreak = Math.max(winningStreak, w);
    losingStreak = Math.max(losingStreak, l);
  }
  const average = (items: PineTrade[]) =>
    items.length
      ? items.reduce((sum, t) => sum + (t.profit ?? 0), 0) / items.length
      : undefined;
  return {
    closed,
    wins,
    losses,
    grossProfit,
    grossLoss,
    pf: grossLoss
      ? number(grossProfit / grossLoss)
      : grossProfit > 0
        ? "∞"
        : "—",
    winRate: closed.length ? (wins.length / closed.length) * 100 : undefined,
    returnPct: s.initialCapital
      ? ((s.equity - s.initialCapital) / s.initialCapital) * 100
      : undefined,
    average: average(closed),
    averageWin: average(wins),
    averageLoss: average(losses),
    best: closed.length
      ? Math.max(...closed.map((t) => t.profit ?? 0))
      : undefined,
    worst: closed.length
      ? Math.min(...closed.map((t) => t.profit ?? 0))
      : undefined,
    winningStreak,
    losingStreak,
    commission: s.trades.reduce((sum, t) => sum + (t.commission ?? 0), 0),
    duration: closed.length
      ? closed.reduce((sum, t) => sum + t.exit! - t.entry, 0) /
        closed.length /
        3600
      : undefined,
  };
}
function Details({ run }: { run: StrategyRun }) {
  const s = run.result?.strategy;
  if (!s) return null;
  const m = statistics(s),
    curve = s.equityCurve ?? [];
  const metrics: [string, number | string | undefined][] = [
    ["Начальный депозит", s.initialCapital],
    ["Капитал с открытыми позициями", s.equity],
    ["Баланс после закрытых сделок", s.initialCapital + s.netProfit],
    ["Чистая прибыль закрытых сделок", s.netProfit],
    ["Открытый P&L", s.openProfit],
    ["Валовая прибыль", m.grossProfit],
    ["Валовой убыток", m.grossLoss],
    ["Максимальная просадка", s.maxDrawdown],
    ["Максимальная просадка, %", s.maxDrawdownPercent],
    ["Прибыльных сделок", m.wins.length],
    ["Убыточных сделок", m.losses.length],
    ["Безубыточных сделок", m.closed.length - m.wins.length - m.losses.length],
    ["Открытых позиций", s.trades.length - m.closed.length],
    ["Profit Factor", m.pf],
    ["Средний результат сделки", m.average],
    ["Средняя прибыль", m.averageWin],
    ["Средний убыток", m.averageLoss],
    ["Лучшая сделка", m.best],
    ["Худшая сделка", m.worst],
    ["Комиссии", m.commission],
    ["Средняя длительность, ч", m.duration],
    ["Макс. прибыльная серия", m.winningStreak],
    ["Макс. убыточная серия", m.losingStreak],
    ["Buy & Hold", s.buyAndHold],
    ["Sharpe (месячные доходности)", s.sharpe],
    ["Sortino (месячные доходности)", s.sortino],
  ];
  return (
    <section className="strategy-details">
      <h4>Депозит во времени · {s.currency || "валюта стратегии"}</h4>
      {curve.length > 0 ? (
        <div
          className="strategy-equity-chart"
          role="img"
          aria-label="Капитал стратегии во времени с учётом открытых позиций"
        >
          <ResponsiveContainer width="100%" height={300} minWidth={0}>
            <AreaChart
              data={curve}
              margin={{ top: 12, right: 20, bottom: 12, left: 12 }}
            >
              <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
              <XAxis
                dataKey="time"
                type="number"
                domain={["dataMin", "dataMax"]}
                tickFormatter={(t) =>
                  new Date(Number(t) * 1000).toLocaleDateString("ru-RU", {
                    timeZone: "Europe/Moscow",
                    day: "2-digit",
                    month: "short",
                  })
                }
                minTickGap={45}
                stroke="var(--muted-foreground)"
              />
              <YAxis
                domain={["auto", "auto"]}
                tickFormatter={number}
                width={85}
                stroke="var(--muted-foreground)"
              />
              <Tooltip
                labelFormatter={(t) => date(Number(t))}
                formatter={(v) => [number(Number(v)), "Капитал"]}
                contentStyle={{
                  background: "var(--card)",
                  border: "1px solid var(--border)",
                  color: "var(--foreground)",
                }}
              />
              <ReferenceLine
                y={s.initialCapital}
                stroke="var(--muted-foreground)"
                strokeDasharray="4 4"
              />
              <Area
                dataKey="value"
                type="linear"
                stroke={s.equity >= s.initialCapital ? "#26a69a" : "#ef5350"}
                fill={s.equity >= s.initialCapital ? "#26a69a" : "#ef5350"}
                fillOpacity={0.12}
                strokeWidth={2}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <p>Нет данных капитала.</p>
      )}
      <p className="muted">
        Фактически: {date(run.from)} — {date(run.to)} МСК · {run.bars} свечей.
        Капитал включает открытый P&L. Последняя позиция не закрывается
        принудительно.
      </p>
      {run.warning && <p className="warning">{run.warning}</p>}
      {run.result?.warnings.map((w) => (
        <p className="warning" key={w}>
          {w}
        </p>
      ))}
      <dl className="strategy-statistics">
        {metrics.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{typeof value === "string" ? value : number(value)}</dd>
          </div>
        ))}
      </dl>
      <h4>Сделки · последние 100 из {s.trades.length}</h4>
      <div className="pine-trades">
        <table>
          <thead>
            <tr>
              <th>Сторона</th>
              <th>Вход · МСК</th>
              <th>Цена входа</th>
              <th>Выход · МСК</th>
              <th>Цена выхода</th>
              <th>Объём</th>
              <th>Комиссия</th>
              <th>P&L</th>
            </tr>
          </thead>
          <tbody>
            {[...s.trades]
              .sort((a, b) => b.entry - a.entry)
              .slice(0, 100)
              .map((t, i) => (
                <tr key={i}>
                  <td>{t.size > 0 ? "Long" : "Short"}</td>
                  <td>{date(t.entry)}</td>
                  <td>{number(t.entryPrice)}</td>
                  <td>{date(t.exit)}</td>
                  <td>{number(t.exitPrice)}</td>
                  <td>{number(Math.abs(t.size))}</td>
                  <td>{number(t.commission)}</td>
                  <td
                    className={(t.profit ?? 0) >= 0 ? "positive" : "negative"}
                  >
                    {number(t.profit)}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
function StrategySummary({ runs }: { runs: StrategyRun[] }) {
  const [opened, setOpened] = useState("");
  return (
    <section className="pine-strategy-report panel">
      <h3>Тестер стратегий · {runs[0]?.name}</h3>
      <div className="strategy-summary-scroll">
        <table className="strategy-summary">
          <thead>
            <tr>
              <th>Таймфрейм</th>
              <th>Доходность</th>
              <th>Чистая прибыль</th>
              <th>Капитал</th>
              <th>Просадка</th>
              <th>Сделок</th>
              <th>Успешных</th>
              <th>Profit Factor</th>
            </tr>
          </thead>
          <tbody>
            {runs.map((r) => {
              const s = r.result?.strategy,
                m = s ? statistics(s) : undefined;
              return (
                <Fragment key={r.timeframe}>
                  <tr>
                    <td>
                      <button
                        type="button"
                        className="button secondary"
                        aria-expanded={opened === r.timeframe}
                        disabled={!s}
                        onClick={() =>
                          setOpened((current) =>
                            current === r.timeframe ? "" : r.timeframe,
                          )
                        }
                      >
                        {opened === r.timeframe ? "▾" : "▸"}{" "}
                        {frameName[r.timeframe]}
                      </button>
                      {r.state === "loading" && <small>Расчёт…</small>}
                      {r.error && <small role="alert">{r.error}</small>}
                      {r.warning && (
                        <small className="warning">
                          Неполная история / прогрев
                        </small>
                      )}
                    </td>
                    <td
                      className={
                        (m?.returnPct ?? 0) >= 0 ? "positive" : "negative"
                      }
                    >
                      {number(m?.returnPct)}
                      {m?.returnPct !== undefined ? "%" : ""}
                    </td>
                    <td
                      className={
                        (s?.netProfit ?? 0) >= 0 ? "positive" : "negative"
                      }
                    >
                      {number(s?.netProfit)}
                    </td>
                    <td>{number(s?.equity)}</td>
                    <td>
                      {number(s?.maxDrawdownPercent)}
                      {s?.maxDrawdownPercent !== undefined ? "%" : ""}
                    </td>
                    <td>{m?.closed.length ?? "—"}</td>
                    <td>
                      {number(m?.winRate)}
                      {m?.winRate !== undefined ? "%" : ""}
                    </td>
                    <td>{m?.pf ?? "—"}</td>
                  </tr>
                  {opened === r.timeframe && s && (
                    <tr>
                      <td colSpan={8}>
                        <Details run={r} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
export function PineStrategyReport({
  indicators,
  symbol,
  exchange,
  candleSource,
  provider,
}: {
  indicators: IndicatorInstance[];
  symbol: string;
  exchange: string;
  candleSource?: string;
  provider?: string;
}) {
  const [range, setRange] = useState(() => ({
    from: day(new Date(Date.now() - 30 * 86400000)),
    to: day(new Date()),
  }));
  const [applied, setApplied] = useState(range),
    [token, setToken] = useState(0);
  const parse = (date: string) => Date.parse(date + "T00:00:00+03:00") / 1000;
  const start = parse(applied.from),
    end = parse(applied.to) + 86400;
  const { runs, cancel, signature } = useStrategyBacktest(
    indicators,
    symbol,
    exchange,
    candleSource,
    provider,
    start,
    end,
    token,
  );
  if (signature === "[]") return null;
  const valid =
    Number.isFinite(parse(range.from)) &&
    Number.isFinite(parse(range.to)) &&
    parse(range.from) < parse(range.to) + 86400 &&
    parse(range.from) < Date.now() / 1000;
  const busy = runs.some((r) => r.state === "loading");
  const names = [...new Set(runs.map((r) => r.id))];
  return (
    <div className="strategy-tester">
      <header className="strategy-period panel">
        <h3>Тестирование · 15 минут / 1 час / 4 часа</h3>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (valid) {
              setApplied(range);
              setToken((n) => n + 1);
            }
          }}
        >
          <label>
            Начало · МСК
            <input
              type="date"
              value={range.from}
              max={day(new Date())}
              onChange={(e) =>
                setRange((v) => ({ ...v, from: e.target.value }))
              }
            />
          </label>
          <label>
            Конец · МСК
            <input
              type="date"
              value={range.to}
              max={day(new Date())}
              onChange={(e) => setRange((v) => ({ ...v, to: e.target.value }))}
            />
          </label>
          {[7, 30, 90].map((days) => (
            <button
              type="button"
              className="button secondary"
              key={days}
              onClick={() =>
                setRange({
                  from: day(new Date(Date.now() - days * 86400000)),
                  to: day(new Date()),
                })
              }
            >
              {days} дней
            </button>
          ))}
          <button className="button" disabled={!valid}>
            Запустить тестирование
          </button>
          {busy && (
            <button className="button secondary" type="button" onClick={cancel}>
              Остановить
            </button>
          )}
        </form>
        {!valid && <p role="alert">Укажите корректный период.</p>}
        <p className="muted">
          Период отчёта: {applied.from} — {applied.to} МСК. До начала периода
          свечи используются только для прогрева; новые заявки не размещаются.
          Лимит — 12 000 свечей на таймфрейм. Расчёт по закрытым свечам;
          реальные ордера не отправляются.
        </p>
      </header>
      {names.map((id) => (
        <StrategySummary key={id} runs={runs.filter((r) => r.id === id)} />
      ))}
    </div>
  );
}
