import { type HeatmapRange } from "../domain/heatmap";
export interface HeatmapJob {
  state: "queued" | "running" | "done" | "error";
  message: string;
  params?: { range?: string };
  result?: { snapshotId: string; collectedAt: string };
}
interface Options {
  asset: string;
  selected: HeatmapRange;
  has: (range: HeatmapRange) => boolean;
  force: boolean;
  signal: AbortSignal;
  status: () => Promise<HeatmapJob | undefined>;
  start: (range: HeatmapRange) => Promise<void>;
  wait: () => Promise<void>;
  onJob: (job: HeatmapJob) => void;
  onLoaded: (range: HeatmapRange, id: string) => void;
}
/** One job per symbol is supported by the collector; the selected period takes priority. */
export async function loadHeatmapRanges(o: Options): Promise<void> {
  const longRanges = ["BTC", "ETH"].includes(o.asset.toUpperCase());
  if (!longRanges && (o.selected === "180d" || o.selected === "365d"))
    throw Error("Карты за 180 и 365 дней доступны только для BTC и ETH.");
  const background: HeatmapRange[] = longRanges ? ["14d", "30d", "180d", "365d"] : ["14d", "30d"];
  const ranges = [o.selected, ...background.filter(r => r !== o.selected)];
  for (const range of ranges) {
    if (o.signal.aborted) return;
    if (o.has(range) && !(o.force && range === o.selected)) continue;
    let current: HeatmapJob | undefined;
    for (let attempt = 0; attempt < 4; attempt++) {
      current = await o.status();
      while (current && ["queued", "running"].includes(current.state)) {
        if (o.signal.aborted) return;
        o.onJob(current); await o.wait(); if (o.signal.aborted) return;
        current = await o.status();
      }
      const collected = current?.result?.collectedAt ? Date.parse(current.result.collectedAt) : NaN;
      const fresh = Number.isFinite(collected) && Date.now() - collected >= 0 && Date.now() - collected < 15 * 60_000;
      if (current?.state === "done" && current.params?.range === range && current.result?.snapshotId && fresh && !(o.force && range === o.selected && attempt === 0)) break;
      await o.start(range);
      do {
        await o.wait(); if (o.signal.aborted) return;
        current = await o.status(); if (current) o.onJob(current);
      } while (!current || ["queued", "running"].includes(current.state));
      if (current.params?.range === range) break;
    }
    if (!current || current.state !== "done" || current.params?.range !== range || !current.result?.snapshotId) {
      const message = current?.message || "Не удалось загрузить карту";
      if (range === o.selected || /40000|50001|429|лимит запросов|авторизац|требуется вход/i.test(message)) throw Error(message);
      continue;
    }
    if (o.signal.aborted) return;
    o.onLoaded(range, current.result.snapshotId);
  }
}
