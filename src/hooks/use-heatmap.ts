"use client";
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { useResource } from "./use-resource";
import { heatmapModel, heatmapParams, parseHeatmap } from "../domain/heatmap";
import type { IndicatorInstance } from "../domain/workspace";
import type { Timeframe } from "../domain/market";

interface HeatmapJob {
  state: "queued" | "running" | "done" | "error";
  message: string;
  result?: { snapshotId: string; collectedAt: string };
}
export function useHeatmap(
  symbol: string,
  asset: string,
  indicators: IndicatorInstance[],
  timeframe: Timeframe,
) {
  const instance = indicators.find(
    (i) => i.definitionId === "coinglass-heatmap",
  );
  const status = useResource<{ job?: HeatmapJob }>(
    `/api/coinglass/heatmap-status?symbol=${encodeURIComponent(symbol)}`,
    5000,
    !!instance,
  );
  const id = status.data?.job?.result?.snapshotId;
  const snapshot = useResource<{ snapshot: unknown }>(
    `/api/coinglass/heatmap-snapshot?symbol=${encodeURIComponent(symbol)}&snapshotId=${id ?? ""}`,
    0,
    !!instance && !!id,
  );
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const activeSymbol = useRef(symbol);
  useLayoutEffect(() => {
    activeSymbol.current = symbol;
    return () => {
      activeSymbol.current = "";
    };
  }, [symbol]);
  const parsed = useMemo(() => {
    try {
      return {
        data: snapshot.data
          ? parseHeatmap(snapshot.data.snapshot, asset)
          : undefined,
        error: "",
      };
    } catch (e) {
      return { data: undefined, error: (e as Error).message };
    }
  }, [snapshot.data, asset]);
  const settings = useMemo(
    () => heatmapParams(instance?.params),
    [instance?.params],
  );
  const model = useMemo(
    () => (parsed.data ? heatmapModel(parsed.data, settings) : undefined),
    [parsed.data, settings],
  );
  const visible =
    !!instance?.enabled &&
    (!instance.timeframes || instance.timeframes.includes(timeframe));
  async function run() {
    if (submitting) return;
    const requestedSymbol = symbol;
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch("/api/coinglass/heatmap-run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol, params: { range: settings.range } }),
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) throw Error(body.error || "Ошибка сбора карты");
      if (activeSymbol.current !== requestedSymbol) return;
      await status.refresh();
    } catch (e) {
      if (activeSymbol.current === requestedSymbol)
        setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }
  return {
    instance,
    settings,
    model,
    data: parsed.data,
    visible,
    job: status.data?.job,
    run,
    busy:
      submitting ||
      ["queued", "running"].includes(status.data?.job?.state ?? ""),
    error:
      error ||
      parsed.error ||
      (!parsed.data ? snapshot.error || status.error : ""),
    levels: visible && settings.showLevels ? (model?.levels ?? []) : [],
  };
}
