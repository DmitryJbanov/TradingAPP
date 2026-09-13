"use client";
import { useState } from "react";
import { useResource } from "./use-resource";
import type { IndicatorInstance } from "../domain/workspace";
import {
  calculationParams,
  coinglassParams,
  type CoinglassJob,
  type CoinglassOverlay,
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
  const overlays: CoinglassOverlay[] = job?.result
    ? instances
        .filter(
          (i) =>
            i.enabled && (!i.timeframes || i.timeframes.includes(timeframe)),
        )
        .map((i) => ({
          id: i.id,
          result: job.result!,
          params: coinglassParams(i.params),
        }))
    : [];
  return {
    instances,
    job,
    overlays,
    error: error || resource.error,
    submitting,
    loading: resource.loading,
    run,
  };
}
