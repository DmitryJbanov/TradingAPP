export type ParameterValue = string | number | boolean;
export interface OverlayField {
  key: string;
  label: string;
  group: string;
  default: ParameterValue;
  kind: "boolean" | "number" | "color" | "choice";
  min?: number;
  max?: number;
  step?: number;
  options?: string[];
}
export function normalizeOverlay<T>(fields: OverlayField[], raw: unknown): T {
  const input =
    raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return Object.fromEntries(
    fields.map((f) => {
      const v = input[f.key];
      let next = f.default;
      if (f.kind === "boolean" && typeof v === "boolean") next = v;
      if (
        f.kind === "color" &&
        typeof v === "string" &&
        /^#[a-f\d]{6}$/i.test(v)
      )
        next = v;
      if (
        f.kind === "choice" &&
        typeof v === "string" &&
        f.options?.includes(v)
      )
        next = v;
      if (f.kind === "number" && typeof v === "number" && Number.isFinite(v))
        next = Math.max(
          f.min ?? 0,
          Math.min(f.max ?? 4000, f.step === 1 ? Math.round(v) : v),
        );
      return [f.key, next];
    }),
  ) as T;
}
