"use client";
import { useEffect, useRef, useState } from "react";
import {
  candleIntervals,
  type CandleResponse,
  type Timeframe,
} from "../domain/market";
import type { IndicatorInstance } from "../domain/workspace";
import type { PineInstanceSettings, PineResult } from "../domain/pine-scripts";
import {
  cachedPairValue,
  calculationKey,
  fetchCandles,
  savePairValue,
} from "./pair-cache";
export const strategyFrames = ["15m", "1h", "4h"] as const;
export type StrategyRun = {
  id: string;
  name: string;
  timeframe: Timeframe;
  state: "loading" | "done" | "error";
  result?: PineResult;
  error?: string;
  warning?: string;
  from?: number;
  to?: number;
  bars?: number;
};
export function useStrategyBacktest(
  indicators: IndicatorInstance[],
  symbol: string,
  exchange: string,
  source: string | undefined,
  provider: string | undefined,
  start: number,
  end: number,
  token: number,
) {
  const signature = JSON.stringify(
    indicators
      .filter((i) => i.enabled && i.pine?.kind === "strategy")
      .map((i) => ({
        id: i.id,
        script: i.pine!,
        inputs: (i.params as PineInstanceSettings | undefined)?.inputs ?? {},
      })),
  );
  const [runs, setRuns] = useState<StrategyRun[]>([]);
  const stop = useRef<() => void>(() => {});
  useEffect(() => {
    const scripts = JSON.parse(signature) as {
      id: string;
      script: NonNullable<IndicatorInstance["pine"]>;
      inputs: Record<string, unknown>;
    }[];
    if (!scripts.length) {
      setRuns([]);
      return;
    }
    if (!source) {
      setRuns([]);
      return;
    }
    if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end) {
      setRuns([]);
      return;
    }
    let disposed = false;
    const abort = new AbortController();
    const active = new Set<Worker>();
    stop.current = () => {
      disposed = true;
      abort.abort();
      active.forEach((w) => w.terminate());
      active.clear();
      setRuns((current) =>
        current.map((r) =>
          r.state === "loading"
            ? { ...r, state: "error", error: "Расчёт остановлен" }
            : r,
        ),
      );
    };
    const patch = (
      id: string,
      timeframe: Timeframe,
      change: Partial<StrategyRun>,
    ) => {
      if (!disposed)
        setRuns((current) =>
          current.map((r) =>
            r.id === id && r.timeframe === timeframe ? { ...r, ...change } : r,
          ),
        );
    };
    setRuns(
      scripts.flatMap((s) =>
        strategyFrames.map((timeframe) => ({
          id: s.id,
          name: s.script.name,
          timeframe,
          state: "loading" as const,
        })),
      ),
    );
    const cutoff = Math.min(end, Math.floor(Date.now() / 1000));
    const load = async (tf: Timeframe) => {
      const count = Math.max(
        300,
        Math.min(
          12000,
          Math.ceil((Date.now() / 1000 - start) / candleIntervals[tf]) + 500,
        ),
      );
      const response = await fetchCandles(
        "/api/candles?" +
          new URLSearchParams({
            symbol,
            interval: tf,
            count: String(count),
            exchange,
            ...(source === "demo" ? { demo: "1" } : {}),
          }),
        { signal: abort.signal },
      );
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        throw Error(
          body.error || "Не удалось загрузить свечи: HTTP " + response.status,
        );
      }
      const data = (await response.json()) as CandleResponse;
      if (
        (data.source === "demo") !== (source === "demo") ||
        (provider && data.provider !== provider)
      )
        throw Error("Источник свечей теста отличается от источника графика");
      const bars = data.data.filter(
        (b) => b.time + candleIntervals[tf] <= cutoff,
      );
      return { ...data, data: bars };
    };
    const histories = new Map<Timeframe, Promise<CandleResponse>>();
    const history = (tf: Timeframe) => {
      let p = histories.get(tf);
      if (!p) {
        p = load(tf);
        histories.set(tf, p);
      }
      return p;
    };
    // At most three workers; each timeframe runs its strategies sequentially.
    for (const timeframe of strategyFrames)
      void (async () => {
        let candles: CandleResponse;
        try {
          candles = await history(timeframe);
        } catch (error) {
          for (const s of scripts)
            patch(s.id, timeframe, { state: "error", error: String(error) });
          return;
        }
        const first = candles.data.find((b) => b.time >= start),
          last = candles.data.at(-1);
        if (!first || !last || last.time <= first.time) {
          for (const s of scripts)
            patch(s.id, timeframe, {
              state: "error",
              error:
                "Нет свечей в выбранном периоде. Выберите более позднее начало или другой конец.",
            });
          return;
        }
        const periodBars = candles.data.filter((b) => b.time >= start).length;
        const warning =
          candles.data[0]?.time > start
            ? "Доступна только часть выбранного периода; начало истории " +
              new Date(first.time * 1000).toLocaleString("ru-RU")
            : (first.time - candles.data[0].time) / candleIntervals[timeframe] <
                100
              ? "Недостаточно истории для полного прогрева индикаторов"
              : undefined;
        for (const s of scripts) {
          if (disposed) return;
          const key =
            "backtest:v1:" +
            s.id +
            ":" +
            JSON.stringify(s.script) +
            ":" +
            JSON.stringify(s.inputs) +
            ":" +
            start +
            ":" +
            end +
            ":" +
            calculationKey(candles, timeframe);
          try {
            let result = cachedPairValue<PineResult>(symbol, key, 60000);
            if (!result) {
              const security = /\b(?:request\s*\.\s*)?security\s*\(/i.test(
                s.script.source.replace(/\/\/[^\n]*/g, ""),
              );
              const securityBars: Partial<
                Record<Timeframe, CandleResponse["data"]>
              > = {};
              let higherTimeframeBars = candles.data;
              if (security) {
                const requests = [
                  ...s.script.source.matchAll(
                    /(?:input(?:\.(?:string|timeframe))?\s*\(|(?:request\.)?security\s*\([^,]+,)\s*['"](\d+)['"]/g,
                  ),
                ].map((m) => Number(m[1]));
                const minutes = [
                  ...requests,
                  ...Object.values(s.inputs)
                    .filter((v) => typeof v === "string" && /^\d+$/.test(v))
                    .map(Number),
                ];
                const lowest = Math.min(...minutes) * 60;
                const lower = Object.entries(candleIntervals)
                  .filter(
                    ([tf, seconds]) =>
                      !["8h", "12h"].includes(tf) &&
                      seconds <= lowest &&
                      seconds < candleIntervals[timeframe],
                  )
                  .sort((a, b) => b[1] - a[1])[0]?.[0] as Timeframe | undefined;
                const frames = ["1d" as Timeframe, ...(lower ? [lower] : [])];
                for (const tf of [...new Set(frames)]) {
                  const data = await history(tf);
                  securityBars[tf] = data.data;
                  if (tf === "1d") higherTimeframeBars = data.data;
                }
              }
              if (disposed) return;
              result = await new Promise<PineResult>((resolve, reject) => {
                const worker = new Worker(
                  new URL("../indicators/pine.worker.ts", import.meta.url),
                  { type: "module" },
                );
                active.add(worker);
                let settled = false;
                const finish = (error?: Error, value?: PineResult) => {
                  if (settled) return;
                  settled = true;
                  clearTimeout(timer);
                  abort.signal.removeEventListener("abort", cancel);
                  worker.terminate();
                  active.delete(worker);
                  if (error) reject(error);
                  else resolve({ ...value!, id: s.id });
                };
                const cancel = () => finish(new Error("Расчёт отменён"));
                const timer = setTimeout(
                  () => finish(new Error("Превышено время расчёта: 5 минут")),
                  5 * 60000,
                );
                abort.signal.addEventListener("abort", cancel, { once: true });
                worker.onerror = (e) =>
                  finish(new Error(e.message || "Ошибка расчёта"));
                worker.onmessage = (e) =>
                  e.data.error
                    ? finish(new Error(e.data.error))
                    : finish(undefined, e.data.result);
                worker.postMessage({
                  script: s.script,
                  bars: candles.data,
                  symbol,
                  timeframe,
                  higherTimeframeBars,
                  mintick: candles.tickSize,
                  settings: { inputs: s.inputs },
                  securityBars,
                  backtestPeriod: { start, end: cutoff },
                });
              });
              if (!result.strategy)
                throw Error("Скрипт не вернул результат стратегии");
              if (!disposed) savePairValue(symbol, key, result);
            }
            patch(s.id, timeframe, {
              state: "done",
              result,
              from: first.time,
              to: last.time + candleIntervals[timeframe],
              bars: periodBars,
              warning,
            });
          } catch (error) {
            if (!disposed)
              patch(s.id, timeframe, {
                state: "error",
                error: error instanceof Error ? error.message : String(error),
              });
          }
        }
      })();
    return () => {
      disposed = true;
      abort.abort();
      active.forEach((w) => w.terminate());
      active.clear();
    };
  }, [signature, symbol, exchange, source, provider, start, end, token]);
  const cancel = () => stop.current();
  return { runs, cancel, signature };
}
