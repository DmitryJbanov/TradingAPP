import type { CoinglassParams } from "./coinglass";
import { computeVmc } from "../indicators/vmc";
import type { VmcParams, VmcStyle } from "../indicators/vmc-settings";
import { computeOrderBlocks } from "../indicators/order-blocks";
import type { OrderBlockParams } from "../indicators/order-blocks-settings";
import { computeDrz } from "../indicators/drz";
import { computeSmc } from "../indicators/smc";
import type { DrzParams } from "../indicators/drz-settings";
import type { SmcParams } from "../indicators/smc-settings";
import type { Candle, Timeframe } from "./market";
/** Serializable workspace document: each future pane owns its series and drawings. */
export interface IndicatorInstance {
  id: string;
  definitionId: string;
  enabled: boolean;
  period: number;
  color: string;
  paneId: string;
  params?:
    | Partial<VmcParams>
    | Partial<OrderBlockParams>
    | Partial<DrzParams>
    | Partial<SmcParams>
    | Partial<CoinglassParams>;
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
  dataSource?: "remote";
  compute?: (bars: Candle[], params: Record<string, unknown>) => unknown;
}
export const indicatorRegistry: IndicatorDefinition[] = [
  {
    id: "coinglass",
    name: "CoinGlass · Уровни ликвидаций",
    description:
      "Значимые пики 90-дневной карты. Фоновый парсинг и повторное обновление по кнопке.",
    implemented: true,
    dataSource: "remote",
  },
  {
    id: "drz",
    name: "DRZ · Delta Reaction Zones",
    description:
      "BOSWaves: зоны накопленной дельты, распределение потока, RC / RE.",
    implemented: true,
    compute: computeDrz,
  },
  {
    id: "smc",
    name: "SMC · Smart Money Concepts",
    description:
      "LuxAlgo: BOS / CHoCH, order blocks, EQH / EQL, FVG и уровни периодов.",
    implemented: true,
    compute: computeSmc,
  },
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
];
