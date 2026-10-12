"use client";
import {
  cachedPairValue,
  savePairValue,
  calculationKey,
  fetchCandles,
} from "./pair-cache";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  candleIntervals,
  type Candle,
  type CandleResponse,
  type Timeframe,
} from "../domain/market";
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
    const workers = new Map<string, Worker>();
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
      const cacheKey =
        "pine:" + calculationKey(candles, timeframe) + ":" + signature;
      const cached = cachedPairValue<{
        results: PineResult[];
        errors: string[];
        loading: boolean;
      }>(
        symbol,
        cacheKey,
        /\b(?:request\s*\.\s*)?security\s*\(/.test(signature)
          ? 60000
          : Infinity,
      );
      if (cached) {
        if (!disposed) setState(cached);
        return;
      }
      await (async () => {
        const needsSecurity = scripts.some(({ script }) =>
          /\b(?:request\s*\.\s*)?security\s*\(/i.test(
            script.source.replace(/\/\/[^\n]*/g, ""),
          ),
        );
        let higherTimeframeBars = candles.data;
        const securityBars: Partial<Record<Timeframe, Candle[]>> = {};
        if (needsSecurity) {
          const requestedMinutes = scripts
            .flatMap(({ script, inputs }) => [
              ...Array.from(
                script.source.matchAll(
                  /\b(?:input(?:\.(?:string|timeframe))?\s*\(|(?:request\.)?security\s*\([^,]+,)\s*['"](\d+)['"]/g,
                ),
                (m) => Number(m[1]),
              ),
              ...Object.values(inputs)
                .filter((v) => typeof v === "string" && /^\d+$/.test(v))
                .map(Number),
            ])
            .filter((minutes) => minutes > 0);
          const minimum = Math.min(...requestedMinutes) * 60;
          const lower = Object.entries(candleIntervals)
            .filter(([, seconds]) => seconds <= minimum)
            .sort((a, b) => b[1] - a[1])[0];
          if (lower && lower[1] < candleIntervals[timeframe]) {
            const [interval, seconds] = lower;
            const count = Math.min(
              12000,
              Math.ceil(
                (candles.data.at(-1)!.time - candles.data[0].time) / seconds,
              ) + 300,
            );
            const response = await fetchCandles(
              `/api/candles?symbol=${encodeURIComponent(symbol)}&interval=${interval}&count=${count}${candles.source === "demo" ? "&demo=1" : ""}${candles.exchange ? `&exchange=${candles.exchange}` : ""}`,
              { signal: abort.signal },
            );
            if (!response.ok)
              throw Error(
                `Не удалось загрузить свечи ${interval}: HTTP ${response.status}.`,
              );
            const lowerData = (await response.json()) as CandleResponse;
            if (
              lowerData.provider !== candles.provider ||
              (lowerData.source === "demo") !== (candles.source === "demo")
            )
              throw Error(
                "Источник свечей request.security() отличается от источника графика.",
              );
            securityBars[interval as Timeframe] = lowerData.data;
          }
        }
        if (needsSecurity && timeframe !== "1d") {
          const demo = candles.source === "demo" ? "&demo=1" : "";
          const response = await fetchCandles(
            `/api/candles?symbol=${encodeURIComponent(symbol)}&interval=1d&count=1000${demo}${candles.exchange ? `&exchange=${candles.exchange}` : ""}`,
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
                  let worker = workers.get(id);
                  if (!worker) {
                    worker = new Worker(
                      new URL("../indicators/pine.worker.ts", import.meta.url),
                      { type: "module" },
                    );
                    workers.set(id, worker);
                  }
                  const activeWorker = worker;
                  let settled = false;
                  const finish = (
                    value: {
                      result?: PineResult;
                      error?: string;
                    },
                    terminate = false,
                  ) => {
                    if (settled) return;
                    settled = true;
                    cancellations.delete(cancel);
                    clearTimeout(timer);
                    activeWorker.onmessage = null;
                    activeWorker.onerror = null;
                    if (terminate) {
                      activeWorker.terminate();
                      workers.delete(id);
                    }
                    resolve(value);
                  };
                  const timer = setTimeout(
                    () =>
                      finish(
                        {
                          error: `${script.name}: превышено время исполнения (5 мин.).`,
                        },
                        true,
                      ),
                    PINE_EXECUTION_TIMEOUT_MS,
                  );
                  const cancel = () => finish({}, true);
                  cancellations.add(cancel);
                  worker.onerror = (e) =>
                    finish(
                      {
                        error: `${script.name}: ${e.message || "ошибка worker"}`,
                      },
                      true,
                    );
                  worker.onmessage = (e) =>
                    finish(
                      e.data.error
                        ? { error: `${script.name}: ${e.data.error}` }
                        : { result: { ...e.data.result, id } },
                      !!e.data.error,
                    );
                  worker.postMessage({
                    script,
                    bars: candles.data,
                    symbol,
                    timeframe,
                    higherTimeframeBars,
                    mintick: candles.tickSize,
                    settings: { inputs },
                    securityBars,
                  });
                },
              ),
          ),
        );
      })()
        .then((results) => {
          if (!disposed) {
            const next = {
              results: results.flatMap((r) => (r.result ? [r.result] : [])),
              errors: results.flatMap((r) => (r.error ? [r.error] : [])),
              loading: false,
            };
            if (!next.errors.length) savePairValue(symbol, cacheKey, next);
            setState(next);
          }
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
      workers.forEach((worker) => worker.terminate());
      workers.clear();
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
          visuals: result.visuals?.map((visual) => {
            const key = ["shape", "char"].includes(visual.kind)
              ? "markers"
              : "plot:" + visual.title;
            const override = display[key];
            return {
              ...visual,
              visible: visible(key),
              kind: override?.style ?? visual.kind,
              options: {
                ...visual.options,
                ...(override?.width ? { linewidth: override.width } : {}),
                ...(override?.color ? { color: override.color } : {}),
              },
              points: visual.points.map((point) => ({
                ...point,
                options: {
                  ...point.options,
                  ...(override?.color ? { color: override.color } : {}),
                },
              })),
            };
          }),
          markers: result.markers.map((marker) => ({
            ...marker,
            color: color("markers", marker.color),
            visible: visible("markers"),
          })),
          drawings: {
            ...result.drawings,
            polylines: result.drawings.polylines?.map((item) => ({
              ...item,
              visible: visible("polylines"),
              line_color: color(
                "polylines",
                String(item.line_color ?? "#2962ff"),
              ),
            })),
            linefills: result.drawings.linefills?.map((item) => ({
              ...item,
              visible: visible("linefills"),
              color: color("linefills", String(item.color ?? "#2962ff")),
            })),
            tables: result.drawings.tables?.map((item) => ({
              ...item,
              visible: visible("tables"),
              bgcolor: color("tables", String(item.bgcolor ?? "transparent")),
            })),
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
