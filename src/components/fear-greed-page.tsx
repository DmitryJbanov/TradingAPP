"use client";
import { useEffect, useMemo, useState } from "react";
import { Activity, ArrowUpRight, RefreshCw } from "lucide-react";
import { useResource } from "../hooks/use-resource";
import { SiteHeader } from "./site-header";

type Point = { timestamp: string; value: number; classification: string };
type Job = { state: string; message: string; result?: { snapshotId: string } };
type SnapshotResponse = { snapshot: { points: Point[]; collectedAt: string } };
const periods = [
  [7, "1W"],
  [30, "1M"],
  [90, "3M"],
  [365, "1Y"],
  [500, "Всё"],
] as const;
const classify = (value: number) =>
  value <= 20 ? "Крайний страх" : value <= 40 ? "Страх" : value <= 60 ? "Нейтрально" : value <= 80 ? "Жадность" : "Крайняя жадность";
const scoreColor = (value: number) =>
  value <= 20 ? "#ef5968" : value <= 40 ? "#f08b55" : value <= 60 ? "#e3c35d" : value <= 80 ? "#8fc77b" : "#43c98b";

function Gauge({ value }: { value: number }) {
  const point = (score: number, radius: number) => {
    const angle = Math.PI * (1 - score / 100);
    return [100 + radius * Math.cos(angle), 100 - radius * Math.sin(angle)];
  };
  const arc = (start: number, end: number) => {
    const [x1, y1] = point(start, 82), [x2, y2] = point(end, 82);
    return `M${x1} ${y1} A82 82 0 0 1 ${x2} ${y2}`;
  };
  const [x, y] = point(value, 74);
  return (
    <svg className="fg-gauge" viewBox="0 0 200 112" role="img" aria-label={`Индекс ${value} из 100`}>
      <path d={arc(0, 25)} fill="none" stroke="#ef5968" strokeWidth="12" />
      <path d={arc(25, 75)} fill="none" stroke="#e3c35d" strokeWidth="12" />
      <path d={arc(75, 100)} fill="none" stroke="#43c98b" strokeWidth="12" />
      <circle cx="100" cy="100" r="6" fill="var(--foreground)" />
      <path d={`M100 100 L${x} ${y}`} stroke={scoreColor(value)} strokeWidth="4" strokeLinecap="round" />
      <circle cx={x} cy={y} r="5" fill={scoreColor(value)} stroke="var(--card)" strokeWidth="2" />
      <text x="18" y="112" className="fg-gauge-label">0</text><text x="174" y="112" className="fg-gauge-label">100</text>
    </svg>
  );
}

