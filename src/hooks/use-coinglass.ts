"use client";
import { useEffect, useState } from "react";
import { useCoinglassPreview } from "./use-coinglass-preview";
import { useResource } from "./use-resource";
import type { IndicatorInstance } from "../domain/workspace";
import {
  calculationParams,
  coinglassParams,
  type CoinglassJob,
  type CoinglassOverlay,
  type CoinglassResult,
} from "../domain/coinglass";
import type { Timeframe } from "../domain/market";
export function useCoinglass(
  symbol: string,
  indicators: IndicatorInstance[],
  timeframe: Timeframe,
) {
  const instances = indicators.filter((i) => i.definitionId === "coinglass");
  const resource = useResource<{ job?: CoinglassJob }>(
    "/api/coinglass/status?symbol=" + encodeURIComponent(symbol),
    5000,
    instances.length > 0,
  );
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  async function run(instance: IndicatorInstance) {
    if (submitting) return;
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch("/api/coinglass/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol,
          params: calculationParams(coinglassParams(instance.params)),
        }),
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok)
        throw new Error(body.error || `HTTP ${response.status}`);
      await resource.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка запуска");
    } finally {
      setSubmitting(false);
    }
  }
  const job = resource.data?.job;
  const settings = coinglassParams(instances[0]?.params);
  const snapshotId = job?.asset
    ? (job.result?.snapshotId ?? settings.snapshotIds?.[job.asset])
    : undefined;
  const preview = useCoinglassPreview(
    symbol,
    snapshotId,
    settings,
    instances.length > 0,
  );
  const [lastResult, setLastResult] = useState<{
    symbol: string;
    result: CoinglassResult;
  }>();
  const freshResult = preview.data?.result;
  useEffect(() => {
    if (freshResult) setLastResult({ symbol, result: freshResult });
  }, [symbol, freshResult]);
  // Keep the displayed map until its replacement has loaded and recalculated.
  const result =
    freshResult ??
    (lastResult?.symbol === symbol ? lastResult.result : undefined) ??
    job?.result;
  const overlays: CoinglassOverlay[] = result
    ? instances
        .filter(
          (i) =>
            i.enabled && (!i.timeframes || i.timeframes.includes(timeframe)),
        )
        .map((i) => ({ id: i.id, result, params: coinglassParams(i.params) }))
    : [];
  return {
    instances,
    result,
    snapshotId,
    recalculating: preview.loading,
    retryPreview: preview.retry,
    job,
    overlays,
    error: error || preview.error || resource.error,
    submitting,
    loading: resource.loading,
    run,
  };
}
