/** Input names/defaults from references/vmc2-original.pine. */
export type PriceSource =
  | "open"
  | "high"
  | "low"
  | "close"
  | "hl2"
  | "hlc3"
  | "ohlc4";
export const vmcTimeframes = {
  "15": "15m",
  "30": "30m",
  "60": "1h",
  "120": "2h",
  "240": "4h",
  "480": "8h",
  "720": "12h",
  D: "1d",
} as const;
export type VmcTimeframe = keyof typeof vmcTimeframes;
export interface VmcParams {
  wtShow: boolean;
  wtBuyShow: boolean;
  wtGoldShow: boolean;
  wtSellShow: boolean;
  wtDivShow: boolean;
  vwapShow: boolean;
  wtChannelLen: number;
  wtAverageLen: number;
  wtMASource: PriceSource;
  wtMALen: number;
  obLevel: number;
  obLevel2: number;
  obLevel3: number;
  osLevel: number;
  osLevel2: number;
  osLevel3: number;
  wtShowDiv: boolean;
  wtShowHiddenDiv: boolean;
  showHiddenDiv_nl: boolean;
  wtDivOBLevel: number;
  wtDivOSLevel: number;
  wtDivOBLevel_addshow: boolean;
  wtDivOBLevel_add: number;
  wtDivOSLevel_add: number;
  rsiMFIShow: boolean;
  rsiMFIperiod: number;
  rsiMFIMultiplier: number;
  rsiMFIPosY: number;
  rsiShow: boolean;
  rsiSRC: PriceSource;
  rsiLen: number;
  rsiOversold: number;
  rsiOverbought: number;
  rsiShowDiv: boolean;
  rsiShowHiddenDiv: boolean;
  rsiDivOBLevel: number;
  rsiDivOSLevel: number;
  stochShow: boolean;
  stochUseLog: boolean;
  stochAvg: boolean;
  stochSRC: PriceSource;
  stochLen: number;
  stochRsiLen: number;
  stochKSmooth: number;
  stochDSmooth: number;
  stochShowDiv: boolean;
  stochShowHiddenDiv: boolean;
  tcLine: boolean;
  tcSRC: PriceSource;
  tclength: number;
  tcfastLength: number;
  tcslowLength: number;
  tcfactor: number;
  sommiFlagShow: boolean;
  sommiShowVwap: boolean;
  sommiVwapTF: VmcTimeframe;
  sommiVwapBearLevel: number;
  sommiVwapBullLevel: number;
  soomiFlagWTBearLevel: number;
  soomiFlagWTBullLevel: number;
  soomiRSIMFIBearLevel: number;
  soomiRSIMFIBullLevel: number;
  sommiDiamondShow: boolean;
  sommiHTCRes: VmcTimeframe;
  sommiHTCRes2: VmcTimeframe;
  soomiDiamondWTBearLevel: number;
  soomiDiamondWTBullLevel: number;
  macdWTColorsShow: boolean;
  macdWTColorsTF: VmcTimeframe;
  darkMode: boolean;
  rsiobcolor: string;
  rsioscolor: string;
  rsinacolor: string;
  rsiMFIColorAbove: string;
  rsiMFIColorBelow: string;
  WTBearDivColorDown: string;
  wtBullDivColorUp: string;
  signalcolorup: string;
  signalcolordown: string;
  colorWT1blue: string;
  colorWT2purple: string;
  VWAPColor: string;
  stochkcolor: string;
  stochdcolor: string;
  mtfMode: "pine" | "confirmed";
}
export interface InputField {
  key: keyof VmcParams;
  label: string;
  group: string;
  kind: "boolean" | "number" | "source" | "timeframe" | "color" | "mode";
  default: string | number | boolean;
  min?: number;
  max?: number;
  step?: number;
  opacity?: number;
}
export const vmcFields: InputField[] = [
  {
    key: "wtShow",
    label: "Show WaveTrend",
    group: "WaveTrend Settings",
    kind: "boolean",
    default: true,
  },
  {
    key: "wtBuyShow",
    label: "Show Buy dots",
    group: "WaveTrend Settings",
    kind: "boolean",
    default: true,
  },
  {
    key: "wtGoldShow",
    label: "Show Gold dots",
    group: "WaveTrend Settings",
    kind: "boolean",
    default: true,
  },
  {
    key: "wtSellShow",
    label: "Show Sell dots",
    group: "WaveTrend Settings",
    kind: "boolean",
    default: true,
  },
  {
    key: "wtDivShow",
    label: "Show Div. dots",
    group: "WaveTrend Settings",
    kind: "boolean",
    default: true,
  },
  {
    key: "vwapShow",
    label: "Show Fast WT",
    group: "WaveTrend Settings",
    kind: "boolean",
    default: true,
  },
  {
    key: "wtChannelLen",
    label: "WT Channel Length",
    group: "WaveTrend Settings",
    kind: "number",
    default: 9,
    step: 1,
    min: 1,
    max: 500,
  },
  {
    key: "wtAverageLen",
    label: "WT Average Length",
    group: "WaveTrend Settings",
    kind: "number",
    default: 12,
    step: 1,
    min: 1,
    max: 500,
  },
  {
    key: "wtMASource",
    label: "WT MA Source",
    group: "WaveTrend Settings",
    kind: "source",
    default: "hlc3",
  },
  {
    key: "wtMALen",
    label: "WT MA Length",
    group: "WaveTrend Settings",
    kind: "number",
    default: 3,
    step: 1,
    min: 1,
    max: 500,
  },
  {
    key: "obLevel",
    label: "WT Overbought Level 1",
    group: "WaveTrend Settings",
    kind: "number",
    default: 53,
    step: 1,
    min: -1000,
    max: 1000,
  },
  {
    key: "obLevel2",
    label: "WT Overbought Level 2",
    group: "WaveTrend Settings",
    kind: "number",
    default: 60,
    step: 1,
    min: -1000,
    max: 1000,
  },
  {
    key: "obLevel3",
    label: "WT Overbought Level 3",
    group: "WaveTrend Settings",
    kind: "number",
    default: 100,
    step: 1,
    min: -1000,
    max: 1000,
  },
  {
    key: "osLevel",
    label: "WT Oversold Level 1",
    group: "WaveTrend Settings",
    kind: "number",
    default: -53,
    step: 1,
    min: -1000,
    max: 1000,
  },
  {
    key: "osLevel2",
    label: "WT Oversold Level 2",
    group: "WaveTrend Settings",
    kind: "number",
    default: -60,
    step: 1,
    min: -1000,
    max: 1000,
  },
  {
    key: "osLevel3",
    label: "WT Oversold Level 3",
    group: "WaveTrend Settings",
    kind: "number",
    default: -75,
    step: 1,
    min: -1000,
    max: 1000,
  },
  {
    key: "wtShowDiv",
    label: "Show WT Regular Divergences",
    group: "WaveTrend Settings",
    kind: "boolean",
    default: true,
  },
  {
    key: "wtShowHiddenDiv",
    label: "Show WT Hidden Divergences",
    group: "WaveTrend Settings",
    kind: "boolean",
    default: false,
  },
  {
    key: "showHiddenDiv_nl",
    label: "Not apply OB/OS Limits on Hidden Divergences",
    group: "WaveTrend Settings",
    kind: "boolean",
    default: true,
  },
  {
    key: "wtDivOBLevel",
    label: "WT Bearish Divergence min",
    group: "WaveTrend Settings",
    kind: "number",
    default: 45,
    step: 1,
    min: -1000,
    max: 1000,
  },
  {
    key: "wtDivOSLevel",
    label: "WT Bullish Divergence min",
    group: "WaveTrend Settings",
    kind: "number",
    default: -65,
    step: 1,
    min: -1000,
    max: 1000,
  },
  {
    key: "wtDivOBLevel_addshow",
    label: "Show 2nd WT Regular Divergences",
    group: "WaveTrend Settings",
    kind: "boolean",
    default: true,
  },
  {
    key: "wtDivOBLevel_add",
    label: "WT 2nd Bearish Divergence",
    group: "WaveTrend Settings",
    kind: "number",
    default: 15,
    step: 1,
    min: -1000,
    max: 1000,
  },
  {
    key: "wtDivOSLevel_add",
    label: "WT 2nd Bullish Divergence 15 min",
    group: "WaveTrend Settings",
    kind: "number",
    default: -40,
    step: 1,
    min: -1000,
    max: 1000,
  },
  {
    key: "rsiMFIShow",
    label: "Show MFI",
    group: "MFI Settings",
    kind: "boolean",
    default: true,
  },
  {
    key: "rsiMFIperiod",
    label: "MFI Period",
    group: "MFI Settings",
    kind: "number",
    default: 60,
    step: 1,
    min: 1,
    max: 500,
  },
  {
    key: "rsiMFIMultiplier",
    label: "MFI Area multiplier",
    group: "MFI Settings",
    kind: "number",
    default: 150,
    step: 0.1,
    min: -1000,
    max: 1000,
  },
  {
    key: "rsiMFIPosY",
    label: "MFI Area Y Pos",
    group: "MFI Settings",
    kind: "number",
    default: 2.5,
    step: 0.1,
    min: -1000,
    max: 1000,
  },
  {
    key: "rsiShow",
    label: "Show RSI",
    group: "RSI Settings",
    kind: "boolean",
    default: true,
  },
  {
    key: "rsiSRC",
    label: "RSI Source",
    group: "RSI Settings",
    kind: "source",
    default: "close",
  },
  {
    key: "rsiLen",
    label: "RSI Length",
    group: "RSI Settings",
    kind: "number",
    default: 14,
    step: 1,
    min: 1,
    max: 500,
  },
  {
    key: "rsiOversold",
    label: "RSI Oversold",
    group: "RSI Settings",
    kind: "number",
    default: 30,
    step: 1,
    min: 0,
    max: 100,
  },
  {
    key: "rsiOverbought",
    label: "RSI Overbought",
    group: "RSI Settings",
    kind: "number",
    default: 60,
    step: 1,
    min: 0,
    max: 100,
  },
  {
    key: "rsiShowDiv",
    label: "Show RSI Regular Divergences",
    group: "RSI Settings",
    kind: "boolean",
    default: false,
  },
  {
    key: "rsiShowHiddenDiv",
    label: "Show RSI Hidden Divergences",
    group: "RSI Settings",
    kind: "boolean",
    default: false,
  },
  {
    key: "rsiDivOBLevel",
    label: "RSI Bearish Divergence min",
    group: "RSI Settings",
    kind: "number",
    default: 60,
    step: 1,
    min: -1000,
    max: 1000,
  },
  {
    key: "rsiDivOSLevel",
    label: "RSI Bullish Divergence min",
    group: "RSI Settings",
    kind: "number",
    default: 30,
    step: 1,
    min: -1000,
    max: 1000,
  },
  {
    key: "stochShow",
    label: "Show Stochastic RSI",
    group: "Stoch Settings",
    kind: "boolean",
    default: true,
  },
  {
    key: "stochUseLog",
    label: "Use Log?",
    group: "Stoch Settings",
    kind: "boolean",
    default: true,
  },
  {
    key: "stochAvg",
    label: "Use Average of both K & D",
    group: "Stoch Settings",
    kind: "boolean",
    default: false,
  },
  {
    key: "stochSRC",
    label: "Stochastic RSI Source",
    group: "Stoch Settings",
    kind: "source",
    default: "close",
  },
  {
    key: "stochLen",
    label: "Stochastic RSI Length",
    group: "Stoch Settings",
    kind: "number",
    default: 14,
    step: 1,
    min: 1,
    max: 500,
  },
  {
    key: "stochRsiLen",
    label: "RSI Length",
    group: "Stoch Settings",
    kind: "number",
    default: 14,
    step: 1,
    min: 1,
    max: 500,
  },
  {
    key: "stochKSmooth",
    label: "Stochastic RSI K Smooth",
    group: "Stoch Settings",
    kind: "number",
    default: 3,
    step: 1,
    min: 1,
    max: 500,
  },
  {
    key: "stochDSmooth",
    label: "Stochastic RSI D Smooth",
    group: "Stoch Settings",
    kind: "number",
    default: 3,
    step: 1,
    min: 1,
    max: 500,
  },
  {
    key: "stochShowDiv",
    label: "Show Stoch Regular Divergences",
    group: "Stoch Settings",
    kind: "boolean",
    default: false,
  },
  {
    key: "stochShowHiddenDiv",
    label: "Show Stoch Hidden Divergences",
    group: "Stoch Settings",
    kind: "boolean",
    default: false,
  },
  {
    key: "tcLine",
    label: "Show Schaff TC line",
    group: "Schaff Settings",
    kind: "boolean",
    default: false,
  },
  {
    key: "tcSRC",
    label: "Schaff TC Source",
    group: "Schaff Settings",
    kind: "source",
    default: "close",
  },
  {
    key: "tclength",
    label: "Schaff TC",
    group: "Schaff Settings",
    kind: "number",
    default: 10,
    step: 1,
    min: 1,
    max: 500,
  },
  {
    key: "tcfastLength",
    label: "Schaff TC Fast Lenght",
    group: "Schaff Settings",
    kind: "number",
    default: 23,
    step: 1,
    min: 1,
    max: 500,
  },
  {
    key: "tcslowLength",
    label: "Schaff TC Slow Length",
    group: "Schaff Settings",
    kind: "number",
    default: 50,
    step: 1,
    min: 1,
    max: 500,
  },
  {
    key: "tcfactor",
    label: "Schaff TC Factor",
    group: "Schaff Settings",
    kind: "number",
    default: 0.5,
    step: 0.05,
    min: 0,
    max: 1,
  },
  {
    key: "sommiFlagShow",
    label: "Show Sommi flag",
    group: "Sommi Settings",
    kind: "boolean",
    default: false,
  },
  {
    key: "sommiShowVwap",
    label: "Show Sommi F. Wave",
    group: "Sommi Settings",
    kind: "boolean",
    default: false,
  },
  {
    key: "sommiVwapTF",
    label: "Sommi F. Wave timeframe",
    group: "Sommi Settings",
    kind: "timeframe",
    default: "720",
  },
  {
    key: "sommiVwapBearLevel",
    label: "F. Wave Bear Level (less than)",
    group: "Sommi Settings",
    kind: "number",
    default: 0,
    step: 1,
    min: -1000,
    max: 1000,
  },
  {
    key: "sommiVwapBullLevel",
    label: "F. Wave Bull Level (more than)",
    group: "Sommi Settings",
    kind: "number",
    default: 0,
    step: 1,
    min: -1000,
    max: 1000,
  },
  {
    key: "soomiFlagWTBearLevel",
    label: "WT Bear Level (more than)",
    group: "Sommi Settings",
    kind: "number",
    default: 0,
    step: 1,
    min: -1000,
    max: 1000,
  },
  {
    key: "soomiFlagWTBullLevel",
    label: "WT Bull Level (less than)",
    group: "Sommi Settings",
    kind: "number",
    default: 0,
    step: 1,
    min: -1000,
    max: 1000,
  },
  {
    key: "soomiRSIMFIBearLevel",
    label: "Money flow Bear Level (less than)",
    group: "Sommi Settings",
    kind: "number",
    default: 0,
    step: 1,
    min: -1000,
    max: 1000,
  },
  {
    key: "soomiRSIMFIBullLevel",
    label: "Money flow Bull Level (more than)",
    group: "Sommi Settings",
    kind: "number",
    default: 0,
    step: 1,
    min: -1000,
    max: 1000,
  },
  {
    key: "sommiDiamondShow",
    label: "Show Sommi diamond",
    group: "Sommi Settings",
    kind: "boolean",
    default: false,
  },
  {
    key: "sommiHTCRes",
    label: "HTF Candle Res. 1",
    group: "Sommi Settings",
    kind: "timeframe",
    default: "60",
  },
  {
    key: "sommiHTCRes2",
    label: "HTF Candle Res. 2",
    group: "Sommi Settings",
    kind: "timeframe",
    default: "240",
  },
  {
    key: "soomiDiamondWTBearLevel",
    label: "WT Bear Level (More than)",
    group: "Sommi Settings",
    kind: "number",
    default: 0,
    step: 1,
    min: -1000,
    max: 1000,
  },
  {
    key: "soomiDiamondWTBullLevel",
    label: "WT Bull Level (Less than)",
    group: "Sommi Settings",
    kind: "number",
    default: 0,
    step: 1,
    min: -1000,
    max: 1000,
  },
  {
    key: "macdWTColorsShow",
    label: "Show MACD Colors",
    group: "MACD Settings",
    kind: "boolean",
    default: false,
  },
  {
    key: "macdWTColorsTF",
    label: "MACD Colors MACD TF",
    group: "MACD Settings",
    kind: "timeframe",
    default: "240",
  },
  {
    key: "darkMode",
    label: "Dark mode",
    group: "Mode Settings",
    kind: "boolean",
    default: false,
  },
  {
    key: "rsiobcolor",
    label: "RSI OverBought",
    group: "Color Settings",
    kind: "color",
    default: "#e13e3e",
    opacity: 100,
  },
  {
    key: "rsioscolor",
    label: "RSI OverSold",
    group: "Color Settings",
    kind: "color",
    default: "#3ee145",
    opacity: 100,
  },
  {
    key: "rsinacolor",
    label: "RSI InBetween",
    group: "Color Settings",
    kind: "color",
    default: "#c33ee1",
    opacity: 100,
  },
  {
    key: "rsiMFIColorAbove",
    label: "MFI Color > 0",
    group: "Color Settings",
    kind: "color",
    default: "#3ee145",
    opacity: 100,
  },
  {
    key: "rsiMFIColorBelow",
    label: "MFI Color < 0",
    group: "Color Settings",
    kind: "color",
    default: "#ff3d2e",
    opacity: 100,
  },
  {
    key: "WTBearDivColorDown",
    label: "WT Bear Div",
    group: "Color Settings",
    kind: "color",
    default: "#e60000",
    opacity: 100,
  },
  {
    key: "wtBullDivColorUp",
    label: "WT Bull Div",
    group: "Color Settings",
    kind: "color",
    default: "#00e676",
    opacity: 100,
  },
  {
    key: "signalcolorup",
    label: "WT Buy Dot",
    group: "Color Settings",
    kind: "color",
    default: "#00e676",
    opacity: 100,
  },
  {
    key: "signalcolordown",
    label: "WT Sell Dot",
    group: "Color Settings",
    kind: "color",
    default: "#ff5252",
    opacity: 100,
  },
  {
    key: "colorWT1blue",
    label: "WT1 Fill",
    group: "Color Settings",
    kind: "color",
    default: "#4994ec",
    opacity: 100,
  },
  {
    key: "colorWT2purple",
    label: "WT2 Fill",
    group: "Color Settings",
    kind: "color",
    default: "#1f1559",
    opacity: 100,
  },
  {
    key: "VWAPColor",
    label: "VWAP",
    group: "Color Settings",
    kind: "color",
    default: "#ffffff",
    opacity: 50,
  },
  {
    key: "stochkcolor",
    label: "Stoch K",
    group: "Color Settings",
    kind: "color",
    default: "#21baf3",
    opacity: 30,
  },
  {
    key: "stochdcolor",
    label: "Stoch D",
    group: "Color Settings",
    kind: "color",
    default: "#673ab7",
    opacity: 10,
  },
  {
    key: "mtfMode",
    label: "Режим данных других таймфреймов",
    group: "Sommi Settings",
    kind: "mode",
    default: "pine",
  },
];
export const vmcDefaults = Object.fromEntries(
  vmcFields.map((f) => [f.key, f.default]),
) as unknown as VmcParams;
export function normalizeVmcParams(raw: unknown): VmcParams {
  const input =
    raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const result: Record<string, unknown> = {};
  for (const f of vmcFields) {
    const value = input[f.key];
    let next: unknown = f.default;
    if (f.kind === "boolean" && typeof value === "boolean") next = value;
    if (
      f.kind === "number" &&
      typeof value === "number" &&
      Number.isFinite(value)
    ) {
      next = Math.min(
        f.max!,
        Math.max(f.min!, f.step === 1 ? Math.round(value) : value),
      );
    }
    if (
      f.kind === "color" &&
      typeof value === "string" &&
      /^#[\da-f]{6}$/i.test(value)
    )
      next = value;
    if (
      f.kind === "source" &&
      ["open", "high", "low", "close", "hl2", "hlc3", "ohlc4"].includes(
        String(value),
      )
    )
      next = value;
    if (
      f.kind === "timeframe" &&
      typeof value === "string" &&
      Object.hasOwn(vmcTimeframes, value)
    )
      next = value;
    if (f.kind === "mode" && (value === "pine" || value === "confirmed"))
      next = value;
    result[f.key] = next;
  }
  return result as unknown as VmcParams;
}
export interface VmcStyle {
  lineWidth: 1 | 2 | 3;
  opacity: number;
  levels: boolean;
  crosses: boolean;
}
export const vmcStyleDefaults: VmcStyle = {
  lineWidth: 2,
  opacity: 100,
  levels: true,
  crosses: true,
};
export function normalizeVmcStyle(raw?: Partial<VmcStyle>): VmcStyle {
  return {
    lineWidth: raw?.lineWidth === 1 || raw?.lineWidth === 3 ? raw.lineWidth : 2,
    opacity:
      typeof raw?.opacity === "number" && Number.isFinite(raw.opacity)
        ? Math.min(100, Math.max(0, raw.opacity))
        : 100,
    levels: raw?.levels !== false,
    crosses: raw?.crosses !== false,
  };
}
