export interface CoinglassParams {
  rangeDays: number;
  requestLimit: number;
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
  /** Pinned source per asset; selection parameters remain shared across instruments. */
  snapshotIds?: Record<string, string>;
}
export const coinglassDefaults: CoinglassParams = {
  rangeDays: 90,
  requestLimit: 1440,
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
    rangeDays: [1, 7, 30, 90, 180, 365].includes(p.rangeDays as number)
      ? (p.rangeDays as number)
      : 90,
    requestLimit: numeric("requestLimit", 1, 1440, true),
    snapshotIds: Object.fromEntries(
      Object.entries(
        p.snapshotIds && typeof p.snapshotIds === "object" ? p.snapshotIds : {},
      ).filter(
        ([asset, id]) =>
          /^[A-Z0-9]{1,20}$/.test(asset) &&
          typeof id === "string" &&
          /^[a-f0-9]{32}$/.test(id),
      ),
    ),
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
    rangeDays: p.rangeDays,
    requestLimit: p.requestLimit,
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
  snapshotId?: string;
  asset: string;
  rangeDays: number;
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

export interface CoinglassSnapshot {
  schemaVersion: 1;
  snapshotId: string;
  asset: string;
  currentPrice: number | string;
  collectedAt: string;
  rangeDays: number;
  requestLimit?: number;
  complete: boolean;
  precision: string;
  hoverMs: number;
  imageDataUrl?: string;
}
export interface CoinglassPoint extends LiquidationLevel {
  exchanges: Record<string, number | string>;
  side: string;
  isPeak: boolean;
  base: number;
  relativeHeight: number;
  relativeProminence: number;
  reasons: string[];
  rank: number | null;
  selected: boolean;
}
export interface CoinglassPreview {
  result: CoinglassResult;
  points: CoinglassPoint[];
  maximum: number;
  heightThreshold: number;
  prominenceThreshold: number;
}
export const selectionReasons: Record<string, string> = {
  not_peak: "Не локальный максимум (включая края карты)",
  plateau: "Плато: выбран его средний столбец",
  height: "Высота ниже порога",
  prominence: "Выраженность ниже порога",
  side: "Исключённая сторона",
  limit: "Прошёл фильтры, вне лимита",
};
export function selectionKey(
  symbol: string,
  snapshotId: string,
  p: CoinglassParams,
) {
  return JSON.stringify([
    symbol,
    snapshotId,
    p.minRelative,
    p.minProminence,
    p.limit,
    p.side,
  ]);
}
