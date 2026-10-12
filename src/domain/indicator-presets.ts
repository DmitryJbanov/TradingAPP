import type { IndicatorInstance } from "./workspace";

export const INDICATOR_PRESETS_KEY = "vector.indicator-presets.v1";
export type PresetSettings = Pick<
  IndicatorInstance,
  "period" | "params" | "style" | "timeframes" | "color" | "icon"
>;
export interface IndicatorPreset {
  id: string;
  kind: string;
  name: string;
  settings: PresetSettings;
}
export interface PresetStore {
  items: IndicatorPreset[];
  defaults: Record<string, string>;
}
export const emptyPresets: PresetStore = { items: [], defaults: {} };
export function presetKind(instance: IndicatorInstance) {
  return instance.pine ? `pine:${instance.pine.id}` : instance.definitionId;
}
function jsonValue(value: unknown, depth = 0): boolean {
  if (depth > 12) return false;
  if (value === null || typeof value === "boolean" || typeof value === "string")
    return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value))
    return value.length <= 1000 && value.every((v) => jsonValue(v, depth + 1));
  return (
    !!value &&
    typeof value === "object" &&
    Object.entries(value).length <= 1000 &&
    Object.entries(value).every(
      ([key, v]) =>
        !["__proto__", "constructor", "prototype"].includes(key) &&
        jsonValue(v, depth + 1),
    )
  );
}
export function validPresetStore(value: unknown): value is PresetStore {
  if (!value || typeof value !== "object") return false;
  const store = value as PresetStore;
  if (
    !Array.isArray(store.items) ||
    store.items.length > 200 ||
    !store.defaults ||
    typeof store.defaults !== "object" ||
    Array.isArray(store.defaults)
  )
    return false;
  if (!jsonValue(value) || JSON.stringify(value).length > 1_000_000)
    return false;
  const ids = new Set<string>();
  for (const item of store.items) {
    if (
      !item ||
      typeof item.id !== "string" ||
      !/^[\w-]{1,100}$/.test(item.id) ||
      ids.has(item.id) ||
      typeof item.kind !== "string" ||
      !/^[\w:.-]{1,180}$/.test(item.kind) ||
      ["__proto__", "constructor", "prototype"].includes(item.kind) ||
      typeof item.name !== "string" ||
      !item.name.trim() ||
      item.name.length > 80 ||
      !item.settings ||
      Object.keys(item.settings).some(
        (key) =>
          ![
            "period",
            "params",
            "style",
            "timeframes",
            "color",
            "icon",
          ].includes(key),
      ) ||
      (item.settings.params !== undefined &&
        (!item.settings.params ||
          typeof item.settings.params !== "object" ||
          Array.isArray(item.settings.params))) ||
      (item.settings.style !== undefined &&
        (!item.settings.style ||
          typeof item.settings.style !== "object" ||
          Array.isArray(item.settings.style))) ||
      (item.settings.timeframes !== undefined &&
        (!Array.isArray(item.settings.timeframes) ||
          !item.settings.timeframes.every(
            (v) => typeof v === "string" && /^[0-9]+[mhdwM]$/.test(v),
          ))) ||
      (item.settings.icon !== undefined &&
        (typeof item.settings.icon !== "string" ||
          item.settings.icon.length > 100)) ||
      !jsonValue(item.settings) ||
      !Number.isFinite(item.settings.period) ||
      item.settings.period < 1 ||
      !/^#[0-9a-f]{6}$/i.test(item.settings.color) ||
      JSON.stringify(item.settings).length > 64000
    )
      return false;
    ids.add(item.id);
  }
  return Object.entries(store.defaults).every(([kind, id]) =>
    store.items.some((p) => p.kind === kind && p.id === id),
  );
}
export function readPresets(value: unknown): PresetStore {
  return validPresetStore(value) ? value : emptyPresets;
}
export function presetSettings(instance: IndicatorInstance): PresetSettings {
  const settings = JSON.parse(
    JSON.stringify({
      period: instance.period,
      params: instance.params,
      style: instance.style,
      timeframes: instance.timeframes,
      color: instance.color,
      icon: instance.icon,
    }),
  ) as PresetSettings;
  if (settings.params && "snapshotIds" in settings.params)
    delete settings.params.snapshotIds;
  return settings;
}
export function applyPreset(
  instance: IndicatorInstance,
  preset: IndicatorPreset,
): IndicatorInstance {
  if (preset.kind !== presetKind(instance)) return instance;
  const settings = structuredClone(preset.settings);
  const snapshots =
    instance.params && "snapshotIds" in instance.params
      ? instance.params.snapshotIds
      : undefined;
  if (snapshots && settings.params)
    settings.params = { ...settings.params, snapshotIds: snapshots };
  return {
    ...instance,
    params: undefined,
    style: undefined,
    timeframes: undefined,
    icon: undefined,
    ...settings,
  };
}
export function applyDefaultPreset(
  instance: IndicatorInstance,
  value: unknown,
): IndicatorInstance {
  const store = readPresets(value),
    kind = presetKind(instance);
  const preset = store.items.find(
    (p) => p.kind === kind && p.id === store.defaults[kind],
  );
  return preset ? applyPreset(instance, preset) : instance;
}
