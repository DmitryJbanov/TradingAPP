import type { Candle, CandleResponse } from "../domain/market";
// One LRU entry owns all cached timeframes and calculations for a pair.
const pairs = new Map<string, Map<string, { value: unknown; at: number }>>();
const scopes = new WeakMap<Candle[], string>();
const fingerprints = new WeakMap<Candle[], string>();
export function clearPairCache() {
  pairs.clear();
}
function normalizePair(pair: string) {
  return pair.replace(/^FUTURES:/, "");
}
function bucket(pair: string) {
  pair = normalizePair(pair);
  let values = pairs.get(pair);
  if (!values) values = new Map();
  pairs.delete(pair);
  pairs.set(pair, values);
  while (pairs.size > 10) pairs.delete(pairs.keys().next().value!);
  return values;
}
export function cachedPairValue<T>(
  pair: string,
  key: string,
  maxAge = Infinity,
): T | undefined {
  pair = normalizePair(pair);
  const values = pairs.get(pair);
  const hit = values?.get(key);
  if (!hit || Date.now() - hit.at > maxAge) return undefined;
  bucket(pair);
  values!.delete(key);
  values!.set(key, hit);
  return hit.value as T;
}
export function savePairValue(pair: string, key: string, value: unknown) {
  const values = bucket(pair);
  values.delete(key);
  values.set(key, { value, at: Date.now() });
  while (values.size > 48) values.delete(values.keys().next().value!);
}
export function candleCachePair(url: string) {
  if (!url.startsWith("/api/candles?") || url.includes("refresh=1"))
    return undefined;
  return new URL(url, "http://local").searchParams.get("symbol") ?? undefined;
}
export function saveCandles(url: string, value: CandleResponse) {
  const pair = candleCachePair(url);
  if (!pair) return;
  scopes.set(value.data, pair);
  savePairValue(pair, url, value);
}
export async function fetchCandles(
  url: string,
  options?: RequestInit,
): Promise<Response> {
  const pair = candleCachePair(url);
  const cached = pair && cachedPairValue<CandleResponse>(pair, url, 60000);
  if (cached && !options?.signal?.aborted) return Response.json(cached);
  const response = await fetch(url, options);
  if (pair && response.ok && !options?.signal?.aborted)
    saveCandles(url, await response.clone().json());
  return response;
}
export function candleFingerprint(bars: Candle[]) {
  const existing = fingerprints.get(bars);
  if (existing) return existing;
  // Hash every OHLCV field, including historical corrections, once per immutable array.
  let hash = 2166136261,
    other = 5381;
  const value = JSON.stringify(bars);
  for (let i = 0; i < value.length; i++) {
    hash = Math.imul(hash ^ value.charCodeAt(i), 16777619);
    other = Math.imul(other, 33) ^ value.charCodeAt(i);
  }
  const key = bars.length + ":" + (hash >>> 0) + ":" + (other >>> 0);
  fingerprints.set(bars, key);
  return key;
}
export function calculationKey(main: CandleResponse, timeframe: string) {
  return [
    main.provider,
    main.exchange,
    main.source === "demo",
    timeframe,
    main.tickSize,
    candleFingerprint(main.data),
  ].join(":");
}
export function cachedCompute<T>(
  main: CandleResponse | undefined,
  timeframe: string,
  name: string,
  params: unknown,
  calculate: () => T,
  histories: Partial<Record<string, Candle[]>> = {},
): T {
  if (!main) return calculate();
  const pair = scopes.get(main.data) ?? main.instrument?.symbol;
  if (!pair) return calculate();
  const key =
    "compute:" +
    calculationKey(main, timeframe) +
    ":" +
    name +
    ":" +
    JSON.stringify(params) +
    ":" +
    JSON.stringify(
      Object.entries(histories).map(([tf, bars]) => [
        tf,
        candleFingerprint(bars!),
      ]),
    );
  const cached = cachedPairValue<T>(pair, key);
  if (cached !== undefined) return cached;
  const result = calculate();
  savePairValue(pair, key, result);
  return result;
}
