export interface HeatmapData {
  symbol: string;
  range: "365d";
  y: number[];
  liquidation_levels: [number, number, number][];
  collectedAt?: string;
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
  threshold: number;
  scale: "log" | "linear" | "percentile";
  scheme: keyof typeof heatmapSchemes;
  showLevels: boolean;
  limit: number;
}
export const heatmapDefaults: HeatmapParams = {
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
  if (d.symbol !== asset || d.range !== "365d")
    throw Error(`Нужна карта ${asset} · 365d`);
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
    range: "365d",
    y,
    liquidation_levels: [...cells.values()],
    collectedAt: typeof d.collectedAt === "string" ? d.collectedAt : undefined,
  };
}
export function heatmapModel(data: HeatmapData, params: HeatmapParams) {
  const values = data.liquidation_levels
    .map((c) => c[2])
    .filter((v) => v > 0)
    .sort((a, b) => a - b);
  const max = values.at(-1) ?? 0;
  const lastX = data.liquidation_levels.reduce((m, c) => Math.max(m, c[0]), 0);
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
  return { lastX, max, visible, levels, intensity };
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
