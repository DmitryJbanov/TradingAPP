"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useResource } from "./use-resource";
import { heatmapModel, heatmapParams, isHeatmapRange, parseHeatmap, type HeatmapRange } from "../domain/heatmap";
import type { IndicatorInstance } from "../domain/workspace";
import type { Timeframe } from "../domain/market";
import { loadHeatmapRanges, type HeatmapJob } from "./heatmap-loader";
export function useHeatmap(symbol: string, asset: string, indicators: IndicatorInstance[], timeframe: Timeframe) {
  const instance = indicators.find((i) => i.definitionId === "coinglass-heatmap");
  const longRanges = ["BTC", "ETH"].includes(asset.toUpperCase());
  const settings = useMemo(() => {
    const params = heatmapParams(instance?.params);
    return !longRanges && (params.range === "180d" || params.range === "365d") ? {...params, range: "90d" as const} : params;
  }, [instance?.params, longRanges]);
  const [snapshots, setSnapshots] = useState<Partial<Record<HeatmapRange, string>>>({});
  const cache = useRef<Partial<Record<HeatmapRange, string>>>({});
  const [job, setJob] = useState<HeatmapJob>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [generation, setGeneration] = useState(0);
  const forcedRange = useRef<HeatmapRange | undefined>(undefined);
  const currentSymbol = useRef(symbol);
  useEffect(() => { if (currentSymbol.current !== symbol) { currentSymbol.current = symbol; cache.current = {}; setSnapshots({}); setJob(undefined); setError(""); } }, [symbol]);
  const visible = !!instance?.enabled && (!instance.timeframes || instance.timeframes.includes(timeframe));
  useEffect(() => {
    if (!visible || !asset) return;
    const abort = new AbortController();
    const query = encodeURIComponent(symbol);
    const getStatus = async () => {
      const response = await fetch(`/api/coinglass/heatmap-status?symbol=${query}`, { signal: abort.signal });
      if (!response.ok) {
        const body = await response.json().catch(() => ({})) as {error?: string};
        throw Error(body.error || `Ошибка состояния карты: HTTP ${response.status}`);
      }
      return ((await response.json()) as {job?: HeatmapJob}).job;
    };
    const wait = () => new Promise<void>((resolve) => {
      const done = () => { clearTimeout(timer); abort.signal.removeEventListener("abort", done); resolve(); };
      const timer = setTimeout(done, 2500);
      abort.signal.addEventListener("abort", done, {once:true});
      if (abort.signal.aborted) done();
    });
    const work = async () => {
      setError(""); setBusy(true);
      try {
        const forceSelected = forcedRange.current === settings.range;
        forcedRange.current = undefined;
        await loadHeatmapRanges({
          asset, selected: settings.range, has: range => !!cache.current[range], force: forceSelected,
          signal: abort.signal, status: getStatus, wait, onJob: setJob,
          start: async range => {
            const response = await fetch("/api/coinglass/heatmap-run", {method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({symbol,params:{range}}),signal:abort.signal});
            if (!response.ok && response.status !== 409) {
              const body = await response.json().catch(() => ({})) as {error?: string};
              throw Error(body.error || `Ошибка запуска: HTTP ${response.status}`);
            }
          },
          onLoaded: (range, id) => {cache.current = {...cache.current,[range]:id}; setSnapshots(cache.current);},
        });
      } catch (e) { if (!abort.signal.aborted) setError(e instanceof Error ? e.message : "Ошибка загрузки карты"); }
      finally { if (!abort.signal.aborted) setBusy(false); }
    };
    void work();
    return () => abort.abort();
  }, [symbol, asset, timeframe, visible, settings.range, generation]);
  const snapshotId = currentSymbol.current === symbol ? snapshots[settings.range] : undefined;
  const snapshot = useResource<{snapshot: unknown}>(`/api/coinglass/heatmap-snapshot?symbol=${encodeURIComponent(symbol)}&snapshotId=${snapshotId ?? ""}`, 0, visible && !!snapshotId);
  const parsed = useMemo(() => {
    try { const data = snapshot.data ? parseHeatmap(snapshot.data.snapshot, asset) : undefined;
      return {data: data?.range === settings.range ? data : undefined, error:""};
    } catch (e) {return {data:undefined,error:e instanceof Error ? e.message : "Ошибка карты"};}
  }, [snapshot.data, asset, settings.range]);
  const data = parsed.data;
  const {scale, threshold, limit} = settings;
  const model = useMemo(() => data ? heatmapModel(data, {scale,threshold,limit}) : undefined, [data,scale,threshold,limit]);
  return {instance,settings,longRanges,model,data,visible,job,run:async () => {delete cache.current[settings.range]; setSnapshots({...cache.current}); forcedRange.current = settings.range; setGeneration(v=>v+1);},busy,error:error || parsed.error || (snapshotId ? snapshot.error : ""),loadedRanges:currentSymbol.current === symbol ? Object.keys(snapshots).filter(isHeatmapRange) : [],levels:visible && settings.showLevels ? model?.levels ?? [] : []};
}
