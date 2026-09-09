export interface OrderBlockParams {
  _v: "1.0.2";
  sens: number;
  OBMitigationType: "Close" | "Wick";
  col_bullish: string;
  col_bullish_ob: string;
  bullishTransparency: number;
  col_bearish: string;
  col_bearish_ob: string;
  bearishTransparency: number;
  buy_alert: boolean;
  sell_alert: boolean;
}

export const orderBlockDefaults: OrderBlockParams = {
  _v: "1.0.2",
  sens: 28,
  OBMitigationType: "Close",
  col_bullish: "#5db49e",
  col_bullish_ob: "#64c4ac",
  bullishTransparency: 85,
  col_bearish: "#4760bb",
  col_bearish_ob: "#506cd3",
  bearishTransparency: 85,
  buy_alert: true,
  sell_alert: true,
};

export function normalizeOrderBlockParams(raw: unknown): OrderBlockParams {
  const input =
    raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const result = { ...orderBlockDefaults };
  if (typeof input.sens === "number" && Number.isFinite(input.sens))
    result.sens = Math.max(1, Math.round(input.sens));
  if (input.OBMitigationType === "Wick") result.OBMitigationType = "Wick";
  for (const key of [
    "col_bullish",
    "col_bullish_ob",
    "col_bearish",
    "col_bearish_ob",
  ] as const) {
    const value = input[key];
    if (typeof value === "string" && /^#[\da-f]{6}$/i.test(value))
      result[key] = value;
  }
  for (const key of ["bullishTransparency", "bearishTransparency"] as const) {
    const value = input[key];
    if (typeof value === "number" && Number.isFinite(value))
      result[key] = Math.max(0, Math.min(100, value));
  }
  for (const key of ["buy_alert", "sell_alert"] as const)
    if (typeof input[key] === "boolean") result[key] = input[key];
  return result;
}
