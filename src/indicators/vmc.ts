import type { Candle, CandleInterval } from "../domain/market";
import { candleIntervals } from "../domain/market";
import {
  ema,
  sma,
  rsi,
  stochastic,
  extrema,
  finite,
  type Values,
} from "./pine-math";
import {
  normalizeVmcParams,
  vmcTimeframes,
  type VmcParams,
  type PriceSource,
} from "./vmc-settings";

export type WaveKey =
  | "wt1"
  | "wt2"
  | "fast"
  | "mfi"
  | "rsi"
  | "k"
  | "d"
  | "schaff"
  | "sommi";
export interface VmcMark {
  value: number;
  color: string;
  shape: "circle" | "flag" | "diamond";
  size: number;
  label: string;
  confirmedAt: number;
}
export interface VmcSegment {
  from: number;
  fromValue: number;
  toValue: number;
  color: string;
  label: string;
  confirmedAt: number;
}
export interface VmcPoint {
  time: number;
  values: Record<WaveKey, number | null>;
  marks: VmcMark[];
  segments: VmcSegment[];
  wt1Color: string;
  wt2Color: string;
}
export interface VmcEvent {
  time: number;
  pivotTime?: number;
  name: string;
}
export interface VmcResult {
  points: VmcPoint[];
  events: VmcEvent[];
  warnings: string[];
}
export interface VmcContext {
  interval?: CandleInterval;
  histories?: Partial<Record<CandleInterval, Candle[]>>;
  now?: number;
}
export function source(bars: Candle[], key: PriceSource): Values {
  return bars.map((b) =>
    key === "hlc3"
      ? (b.high + b.low + b.close) / 3
      : key === "hl2"
        ? (b.high + b.low) / 2
        : key === "ohlc4"
          ? (b.open + b.high + b.low + b.close) / 4
          : b[key],
  );
}
export function waveTrend(bars: Candle[], p: VmcParams) {
  const src = source(bars, p.wtMASource),
    esa = ema(src, p.wtChannelLen);
  const de = ema(
    src.map((v, i) =>
      finite(v) && finite(esa[i]) ? Math.abs(v - esa[i]!) : null,
    ),
    p.wtChannelLen,
  );
  const ci = src.map((v, i) =>
    finite(v) && finite(esa[i]) && finite(de[i]) && de[i] !== 0
      ? (v - esa[i]!) / (0.015 * de[i]!)
      : null,
  );
  const wt1 = ema(ci, p.wtAverageLen),
    wt2 = sma(wt1, p.wtMALen);
  return {
    wt1,
    wt2,
    fast: wt1.map((v, i) => (finite(v) && finite(wt2[i]) ? v - wt2[i]! : null)),
  };
}
function moneyFlow(bars: Candle[], p: VmcParams) {
  return sma(
    bars.map((b) =>
      b.high === b.low
        ? null
        : ((b.close - b.open) / (b.high - b.low)) * p.rsiMFIMultiplier,
    ),
    p.rsiMFIperiod,
  ).map((v) => (v === null ? null : v - p.rsiMFIPosY));
}
export function schaff(src: Values, p: VmcParams): Values {
  const a = ema(src, p.tcfastLength),
    b = ema(src, p.tcslowLength);
  const macd = a.map((v, i) => (finite(v) && finite(b[i]) ? v - b[i]! : null));
  const delta: Values = [],
    out: Values = [];
  let gamma = 0,
    eta = 0;
  for (let i = 0; i < src.length; i++) {
    const r = extrema(macd, i, p.tclength);
    if (r && r[1] > r[0] && finite(macd[i]))
      gamma = (100 * (macd[i]! - r[0])) / (r[1] - r[0]);
    delta.push(
      i ? delta[i - 1]! + p.tcfactor * (gamma - delta[i - 1]!) : gamma,
    );
    const s = extrema(delta, i, p.tclength)!;
    if (s[1] > s[0]) eta = (100 * (delta[i]! - s[0])) / (s[1] - s[0]);
    out.push(i ? out[i - 1]! + p.tcfactor * (eta - out[i - 1]!) : eta);
  }
  return out;
}
interface Pivot {
  index: number;
  value: number;
  price: number;
}
export interface Divergence {
  top: Pivot | null;
  bottom: Pivot | null;
  previousTop: Pivot | null;
  previousBottom: Pivot | null;
  bear: boolean;
  bull: boolean;
  hiddenBear: boolean;
  hiddenBull: boolean;
}
/** Five-bar strict fractals become known two bars after the pivot. valuewhen(...)[2] is preserved. */
export function divergences(
  values: Values,
  bars: Candle[],
  topLimit: number,
  bottomLimit: number,
  limits: boolean,
): Divergence[] {
  const tops: (Pivot | null)[] = [],
    bottoms: (Pivot | null)[] = [];
  let top: Pivot | null = null,
    bottom: Pivot | null = null;
  return values.map((_, i) => {
    const j = i - 2,
      v = values[j],
      others = [values[j - 2], values[j - 1], values[j + 1], values[j + 2]];
    const valid = finite(v) && others.every(finite);
    const t =
      valid && others.every((x) => x! < v!) && (!limits || v! >= topLimit)
        ? { index: j, value: v!, price: bars[j].high }
        : null;
    const b =
      valid && others.every((x) => x! > v!) && (!limits || v! <= bottomLimit)
        ? { index: j, value: v!, price: bars[j].low }
        : null;
    const pt = tops[i - 2] ?? null,
      pb = bottoms[i - 2] ?? null;
    // Pine v4 casts numeric fractals to bool: a zero-valued pivot is false.
    if (t?.value) top = t;
    if (b?.value) bottom = b;
    tops.push(top);
    bottoms.push(bottom);
    return {
      top: t,
      bottom: b,
      previousTop: pt,
      previousBottom: pb,
      bear: !!(t?.value && pt && t.price > pt.price && t.value < pt.value),
      bull: !!(b?.value && pb && b.price < pb.price && b.value > pb.value),
      hiddenBear: !!(
        t?.value &&
        pt &&
        t.price < pt.price &&
        t.value > pt.value
      ),
      hiddenBull: !!(
        b?.value &&
        pb &&
        b.price > pb.price &&
        b.value < pb.value
      ),
    };
  });
}
/** gaps_off merge: historical HTF values appear at close; HA lookahead_on at open.
 * Lower TF requests sample first intrabar with lookahead_on, last with lookahead_off.
 * In confirmed mode only candles closed at the chart evaluation time are eligible. */
