import {
  handleCoinglass,
  coinglassRequest,
  type CoinglassConfig,
} from "./coinglass-service";
import {
  resolveInstrument,
  searchSymbols,
  SymbolError,
  upstreamSymbol,
} from "./symbol-service";
import { catalog, instrument } from "../domain/catalog";
import { demoCandles, demoQuote } from "../domain/demo";
import { DEFAULT_CANDLE_COUNT, validCandleCount } from "../domain/history";
import { binanceEndpoint, loadBinanceHistory } from "./binance-history";
import {
  candleIntervals,
  type Quote,
  type CandleResponse,
  type MarketResponse,
  type LogEntry,
  type CandleInterval,
} from "../domain/market";
export interface Config extends CoinglassConfig {
  DATA_MODE?: string;
  TWELVE_DATA_API_KEY?: string;
}
const logs: LogEntry[] = [];
let sequence = 0;
const started = Date.now();
const cache = new Map<string, { value: any; expires: number }>();
const pending = new Map<string, Promise<any>>();
const providers: Record<string, { status: string; time: string }> = {};
function log(level: LogEntry["level"], message: string) {
  const item = {
    id: ++sequence,
    time: new Date().toISOString(),
    level,
    message,
  };
  logs.push(item);
  if (logs.length > 100) logs.shift();
  console.log(JSON.stringify(item));
}
async function json(url: string) {
  const r = await fetch(url, {
    signal: AbortSignal.timeout(8000),
    headers: { Accept: "application/json" },
  });
  if (!r.ok) throw Error(`HTTP ${r.status}`);
  const d: any = await r.json();
  if (d.status === "error")
    throw Error(`Provider error ${d.code ?? "unknown"}`);
  return d;
}
async function cached<T>(
  key: string,
  ttl: number,
  force: boolean,
  fn: () => Promise<T>,
): Promise<T> {
  const c = cache.get(key);
  if (!force && c && c.expires > Date.now()) return c.value;
  if (pending.has(key)) return pending.get(key)!;
  const job = fn()
    .then((value) => {
      if (cache.size >= 64) cache.delete(cache.keys().next().value!);
      cache.set(key, { value, expires: Date.now() + ttl });
      return value;
    })
    .finally(() => pending.delete(key));
  pending.set(key, job);
  return job;
}
function status(provider: string, ok: boolean) {
  providers[provider] = {
    status: ok ? "connected" : "unavailable",
    time: new Date().toISOString(),
  };
}
const base = "https://data-api.binance.vision";
export async function markets(
  config: Config = {},
  force = false,
): Promise<MarketResponse> {
  return cached(
    "markets:" +
      (config.DATA_MODE ?? "auto") +
      ":" +
      Boolean(config.TWELVE_DATA_API_KEY),
    30000,
    force,
    async () => {
      const now = Date.now();
      const rows = catalog.map((x) => demoQuote(x, now));
      const warnings: string[] = [];
      if (config.DATA_MODE !== "demo") {
        await Promise.all([
          (async () => {
            try {
              const data = await json(
                base +
                  "/api/v3/ticker/24hr?" +
                  new URLSearchParams({
                    symbols: JSON.stringify(
                      catalog
                        .filter(
                          (x) =>
                            x.category === "crypto" && x.symbol !== "HYPEUSDT",
                        )
                        .map((x) => x.symbol),
                    ),
                  }),
              );
              if (!Array.isArray(data)) throw Error("Invalid response");
              const map = new Map(data.map((d: any) => [d.symbol, d]));
              for (let i = 0; i < rows.length; i++) {
                const item = rows[i];
                if (item.category !== "crypto") continue;
                const d: any = map.get(item.symbol);
                if (!d || !Number.isFinite(+d.lastPrice) || +d.lastPrice <= 0)
                  continue;
                rows[i] = {
                  ...item,
                  price: +d.lastPrice,
                  change: +d.priceChangePercent,
                  volume: +d.quoteVolume,
                  high: +d.highPrice,
                  low: +d.lowPrice,
                  source: "live",
                  provider: "Binance",
                  asOf: new Date(+d.closeTime).toISOString(),
                };
              }
              status("Binance", true);
              log(
                "INFO",
                `Binance: обновлено ${rows.filter((x) => x.source === "live").length} котировок`,
              );
            } catch (e) {
              status("Binance", false);
              warnings.push(
                "Binance недоступен: криптовалюты показаны в деморежиме",
              );
              log(
                "WARN",
                `Binance: ${e instanceof Error ? e.message : "request failed"}; demo fallback`,
              );
            }
          })(),
          (async () => {
            try {
              const e = binanceEndpoint("HYPEUSDT");
              const d = await json(
                `${e.root}${e.path}/ticker/24hr?symbol=HYPEUSDT`,
              );
              if (
                ![
                  d.lastPrice,
                  d.priceChangePercent,
                  d.quoteVolume,
                  d.highPrice,
                  d.lowPrice,
                  d.closeTime,
                ].every((v) => v !== undefined && Number.isFinite(Number(v))) ||
                +d.lastPrice <= 0
              )
                throw Error("Invalid HYPE quote");
              const i = rows.findIndex((r) => r.symbol === "HYPEUSDT");
              rows[i] = {
                ...rows[i],
                price: +d.lastPrice,
                change: +d.priceChangePercent,
                volume: +d.quoteVolume,
                high: +d.highPrice,
                low: +d.lowPrice,
                source: "live",
                provider: e.name,
                asOf: new Date(+d.closeTime).toISOString(),
              };
              status(e.name, true);
            } catch {
              status("Binance Futures", false);
              warnings.push("HYPE: Binance Futures недоступен, показан DEMO");
              log("WARN", "HYPE: Binance Futures unavailable; demo fallback");
            }
          })(),
          (async () => {
            if (!config.TWELVE_DATA_API_KEY) return;
            try {
              const others = catalog.filter((x) => x.category !== "crypto");
              const symbols = others.map((x) =>
                x.category === "forex"
                  ? x.base.slice(0, 3) + "/" + x.base.slice(3)
                  : x.symbol,
              );
              const data = await json(
                "https://api.twelvedata.com/quote?" +
                  new URLSearchParams({
                    symbol: symbols.join(","),
                    apikey: config.TWELVE_DATA_API_KEY,
                  }),
              );
              let count = 0;
              for (let j = 0; j < others.length; j++) {
                const d = data[symbols[j]];
                if (
                  !d ||
                  d.status === "error" ||
                  !Number.isFinite(+d.close) ||
                  +d.close <= 0
                )
                  continue;
                const i = rows.findIndex((x) => x.symbol === others[j].symbol);
                rows[i] = {
                  ...rows[i],
                  price: +d.close,
                  change: +d.percent_change || 0,
                  volume: (+d.volume || 0) * +d.close,
                  high: +d.high,
                  low: +d.low,
                  source: "live",
                  provider: "Twelve Data",
                  asOf: d.timestamp
                    ? new Date(+d.timestamp * 1000).toISOString()
                    : new Date(now).toISOString(),
                };
                count++;
              }
              status("Twelve Data", count > 0);
              log(
                count ? "INFO" : "WARN",
                `Twelve Data: обновлено ${count} котировок`,
              );
            } catch (e) {
              status("Twelve Data", false);
              warnings.push("Twelve Data недоступен");
              log("WARN", "Twelve Data: request failed; demo fallback");
            }
          })(),
        ]);
      }
      if (rows.some((x) => x.source === "demo"))
        warnings.push(
          "DEMO — синтетические данные; акции и индексы требуют ключ Twelve Data и доступного тарифа",
        );
      return {
        data: rows,
        asOf: new Date(now).toISOString(),
        warning: warnings.join(". ") || undefined,
      };
    },
  );
}
export async function candles(
  symbol: string,
  tf: CandleInterval,
  config: Config = {},
  force = false,
  count = DEFAULT_CANDLE_COUNT,
): Promise<CandleResponse> {
  // The short polling route fetches only the two newest candles. The public
  // history route still validates its own 300–4000 range below.
  if (!validCandleCount(count) && count !== 2)
    throw Error("Invalid candle count");
  const item = await resolveInstrument(symbol, config.DATA_MODE === "demo");
  return cached(
    `candles:${symbol}:${tf}:${count}:${config.DATA_MODE}:${!!config.TWELVE_DATA_API_KEY}`,
    count === 2 ? 2000 : 15000,
    force,
    async () => {
      const asOf = new Date().toISOString();
      let reason = "Демонстрационные свечи";
      if (config.DATA_MODE !== "demo")
        try {
          if (item.category === "crypto") {
            const endpoint = binanceEndpoint(symbol),
              { bars, warning } = await loadBinanceHistory(
                symbol,
                tf,
                count,
                json,
              );
            let tickSize: number | undefined;
            if (count !== 2)
              try {
                const info = await cached(
                  `tick:${endpoint.name}:${symbol}`,
                  3600000,
                  false,
                  () =>
                    json(
                      `${endpoint.root}${endpoint.path}/exchangeInfo${endpoint.name === "Binance Futures" ? "" : "?symbol=" + encodeURIComponent(upstreamSymbol(symbol))}`,
                    ),
                );
                const f = info.symbols
                  ?.find((s: any) => s.symbol === upstreamSymbol(symbol))
                  ?.filters?.find((f: any) => f.filterType === "PRICE_FILTER");
                if (f && Number.isFinite(+f.tickSize) && +f.tickSize > 0)
                  tickSize = +f.tickSize;
              } catch {
                /* History remains usable without exchange metadata. */
              }
            status(endpoint.name, true);
            log(
              "INFO",
              `${symbol} ${tf}: ${bars.length} свечей ${endpoint.name}`,
            );
            return {
              data: bars,
              instrument: item,
              source: "live",
              provider: endpoint.name,
              asOf,
              warning,
              tickSize,
            };
          }
          if (config.TWELVE_DATA_API_KEY) {
            const providerSymbol =
              item.category === "forex"
                ? symbol.slice(0, 3) + "/" + symbol.slice(3)
                : symbol;
            const data = await json(
              "https://api.twelvedata.com/time_series?" +
                new URLSearchParams({
                  symbol: providerSymbol,
                  interval: {
                    "15m": "15min",
                    "30m": "30min",
                    "2h": "2h",
                    "8h": "8h",
                    "12h": "12h",
                    "1h": "1h",
                    "4h": "4h",
                    "1d": "1day",
                  }[tf],
                  outputsize: String(count),
                  timezone: "UTC",
                  apikey: config.TWELVE_DATA_API_KEY,
                }),
            );
            if (!Array.isArray(data.values) || !data.values.length)
              throw Error("Empty response");
            const bars = data.values
              .map((d: any) => ({
                time:
                  Date.parse(
                    d.datetime.replace(" ", "T") +
                      (d.datetime.includes(":") ? "Z" : "T00:00:00Z"),
                  ) / 1000,
                open: +d.open,
                high: +d.high,
                low: +d.low,
                close: +d.close,
                volume: +d.volume || 0,
              }))
              .sort((a: any, b: any) => a.time - b.time);
            if (
              bars.some(
                (b: any) =>
                  !Number.isFinite(b.time) || !Number.isFinite(b.close),
              )
            )
              throw Error("Invalid candles");
            status("Twelve Data", true);
            log("INFO", `${symbol} ${tf}: ${bars.length} свечей Twelve Data`);
            return {
              data: bars,
              instrument: item,
              source: "live",
              provider: "Twelve Data",
              asOf,
              warning:
                bars.length < count
                  ? `Доступно ${bars.length} из ${count} свечей.`
                  : undefined,
            };
          }
          reason = "Для этого рынка нужен ключ Twelve Data";
        } catch (e) {
          reason = "Источник недоступен: показаны демонстрационные свечи";
          status(
            item.category === "crypto"
              ? binanceEndpoint(symbol).name
              : "Twelve Data",
            false,
          );
          log(
            "WARN",
            `${symbol} ${tf}: request failed${instrument(symbol) ? "; demo fallback" : ""}`,
          );
        }
      if (!instrument(symbol))
        throw new SymbolError("Котировки пары временно недоступны");
      return {
        instrument: item,
        data: demoCandles(
          item,
          tf,
          Date.parse(asOf),
          Math.max(count, 300),
        ).slice(-count),
        source: "demo",
        provider: "Demo",
        asOf,
        warning: reason,
      };
    },
  );
}
/** Shared Fetch API handler used by both Cloudflare and standalone Node. */
export async function handleApi(
  request: Request,
  config: Config = {},
): Promise<Response> {
  const u = new URL(request.url);
  if (u.pathname.startsWith("/api/coinglass/"))
    return handleCoinglass(request, config);
  if (request.method !== "GET")
    return Response.json(
      { error: "Method not allowed" },
      { status: 405, headers: { Allow: "GET" } },
    );
  const force = u.searchParams.get("refresh") === "1";
  try {
    let result: unknown;
    switch (u.pathname) {
      case "/api/symbols":
        result = await searchSymbols(
          u.searchParams.get("q") ?? "",
          u.searchParams.get("market") ?? "all",
          config.DATA_MODE === "demo",
        );
        break;
      case "/api/markets":
        result = await markets(config, force);
        break;
      case "/api/candles": {
        const symbol = u.searchParams.get("symbol") ?? "BTCUSDT";
        const tf = u.searchParams.get("interval") ?? "1h";
        const count = u.searchParams.has("count")
          ? Number(u.searchParams.get("count"))
          : DEFAULT_CANDLE_COUNT;
        if (!validCandleCount(count))
          return Response.json(
            { error: "count: целое число от 300 до 4000" },
            { status: 400 },
          );
        if (!Object.hasOwn(candleIntervals, tf))
          return Response.json(
            { error: "Неизвестный symbol или interval" },
            { status: 400 },
          );
        result = await candles(
          symbol,
          tf as CandleInterval,
          u.searchParams.get("demo") === "1"
            ? { ...config, DATA_MODE: "demo" }
            : config,
          force,
          count,
        );
        break;
      }
      case "/api/candles/latest": {
        const symbol = u.searchParams.get("symbol") ?? "BTCUSDT";
        const tf = u.searchParams.get("interval") ?? "1h";
        if (!Object.hasOwn(candleIntervals, tf))
          return Response.json(
            { error: "Неизвестный symbol или interval" },
            { status: 400 },
          );
        result = await candles(
          symbol,
          tf as CandleInterval,
          u.searchParams.get("demo") === "1"
            ? { ...config, DATA_MODE: "demo" }
            : config,
          force,
          2,
        );
        break;
      }
      case "/api/health":
        result = {
          status: "ok",
          uptime: Math.floor((Date.now() - started) / 1000),
          time: new Date().toISOString(),
          providers,
          cacheEntries: cache.size,
          mode: config.DATA_MODE ?? "auto",
          logScope: "current process / worker isolate",
        };
        break;
      case "/api/logs": {
        let remote: LogEntry[] = [];
        if (config.COINGLASS_SERVICE_URL)
          try {
            const events = await coinglassRequest("/events", config);
            remote = events.data.map((event: LogEntry) => ({
              ...event,
              id: -event.id,
            }));
          } catch {
            /* CoinGlass status panel reports the connection failure. */
          }
        result = {
          data: [...logs, ...remote]
            .sort((a, b) => a.time.localeCompare(b.time))
            .slice(-60),
          scope: "current process / worker isolate + CoinGlass service",
        };
        break;
      }
      default:
        return Response.json({ error: "Not found" }, { status: 404 });
    }
    return Response.json(result, {
      headers: {
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    if (error instanceof SymbolError)
      return Response.json(
        { error: error.message },
        { status: error.status, headers: { "Cache-Control": "no-store" } },
      );
    log("ERROR", "Internal API error");
    return Response.json(
      { error: "Внутренняя ошибка сервера" },
      { status: 500 },
    );
  }
}
