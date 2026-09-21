export const heatmapRanges = [
  "12h",
  "24h",
  "3d",
  "7d",
  "30d",
  "90d",
  "180d",
  "365d",
] as const;
export type HeatmapRange = (typeof heatmapRanges)[number];
export const heatmapRangeLabels: Record<HeatmapRange, string> = {
  "12h": "12 часов",
  "24h": "24 часа",
  "3d": "3 дня",
  "7d": "7 дней",
  "30d": "30 дней",
  "90d": "90 дней",
  "180d": "180 дней",
  "365d": "365 дней",
};
export function isHeatmapRange(value: unknown): value is HeatmapRange {
  return heatmapRanges.includes(value as HeatmapRange);
}
export interface HeatmapData {
  symbol: string;
  range: HeatmapRange;
  y: number[];
  liquidation_levels: [number, number, number][];
  collectedAt?: string;
  candles: HeatmapCandle[];
  priceColumns: number;
}
export interface HeatmapCandle {
  x: number;
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

// CoinGlass prices use [timestamp, open, high, low, close, ...].
// Preserve row indices even if an invalid candle is skipped.
export function parseHeatmapCandles(prices: unknown): HeatmapCandle[] {
  if (!Array.isArray(prices) || prices.length > 100000) return [];
  return prices.flatMap((row, x) => {
    if (!Array.isArray(row) || row.length < 5) return [];
    if (
      !row
        .slice(0, 5)
        .every(
          (v) =>
            (typeof v === "number" ||
              (typeof v === "string" && v.trim() !== "")) &&
            Number.isFinite(Number(v)) &&
            Number(v) > 0,
        )
    )
      return [];
    const [rawTime, open, high, low, close] = row.slice(0, 5).map(Number);
    const time = rawTime >= 1e12 ? rawTime / 1000 : rawTime;
    if (
      time > 8640000000000 ||
      low > Math.min(open, close) ||
      high < Math.max(open, close)
    )
      return [];
    return [{ x, time, open, high, low, close }];
  });
}

// Map prices to heatmap row centres, including non-uniform price axes.
export function heatmapPriceIndex(axis: number[], price: number): number {
  let lo = 0,
    hi = axis.length - 1;
  while (lo + 1 < hi) {
    const mid = (lo + hi) >>> 1;
    if (axis[mid] <= price) lo = mid;
    else hi = mid;
  }
  return lo + (price - axis[lo]) / (axis[hi] - axis[lo]);
}
export const heatmapSchemes = {
  coinglass: [
    [20, 25, 45],
    [38, 48, 110],
    [90, 35, 150],
    [190, 45, 75],
    [245, 120, 35],
    [255, 225, 70],
  ],
  fire: [
    [20, 10, 8],
    [90, 20, 8],
    [180, 45, 5],
    [240, 110, 10],
    [255, 220, 60],
    [255, 255, 220],
  ],
  ice: [
    [8, 20, 35],
    [12, 75, 120],
    [30, 145, 180],
    [90, 210, 210],
    [190, 245, 230],
    [245, 255, 250],
  ],
  mono: [
    [15, 18, 25],
    [45, 50, 65],
    [85, 92, 110],
    [135, 142, 155],
    [195, 200, 210],
    [250, 252, 255],
  ],
};
export interface HeatmapParams {
  showCandles: boolean;
  range: HeatmapRange;
  threshold: number;
  scale: "log" | "linear" | "percentile";
  scheme: keyof typeof heatmapSchemes;
  showLevels: boolean;
  limit: number;
}
export const heatmapDefaults: HeatmapParams = {
  showCandles: true,
  range: "365d",
  threshold: 0.5,
  scale: "log",
  scheme: "coinglass",
  showLevels: true,
  limit: 10,
};
export function heatmapParams(value: unknown): HeatmapParams {
  const p = (
    value && typeof value === "object" ? value : {}
  ) as Partial<HeatmapParams>;
  return {
    showCandles: p.showCandles !== false,
    range: isHeatmapRange(p.range) ? p.range : "365d",
    threshold:
      typeof p.threshold === "number" && Number.isFinite(p.threshold)
        ? Math.max(0, Math.min(1, p.threshold))
        : 0.5,
    scale: ["linear", "percentile"].includes(p.scale ?? "") ? p.scale! : "log",
    scheme:
      p.scheme && Object.hasOwn(heatmapSchemes, p.scheme)
        ? p.scheme
        : "coinglass",
    showLevels: p.showLevels !== false,
    limit:
      typeof p.limit === "number" && Number.isFinite(p.limit)
        ? Math.max(1, Math.min(50, Math.round(p.limit)))
        : 10,
  };
}
export function parseHeatmap(value: unknown, asset: string): HeatmapData {
  if (!value || typeof value !== "object")
    throw Error("Некорректный JSON карты");
  const d = value as Record<string, unknown>;
  if (d.symbol !== asset) throw Error(`Нужна карта ${asset}`);
  if (!isHeatmapRange(d.range)) throw Error("Некорректный период карты");
  if (
    !Array.isArray(d.y) ||
    d.y.length < 2 ||
    d.y.length > 10000 ||
    !d.y.every(
      (p, i, a) =>
        typeof p === "number" &&
        Number.isFinite(p) &&
        p > 0 &&
        (!i || p > a[i - 1]),
    )
  )
    throw Error("Некорректная ценовая ось");
  const y = d.y as number[];
  const raw =
    d.liquidation_levels ??
    (Array.isArray(d.price_levels)
      ? d.price_levels.map((p) => [p.x_index, p.y_index, p.liquidation_value])
      : undefined);
  if (!Array.isArray(raw) || !raw.length || raw.length > 1000000)
    throw Error("Карта пуста или слишком велика");
  const cells = new Map<string, [number, number, number]>();
  for (const c of raw) {
    if (
      !Array.isArray(c) ||
      c.length !== 3 ||
      !Number.isInteger(c[0]) ||
      c[0] < 0 ||
      c[0] >= 100000 ||
      !Number.isInteger(c[1]) ||
      c[1] < 0 ||
      c[1] >= y.length ||
      typeof c[2] !== "number" ||
      !Number.isFinite(c[2]) ||
      c[2] < 0
    )
      throw Error("Некорректная ячейка карты");
    const key = `${c[0]}:${c[1]}`;
    if (!cells.has(key) || cells.get(key)![2] < c[2])
      cells.set(key, c as [number, number, number]);
  }
  return {
    symbol: asset,
    range: d.range,
    y,
    liquidation_levels: [...cells.values()],
    collectedAt: typeof d.collectedAt === "string" ? d.collectedAt : undefined,
    candles: parseHeatmapCandles(d.prices),
    priceColumns:
      Array.isArray(d.prices) && d.prices.length <= 100000
        ? d.prices.length
        : 0,
  };
}
export function heatmapModel(data: HeatmapData, params: HeatmapParams) {
  const values = data.liquidation_levels
    .map((c) => c[2])
    .filter((v) => v > 0)
    .sort((a, b) => a - b);
  const max = values.at(-1) ?? 0;
  const lastX = data.liquidation_levels.reduce((m, c) => Math.max(m, c[0]), 0);
  const columns = Math.max(lastX + 1, data.priceColumns);
  function intensity(v: number) {
    if (v <= 0 || !max) return 0;
    if (params.scale === "linear") return v / max;
    if (params.scale === "log") return Math.log1p(v) / Math.log1p(max);
    let lo = 0,
      hi = values.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (values[mid] <= v) lo = mid + 1;
      else hi = mid;
    }
    return lo / values.length;
  }
  const visible = data.liquidation_levels.filter(
    (c) => c[2] > 0 && intensity(c[2]) >= params.threshold,
  );
  const levels = visible
    .filter((c) => c[0] === lastX)
    .sort((a, b) => b[2] - a[2])
    .slice(0, params.limit)
    .map((c) => ({ price: data.y[c[1]], value: c[2] }));
  return { lastX, columns, max, visible, levels, intensity };
}
export function heatmapColor(
  value: number,
  scheme: keyof typeof heatmapSchemes,
) {
  const stops = heatmapSchemes[scheme];
  const at = Math.max(0, Math.min(0.999999, value)) * (stops.length - 1),
    i = Math.floor(at);
  return `rgb(${stops[i].map((v, k) => Math.round(v + (stops[i + 1][k] - v) * (at - i))).join(",")})`;
}

export interface HeatmapView {
  x: number;
  y: number;
  size: number;
}
export const heatmapFullView: HeatmapView = { x: 0, y: 0, size: 1 };
export function panHeatmap(
  view: HeatmapView,
  dx: number,
  dy: number,
): HeatmapView {
  return {
    ...view,
    x: Math.max(0, Math.min(1 - view.size, view.x + dx)),
    y: Math.max(0, Math.min(1 - view.size, view.y + dy)),
  };
}
export function zoomHeatmap(
  view: HeatmapView,
  factor: number,
  x = 0.5,
  y = 0.5,
): HeatmapView {
  const size = Math.max(0.01, Math.min(1, view.size * factor));
  return panHeatmap(
    {
      x: view.x + (view.size - size) * Math.max(0, Math.min(1, x)),
      y: view.y + (view.size - size) * Math.max(0, Math.min(1, y)),
      size,
    },
    0,
    0,
  );
}
