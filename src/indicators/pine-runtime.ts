import { collectPineVisuals } from "./pine-visuals";
import {
  aggregateCandles,
  splitTickerModifier,
  Indicator,
  PineTS,
  type Context,
  type IProvider,
  type ISymbolInfo,
  type Kline,
} from "pinets";
import { candleIntervals, type Candle, type Timeframe } from "../domain/market";
import type {
  PineScript,
  PineResult,
  PineInstanceSettings,
} from "../domain/pine-scripts";

const PINE_V4_CALLS: Record<string, string> = {
  study: "indicator",
  security: "request.security",
  tickerid: "ticker.new",
  heikinashi: "ticker.heikinashi",
  tostring: "str.tostring",
  tonumber: "str.tonumber",
  ...Object.fromEntries(
    "accdist alma atr bb bbw cci cmo cog dmi ema hma iii kc kcw linreg macd mfi mom nvi obv pvi pvt rma roc rsi sar sma stoch supertrend swma tr tsi vwap vwma wad wma wpr wvad barssince change correlation cross crossover crossunder cum dev falling highest highestbars lowest lowestbars median mode percentile_linear_interpolation percentile_nearest_rank percentrank pivothigh pivotlow range rising stdev valuewhen variance"
      .split(" ")
      .map((name) => [name, `ta.${name}`]),
  ),
  ...Object.fromEntries(
    "abs acos asin atan avg ceil cos exp floor log log10 max min pow random round round_to_mintick sign sin sqrt sum tan todegrees toradians"
      .split(" ")
      .map((name) => [name, `math.${name}`]),
  ),
};

const PINE_V4_VALUES = new Set(
  "accdist iii nvi obv pvi pvt tr vwap wad wvad".split(" "),
);

const PINE_V4_COLORS = new Set(
  "aqua black blue fuchsia gray green lime maroon navy olive orange purple red silver teal white yellow".split(
    " ",
  ),
);

function migrateLegacyV4Calls(source: string): string {
  let result = "";
  let cursor = 0;
  for (let index = 0; index < source.length; ) {
    const current = source[index];
    if (current === "/" && source[index + 1] === "/") {
      const end = source.indexOf("\n", index);
      index = end < 0 ? source.length : end;
      continue;
    }
    if (current === "/" && source[index + 1] === "*") {
      const close = source.indexOf("*/", index + 2);
      index = close < 0 ? source.length : close + 2;
      continue;
    }
    if (current === '"' || current === "'") {
      const quote = current;
      index++;
      while (index < source.length) {
        if (source[index] === "\\") index += 2;
        else if (source[index++] === quote) break;
      }
      continue;
    }
    if (!/[A-Za-z_]/.test(current ?? "")) {
      index++;
      continue;
    }

    const start = index++;
    while (/[A-Za-z0-9_]/.test(source[index] ?? "")) index++;
    if (
      !["input", "fill"].includes(source.slice(start, index)) ||
      source[start - 1] === "."
    )
      continue;

    let open = index;
    while (/\s/.test(source[open] ?? "")) open++;
    if (source[open] !== "(") continue;

    const args: string[] = [];
    let argStart = open + 1;
    let parens = 1;
    let brackets = 0;
    let braces = 0;
    let end = argStart;
    for (; end < source.length; end++) {
      const char = source[end];
      if (char === '"' || char === "'") {
        const quote = char;
        end++;
        while (end < source.length) {
          if (source[end] === "\\") end++;
          else if (source[end] === quote) break;
          end++;
        }
      } else if (char === "/" && source[end + 1] === "/") {
        const newline = source.indexOf("\n", end);
        end = newline < 0 ? source.length : newline;
      } else if (char === "/" && source[end + 1] === "*") {
        const close = source.indexOf("*/", end + 2);
        end = close < 0 ? source.length : close + 1;
      } else if (char === "(") parens++;
      else if (char === ")") {
        if (--parens === 0) {
          args.push(source.slice(argStart, end));
          break;
        }
      } else if (char === "[") brackets++;
      else if (char === "]") brackets--;
      else if (char === "{") braces++;
      else if (char === "}") braces--;
      else if (char === "," && parens === 1 && brackets === 0 && braces === 0) {
        args.push(source.slice(argStart, end));
        argStart = end + 1;
      }
    }

    if (source.slice(start, index) === "fill" && parens === 0) {
      const transparency = args.findIndex((arg) => /^\s*transp\s*=/.test(arg));
      const namedColor = args.findIndex((arg) => /^\s*color\s*=/.test(arg));
      const colorIndex =
        namedColor >= 0
          ? namedColor
          : args[2] && !/^\s*\w+\s*=/.test(args[2])
            ? 2
            : -1;
      if (transparency >= 0 && colorIndex >= 0) {
        const value = args[colorIndex].replace(/^\s*color\s*=\s*/, "").trim();
        const alpha = args[transparency]
          .replace(/^\s*transp\s*=\s*/, "")
          .trim();
        args[colorIndex] =
          (namedColor >= 0 ? "color = " : "") +
          "color.new(" +
          value +
          ", " +
          alpha +
          ")";
        result +=
          source.slice(cursor, start) +
          "fill(" +
          args.filter((_, i) => i !== transparency).join(",") +
          ")";
        cursor = end + 1;
        index = cursor;
      }
      continue;
    }

    const typeIndex = args.findIndex((arg) =>
      /^\s*type\s*=\s*input\.(bool|integer|int|float|source|color|string|session|symbol|resolution|timeframe|time)\s*$/.test(
        arg,
      ),
    );
    if (parens !== 0 || typeIndex < 0) continue;

    const type = args[typeIndex].match(/input\.(\w+)/)?.[1];
    if (!type) continue;
    const inputType =
      type === "integer" ? "int" : type === "resolution" ? "timeframe" : type;
    const defaultArg =
      args.find((arg) => /^\s*defval\s*=/.test(arg)) ?? args[0];
    const defaultValue = Number(
      defaultArg?.replace(/^\s*defval\s*=\s*/, "").trim(),
    );
    const migratedArgs = args.filter((arg, argIndex) => {
      if (argIndex === typeIndex) return false;
      if (!Number.isFinite(defaultValue)) return true;
      const bound = arg.match(
        /^\s*(minval|maxval)\s*=\s*(-?\d+(?:\.\d+)?)\s*$/,
      );
      if (!bound) return true;
      const value = Number(bound[2]);
      return bound[1] === "minval"
        ? value <= defaultValue
        : value >= defaultValue;
    });
    while (migratedArgs.length && !migratedArgs.at(-1)?.trim())
      migratedArgs.pop();
    result += source.slice(cursor, start);
    result += `input.${inputType}(${migratedArgs.join(",")})`;
    cursor = end + 1;
    index = cursor;
  }
  return result + source.slice(cursor);
}

