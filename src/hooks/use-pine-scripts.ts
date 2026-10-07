"use client";
import { useEffect, useRef, useState } from "react";
import type { CandleResponse, Timeframe } from "../domain/market";
import type { IndicatorInstance } from "../domain/workspace";
import type { PineResult } from "../domain/pine-scripts";
export function usePineScripts(
  symbol: string,
  timeframe: Timeframe,
  candles: CandleResponse | undefined,
  indicators: IndicatorInstance[],
) {
  const signature = JSON.stringify(
    indicators
      .filter(
        (i) =>
          i.definitionId === "pine-script" &&
          i.enabled &&
          i.pine &&
          (!i.timeframes || i.timeframes.includes(timeframe)),
      )
      .map((i) => ({ id: i.id, script: i.pine! })),
  );
  const [state, setState] = useState<{
    results: PineResult[];
    errors: string[];
    loading: boolean;
  }>({ results: [], errors: [], loading: false });
  const previousScope = useRef("");
  useEffect(() => {
    const scripts = JSON.parse(signature) as {
      id: string;
      script: NonNullable<IndicatorInstance["pine"]>;
    }[];
    if (!candles?.data.length || !scripts.length) {
      setState({ results: [], errors: [], loading: false });
      return;
    }
    let disposed = false;
    const workers: Worker[] = [];
    const timers: ReturnType<typeof setTimeout>[] = [];
    const scope = symbol + timeframe + signature;
    const sameScope = previousScope.current === scope;
    previousScope.current = scope;
    setState((s) => ({
      results: sameScope ? s.results : [],
      loading: true,
      errors: [],
    }));
    void Promise.all(
      scripts.map(
        ({ id, script }) =>
          new Promise<{ result?: PineResult; error?: string }>((resolve) => {
            const worker = new Worker(
              new URL("../indicators/pine.worker.ts", import.meta.url),
              { type: "module" },
            );
            workers.push(worker);
            const finish = (value: { result?: PineResult; error?: string }) => {
              clearTimeout(timer);
              worker.terminate();
              resolve(value);
            };
            const timer = setTimeout(
              () =>
                finish({
                  error: `${script.name}: превышено время исполнения (10 сек.).`,
                }),
              10000,
            );
            timers.push(timer);
            worker.onerror = (e) =>
              finish({
                error: `${script.name}: ${e.message || "ошибка worker"}`,
              });
            worker.onmessage = (e) =>
              finish(
                e.data.error
                  ? { error: `${script.name}: ${e.data.error}` }
                  : { result: { ...e.data.result, id } },
              );
            worker.postMessage({
              script,
              bars: candles.data,
              symbol,
              timeframe,
            });
          }),
      ),
    )
      .then((results) => {
        if (!disposed)
          setState({
            results: results.flatMap((r) => (r.result ? [r.result] : [])),
            errors: results.flatMap((r) => (r.error ? [r.error] : [])),
            loading: false,
          });
      })
      .catch((error) => {
        if (!disposed)
          setState({ results: [], errors: [String(error)], loading: false });
      });
    return () => {
      disposed = true;
      timers.forEach(clearTimeout);
      workers.forEach((w) => w.terminate());
    };
  }, [symbol, timeframe, candles, signature]);
  return state;
}
