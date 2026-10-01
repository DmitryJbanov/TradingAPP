import { candleIntervals } from "../domain/market";
import { normalizeOverlay, type OverlayField } from "./overlay-settings";

export const fvgDefaults = {
  timeframe: "Chart",
  auto_threshold: true,
  threshold_percent: 0,
  show_mitigated_levels: false,
  show_current_gaps: true,
  dynamic: false,
  show_historical_gaps: false,
  unmitigated_levels: 3,
  bullish_color: "#00ff68",
  bearish_color: "#ff0008",
  historical_bullish_color: "#4f9b7d",
  historical_bearish_color: "#b86a73",
};
export type FvgParams = typeof fvgDefaults;
export const fvgFields: OverlayField[] = [
  {
    key: "timeframe",
    label: "Timeframe",
    group: "Fair Value Gaps",
    kind: "choice",
    default: "Chart",
    options: ["Chart", ...Object.keys(candleIntervals)],
  },
  {
    key: "auto_threshold",
    label: "Auto Threshold",
    group: "Fair Value Gaps",
    kind: "boolean",
    default: true,
  },
  {
    key: "threshold_percent",
    label: "Threshold %",
    group: "Fair Value Gaps",
    kind: "number",
    default: 0,
    min: 0,
    max: 100,
    step: 0.1,
  },
  {
    key: "dynamic",
    label: "Dynamic",
    group: "Fair Value Gaps",
    kind: "boolean",
    default: false,
  },
  {
    key: "show_mitigated_levels",
    label: "Mitigation Levels",
    group: "Fair Value Gaps",
    kind: "boolean",
    default: false,
  },
  {
    key: "show_historical_gaps",
    label: "Historical Gaps",
    group: "Fair Value Gaps",
    kind: "boolean",
    default: false,
  },
  {
    key: "show_current_gaps",
    label: "Show Current Gaps",
    group: "Fair Value Gaps",
    kind: "boolean",
    default: true,
  },
  {
    key: "unmitigated_levels",
    label: "Unmitigated Levels",
    group: "Fair Value Gaps",
    kind: "number",
    default: 3,
    min: 0,
    max: 200,
    step: 1,
  },
  {
    key: "bullish_color",
    label: "Bullish FVG",
    group: "Style",
    kind: "color",
    default: "#00ff68",
  },
  {
    key: "bearish_color",
    label: "Bearish FVG",
    group: "Style",
    kind: "color",
    default: "#ff0008",
  },
  {
    key: "historical_bullish_color",
    label: "Historical Bullish FVG",
    group: "Style",
    kind: "color",
    default: "#4f9b7d",
  },
  {
    key: "historical_bearish_color",
    label: "Historical Bearish FVG",
    group: "Style",
    kind: "color",
    default: "#b86a73",
  },
];
export const normalizeFvgParams = (raw: unknown): FvgParams =>
  normalizeOverlay(fvgFields, raw);
