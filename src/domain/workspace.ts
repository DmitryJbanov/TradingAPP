import { computeVmc } from "../indicators/vmc";
import type { VmcParams, VmcStyle } from "../indicators/vmc-settings";
import { computeOrderBlocks } from "../indicators/order-blocks";
import type { OrderBlockParams } from "../indicators/order-blocks-settings";
import type { Candle, Timeframe } from "./market";
/** Serializable workspace document: each future pane owns its series and drawings. */
export interface IndicatorInstance {
  id: string;
  definitionId: string;
  enabled: boolean;
  period: number;
  color: string;
  paneId: string;
  params?: Partial<VmcParams> | Partial<OrderBlockParams>;
  style?: Partial<VmcStyle>;
  timeframes?: Timeframe[];
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
    id: "vmc",
    name: "VMC Cipher B · VuManChu",
    description:
      "WaveTrend, MFI, RSI, Stoch RSI, Schaff, дивергенции и Sommi. Отдельная панель.",
    implemented: true,
    compute: computeVmc,
  },
  {
    id: "sonarlab-ob",
    name: "Sonarlab · Order Blocks",
    description:
      "Бычьи и медвежьи зоны на ценовом графике. Чувствительность, удаление Close/Wick и сигналы касания.",
    implemented: true,
    compute: computeOrderBlocks,
  },
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
