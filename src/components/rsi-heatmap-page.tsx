"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { RefreshCw, Waves } from "lucide-react";
import { SiteHeader } from "./site-header";
import { useResource } from "../hooks/use-resource";
import { catalog } from "../domain/catalog";

type Period = "4h" | "24h" | "1w";
type Row = { rank: number; symbol: string; name?: string; logo?: string | null; weight?: number; price: number | null; change1h: number | null; change24h: number | null; rsi: number };
type Job = { id: string; state: string; message: string; params: { period: Period }; result?: { snapshotId: string; period: Period; count: number } };
type Snapshot = { snapshot: { rows: Row[]; period: Period; collectedAt: string; count: number } };
const periods: { value: Period; label: string }[] = [{ value: "4h", label: "4 часа" }, { value: "24h", label: "24 часа" }, { value: "1w", label: "Неделя" }];
const fmt = (value: number | null, suffix = "") => value == null ? "—" : `${value.toLocaleString("ru-RU", { maximumFractionDigits: 2 })}${suffix}`;
const coinName = (row: Row) => row.name || catalog.find(item => item.base === row.symbol || item.symbol === row.symbol || item.symbol === `${row.symbol}USDT`)?.name || row.symbol;

function rsiDot(value: number) { return value >= 70 ? "rsi-dot-high" : value <= 40 ? "rsi-dot-low" : "rsi-dot-mid"; }

function RsiChart({ rows }: { rows: Row[] }) {
  const [hover, setHover] = useState<{ row: Row; x: number; y: number } | null>(null);
  const width = 1320, height = 700, left = 42, right = 128, top = 24, bottom = 24;
  const plotWidth = width - left - right, plotHeight = height - top - bottom;
  const y = (value: number) => top + (90 - value) / 80 * plotHeight;
  const ticks = [90, 80, 70, 60, 50, 40, 30, 20, 10];
  const average = rows.reduce((sum, row) => sum + row.rsi, 0) / Math.max(rows.length, 1);
  const points = [...rows].sort((a, b) => {
    const hash = (text: string) => [...text].reduce((sum, letter) => (sum * 31 + letter.charCodeAt(0)) >>> 0, 7);
    return hash(a.symbol) - hash(b.symbol);
  });
  const bands = [
    { from: 70, to: 90, fill: "#4b1d24", label: "Перекупленность" },
    { from: 60, to: 70, fill: "#291b23", label: "Сильный" },
    { from: 40, to: 60, fill: "#11161d", label: "Нейтральный" },
    { from: 30, to: 40, fill: "#102b29", label: "Слабый" },
    { from: 10, to: 30, fill: "#12433b", label: "Перепроданность" },
  ];
  return <div className="rsi-map-scroll"><div className="rsi-chart-wrap"><svg className="rsi-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`График RSI для ${rows.length} инструментов`}>
    {bands.map(band => <g key={band.label}>
      <rect x={left} y={y(band.to)} width={plotWidth} height={y(band.from) - y(band.to)} fill={band.fill}/>
      <text x={width - 8} y={(y(band.from) + y(band.to)) / 2 + 5} textAnchor="end" className="rsi-band-label">{band.label}</text>
    </g>)}
    {ticks.map(tick => <g key={tick}>
      <line x1={left} x2={width - right} y1={y(tick)} y2={y(tick)} className="rsi-grid-line"/>
      <text x={left - 9} y={y(tick) + 4} textAnchor="end" className="rsi-axis-label">{tick}</text>
    </g>)}
    {points.map((row, index) => {
      const x = left + (index + .5) * plotWidth / points.length;
      const pointY = y(row.rsi);
      const stemBase = row.rsi >= 60 ? 60 : row.rsi <= 40 ? 40 : null;
      const labelY = Math.max(top + 12, pointY - 10 - (index % 3) * 9);
      const pair = row.symbol.endsWith("USDT") ? row.symbol : `${row.symbol}USDT`;
      return <a key={row.symbol} href={`/pair/${encodeURIComponent(pair)}`} className="rsi-point" aria-label={`Открыть график ${coinName(row)}, цена $${fmt(row.price)}`} onMouseEnter={event => {
        const rect = event.currentTarget.ownerSVGElement!.getBoundingClientRect();
        setHover({ row, x: Math.min(event.clientX - rect.left + 14, rect.width - 210), y: Math.min(Math.max(8, event.clientY - rect.top + 14), rect.height - 90) });
      }} onMouseMove={event => {
        const rect = event.currentTarget.ownerSVGElement!.getBoundingClientRect();
        setHover({ row, x: Math.min(event.clientX - rect.left + 14, rect.width - 210), y: Math.min(Math.max(8, event.clientY - rect.top + 14), rect.height - 90) });
      }} onMouseLeave={() => setHover(null)} onFocus={() => setHover({ row, x: 56, y: Math.max(8, (pointY / height) * 500 - 64) })} onBlur={() => setHover(null)}>
        <title>{`${coinName(row)} · $${fmt(row.price)}`}</title>
        {stemBase !== null && <line x1={x} x2={x} y1={y(stemBase)} y2={pointY} className={`rsi-stem ${rsiDot(row.rsi)}`}/>}
        <circle cx={x} cy={pointY} r="6" className={`rsi-dot ${rsiDot(row.rsi)}`}/>
        <text x={x} y={labelY} textAnchor="middle" className="rsi-point-label">{row.symbol}</text>
      </a>;
    })}
    <line x1={left} x2={width - right} y1={y(average)} y2={y(average)} className="rsi-average-line"/>
    <text x={width - right - 5} y={y(average) - 8} textAnchor="end" className="rsi-average-label">Средний RSI : {fmt(average)}</text>
  </svg>{hover && <div className="rsi-tooltip" role="tooltip" style={{ left: hover.x, top: hover.y }}><strong>{coinName(hover.row)}</strong><span>{hover.row.symbol}</span><b>${fmt(hover.row.price)}</b></div>}</div></div>;
}

