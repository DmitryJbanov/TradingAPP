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
  volumeColors: [string, string, string, string, string, string];
  volumeOpacities: [number, number, number, number, number, number];
  showLevels: boolean;
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
  volumeColors: ["#14192d", "#26306e", "#5a2396", "#be2d4b", "#f57823", "#ffe146"],
  volumeOpacities: [5, 6, 25, 23, 27, 44],
  showLevels: true,
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
  const savedVolumeColors =
    Array.isArray(p.volumeColors) && p.volumeColors.length === 6
      ? p.volumeColors
      : [];
  const volumeColors = coinglassDefaults.volumeColors.map((fallback, index) => {
    const value = savedVolumeColors[index];
    return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value)
      ? value
      : fallback;
  }) as CoinglassParams["volumeColors"];
  const legacyOpacity =
    typeof p.opacity === "number" && Number.isFinite(p.opacity)
      ? Math.max(0, Math.min(100, p.opacity))
      : coinglassDefaults.volumeOpacities[0];
  const savedVolumeOpacities = Array.isArray(p.volumeOpacities)
    ? p.volumeOpacities
    : [];
  const migratedDefaultOpacities =
    (savedVolumeOpacities.length === 6 &&
      (savedVolumeOpacities.every((value) => value === 72) ||
        savedVolumeOpacities.every((value, index) => value === [15, 30, 40, 50, 70, 90][index]))) ||
    (savedVolumeOpacities.length === 0 && p.opacity === 72)
      ? null
      : savedVolumeOpacities;
  const volumeOpacities = coinglassDefaults.volumeOpacities.map((fallback, index) => {
    if (migratedDefaultOpacities === null) return fallback;
    const value = migratedDefaultOpacities[index];
    return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100
      ? value
      : migratedDefaultOpacities.length === 0
        ? legacyOpacity
        : fallback;
  }) as CoinglassParams["volumeOpacities"];
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
    volumeColors,
    volumeOpacities,
    showLevels: typeof p.showLevels === "boolean" ? p.showLevels : true,
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
  points?: CoinglassPoint[];
}

export function coinglassVolumeColorIndex(value: number, min: number, max: number) {
  const low = Math.log1p(Math.max(0, min));
  const high = Math.log1p(Math.max(0, max));
  const normalized = high === low
    ? 0.5
    : (Math.log1p(Math.max(0, value)) - low) / (high - low);
  return Math.min(5, Math.floor(Math.max(0, Math.min(1, normalized)) * 6));
}

export function coinglassColorOpacity(color: string, opacity: number) {
  const value = Number.parseInt(color.slice(1), 16);
  return `rgba(${value >> 16}, ${(value >> 8) & 255}, ${value & 255}, ${Math.max(0, Math.min(100, opacity)) / 100})`;
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
