export type RsiPeriod = "4h" | "24h" | "1w";
export interface RsiRow {
  rank: number;
  sourceRank?: number;
  symbol: string;
  name?: string;
  logo?: string | null;
  marketCap?: number | null;
  price: number | null;
  change1h: number | null;
  change24h: number | null;
  rsi: number | null;
  priceChanges?: Partial<Record<RsiPeriod, number | null>>;
  rsiValues?: Partial<Record<RsiPeriod, number | null>>;
}
export function rsiRowsForPeriod(
  rows: RsiRow[],
  period: RsiPeriod,
  snapshotPeriod: RsiPeriod,
) {
  return rows
    .map((row) => ({
      ...row,
      rsi: row.rsiValues
        ? (row.rsiValues[period] ?? null)
        : period === snapshotPeriod
          ? row.rsi
          : null,
    }))
    .sort((a, b) => (a.sourceRank ?? a.rank) - (b.sourceRank ?? b.rank));
}