export function RsiHeatmapPage() {
  const [period, setPeriod] = useState<Period>("4h");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const started = useRef(false);
  const status = useResource<{ job?: Job }>("/api/coinglass/rsi-heatmap-status", 5000);
  const job = status.data?.job;
  const snapshotId = job?.result?.snapshotId;
  const snapshot = useResource<Snapshot>(`/api/coinglass/rsi-heatmap-snapshot?symbol=TOP50&snapshotId=${snapshotId ?? ""}`, 0, !!snapshotId);

  async function refreshData(nextPeriod: Period = period) {
    if (submitting || ["queued", "running"].includes(job?.state ?? "")) return;
    setSubmitting(true); setError("");
    try {
      const response = await fetch("/api/coinglass/rsi-heatmap-run", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ symbol: "TOP50", params: { period: nextPeriod } }) });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error || "Не удалось запустить сбор данных");
      await status.refresh(true);
    } catch (e) { setError((e as Error).message); }
    finally { setSubmitting(false); }
  }
  useEffect(() => {
    if (!status.loading && !started.current && !job) { started.current = true; void refreshData(); }
    // Load the first top-50 snapshot once when status is available.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status.loading, job]);
  useEffect(() => {
    if (job?.state === "error" && job.result?.period) setPeriod(job.result.period);
    else if (job?.params.period) setPeriod(job.params.period);
  }, [job?.state, job?.params.period, job?.result?.period]);

  const rows = snapshot.data?.snapshot.rows ?? [];
  const collectedAt = snapshot.data?.snapshot.collectedAt;
  const busy = submitting || ["queued", "running"].includes(job?.state ?? "");
  const periodNote = useMemo(() => periods.find(item => item.value === period)?.label ?? "4 часа", [period]);

  return <div className="terminal-shell">
    <SiteHeader active="rsi-heatmap" />
    <main className="dashboard rsi-page">
      <div className="page-heading"><div><div className="eyebrow">COINGLASS · MARKET SCANNER</div><h1>RSI Heatmap</h1><p>Тепловая карта силы движения для 50 ведущих инструментов</p></div>
        <button className="button" onClick={() => void refreshData()} disabled={busy}><RefreshCw size={15} className={busy ? "spin" : ""}/>Обновить</button>
      </div>
      {(error || (!rows.length && (status.error || snapshot.error || job?.state === "error"))) && <div className="notice error">{error || status.error || snapshot.error || job?.message}</div>}
      <section className="panel rsi-panel">
        <div className="rsi-toolbar"><div className="rsi-toolbar-title"><span className="rsi-mark"><Waves size={17}/></span><div><strong>RSI по рынку</strong><small>{rows.length ? `Top ${rows.length} · обновлено ${collectedAt ? new Date(collectedAt).toLocaleString("ru-RU") : ""}` : job?.message ?? "Подключаемся к CoinGlass…"}</small></div></div>
          <div className="rsi-periods" aria-label="Период RSI">{periods.map(item => <button key={item.value} className={period === item.value ? "active" : ""} onClick={() => { setPeriod(item.value); void refreshData(item.value); }} disabled={busy}>{item.label}</button>)}</div>
        </div>
        <div className="rsi-description"><span>RSI · {periodNote} · top 50</span><div className="rsi-legend"><span>0</span><i/><span>50</span><i/><span>100</span></div></div>
        {rows.length ? <RsiChart rows={rows}/> : <div className="rsi-empty">{busy ? job?.message ?? "Получаем данные…" : "Данные CoinGlass появятся после обновления."}</div>}
      </section>
      <p className="rsi-source">Источник: <a href="https://www.coinglass.com/ru/pro/i/RsiHeatMap" target="_blank" rel="noreferrer">CoinGlass RSI Heatmap</a></p>
    </main>
  </div>;
}
