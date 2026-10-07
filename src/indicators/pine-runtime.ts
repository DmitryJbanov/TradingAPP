import { Indicator, PineTS } from "pinets";
import { candleIntervals, type Candle, type Timeframe } from "../domain/market";
import type { PineScript, PineResult, PinePlot } from "../domain/pine-scripts";

/** Native Pine only; the chart adapter intentionally reports unsupported visuals. */
export async function runPine(
  script: PineScript,
  bars: Candle[],
  symbol: string,
  timeframe: Timeframe,
): Promise<PineResult> {
  if (!/^\s*\/\/@version\s*=\s*[56]\b/m.test(script.source))
    throw Error("Добавьте //@version=5 или //@version=6 в начало Pine Script.");
  if (script.source.length > 100000)
    throw Error("Скрипт превышает 100 000 символов.");
  if (!bars.length) throw Error("Дождитесь загрузки свечей.");
  if (/\brequest\s*\./.test(script.source.replace(/\/\/[^\n]*/g, "")))
    throw Error(
      "request.* пока не подключён: используйте данные текущего инструмента и таймфрейма.",
    );
  const indicator = new Indicator(script.source);
  const kind = indicator.getDeclarationType();
  if (!kind) throw Error("Скрипт должен содержать indicator() или strategy().");
  const pine = new PineTS(
    bars.map((b) => ({
      openTime: b.time * 1000,
      closeTime: (b.time + candleIntervals[timeframe]) * 1000 - 1,
      open: b.open,
      high: b.high,
      low: b.low,
      close: b.close,
      volume: b.volume,
    })),
    symbol,
    { "15m": "15", "1h": "60", "4h": "240", "1d": "D" }[timeframe],
  );
  pine.setMaxLoops(10000);
  const context = await pine.run(indicator);
  const result: PineResult = {
    id: script.id,
    name: script.name,
    kind,
    overlay: Boolean(indicator.prop.overlay),
    plots: [],
    markers: [],
    warnings: [...new Set(context.warnings.map((w) => w.message))].slice(0, 10),
  };
  const allowedTimes = new Set(bars.map((b) => b.time));
  // PineTS plots are dynamically shaped; validate the values at this boundary.
  for (const [title, raw] of Object.entries(context.plots) as [
    string,
    {
      options?: Record<string, unknown>;
      data?: {
        time: number;
        value: unknown;
        options?: Record<string, unknown>;
      }[];
    },
  ][]) {
    const data = raw.data ?? [];
    const style = String(raw.options?.style ?? "line");
    if (
      title.startsWith("__") ||
      ["fill", "bgcolor", "barcolor", "candle", "bar"].includes(style)
    ) {
      if (
        data.some((p) =>
          Array.isArray(p.value) ? p.value.length : p.value != null,
        )
      )
        result.warnings.push(
          `Визуализация ${style} пока не отображается в терминале.`,
        );
      continue;
    }
    if (style === "shape" || style === "char") {
      for (const p of data) {
        const time = Math.floor(p.time / 1000);
        if (!p.value || !allowedTimes.has(time)) continue;
        result.markers.push({
          time,
          position: "aboveBar",
          shape: "circle",
          color: String(p.options?.color ?? "#99a5ff"),
          text: String(p.options?.text ?? title),
        });
      }
      continue;
    }
    const plot: PinePlot = {
      title,
      style: /histogram|columns/.test(style)
        ? "histogram"
        : /area/.test(style)
          ? "area"
          : "line",
      color: String(
        raw.options?.color ??
          data.find((p) => p.options?.color)?.options?.color ??
          "#99a5ff",
      ),
      width: Math.max(
        1,
        Math.min(4, Number(raw.options?.linewidth) || 2),
      ) as PinePlot["width"],
      points: [],
    };
    const seen = new Set<number>();
    for (const p of data) {
      const time = Math.floor(p.time / 1000);
      if (!allowedTimes.has(time) || seen.has(time)) continue;
      seen.add(time);
      plot.points.push(
        typeof p.value === "number" && Number.isFinite(p.value)
          ? {
              time,
              value: p.value,
              ...(typeof p.options?.color === "string"
                ? { color: p.options.color }
                : {}),
            }
          : { time },
      );
    }
    plot.points.sort((a, b) => a.time - b.time);
    if (plot.points.some((p) => p.value !== undefined)) result.plots.push(plot);
  }
  if (context.strategy) {
    const s = context.strategy;
    const trades = [...s.closedtrades, ...s.opentrades].map((t) => ({
      entry: Math.floor(t.entry_time / 1000),
      exit:
        t.exit_time === undefined ? undefined : Math.floor(t.exit_time / 1000),
      entryPrice: t.entry_price,
      exitPrice: t.exit_price,
      size: t.size,
      profit: t.profit,
    }));
    result.strategy = {
      initialCapital: s.initial_capital,
      equity: s.equity,
      netProfit: s.netprofit,
      maxDrawdown: s.max_drawdown,
      wins: s.wintrades,
      trades,
    };
    for (const t of trades) {
      if (allowedTimes.has(t.entry))
        result.markers.push({
          time: t.entry,
          position: t.size > 0 ? "belowBar" : "aboveBar",
          shape: t.size > 0 ? "arrowUp" : "arrowDown",
          color: t.size > 0 ? "#0ECB81" : "#F6465D",
          text: t.size > 0 ? "Long" : "Short",
        });
      if (t.exit !== undefined && allowedTimes.has(t.exit))
        result.markers.push({
          time: t.exit,
          position: t.size > 0 ? "aboveBar" : "belowBar",
          shape: "circle",
          color: "#99a5ff",
          text: "Выход",
        });
    }
  }
  result.markers.sort((a, b) => a.time - b.time);
  result.warnings = [...new Set(result.warnings)];
  return result;
}
