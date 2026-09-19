"use client";
import { useEffect, useState } from "react";

interface Result {
  symbol: string;
  base: string;
  quote: string;
  market: "spot" | "futures";
}
interface Results {
  data: Result[];
  total: number;
  warning?: string;
}
export function SymbolSearch({
  favorites,
  star,
  query,
  onQueryChange,
}: {
  query: string;
  onQueryChange: (query: string) => void;
  favorites: string[];
  star: (symbol: string) => void;
}) {
  const [market, setMarket] = useState("all");
  const [results, setResults] = useState<Results>();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    setResults(undefined);
    setError("");
    setLoading(!!query.trim());
    if (!query.trim()) return () => controller.abort();
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(
          `/api/symbols?q=${encodeURIComponent(query)}&market=${market}`,
          { signal: controller.signal },
        );
        const body = (await response.json()) as Results & { error?: string };
        if (!response.ok)
          throw new Error(body.error || `HTTP ${response.status}`);
        if (!controller.signal.aborted) setResults(body);
      } catch (e) {
        if (!controller.signal.aborted)
          setError(e instanceof Error ? e.message : "Поиск недоступен");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 300);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, market]);
  return (
    <div className="symbol-search">
      <div className="symbol-search-controls">
        <label>
          Найти инструмент
          <input
            type="search"
            value={query}
            maxLength={40}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="Например, BTC/USDC"
          />
        </label>
        <label>
          Рынок
          <select value={market} onChange={(e) => setMarket(e.target.value)}>
            <option value="all">Все рынки Binance</option>
            <option value="spot">Spot</option>
            <option value="futures">USDⓈ-M Perpetual</option>
          </select>
        </label>
      </div>
      <div role="status" aria-live="polite">
        {loading && <p>Поиск…</p>}
        {error && <p>{error}</p>}
        {results?.warning && <p>{results.warning}</p>}
        {results && (
          <p>
            {results.total
              ? `Найдено: ${results.total}${results.total > results.data.length ? ". Показаны первые 60 — уточните запрос." : ""}`
              : "Активные пары не найдены."}
          </p>
        )}
      </div>
      {results && results.data.length > 0 && (
        <ul className="symbol-search-results">
          {results.data.map((row) => (
            <li key={row.symbol}>
              <a href={`/pair/${encodeURIComponent(row.symbol)}`}>
                {row.base} / {row.quote}
                <small>
                  {row.market === "spot" ? "Spot" : "USDⓈ-M Perpetual"}
                </small>
              </a>
              <button
                type="button"
                aria-label={`Избранное: ${row.symbol}`}
                aria-pressed={favorites.includes(row.symbol)}
                onClick={() => star(row.symbol)}
              >
                {favorites.includes(row.symbol) ? "★" : "☆"}
              </button>
            </li>
          ))}
        </ul>
      )}
      <details className="symbol-search-favorites">
        <summary>Избранные пары ({favorites.length})</summary>
        <ul className="symbol-search-results">
          {favorites.map((symbol) => (
            <li key={symbol}>
              <a href={`/pair/${encodeURIComponent(symbol)}`}>
                {symbol.replace(/^(FUTURES|SPOT):/, "")}
                <small>
                  {symbol.startsWith("FUTURES:") || symbol === "HYPEUSDT"
                    ? "USDⓈ-M Perpetual"
                    : "Spot / другие рынки"}
                </small>
              </a>
              <button
                type="button"
                aria-label={`Удалить ${symbol} из избранного`}
                onClick={() => star(symbol)}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
        {!favorites.length && (
          <p>Добавьте пару кнопкой ☆ в результатах поиска.</p>
        )}
      </details>
    </div>
  );
}
