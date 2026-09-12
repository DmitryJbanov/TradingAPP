import type { Candle, CandleResponse } from "./market";

/** Merge the short polling response into the initial history without gaps or mixed providers. */
export function mergeLatestCandles(
  history: CandleResponse | undefined,
  latest: CandleResponse | undefined,
  count: number,
  intervalSeconds: number,
): { response: CandleResponse | undefined; needsReload: boolean } {
  if (!history || !latest || !history.data.length || !latest.data.length)
    return { response: history, needsReload: false };
  if (Date.parse(latest.asOf) < Date.parse(history.asOf))
    return { response: history, needsReload: false };
  if (history.source !== latest.source || history.provider !== latest.provider)
    return { response: history, needsReload: true };

  const lastTime = history.data.at(-1)!.time;
  const additions = latest.data.filter((bar) => bar.time > lastTime);
  let expected = lastTime + intervalSeconds;
  for (const bar of additions) {
    if (bar.time !== expected) return { response: history, needsReload: true };
    expected += intervalSeconds;
  }
  const byTime = new Map<number, Candle>(
    history.data.map((bar) => [bar.time, bar]),
  );
  for (const bar of latest.data)
    if (bar.time >= history.data[0].time) byTime.set(bar.time, bar);
  return {
    response: {
      ...history,
      data: [...byTime.values()].sort((a, b) => a.time - b.time).slice(-count),
      asOf: latest.asOf,
      warning: latest.warning ?? history.warning,
    },
    needsReload: false,
  };
}
