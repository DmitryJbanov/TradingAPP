import type { Candle, Timeframe } from "./market";
/** Serializable workspace document: each future pane owns its series and drawings. */
export interface IndicatorInstance {
  id: string;
  definitionId: string;
  enabled: boolean;
  period: number;
  color: string;
  paneId: string;
}
export interface Drawing {
  id: string;
  tool: string;
  anchors: { time: number; price: number }[];
  style: Record<string, string>;
}
export interface PaneState {
  id: string;
  symbol: string;
  timeframe: Timeframe;
  indicators: IndicatorInstance[];
  drawings: Drawing[];
}
export interface WorkspaceDocument {
  version: 1;
  layout: "single" | "horizontal" | "grid";
  panes: PaneState[];
}
export interface IndicatorDefinition {
  id: string;
  name: string;
  description: string;
  implemented: boolean;
  compute?: (bars: Candle[], params: Record<string, unknown>) => unknown;
}
export const indicatorRegistry: IndicatorDefinition[] = [
  {
    id: "nwe",
    name: "Nadaraya–Watson Envelope",
    description: "Исходник Pine Script сохранён. Перенос расчёта запланирован.",
    implemented: false,
  },
  {
    id: "sma",
    name: "Moving Average",
    description: "Скользящая средняя · расчёт будет добавлен позже.",
    implemented: false,
  },
  {
    id: "rsi",
    name: "Relative Strength Index",
    description: "Осциллятор в отдельной панели · расчёт будет добавлен позже.",
    implemented: false,
  },
];