export function FearGreedPage() {
  const status = useResource<{ job?: Job }>("/api/coinglass/fear-greed-status", 5000);
  const id = status.data?.job?.result?.snapshotId;
  const snapshot = useResource<SnapshotResponse>(`/api/coinglass/fear-greed-snapshot?snapshotId=${id ?? ""}`, 0, !!id);
  const [period, setPeriod] = useState<number>(90);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const job = status.data?.job;
  async function refreshData() {
    if (submitting) return;
    setSubmitting(true); setError("");
    try {
      const response = await fetch("/api/coinglass/fear-greed-run", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ symbol: "CMC" }) });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error || "Не удалось запустить обновление");
      await status.refresh(true);
    } catch (e) { setError((e as Error).message); }
    finally { setSubmitting(false); }
  }
  useEffect(() => {
    if (!status.loading && !job && !status.error) void refreshData();
    // Initial page load starts the first background collection.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status.loading, job, status.error]);
  const points = snapshot.data?.snapshot.points ?? [];
  const latest = points.at(-1);
  const shown = useMemo(() => points.slice(-period), [points, period]);
  const monthTicks = useMemo(() => {
    if (shown.length < 2) return [];
    const start = Date.parse(shown[0].timestamp), end = Date.parse(shown.at(-1)!.timestamp);
    const date = new Date(start);
    const ticks: { x: number; label: string; boundary: boolean }[] = [];
    const add = (time: number, boundary: boolean) => {
      const month = new Date(time);
      ticks.push({
        x: boundary ? 12 + ((time - start) / (end - start)) * 876 : 12,
        label: `${month.toLocaleDateString("ru-RU", { month: "short", timeZone: "UTC" }).replace(/\.$/, "")} '${String(month.getUTCFullYear()).slice(-2)}`,
        boundary,
      });
    };
    add(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1), false);
    for (let time = Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1); time <= end; time = new Date(time).setUTCMonth(new Date(time).getUTCMonth() + 1))
      add(time, true);
    return ticks;
  }, [shown]);
  const chart = useMemo(() => {
    const paths = { low: [] as string[], middle: [] as string[], high: [] as string[] };
    if (shown.length < 2) return paths;
    const xy = (index: number, value: number) => [12 + (index / (shown.length - 1)) * 876, 268 - value * 2.56];
    for (let i = 1; i < shown.length; i++) {
      const previous = shown[i - 1].value, current = shown[i].value;
      const cuts = [0, 1, ...[25, 75].filter(level => (previous < level && current > level) || (previous > level && current < level)).map(level => (level - previous) / (current - previous))].sort((a, b) => a - b);
      for (let j = 1; j < cuts.length; j++) {
        const from = cuts[j - 1], to = cuts[j];
        const start = previous + (current - previous) * from;
        const end = previous + (current - previous) * to;
        const [x1, y1] = xy(i - 1 + from, start), [x2, y2] = xy(i - 1 + to, end);
        const band = (start + end) / 2 < 25 ? "low" : (start + end) / 2 >= 75 ? "high" : "middle";
        paths[band].push(`M${x1} ${y1}L${x2} ${y2}`);
      }
    }
    return paths;
  }, [shown]);
  const yearly = points.slice(-365);
  const high = yearly.length ? Math.max(...yearly.map(p => p.value)) : undefined;
  const low = yearly.length ? Math.min(...yearly.map(p => p.value)) : undefined;
  const label = latest ? classify(latest.value) : "Загрузка";
  return (
    <div className="terminal-shell">
      <SiteHeader active="fear-greed" />
      <main className="dashboard fg-page">
        <div className="page-heading"><div><div className="eyebrow">CMC · MARKET SENTIMENT</div><h1>Crypto Fear and Greed Index</h1><p>Исторические значения индекса настроения рынка</p></div>
          <button className="button" onClick={() => void refreshData()} disabled={submitting || ["queued", "running"].includes(job?.state ?? "")}><RefreshCw size={15} className={submitting || ["queued", "running"].includes(job?.state ?? "") ? "spin" : ""}/>Обновить</button>
        </div>
        {(error || status.error || snapshot.error || job?.state === "error") && <div className="notice error">{error || status.error || snapshot.error || job?.message}</div>}
        <section className="fg-summary panel">
          <div className="fg-score"><span className="eyebrow">Текущее значение</span><strong style={{ color: latest ? scoreColor(latest.value) : undefined }}>{latest?.value ?? "—"}<small> / 100</small></strong><b style={{ color: latest ? scoreColor(latest.value) : undefined }}>{label}</b><span className="fg-date">{latest ? new Date(latest.timestamp).toLocaleDateString("ru-RU", {day:"numeric",month:"long",year:"numeric",timeZone:"UTC"}) : job?.message ?? "Получаем данные…"}</span></div>
          <Gauge value={latest?.value ?? 50}/>
          <div className="fg-extremes"><div><span>Максимум за год</span><b>{high ?? "—"}</b></div><div><span>Минимум за год</span><b>{low ?? "—"}</b></div><a href="https://coinmarketcap.com/charts/fear-and-greed-index/" target="_blank" rel="noreferrer">CoinMarketCap <ArrowUpRight size={14}/></a></div>
        </section>
        <section className="panel fg-history">
          <div className="fg-history-heading"><div><h2>Исторические значения</h2><span>{shown.length ? `${new Date(shown[0].timestamp).toLocaleDateString("ru-RU", {timeZone:"UTC"})} — ${new Date(shown.at(-1)!.timestamp).toLocaleDateString("ru-RU", {timeZone:"UTC"})}` : ""}</span></div><div className="fg-periods">{periods.map(([days, title])=><button key={days} className={period===days?"active":""} onClick={()=>setPeriod(days)}>{title}</button>)}</div></div>
          <div className="fg-chart-wrap">{shown.length > 1 ? <svg className="fg-chart" viewBox="0 0 900 280" preserveAspectRatio="none" aria-label="История индекса">{[0,25,50,75,100].map(v=><g key={v}><line x1="0" x2="900" y1={268-v*2.56} y2={268-v*2.56}/><text x="4" y={264-v*2.56}>{v}</text></g>)}{monthTicks.filter(tick=>tick.boundary).map(tick=><line key={tick.label} className="fg-month-boundary" x1={tick.x} x2={tick.x} y1="12" y2="268"/>)}<path d={chart.low.join("")} fill="none" stroke="#ef5968" strokeWidth="2.4" vectorEffect="non-scaling-stroke"/><path d={chart.middle.join("")} fill="none" stroke="#e3c35d" strokeWidth="2.4" vectorEffect="non-scaling-stroke"/><path d={chart.high.join("")} fill="none" stroke="#43c98b" strokeWidth="2.4" vectorEffect="non-scaling-stroke"/></svg> : <div className="fg-empty">{job?.state === "running" || job?.state === "queued" ? job.message : "История появится после загрузки данных."}</div>}</div>
          {monthTicks.length > 0 && <svg className="fg-month-axis" viewBox="0 0 900 24" preserveAspectRatio="none" aria-label="Месяцы на горизонтальной оси">{monthTicks.map((tick,index)=><text key={tick.label} x={tick.x} textAnchor={index===0?"start":index===monthTicks.length-1?"end":"middle"}>{tick.label}</text>)}</svg>}
        </section>
        <p className="fg-source">Источник данных: CoinMarketCap.</p>
      </main>
    </div>
  );
}
