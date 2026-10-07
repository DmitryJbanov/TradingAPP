"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import type { CandleResponse, Timeframe } from "../domain/market";
import type { IndicatorInstance } from "../domain/workspace";
import type { PineInstanceSettings, PineResult } from "../domain/pine-scripts";
import { createPineQueue } from "../indicators/pine-queue";

const PINE_EXECUTION_TIMEOUT_MS = 5 * 60 * 1000;
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
      .map((i) => ({
        id: i.id,
        script: i.pine!,
        inputs: (i.params as PineInstanceSettings | undefined)?.inputs ?? {},
      })),
  );
  const [state, setState] = useState<{
    results: PineResult[];
    errors: string[];
    loading: boolean;
  }>({ results: [], errors: [], loading: false });
  const previousScope = useRef("");
  const queueRef = useRef<ReturnType<
    typeof createPineQueue<CandleResponse>
  > | null>(null);
  const sourceScope = `${candles?.provider ?? ""}:${candles?.source === "demo"}`;
  useEffect(() => {
    const scripts = JSON.parse(signature) as {
      id: string;
      script: NonNullable<IndicatorInstance["pine"]>;
      inputs: Record<string, unknown>;
    }[];
    if (!scripts.length) {
      setState({ results: [], errors: [], loading: false });
      return;
    }
    let disposed = false;
    const abort = new AbortController();
    const cancellations = new Set<() => void>();
    const scope = symbol + timeframe + sourceScope;
    const sameScope = previousScope.current === scope;
    previousScope.current = scope;
    setState((s) => ({
      results: sameScope ? s.results : [],
      loading: true,
      errors: [],
    }));
    const queue = createPineQueue<CandleResponse>(async (candles) => {
      if (!candles.data.length) return;
      await (async () => {
        const needsSecurity = scripts.some(({ script }) =>
          /\brequest\s*\.\s*security\s*\(/i.test(
            script.source.replace(/\/\/[^\n]*/g, ""),
          ),
        );
        let higherTimeframeBars = candles.data;
        if (needsSecurity && timeframe !== "1d") {
          const demo = candles.source === "demo" ? "&demo=1" : "";
          const response = await fetch(
            `/api/candles?symbol=${encodeURIComponent(symbol)}&interval=1d&count=1000${demo}`,
            { signal: abort.signal },
          );
          if (!response.ok)
            throw Error(
              `Не удалось загрузить дневные свечи: HTTP ${response.status}.`,
            );
          const daily = (await response.json()) as CandleResponse;
          if (
            (daily.source === "demo") !== (candles.source === "demo") ||
            daily.provider !== candles.provider
          )
            throw Error(
              "Источник дневных свечей отличается от источника графика.",
            );
          higherTimeframeBars = daily.data;
        }
        return Promise.all(
          scripts.map(
            ({ id, script, inputs }) =>
              new Promise<{ result?: PineResult; error?: string }>(
                (resolve) => {
                  if (disposed) {
                    resolve({});
                    return;
                  }
                  if (
                    /\brequest\s*\.\s*security\s*\(/i.test(
                      script.source.replace(/\/\/[^\n]*/g, ""),
                    ) &&
                    needsSecurity &&
                    !higherTimeframeBars.length
                  ) {
                    resolve({
                      error: `${script.name}: нет дневных свечей для request.security().`,
                    });
                    return;
                  }
                  const worker = new Worker(
                    new URL("../indicators/pine.worker.ts", import.meta.url),
                    { type: "module" },
                  );
                  const finish = (value: {
                    result?: PineResult;
                    error?: string;
                  }) => {
                    cancellations.delete(cancel);
                    clearTimeout(timer);
                    worker.terminate();
                    resolve(value);
                  };
                  const timer = setTimeout(
                    () =>
                      finish({
                        error: `${script.name}: превышено время исполнения (5 мин.).`,
                      }),
                    PINE_EXECUTION_TIMEOUT_MS,
                  );
                  const cancel = () => finish({});
                  cancellations.add(cancel);
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
                    higherTimeframeBars,
                    mintick: candles.tickSize,
                    settings: { inputs },
                  });
                },
              ),
          ),
        );
      })()
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
    });
    queueRef.current = queue;
    return () => {
      disposed = true;
      queue.close();
      queueRef.current = null;
      abort.abort();
      cancellations.forEach((cancel) => cancel());
    };
  }, [symbol, timeframe, signature, sourceScope]);
  useEffect(() => {
    if (candles) void queueRef.current?.enqueue(candles);
  }, [candles, symbol, timeframe, signature, sourceScope]);
  const results = useMemo(
    () =>
      state.results.map((result) => {
        const instance = indicators.find((item) => item.id === result.id);
        const display =
          (instance?.params as PineInstanceSettings | undefined)?.display ?? {};
        const visible = (key: string) => display[key]?.visible !== false;
        const color = (key: string, fallback: string) =>
          display[key]?.color ?? fallback;
        const plots = result.plots.map((plot) => {
          const key = `plot:${plot.title}`;
          const style = display[key];
          return {
            ...plot,
            color: color(key, plot.color),
            width: style?.width ?? plot.width,
            style: style?.style ?? plot.style,
            visible: visible(key),
          };
        });
        return {
          ...result,
          plots,
          markers: result.markers.map((marker) => ({
            ...marker,
            color: color("markers", marker.color),
            visible: visible("markers"),
          })),
          drawings: {
            boxes: result.drawings.boxes.map((box) => ({
              ...box,
              visible: visible("boxes"),
              border_color: color(
                "boxes",
                String(box.border_color ?? "#99a5ff"),
              ),
            })),
            lines: result.drawings.lines.map((line) => ({
              ...line,
              visible: visible("lines"),
              color: color("lines", String(line.color ?? "#99a5ff")),
            })),
            labels: result.drawings.labels.map((label) => ({
              ...label,
              visible: visible("labels"),
              textcolor: color("labels", String(label.textcolor ?? "#ffffff")),
            })),
          },
        };
      }),
    [state.results, indicators],
  );
  return { ...state, results };
}
