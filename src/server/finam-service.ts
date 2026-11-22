import {
  candleIntervals,
  type Candle,
  type CandleInterval,
  type CandleResponse,
  type Instrument,
  type MarketResponse,
  type Quote,
} from "../domain/market";
import { SymbolError } from "./symbol-service";

const root = "https://api.finam.ru";
const symbolPattern = /^[A-Z0-9._-]{1,40}@[A-Z0-9_]{2,8}$/;
const frames: Partial<Record<CandleInterval, [string, number]>> = {
  "1m": ["M1", 7],
  "5m": ["M5", 30],
  "15m": ["M15", 30],
  "30m": ["M30", 30],
  "1h": ["H1", 30],
  "2h": ["H2", 30],
  "4h": ["H4", 30],
  "8h": ["H8", 30],
  "1d": ["D", 365],
  "1w": ["W", 365 * 5],
};
type Asset = {
  symbol: string;
  ticker: string;
  mic: string;
  name: string;
  type: string;
  is_archived?: boolean;
};
type Fetch = typeof fetch;
type Decimal = { value?: string };
type FinamPayload = {
  token?: string;
  readonly?: boolean;
  expires_at?: string;
  assets?: Asset[];
  next_cursor?: string;
  bars?: { timestamp: string; open?: Decimal; high?: Decimal; low?: Decimal; close?: Decimal; volume?: Decimal }[];
  quote?: { last?: Decimal; open?: Decimal; high?: Decimal; low?: Decimal; volume?: Decimal; timestamp?: string };
};

export class FinamService {
  private token = "";
  private until = 0;
  private authentication?: Promise<string>;
  private assetsCache?: { value: Asset[]; until: number };
  private assetsPending?: Promise<Asset[]>;
  private catalogLoading = false;
  private catalogIncomplete = false;
  private quotes = new Map<string, { value: Quote; until: number }>();
  private barCache = new Map<
    string,
    { value: CandleResponse; until: number }
  >();
  private barPending = new Map<string, Promise<CandleResponse>>();
  private requestTimes = new Map<string, number[]>();
  constructor(
    private readonly secret: string,
    private readonly request: Fetch = fetch,
  ) {}

