import { indicatorRegistry, type IndicatorInstance } from "./workspace";

export const SHARED_INDICATORS_KEY = "vector.indicators.shared.v1";
export const LEGACY_INDICATORS_KEY = "vector.indicators.v1";

export function supportedIndicators(value: unknown): IndicatorInstance[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is IndicatorInstance =>
      item !== null &&
      typeof item === "object" &&
      typeof item.id === "string" &&
      typeof item.enabled === "boolean" &&
      indicatorRegistry.some(
        (definition) =>
          definition.id === item.definitionId &&
          definition.implemented &&
          definition.compute,
      ),
  );
}

export function initialSharedIndicators(
  shared: unknown,
  legacy: unknown,
  symbol: string,
): IndicatorInstance[] {
  // An intentionally empty shared selection must never re-import old settings.
  if (Array.isArray(shared)) return supportedIndicators(shared);
  if (!legacy || typeof legacy !== "object" || Array.isArray(legacy)) return [];
  const bySymbol = legacy as Record<string, unknown>;
  const current = supportedIndicators(bySymbol[symbol]);
  if (current.length) return current;
  for (const key of Object.keys(bySymbol).sort()) {
    const items = supportedIndicators(bySymbol[key]);
    if (items.length) return items;
  }
  return [];
}
