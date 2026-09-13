export interface CoinglassParams {
  minRelative: number;
  minProminence: number;
  limit: number;
  side: "both" | "above" | "below";
  hoverMs: number;
  aboveColor: string;
  belowColor: string;
  lineWidth: number;
  showLabels: boolean;
  staleHours: number;
}
export const coinglassDefaults: CoinglassParams = {
  minRelative: 0.5,
  minProminence: 0.35,
  limit: 5,
  side: "both",
  hoverMs: 180,
  aboveColor: "#ef7185",
  belowColor: "#49d5ac",
  lineWidth: 2,
  showLabels: true,
  staleHours: 24,
};
export function coinglassParams(value: unknown): CoinglassParams {
  const p =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  const numeric = (
    key: keyof CoinglassParams,
    lo: number,
    hi: number,
    integer = false,
  ) =>
    typeof p[key] === "number" &&
    Number.isFinite(p[key]) &&
    (p[key] as number) >= lo &&
    (p[key] as number) <= hi &&
    (!integer || Number.isInteger(p[key]))
      ? (p[key] as number)
      : (coinglassDefaults[key] as number);
  const color = (key: "aboveColor" | "belowColor") =>
    typeof p[key] === "string" && /^#[0-9a-f]{6}$/i.test(p[key] as string)
      ? (p[key] as string)
      : coinglassDefaults[key];
  return {
    minRelative: numeric("minRelative", 0, 1),
    minProminence: numeric("minProminence", 0, 1),
    limit: numeric("limit", 1, 50, true),
    hoverMs: numeric("hoverMs", 50, 250, true),
    side: p.side === "above" || p.side === "below" ? p.side : "both",
    aboveColor: color("aboveColor"),
    belowColor: color("belowColor"),
    lineWidth: numeric("lineWidth", 1, 4, true),
    showLabels: typeof p.showLabels === "boolean" ? p.showLabels : true,
    staleHours: numeric("staleHours", 1, 720, true),
  };
}
export function calculationParams(p: CoinglassParams) {
  return {
    minRelative: p.minRelative,
    minProminence: p.minProminence,
    limit: p.limit,
    side: p.side,
    hoverMs: p.hoverMs,
  };
}
export interface LiquidationLevel {
  price: number;
  intensity: number;
  prominence: number;
  distancePercent: number;
}
export interface CoinglassResult {
  asset: string;
  rangeDays: 90;
  currentPrice: number;
  collectedAt: string;
  params: ReturnType<typeof calculationParams>;
  levels: LiquidationLevel[];
}
export interface CoinglassJob {
  id: string;
  asset: string;
  state: "queued" | "running" | "done" | "error";
  progress: number;
  message: string;
  updatedAt: string;
  result?: CoinglassResult;
  params: ReturnType<typeof calculationParams>;
}
export const jobState = {
  queued: "В очереди",
  running: "Парсинг",
  done: "Готово",
  error: "Ошибка",
};
export interface CoinglassOverlay {
  id: string;
  result: CoinglassResult;
  params: CoinglassParams;
}