  private async json(path: string, init: RequestInit = {}) {
    const kind = path
      .replace(/^\/v1\/instruments\/[^/]+/, "/v1/instruments/*")
      .split("?")[0];
    const recent = (this.requestTimes.get(kind) ?? []).filter(
      (t) => t > Date.now() - 60_000,
    );
    if (recent.length >= 150)
      throw new SymbolError(
        "Превышен лимит запросов Финам; повторите позже",
        429,
      );
    recent.push(Date.now());
    this.requestTimes.set(kind, recent);
    let response: Response;
    try {
      response = await this.request(root + path, {
        ...init,
        signal: AbortSignal.timeout(15000),
      });
    } catch {
      throw new SymbolError("Финам временно недоступен", 503);
    }
    if (!response.ok)
      throw new SymbolError(
        response.status === 401
          ? "Ошибка авторизации Финам"
          : response.status === 429
            ? "Превышен лимит запросов Финам"
            : `Финам: HTTP ${response.status}`,
        response.status === 401 ? 503 : response.status,
      );
    return response.json() as Promise<FinamPayload>;
  }
  private async authenticate() {
    if (!this.secret)
      throw new SymbolError("Токен Финама не настроен на сервере", 503);
    if (this.token && Date.now() < this.until) return this.token;
    if (this.authentication) return this.authentication;
    this.authentication = (async () => {
      const { token } = await this.json("/v1/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ secret: this.secret }),
      });
      if (typeof token !== "string" || !token)
        throw new SymbolError("Финам не вернул токен сессии", 502);
      const details = await this.json("/v1/sessions/details", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      if (details.readonly !== true)
        throw new SymbolError(
          "Для Финама необходим токен только для чтения",
          403,
        );
      const expires = Date.parse(details.expires_at ?? "");
      this.token = token;
      this.until = Math.min(
        Date.now() + 10 * 60_000,
        Number.isFinite(expires) ? expires - 60_000 : Infinity,
      );
      return token;
    })().finally(() => {
      this.authentication = undefined;
    });
    return this.authentication;
  }
  private async get(path: string) {
    for (let attempt = 0; attempt < 2; attempt++) {
      const token = await this.authenticate();
      try {
        return await this.json(path, {
          headers: { Authorization: `Bearer ${token}` },
        });
      } catch (e) {
        if (
          attempt ||
          !(e instanceof SymbolError) ||
          e.message !== "Ошибка авторизации Финам"
        )
          throw e;
        this.token = "";
      }
    }
    throw new SymbolError("Ошибка авторизации Финам", 503);
  }
  async assets() {
    if (this.assetsCache && this.assetsCache.until > Date.now())
      return this.assetsCache.value;
    if (this.assetsPending) return this.assetsPending;
    this.assetsPending = (async () => {
      let data: FinamPayload;
      try {
        data = await this.get("/v1/assets");
        this.catalogIncomplete = false;
      } catch (error) {
        if (!(error instanceof SymbolError) || error.status < 500) throw error;
        data = await this.get("/v1/assets/all?only_active=true");
        this.catalogIncomplete = Boolean(data.next_cursor);
      }
      if (!Array.isArray(data.assets))
        throw new SymbolError("Финам вернул некорректный каталог", 502);
      const assets: Asset[] = data.assets.filter(
        (a: Asset) =>
          a &&
          typeof a.symbol === "string" &&
          symbolPattern.test(a.symbol) &&
          typeof a.ticker === "string" &&
          typeof a.mic === "string" &&
          !a.is_archived,
      );
      this.assetsCache = { value: assets, until: Date.now() + 3600_000 };
      if (data.next_cursor && this.catalogIncomplete && !this.catalogLoading)
        void this.loadRemainingAssets(data.next_cursor, assets);
      return assets;
    })().finally(() => {
      this.assetsPending = undefined;
    });
    return this.assetsPending;
  }
  private async loadRemainingAssets(cursor: string, assets: Asset[]) {
    this.catalogLoading = true;
    const seen = new Set(assets.map((a) => a.symbol));
    const cursors = new Set<string>();
    try {
      // ponytail: bound the fallback catalogue to 200 pages to cap memory and upstream work.
      while (cursor && !cursors.has(cursor) && cursors.size < 200) {
        cursors.add(cursor);
        await new Promise((resolve) => setTimeout(resolve, 1100));
        const params = new URLSearchParams({ only_active: "true", cursor });
        const page = await this.get(`/v1/assets/all?${params}`);
        if (!Array.isArray(page.assets)) throw new Error("Invalid catalog");
        for (const asset of page.assets) {
          if (asset && typeof asset.symbol === "string" && symbolPattern.test(asset.symbol) && typeof asset.ticker === "string" && typeof asset.mic === "string" && !asset.is_archived && !seen.has(asset.symbol)) {
            seen.add(asset.symbol);
            assets.push(asset);
          }
        }
        cursor = page.next_cursor ?? "";
      }
      this.catalogIncomplete = Boolean(cursor);
    } catch {
      this.catalogIncomplete = true;
    } finally {
      this.catalogLoading = false;
    }
  }
  private instrument(asset: Asset): Instrument {
    const type = String(asset.type ?? "").toLowerCase();
    return {
      symbol: `FINAM:${asset.symbol}`,
      base: asset.ticker,
      quote: "",
      name: asset.name || asset.ticker,
      category: /currency|forex/.test(type)
        ? "forex"
        : /index/.test(type)
          ? "indices"
          : "stocks",
      sector: asset.mic,
      seed: 0,
    };
  }
  async search(query: string) {
    const q = query.trim().toLocaleLowerCase("ru");
    if (q.length > 40)
      throw new SymbolError("Слишком длинный запрос поиска", 400);
    const matches = (await this.assets()).filter((a) =>
      `${a.symbol} ${a.name ?? ""}`.toLocaleLowerCase("ru").includes(q),
    );
    return {
      data: matches
        .slice(0, 60)
        .map((a) => ({ ...this.instrument(a), market: "finam" as const })),
      total: matches.length,
      ...(this.catalogIncomplete ? { warning: "Основной каталог Финама недоступен; альтернативный каталог загружается в фоне. Доступность инструмента зависит от вашего счёта." } : {}),
    };
  }
  private async asset(symbol: string) {
    const id = symbol.startsWith("FINAM:") ? symbol.slice(6) : "";
    if (!symbolPattern.test(id))
      throw new SymbolError("Некорректный инструмент Финама", 400);
    const asset = (await this.assets()).find((a) => a.symbol === id);
    if (!asset)
      throw new SymbolError("Инструмент отсутствует в каталоге Финама", 404);
    return asset;
  }
  async candles(
    symbol: string,
    interval: CandleInterval,
    count: number,
    before?: number,
  ): Promise<CandleResponse> {
    const key = `${symbol}:${interval}:${count}:${before ?? "latest"}`;
    const cached = this.barCache.get(key);
    if (cached && cached.until > Date.now()) return cached.value;
    const pending = this.barPending.get(key);
    if (pending) return pending;
    const task = this.loadCandles(symbol, interval, count, before)
      .then((value) => {
        if (this.barCache.size >= 150)
          this.barCache.delete(this.barCache.keys().next().value!);
        this.barCache.set(key, {
          value,
          until: Date.now() + (count === 2 ? 5000 : 30000),
        });
        return value;
      })
      .finally(() => this.barPending.delete(key));
    this.barPending.set(key, task);
    return task;
  }
  private async loadCandles(
    symbol: string,
    interval: CandleInterval,
    count: number,
    before?: number,
  ): Promise<CandleResponse> {
    const frame = frames[interval];
    if (!frame)
      throw new SymbolError(`Финам не поддерживает таймфрейм ${interval}`, 400);
    const asset = await this.asset(symbol);
    const now = Date.now(),
      end = Math.min(now, before === undefined ? now : (before + 1) * 1000);
    // Search the available history on initial load: trading sessions can have long gaps.
    const start =
      count === 2
        ? Math.max(
            now - frame[1] * 86400_000,
            end - 3 * candleIntervals[interval] * 1000,
          )
        : now - frame[1] * 86400_000 + 60_000;
    if (start >= end)
      throw new SymbolError("История за этот период недоступна у Финама", 404);
    const query = new URLSearchParams({
      timeframe: `TIME_FRAME_${frame[0]}`,
      "interval.start_time": new Date(start).toISOString(),
      "interval.end_time": new Date(end).toISOString(),
    });
    const data = await this.get(
      `/v1/instruments/${encodeURIComponent(asset.symbol)}/bars?${query}`,
    );
    if (!Array.isArray(data.bars))
      throw new SymbolError("Финам вернул некорректные свечи", 502);
    const byTime = new Map<number, Candle>();
    for (const bar of data.bars) {
      const item = {
        time: Math.floor(Date.parse(bar.timestamp) / 1000),
        open: Number(bar.open?.value),
        high: Number(bar.high?.value),
        low: Number(bar.low?.value),
        close: Number(bar.close?.value),
        volume: Number(bar.volume?.value),
      };
      if (
        Object.values(item).every(Number.isFinite) &&
        item.low > 0 &&
        item.volume >= 0 &&
        item.high >= Math.max(item.open, item.close) &&
        item.low <= Math.min(item.open, item.close)
      )
        byTime.set(item.time, item);
    }
    const bars = [...byTime.values()]
      .sort((a, b) => a.time - b.time)
      .slice(-count);
    if (!bars.length)
      throw new SymbolError("Финам не вернул свечи за выбранный период", 404);
    return {
      instrument: this.instrument(asset),
      data: bars,
      source: "live",
      exchange: "finam",
      provider: "Финам",
      asOf: new Date().toISOString(),
      ...(bars.length < count
        ? {
            warning: `Доступна неполная история: ${bars.length} из ${count} свечей.`,
          }
        : {}),
    };
  }
  async markets(symbols: string[]): Promise<MarketResponse> {
    const unique = [...new Set(symbols)]
      .filter((s) => s.startsWith("FINAM:"))
      .slice(0, 100);
    const data: Quote[] = [];
    // Bound fan-out to avoid exceeding Finam's per-method limit on shared pages.
    for (let i = 0; i < unique.length; i += 5) {
      const batch = await Promise.allSettled(
        unique.slice(i, i + 5).map(async (symbol) => {
          const cached = this.quotes.get(symbol);
          if (cached && cached.until > Date.now()) return cached.value;
          const asset = await this.asset(symbol);
          const result = await this.get(
            `/v1/instruments/${encodeURIComponent(asset.symbol)}/quotes/latest`,
          );
          const q = result.quote;
          const price = Number(q?.last?.value);
          if (!Number.isFinite(price) || price <= 0) return undefined;
          const open = Number(q?.open?.value),
            change =
              Number.isFinite(open) && open > 0
                ? (price / open - 1) * 100
                : NaN;
          const quote: Quote = {
            ...this.instrument(asset),
            price,
            change,
            volume: Number(q?.volume?.value) || 0,
            high: Number(q?.high?.value) || price,
            low: Number(q?.low?.value) || price,
            source: "live",
            provider: "Финам",
            asOf: q?.timestamp || new Date().toISOString(),
          };
          this.quotes.set(symbol, { value: quote, until: Date.now() + 30_000 });
          return quote;
        }),
      );
      for (const item of batch)
        if (item.status === "fulfilled" && item.value) data.push(item.value);
    }
    return { data, asOf: new Date().toISOString() };
  }
}
let instance: FinamService | undefined;
let configuredSecret = "";
export function finamService(secret?: string) {
  const value = secret ?? "";
  if (!instance || value !== configuredSecret) {
    configuredSecret = value;
    instance = new FinamService(value);
  }
  return instance;
}
