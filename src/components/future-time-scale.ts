import type { IChartApi, ISeriesApi, LogicalRange, UTCTimestamp } from "lightweight-charts";

/** Supply dates throughout the visible future without adding candles or prices. */
export function bindFutureTimeScale(
  chart: IChartApi,
  axis: ISeriesApi<"Line">,
  lastTime: number,
  interval: number,
) {
  const scale = chart.timeScale();
  let count = 0;
  function extend(range: LogicalRange | null) {
    const lastIndex = scale.timeToIndex(lastTime as UTCTimestamp);
    const needed = Math.max(128, Math.ceil((range?.to ?? 0) - (lastIndex ?? 0)) + 2);
    if (!Number.isFinite(needed) || needed <= count) return;
    count = Math.ceil(needed / 128) * 128;
    axis.setData(Array.from({ length: count }, (_, index) => ({
      time: (lastTime + interval * (index + 1)) as UTCTimestamp,
    })));
    if (range) scale.setVisibleLogicalRange(range);
  }
  extend(scale.getVisibleLogicalRange());
  scale.subscribeVisibleLogicalRangeChange(extend);
  return () => scale.unsubscribeVisibleLogicalRangeChange(extend);
}
