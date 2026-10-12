import type { Candle } from "../domain/market";

export function computeMtm(
  bars: Candle[],
  params: { period?: number; maPeriod?: number } = {},
) {
  const period = Math.max(1, Math.min(100, params.period || 60));
  const maPeriod = Math.max(1, Math.min(100, params.maPeriod || 60));
  const values = bars.map((bar, index) =>
    index >= period ? bar.close - bars[index - period].close : null,
  );
  return bars.flatMap((bar, index) => {
    const value = values[index];
    if (value === null) return [];
    const window = values
      .slice(Math.max(period, index - maPeriod + 1), index + 1)
      .filter((x): x is number => x !== null);
    return [{
      time: bar.time,
      value,
      average: window.reduce((sum, x) => sum + x, 0) / window.length,
    }];
  });
}