/** Translates common v4 syntax to the v5 syntax supported by PineTS. */
function translatePineV4(source: string): string {
  source = migrateLegacyV4Calls(source);
  let result = "";
  for (let index = 0; index < source.length; ) {
    const current = source[index];
    if (current === "/" && source[index + 1] === "/") {
      const end = source.indexOf("\n", index);
      result += source.slice(index, end < 0 ? source.length : end);
      index = end < 0 ? source.length : end;
      continue;
    }
    if (current === "/" && source[index + 1] === "*") {
      const close = source.indexOf("*/", index + 2);
      const end = close < 0 ? source.length : close + 2;
      result += source.slice(index, end);
      index = end;
      continue;
    }
    if (current === '"' || current === "'") {
      const quote = current;
      const start = index++;
      while (index < source.length) {
        if (source[index] === "\\") index += 2;
        else if (source[index++] === quote) break;
      }
      result += source.slice(start, index);
      continue;
    }
    if (!/[A-Za-z_]/.test(current ?? "")) {
      result += current;
      index++;
      continue;
    }

    const start = index++;
    while (/[A-Za-z0-9_]/.test(source[index] ?? "")) index++;
    const name = source.slice(start, index);
    const before = result.slice(-80).trimEnd();
    let next = index;
    while (/\s/.test(source[next] ?? "")) next++;
    const qualified = before.endsWith(".");
    const isInputType = /\binput\.$/.test(before);
    const isCall = source[next] === "(";
    const isNamedArgument = source[next] === "=";
    let replacement = name;

    if (isInputType && name === "integer") replacement = "int";
    else if (isInputType && name === "resolution") replacement = "timeframe";
    else if (
      !qualified &&
      isNamedArgument &&
      (name === "resolution" || name === "resolution_gaps")
    )
      replacement = name === "resolution" ? "timeframe" : "timeframe_gaps";
    else if (!qualified && isCall) replacement = PINE_V4_CALLS[name] ?? name;
    else if (!qualified && PINE_V4_VALUES.has(name)) replacement = `ta.${name}`;
    else if (
      !qualified &&
      PINE_V4_COLORS.has(name) &&
      /(?:\bcolor\s*=|\?|:|(?:color\.new|bgcolor|barcolor)\s*\()\s*$/.test(
        before,
      )
    )
      replacement = `color.${name}`;

    result += replacement;
  }

  return result.replace(
    /^(\s*\/\/\s*@version\s*=\s*)4\b/m,
    (_match, prefix: string) => `${prefix}5`,
  );
}

// Each worker executes one script. Retain its compiled Indicator between ticks.
let compiledIndicator:
  | { source: string; inputs: string; indicator: Indicator }
  | undefined;
function prepareIndicator(source: string, inputs: Record<string, unknown>) {
  const inputKey = JSON.stringify(inputs);
  if (
    compiledIndicator?.source === source &&
    compiledIndicator.inputs === inputKey
  )
    return compiledIndicator.indicator;
  const indicator = new Indicator(source, inputs);
  if (!indicator.getDeclarationType()) return indicator;
  const prepared = indicator.prepare();
  const original = prepared.fn;
  // Slices inside user functions lose their call arguments in PineTS 0.11.
  // Keep working top-level slices; fall back only for the affected call sites.
  const nestedRequests = new Set(
    Array.from(
      original
        .toString()
        .matchAll(/request\.param\([^\n]*\$\$\.id \+ ['"](p\d+)['"]/g),
      (m) => m[1],
    ),
  );
  if (prepared.ltfSlices) {
    prepared.ltfSlices = Object.fromEntries(
      Object.entries(prepared.ltfSlices)
        .filter(([key]) => !nestedRequests.has(key))
        .map(([key, fn]) => [
          key,
          Object.assign((context: Context) => {
            context.inputs = prepared.inputs;
            return fn(context);
          }, fn),
        ]),
    ) as typeof prepared.ltfSlices;
  }
  // A full secondary run already contains the other expression histories at
  // this symbol/timeframe. Reuse it instead of running the whole script again.
  // Explicit request depths must keep their independent secondary contexts.
  const shareSecondary =
    !/\bcalc_bars_count\b/.test(source) &&
    !/request\.security\([^;\n]*(?:,[^;\n]*){7}/.test(original.toString());
  prepared.fn = Object.assign((context: Context) => {
    // request.security accepts an Indicator, despite the older Context type.
    // Share its compiled body and input overrides with full secondary runs.
    if (context.idx === 0)
      context.pineTSCode = indicator as unknown as Context["pineTSCode"];
    if (context.idx === 0 && !context.isSecondaryContext) {
      for (const method of ["bgcolor", "barcolor"]) {
        const call = context.pine[method];
        if (typeof call !== "function") continue;
        let index = -1,
          ordinal = 0;
        context.pine[method] = (...args: unknown[]) => {
          if (index !== context.idx) {
            index = context.idx;
            ordinal = 0;
          }
          const key = "__pine_" + method + "_" + ordinal++;
          const shared = context.plots.plot;
          delete context.plots.plot;
          if (context.plots[key]) context.plots.plot = context.plots[key];
          try {
            const value = call(...args);
            if (context.plots.plot) {
              const entry = context.plots.plot;
              entry.title =
                (method === "bgcolor" ? "Фон" : "Цвет свечей") + " #" + ordinal;
              entry._plotKey = key;
              context.plots[key] = entry;
            }
            return value;
          } finally {
            delete context.plots.plot;
            if (shared) context.plots.plot = shared;
          }
        };
      }
    }
    if (context.idx === 0 && !context.isSecondaryContext && shareSecondary) {
      const completed = new Map<string, { context: Context }>();
      context.cache = new Proxy(context.cache, {
        get(target, key) {
          if (typeof key !== "string" || Object.hasOwn(target, key))
            return Reflect.get(target, key);
          const match = key.match(/^(.+?_(?:\d+|[DWM]))_(.+p\d+)$/);
          const cached = match && completed.get(match[1]);
          if (cached && Object.hasOwn(cached.context.params, match![2])) {
            target[key] = cached;
            return cached;
          }
          return undefined;
        },
        set(target, key, value) {
          Reflect.set(target, key, value);
          if (typeof key === "string" && value?.context) {
            const match = key.match(/^(.+?_(?:\d+|[DWM]))_(.+p\d+)$/);
            // A truncated body is only a partial history; never share it.
            const sliceKey = match?.[2].match(/p\d+$/)?.[0];
            if (
              match &&
              sliceKey &&
              !prepared.ltfSlices?.[sliceKey as keyof typeof prepared.ltfSlices]
            )
              completed.set(match[1], value);
          }
          return true;
        },
      });
    }
    return original(context);
  }, original);
  compiledIndicator = { source, inputs: inputKey, indicator };
  return indicator;
}

/** Runs Pine against the active candles and a local higher-timeframe provider. */
export async function runPine(
  script: PineScript,
  bars: Candle[],
  symbol: string,
  timeframe: Timeframe,
  higherTimeframeBars: Candle[] = bars,
  mintick = 0.01,
  settings: PineInstanceSettings = {},
  securityBars: Partial<Record<Timeframe, Candle[]>> = {},
): Promise<PineResult> {
  const version = script.source.match(
    /^\s*\/\/\s*@version\s*=\s*(\d+)\b/m,
  )?.[1];
  if (!version || !["4", "5", "6"].includes(version))
    throw Error(
      "Поддерживаются Pine Script v4, v5 и v6. Укажите версию в начале скрипта, например //@version=4.",
    );
  if (script.source.length > 100000)
    throw Error("Скрипт превышает 100 000 символов.");
  if (!bars.length) throw Error("Дождитесь загрузки свечей.");
  const ticker = symbol.split(":").at(-1)!.toUpperCase();
  const runtimeSource =
    version === "4" ? translatePineV4(script.source) : script.source;
  const source = runtimeSource.replace(/\/\/[^\n]*/g, "");
  if (/\brequest\.(?!security\s*\()/i.test(source))
    throw Error("Поддерживается request.security() для текущего инструмента.");
  const indicator = prepareIndicator(runtimeSource, settings.inputs ?? {});
  const kind = indicator.getDeclarationType();
  if (!kind) {
    if (/^\s*(?:indicator|strategy)\s*\(/m.test(runtimeSource))
      indicator.prepare();
    throw Error("Скрипт должен содержать indicator() или strategy().");
  }
  const pineTimeframe = {
    "1m": "1",
    "3m": "3",
    "5m": "5",
    "15m": "15",
    "30m": "30",
    "1h": "60",
    "2h": "120",
    "4h": "240",
    "1d": "D",
    "1w": "W",
  }[timeframe];
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
  const intraday = Object.entries(securityBars).map(([tf, candles]) => ({
    seconds: candleIntervals[tf as Timeframe],
    interval: String(candleIntervals[tf as Timeframe] / 60),
    data: toKlines(candles!, candleIntervals[tf as Timeframe]),
  }));
  const info: ISymbolInfo = {
    current_contract: symbol,
    description: symbol,
    isin: "",
    main_tickerid: symbol,
    prefix: "",
    root: ticker,
    ticker,
    tickerid: symbol,
    type: "crypto",
    basecurrency: ticker.replace(/USDT$|USDC$|USD$/, ""),
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
      const { symbol: requestedTicker, modifier } =
        splitTickerModifier(tickerId);
      const requestedSymbol = requestedTicker.split(":").at(-1)?.toUpperCase();
      if (requestedSymbol !== ticker)
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
      else if (
        /^\d+$/.test(requestedTimeframe) &&
        Number(requestedTimeframe) * 60 >= candleIntervals[timeframe]
      )
        data = aggregateCandles(
          currentData,
          requestedTimeframe,
          pineTimeframe,
          { calendarGrid: true },
        );
      else if (
        /^\d+$/.test(requestedTimeframe) &&
        intraday.some(
          (entry) => entry.seconds <= Number(requestedTimeframe) * 60,
        )
      ) {
        const entry = intraday
          .filter((entry) => entry.seconds <= Number(requestedTimeframe) * 60)
          .sort((a, b) => b.seconds - a.seconds)[0];
        data =
          entry.interval === requestedTimeframe
            ? entry.data
            : aggregateCandles(entry.data, requestedTimeframe, entry.interval, {
                calendarGrid: true,
              });
      } else
        throw Error(
          `request.security(): таймфрейм ${requestedTimeframe} пока не поддерживается.`,
        );
      if (modifier === "heikinashi") {
        let previousOpen = 0;
        let previousClose = 0;
        data = data.map((bar, index) => {
          const close = (bar.open + bar.high + bar.low + bar.close) / 4;
          const open =
            index === 0
              ? (bar.open + bar.close) / 2
              : (previousOpen + previousClose) / 2;
          previousOpen = open;
          previousClose = close;
          return {
            ...bar,
            open,
            close,
            high: Math.max(bar.high, open, close),
            low: Math.min(bar.low, open, close),
          };
        });
      }
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
    explicitPlotOrder: Boolean(indicator.prop.explicit_plot_zorder),
    scale: String(indicator.prop.scale ?? "right")
      .split(/[._]/)
      .at(-1),
    precision:
      indicator.prop.precision != null &&
      Number.isFinite(Number(indicator.prop.precision))
        ? Math.max(0, Math.min(10, Number(indicator.prop.precision)))
        : 2,
    format: String(indicator.prop.format ?? "price")
      .split(/[._]/)
      .at(-1),
    plots: [],
    markers: [],
    drawings: { boxes: [], lines: [], labels: [] },
    warnings: [...new Set(context.warnings.map((w) => w.message))].slice(0, 10),
    inputMeta: indicator.getInputsMeta(),
  };
  const allowedTimes = new Set(bars.map((b) => b.time));
  Object.assign(
    result,
    collectPineVisuals(context.plots, bars, candleIntervals[timeframe]),
  );
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
