import {
  aggregateCandles,
  Indicator,
  PineTS,
  type IProvider,
  type ISymbolInfo,
  type Kline,
} from "pinets";
import { candleIntervals, type Candle, type Timeframe } from "../domain/market";
import type {
  PineScript,
  PineResult,
  PinePlot,
  PineInstanceSettings,
} from "../domain/pine-scripts";
import { timeAtLogical } from "../domain/drawings";

/** Runs Pine against the active candles and a local higher-timeframe provider. */
export async function runPine(
  script: PineScript,
  bars: Candle[],
  symbol: string,
  timeframe: Timeframe,
  higherTimeframeBars: Candle[] = bars,
  mintick = 0.01,
  settings: PineInstanceSettings = {},
): Promise<PineResult> {
  if (!/^\s*\/\/@version\s*=\s*[56]\b/m.test(script.source))
    throw Error("Добавьте //@version=5 или //@version=6 в начало Pine Script.");
  if (script.source.length > 100000)
    throw Error("Скрипт превышает 100 000 символов.");
  if (!bars.length) throw Error("Дождитесь загрузки свечей.");
  const source = script.source.replace(/\/\/[^\n]*/g, "");
  if (/\brequest\.(?!security\s*\()/i.test(source))
    throw Error("Поддерживается request.security() для текущего инструмента.");
  const indicator = new Indicator(script.source, settings.inputs ?? {});
  const kind = indicator.getDeclarationType();
  if (!kind) throw Error("Скрипт должен содержать indicator() или strategy().");
  const pineTimeframe = { "15m": "15", "1h": "60", "4h": "240", "1d": "D" }[
    timeframe
  ];
  const toKlines = (candles: Candle[], interval: number): Kline[] =>
    candles.map((b) => ({
      openTime: b.time * 1000,
      closeTime: (b.time + interval) * 1000 - 1,
      open: b.open,
      high: b.high,
      low: b.low,
      close: b.close,
      volume: b.volume,
      quoteAssetVolume: b.volume * b.close,
      numberOfTrades: 0,
      takerBuyBaseAssetVolume: b.volume / 2,
      takerBuyQuoteAssetVolume: (b.volume * b.close) / 2,
      ignore: 0,
    }));
  const currentData = toKlines(bars, candleIntervals[timeframe]);
  const dailyData = toKlines(higherTimeframeBars, candleIntervals["1d"]);
  const info: ISymbolInfo = {
    current_contract: symbol,
    description: symbol,
    isin: "",
    main_tickerid: symbol,
    prefix: "",
    root: symbol,
    ticker: symbol,
    tickerid: symbol,
    type: "crypto",
    basecurrency: symbol.replace(/USDT$|USDC$|USD$/, ""),
    country: "",
    currency: "USD",
    timezone: "Etc/UTC",
    employees: 0,
    industry: "",
    sector: "",
    shareholders: 0,
    shares_outstanding_float: 0,
    shares_outstanding_total: 0,
    expiration_date: 0,
    session: "24x7",
    volumetype: "base",
    mincontract: mintick,
    minmove: 1,
    mintick,
    pointvalue: 1,
    pricescale: Math.round(1 / mintick),
    recommendations_buy: 0,
    recommendations_buy_strong: 0,
    recommendations_date: 0,
    recommendations_hold: 0,
    recommendations_sell: 0,
    recommendations_sell_strong: 0,
    recommendations_total: 0,
    target_price_average: 0,
    target_price_date: 0,
    target_price_estimates: 0,
    target_price_high: 0,
    target_price_low: 0,
    target_price_median: 0,
  };
  const provider: IProvider = {
    configure() {},
    async getSymbolInfo() {
      return info;
    },
    async getMarketData(tickerId, requestedTimeframe, limit, start, end) {
      const requestedSymbol = tickerId.split(":").at(-1)?.toUpperCase();
      if (requestedSymbol !== symbol.toUpperCase())
        throw Error(
          "request.security() поддерживает только текущий инструмент.",
        );
      let data: Kline[];
      if (requestedTimeframe === pineTimeframe) data = currentData;
      else if (requestedTimeframe === "D") data = dailyData;
      else if (["W", "M"].includes(requestedTimeframe))
        data = aggregateCandles(dailyData, requestedTimeframe, "D", {
          calendarGrid: true,
        });
      else
        throw Error(
          `request.security(): таймфрейм ${requestedTimeframe} пока не поддерживается.`,
        );
      return data
        .filter(
          (b) =>
            (start === undefined || b.closeTime >= start) &&
            (end === undefined || b.openTime <= end),
        )
        .slice(-(limit ?? data.length));
    },
  };
  const pine = new PineTS(provider, symbol, pineTimeframe);
  pine.setMaxLoops(10000);
  const context = await pine.run(indicator);
  const result: PineResult = {
    id: script.id,
    name: script.name,
    kind,
    overlay: Boolean(indicator.prop.overlay),
    plots: [],
    markers: [],
    drawings: { boxes: [], lines: [], labels: [] },
    warnings: [...new Set(context.warnings.map((w) => w.message))].slice(0, 10),
    inputMeta: indicator.getInputsMeta(),
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
    if (["drawing_box", "drawing_line", "label"].includes(style)) {
      const latest = data.at(-1)?.value;
      if (Array.isArray(latest)) {
        const objects = latest
          .filter(
            (item): item is Record<string, unknown> =>
              !!item && typeof item === "object" && !item._deleted,
          )
          .map((item) => {
            if (item.xloc === "bt" || item.xloc === "bar_time") return item;
            const copy = { ...item, xloc: "bt" } as Record<string, unknown>;
            // Anchor to the calculation snapshot, even if live candles slide meanwhile.
            for (const key of ["left", "right", "x", "x1", "x2"]) {
              if (item[key] != null && Number.isFinite(Number(item[key])))
                copy[key] =
                  timeAtLogical(
                    bars,
                    Number(item[key]),
                    candleIntervals[timeframe],
                  ) * 1000;
            }
            return copy;
          });
        if (style === "drawing_box") result.drawings.boxes.push(...objects);
        if (style === "drawing_line") result.drawings.lines.push(...objects);
        if (style === "label") result.drawings.labels.push(...objects);
      }
      continue;
    }
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
    result.plots.push(plot);
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
