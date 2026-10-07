export type PineKind = "indicator" | "strategy";
export interface PineScript {
  id: string;
  name: string;
  kind: PineKind;
  source: string;
}
export interface PineInputMeta {
  id: string;
  name: string;
  title?: string;
  type: string;
  defval: unknown;
  tooltip?: string;
  group?: string;
  options?: unknown[];
  minval?: number;
  maxval?: number;
  step?: number;
  active?: boolean;
}
export interface PineElementStyle {
  visible?: boolean;
  color?: string;
  width?: 1 | 2 | 3 | 4;
  style?: "line" | "histogram" | "area";
}
export interface PineInstanceSettings {
  inputs?: Record<string, unknown>;
  display?: Record<string, PineElementStyle>;
}
export const PINE_LIBRARY_KEY = "vector.pine.library.v1";
export const PINE_DRAFT_KEY = "vector.pine.draft.v1";
export const pineTemplates: PineScript[] = [
  {
    id: "builtin-sma",
    name: "Pine · SMA",
    kind: "indicator",
    source: `//@version=6
indicator("SMA", overlay=true)
length = input.int(20, "Период", minval=1)
plot(ta.sma(close, length), title="SMA", color=color.orange, linewidth=2)
`,
  },
  {
    id: "builtin-rsi",
    name: "Pine · RSI",
    kind: "indicator",
    source: `//@version=6
indicator("RSI", overlay=false)
length = input.int(14, "Период", minval=1)
plot(ta.rsi(close, length), title="RSI", color=color.purple)
hline(70, "Перекупленность", color=color.red)
hline(30, "Перепроданность", color=color.green)
`,
  },
  {
    id: "builtin-cross",
    name: "Пересечение средних",
    kind: "strategy",
    source: `//@version=6
strategy("Пересечение средних", overlay=true, initial_capital=10000, default_qty_type=strategy.percent_of_equity, default_qty_value=10, commission_type=strategy.commission.percent, commission_value=0.05)
fastLength = input.int(10, "Быстрая средняя", minval=1)
slowLength = input.int(30, "Медленная средняя", minval=1)
fast = ta.sma(close, fastLength)
slow = ta.sma(close, slowLength)
if ta.crossover(fast, slow)
    strategy.entry("Long", strategy.long)
if ta.crossunder(fast, slow)
    strategy.close("Long")
plot(fast, "Быстрая", color=color.teal)
plot(slow, "Медленная", color=color.orange)
`,
  },
];
export function isPineScript(value: unknown): value is PineScript {
  if (!value || typeof value !== "object") return false;
  const p = value as Partial<PineScript>;
  return (
    typeof p.id === "string" &&
    !!p.id &&
    typeof p.name === "string" &&
    !!p.name.trim() &&
    typeof p.source === "string" &&
    p.source.length <= 100000 &&
    (p.kind === "indicator" || p.kind === "strategy")
  );
}
export interface PinePoint {
  time: number;
  value?: number;
  color?: string;
}
export interface PinePlot {
  title: string;
  style: "line" | "histogram" | "area";
  visible?: boolean;
  color: string;
  width: 1 | 2 | 3 | 4;
  points: PinePoint[];
}
export interface PineMarker {
  time: number;
  position: "aboveBar" | "belowBar";
  shape: "arrowUp" | "arrowDown" | "circle";
  color: string;
  text: string;
  visible?: boolean;
}
export interface PineDrawing {
  boxes: Record<string, unknown>[];
  lines: Record<string, unknown>[];
  labels: Record<string, unknown>[];
}
export interface PineTrade {
  entry: number;
  exit?: number;
  entryPrice: number;
  exitPrice?: number;
  size: number;
  profit?: number;
}
export interface PineResult {
  id: string;
  name: string;
  kind: PineKind;
  overlay: boolean;
  plots: PinePlot[];
  markers: PineMarker[];
  drawings: PineDrawing;
  warnings: string[];
  inputMeta: PineInputMeta[];
  strategy?: {
    initialCapital: number;
    equity: number;
    netProfit: number;
    maxDrawdown: number;
    wins: number;
    trades: PineTrade[];
  };
}