export function alignValues(
  bars: Candle[],
  chartStep: number,
  other: Candle[],
  step: number,
  values: Values,
  lookahead: boolean,
  confirmed: boolean,
  now: number,
): Values {
  let cursor = -1;
  return bars.map((b) => {
    const close = Math.min(b.time + chartStep, now);
    if (step < chartStep && lookahead && !confirmed) {
      let lo = 0,
        hi = other.length;
      while (lo < hi) {
        const mid = (lo + hi) >>> 1;
        if (other[mid].time < b.time) lo = mid + 1;
        else hi = mid;
      }
      return other[lo] && other[lo].time < close ? (values[lo] ?? null) : null;
    }
    const cutoff = lookahead && !confirmed && step > chartStep ? b.time : close;
    while (cursor + 1 < other.length) {
      const o = other[cursor + 1];
      const eligible =
        lookahead && !confirmed && step > chartStep
          ? o.time <= cutoff
          : o.time + step <= cutoff;
      if (!eligible) break;
      cursor++;
    }
    // Match the developing value only on the active chart bar; never borrow it on past bars.
    let k = cursor;
    if (
      !confirmed &&
      b.time <= now &&
      now < b.time + chartStep &&
      other[k + 1]?.time <= now
    )
      k++;
    return k >= 0 ? (values[k] ?? null) : null;
  });
}
export function heikinAshiDirection(bars: Candle[]): Values {
  let open = 0,
    close = 0;
  return bars.map((b, i) => {
    open = i ? (open + close) / 2 : (b.open + b.close) / 2;
    close = (b.open + b.high + b.low + b.close) / 4;
    return close > open ? 1 : 0;
  });
}
export function requiredVmcIntervals(p: VmcParams): CandleInterval[] {
  const a: CandleInterval[] = [];
  if (p.sommiFlagShow || p.sommiShowVwap) a.push(vmcTimeframes[p.sommiVwapTF]);
  if (p.sommiDiamondShow)
    a.push(vmcTimeframes[p.sommiHTCRes], vmcTimeframes[p.sommiHTCRes2]);
  if (p.macdWTColorsShow) a.push(vmcTimeframes[p.macdWTColorsTF]);
  return [...new Set(a)];
}
export function computeVmc(
  bars: Candle[],
  raw: unknown = {},
  ctx: VmcContext = {},
): VmcResult {
  const p = normalizeVmcParams(raw),
    interval = ctx.interval ?? "1h",
    step = candleIntervals[interval],
    now = ctx.now ?? Date.now() / 1000;
  const wt = waveTrend(bars, p),
    mfi = moneyFlow(bars, p),
    rs = rsi(source(bars, p.rsiSRC), p.rsiLen);
  const sx = source(bars, p.stochSRC).map((v) =>
    p.stochUseLog ? (finite(v) && v > 0 ? Math.log(v) : null) : v,
  );
  const kk = sma(
      stochastic(rsi(sx, p.stochRsiLen), p.stochLen),
      p.stochKSmooth,
    ),
    d = sma(kk, p.stochDSmooth);
  const k = kk.map((v, i) =>
    p.stochAvg ? (finite(v) && finite(d[i]) ? (v + d[i]!) / 2 : null) : v,
  );
  const tc = schaff(source(bars, p.tcSRC), p),
    warnings: string[] = [];
  function history(tf: CandleInterval) {
    return tf === interval ? bars : (ctx.histories?.[tf] ?? []);
  }
  function align(tf: CandleInterval, v: Values, lookahead = false) {
    return alignValues(
      bars,
      step,
      history(tf),
      candleIntervals[tf],
      v,
      lookahead,
      p.mtfMode === "confirmed",
      now,
    );
  }
  for (const tf of requiredVmcIntervals(p)) {
    if (!history(tf).length)
      warnings.push(
        `Нет данных ${tf}: соответствующие сигналы MTF недоступны.`,
      );
    else if (history(tf)[0].time > bars[0]?.time)
      warnings.push(
        `История ${tf} покрывает только последние ${history(tf).length} свечей: ранние сигналы MTF недоступны.`,
      );
  }
  const htf = vmcTimeframes[p.sommiVwapTF];
  const hv =
    p.sommiFlagShow || p.sommiShowVwap
      ? align(htf, waveTrend(history(htf), p).fast)
      : [];
  const sommi = ema(hv, 3);
  const ha1 = p.sommiDiamondShow
    ? align(
        vmcTimeframes[p.sommiHTCRes],
        heikinAshiDirection(history(vmcTimeframes[p.sommiHTCRes])),
        true,
      )
    : [];
  const ha2 = p.sommiDiamondShow
    ? align(
        vmcTimeframes[p.sommiHTCRes2],
        heikinAshiDirection(history(vmcTimeframes[p.sommiHTCRes2])),
        true,
      )
    : [];
  let macd: Values = [],
    macdSignal: Values = [],
    macdMfi: Values = [];
  if (p.macdWTColorsShow) {
    const tf = vmcTimeframes[p.macdWTColorsTF],
      h = history(tf),
      s = source(h, "close"),
      fast = ema(s, 28),
      slow = ema(s, 42);
    const m = fast.map((v, i) =>
      finite(v) && finite(slow[i]) ? v - slow[i]! : null,
    );
    macd = align(tf, m);
    macdSignal = align(tf, sma(m, 9));
    macdMfi = align(tf, moneyFlow(h, p));
  }
  const wd = divergences(wt.wt2, bars, p.wtDivOBLevel, p.wtDivOSLevel, true),
    wa = divergences(
      wt.wt2,
      bars,
      p.wtDivOBLevel_add,
      p.wtDivOSLevel_add,
      true,
    ),
    wn = divergences(wt.wt2, bars, 0, 0, false);
  const rd = divergences(rs, bars, p.rsiDivOBLevel, p.rsiDivOSLevel, true),
    rn = divergences(rs, bars, 0, 0, false),
    sd = divergences(k, bars, 0, 0, false);
  const events: VmcEvent[] = [];
  const points: VmcPoint[] = bars.map((b, i) => ({
    time: b.time,
    values: {
      wt1: wt.wt1[i],
      wt2: wt.wt2[i],
      fast: wt.fast[i],
      mfi: mfi[i],
      rsi: rs[i],
      k: k[i],
      d: d[i],
      schaff: tc[i],
      sommi: sommi[i] ?? null,
    },
    marks: [],
    segments: [],
    wt1Color: p.colorWT1blue,
    wt2Color: p.colorWT2purple,
  }));
  for (let i = 0; i < bars.length; i++) {
    const a = wt.wt1[i],
      b = wt.wt2[i],
      prevA = wt.wt1[i - 1],
      prevB = wt.wt2[i - 1];
    const cross =
      finite(a) &&
      finite(b) &&
      finite(prevA) &&
      finite(prevB) &&
      ((a > b && prevA <= prevB) || (a < b && prevA >= prevB));
    const up = cross && a! >= b!,
      down = cross && a! <= b!,
      buy = up && b! <= p.osLevel,
      sell = down && b! >= p.obLevel;
    function event(name: string, pivot = false) {
      events.push({
        name,
        time: bars[i].time,
        ...(pivot && i >= 2 ? { pivotTime: bars[i - 2].time } : {}),
      });
    }
    function mark(
      index: number,
      value: number,
      color: string,
      label: string,
      shape: VmcMark["shape"] = "circle",
      size = 4,
    ) {
      if (points[index])
        points[index].marks.push({
          value,
          color,
          label,
          shape,
          size,
          confirmedAt: bars[i].time,
        });
    }
    if (cross) {
      mark(
        i,
        b!,
        up ? p.signalcolorup : p.signalcolordown,
        up ? "WT Cross Up" : "WT Cross Down",
        "circle",
        2,
      );
      event(up ? "Buy small circle" : "Sell small circle");
    }
    if (buy) {
      event("Buy");
      if (p.wtBuyShow) mark(i, -107, "#3fff00", "Buy");
    }
    if (sell) {
      event("Sell");
      if (p.wtSellShow) mark(i, 105, "#ff0000", "Sell");
    }
    function divSegments(
      ds: Divergence,
      hidden: Divergence,
      regular: boolean,
      showHidden: boolean,
      bearColor: string,
      bullColor: string,
      name: string,
    ) {
      for (const bull of [false, true]) {
        const reg = bull ? ds.bull : ds.bear,
          hid = bull ? hidden.hiddenBull : hidden.hiddenBear;
        const selected =
          regular && reg ? ds : showHidden && hid ? hidden : null;
        const pivot = bull ? selected?.bottom : selected?.top,
          prev = bull ? selected?.previousBottom : selected?.previousTop;
        if (pivot && prev)
          points[pivot.index].segments.push({
            from: prev.index,
            fromValue: prev.value,
            toValue: pivot.value,
            color: bull ? bullColor : bearColor,
            label: name + (bull ? " Bull" : " Bear"),
            confirmedAt: bars[i].time,
          });
      }
    }
    divSegments(
      wd[i],
      p.showHiddenDiv_nl ? wn[i] : wd[i],
      p.wtShowDiv,
      p.wtShowHiddenDiv,
      p.WTBearDivColorDown,
      p.wtBullDivColorUp,
      "WT",
    );
    divSegments(
      wa[i],
      wa[i],
      p.wtShowDiv && p.wtDivOBLevel_addshow,
      p.wtShowHiddenDiv && p.wtDivOBLevel_addshow,
      p.WTBearDivColorDown,
      p.wtBullDivColorUp,
      "WT 2",
    );
    divSegments(
      rd[i],
      p.showHiddenDiv_nl ? rn[i] : rd[i],
      p.rsiShowDiv,
      p.rsiShowHiddenDiv,
      "#e60000",
      "#38ff42",
      "RSI",
    );
    divSegments(
      sd[i],
      sd[i],
      p.stochShowDiv,
      p.stochShowHiddenDiv,
      "#e60000",
      "#38ff42",
      "Stoch",
    );
    const bullDiv =
      (p.wtShowDiv && (wd[i].bull || wa[i].bull)) ||
      (p.stochShowDiv && sd[i].bull) ||
      (p.rsiShowDiv && rd[i].bull);
    const bearDiv =
      (p.wtShowDiv && (wd[i].bear || wa[i].bear)) ||
      (p.stochShowDiv && sd[i].bear) ||
      (p.rsiShowDiv && rd[i].bear);
    if (bullDiv) {
      event("Buy divergence", true);
      const color = wd[i].bull
        ? "#3fff00"
        : wa[i].bull
          ? "#3fff0066"
          : p.rsiShowDiv
            ? "#3fff00"
            : null;
      if (p.wtDivShow && color) mark(i - 2, -106, color, "Bull divergence");
    }
    if (bearDiv) {
      event("Sell divergence", true);
      const color = wd[i].bear
        ? "#ff0000"
        : wa[i].bear
          ? "#ff000066"
          : rd[i].bear
            ? "#ff0000"
            : null;
      if (p.wtDivShow && color) mark(i - 2, 106, color, "Bear divergence");
    }
    const previous = wd[i].previousBottom;
    const gold =
      ((p.wtShowDiv && wd[i].bull) || (p.rsiShowDiv && rd[i].bull)) &&
      previous &&
      previous.value <= p.osLevel3 &&
      finite(b) &&
      b > p.osLevel3 &&
      previous.value - b <= -5 &&
      finite(rs[previous.index]) &&
      rs[previous.index]! < 30;
    if (gold) {
      event("Gold buy", true);
      if (p.wtGoldShow) mark(i - 2, -106, "#e2a400", "Gold", "circle", 6);
    }
    if (p.sommiFlagShow && finite(mfi[i]) && finite(hv[i])) {
      const bear =
        mfi[i]! < p.soomiRSIMFIBearLevel &&
        b! > p.soomiFlagWTBearLevel &&
        down &&
        hv[i]! < p.sommiVwapBearLevel;
      const bull =
        mfi[i]! > p.soomiRSIMFIBullLevel &&
        b! < p.soomiFlagWTBullLevel &&
        up &&
        hv[i]! > p.sommiVwapBullLevel;
      if (bear || bull) {
        event(bull ? "Sommi bullish flag" : "Sommi bearish flag");
        mark(
          i,
          bull ? -108 : 108,
          bull ? "#31c0ff" : "#ff00f0",
          "Sommi flag",
          "flag",
        );
      }
    }
    if (p.sommiDiamondShow && finite(ha1[i]) && finite(ha2[i])) {
      const bear =
        b! >= p.soomiDiamondWTBearLevel && down && ha1[i] === 0 && ha2[i] === 0;
      const bull =
        b! <= p.soomiDiamondWTBullLevel && up && ha1[i] === 1 && ha2[i] === 1;
      if (bear || bull) {
        event(bull ? "Sommi bullish diamond" : "Sommi bearish diamond");
        mark(
          i,
          bull ? -108 : 108,
          bull ? "#31c0ff" : "#ff00f0",
          "Sommi diamond",
          "diamond",
        );
      }
    }
    if (
      p.macdWTColorsShow &&
      finite(macd[i]) &&
      finite(macdSignal[i]) &&
      finite(macdMfi[i])
    ) {
      const up = macd[i]! >= macdSignal[i]!,
        m = macdMfi[i]!;
      points[i].wt1Color = up
        ? m > 0
          ? "#7ee57e"
          : "#4caf58"
        : m < 0
          ? "#ff3535"
          : "#af4c4c";
      points[i].wt2Color = up
        ? m < 0
          ? "#132213"
          : "#305630"
        : m < 0
          ? "#770000"
          : "#310101";
    }
  }
  if (bars.length && !finite(mfi.at(-1)))
    warnings.push(
      "Недостаточно истории для MFI: уменьшите период или загрузите больше свечей.",
    );
  return { points, events, warnings };
}
