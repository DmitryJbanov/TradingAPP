import {
  customSeriesDefaultOptions,
  type CustomData,
  type CustomSeriesWhitespaceData,
  type ICustomSeriesPaneView,
  type ICustomSeriesPaneRenderer,
  type PaneRendererCustomData,
  type Time,
} from "lightweight-charts";
import type { VmcPoint, WaveKey } from "./vmc";
import { finite } from "./pine-math";
import type { VmcParams, VmcStyle } from "./vmc-settings";
export interface VmcChartData extends CustomData {
  point: VmcPoint;
  index: number;
}
interface Plot {
  key: WaveKey;
  show: boolean;
  area?: boolean;
  opacity: number;
  color: (p: VmcPoint) => string;
}
/** One custom series owns an oscillator pane. The chart owns time/price transforms,
 * crosshair, axis dragging and pane sizing; this renderer only draws indicator geometry. */
export class VmcRenderer implements ICustomSeriesPaneView<Time, VmcChartData> {
  private data: PaneRendererCustomData<Time, VmcChartData> | null = null;
  constructor(
    private params: VmcParams,
    private style: VmcStyle,
    private text: string,
    private ordinal: number,
  ) {}
  configure(params: VmcParams, style: VmcStyle, text: string, ordinal: number) {
    this.params = params;
    this.style = style;
    this.text = text;
    this.ordinal = ordinal;
  }
  defaultOptions() {
    return {
      ...customSeriesDefaultOptions,
      priceLineVisible: false,
      lastValueVisible: false,
      priceFormat: { type: "price" as const, precision: 2, minMove: 0.01 },
    };
  }
  isWhitespace(
    data: VmcChartData | CustomSeriesWhitespaceData<Time>,
  ): data is CustomSeriesWhitespaceData<Time> {
    return !("point" in data);
  }
  update(data: PaneRendererCustomData<Time, VmcChartData>) {
    this.data = data;
  }
  private plots(): Plot[] {
    const p = this.params;
    return [
      {
        key: "wt1",
        show: p.wtShow,
        area: true,
        opacity: 0.7,
        color: (d) => d.wt1Color,
      },
      {
        key: "wt2",
        show: p.wtShow,
        area: true,
        opacity: 0.75,
        color: (d) => d.wt2Color,
      },
      {
        key: "fast",
        show: p.vwapShow,
        area: true,
        opacity: 0.55,
        color: () => p.VWAPColor,
      },
      {
        key: "mfi",
        show: p.rsiMFIShow,
        area: true,
        opacity: 0.5,
        color: (d) =>
          d.values.mfi! > 0 ? p.rsiMFIColorAbove : p.rsiMFIColorBelow,
      },
      {
        key: "rsi",
        show: p.rsiShow,
        opacity: 0.75,
        color: (d) =>
          d.values.rsi! <= p.rsiOversold
            ? p.rsioscolor
            : d.values.rsi! >= p.rsiOverbought
              ? p.rsiobcolor
              : p.rsinacolor,
      },
      { key: "k", show: p.stochShow, opacity: 0.3, color: () => p.stochkcolor },
      { key: "d", show: p.stochShow, opacity: 0.1, color: () => p.stochdcolor },
      { key: "schaff", show: p.tcLine, opacity: 0.75, color: () => "#673ab7" },
      {
        key: "sommi",
        show: p.sommiShowVwap,
        opacity: 0.45,
        color: () => "#ffe500",
      },
    ];
  }
  priceValueBuilder(data: VmcChartData): number[] {
    const values = this.plots()
      .filter((p) => p.show)
      .map((p) => data.point.values[p.key])
      .filter(finite);
    values.push(
      0,
      ...data.point.marks
        .filter((m) => this.style.crosses || m.size !== 2)
        .map((m) => m.value),
    );
    for (const seg of data.point.segments)
      values.push(seg.fromValue, seg.toValue);
    if (this.style.levels)
      values.push(
        this.params.obLevel2,
        this.params.obLevel3,
        this.params.osLevel2,
      );
    if (this.params.rsiMFIShow) values.push(-99);
    return [
      Math.max(...values),
      Math.min(...values),
      data.point.values.wt2 ?? 0,
    ];
  }
  renderer(): ICustomSeriesPaneRenderer {
    return {
      draw: (target, toY) => {
        const data = this.data;
        if (!data?.visibleRange) return;
        target.useMediaCoordinateSpace(({ context: ctx, mediaSize: size }) => {
          const p = this.params,
            style = this.style,
            all = data.bars;
          const start = Math.max(0, data.visibleRange!.from - 1),
            end = Math.min(all.length, data.visibleRange!.to + 1),
            bars = all.slice(start, end);
          if (!bars.length) return;
          ctx.save();
          ctx.beginPath();
          ctx.rect(0, 0, size.width, size.height);
          ctx.clip();
          if (p.darkMode) {
            ctx.fillStyle = "#000000";
            ctx.fillRect(0, 0, size.width, size.height);
          }
          const y = (v: number) => toY(v) ?? 0;
          function line(
            x1: number,
            v1: number,
            x2: number,
            v2: number,
            color: string,
            width = style.lineWidth,
          ) {
            ctx.strokeStyle = color;
            ctx.lineWidth = width;
            ctx.beginPath();
            ctx.moveTo(x1, y(v1));
            ctx.lineTo(x2, y(v2));
            ctx.stroke();
          }
          ctx.globalAlpha = (0.4 * style.opacity) / 100;
          line(0, 0, size.width, 0, this.text, 1);
          if (style.levels) {
            ctx.globalAlpha = (0.25 * style.opacity) / 100;
            ctx.setLineDash([4, 4]);
            for (const level of [p.obLevel2, p.obLevel3, p.osLevel2])
              line(0, level, size.width, level, this.text, 1);
            ctx.setLineDash([]);
          }
          for (const plot of this.plots().filter((p) => p.show)) {
            ctx.globalAlpha = (plot.opacity * style.opacity) / 100;
            for (let i = 1; i < bars.length; i++) {
              const prev = bars[i - 1],
                curr = bars[i],
                a = prev.originalData.point.values[plot.key],
                b = curr.originalData.point.values[plot.key];
              if (!finite(a) || !finite(b)) continue;
              const color = plot.color(curr.originalData.point);
              if (plot.area) {
                ctx.fillStyle = color;
                ctx.beginPath();
                ctx.moveTo(prev.x, y(0));
                ctx.lineTo(prev.x, y(a));
                ctx.lineTo(curr.x, y(b));
                ctx.lineTo(curr.x, y(0));
                ctx.closePath();
                ctx.fill();
              } else line(prev.x, a, curr.x, b, color);
              if (plot.key === "schaff") {
                ctx.globalAlpha = (0.5 * style.opacity) / 100;
                line(prev.x, a, curr.x, b, "#ffffff", 1);
                ctx.globalAlpha = (plot.opacity * style.opacity) / 100;
              }
            }
          }
          if (p.stochShow) {
            for (let i = 1; i < bars.length; i++) {
              const a = bars[i - 1],
                b = bars[i],
                v = a.originalData.point.values,
                w = b.originalData.point.values;
              if (![v.k, v.d, w.k, w.d].every(finite)) continue;
              ctx.globalAlpha =
                ((w.k! >= w.d! ? 0.05 : 0.1) * style.opacity) / 100;
              ctx.fillStyle = w.k! >= w.d! ? "#21baf3" : "#673ab7";
              ctx.beginPath();
              ctx.moveTo(a.x, y(v.k!));
              ctx.lineTo(b.x, y(w.k!));
              ctx.lineTo(b.x, y(w.d!));
              ctx.lineTo(a.x, y(v.d!));
              ctx.closePath();
              ctx.fill();
            }
          }
          if (p.rsiMFIShow) {
            ctx.globalAlpha = (0.25 * style.opacity) / 100;
            for (const b of bars) {
              const v = b.originalData.point.values.mfi;
              if (!finite(v)) continue;
              ctx.fillStyle = v > 0 ? p.rsiMFIColorAbove : p.rsiMFIColorBelow;
              ctx.fillRect(
                b.x - data.barSpacing / 2,
                y(-95),
                data.barSpacing + 1,
                y(-99) - y(-95),
              );
            }
          }
          ctx.globalAlpha = style.opacity / 100;
          // All endpoints are considered so a line remains visible when its right pivot is offscreen.
          const byIndex = new Map(all.map((b) => [b.originalData.index, b]));
          for (const b of all) {
            for (const seg of b.originalData.point.segments) {
              const from = byIndex.get(seg.from);
              if (from && from.x <= size.width && b.x >= 0)
                line(from.x, seg.fromValue, b.x, seg.toValue, seg.color);
            }
          }
          for (const b of bars)
            for (const mark of b.originalData.point.marks) {
              if (mark.size === 2 && !style.crosses) continue;
              const x = b.x,
                v = y(mark.value),
                r = mark.size;
              ctx.fillStyle = mark.color;
              ctx.strokeStyle = mark.color;
              ctx.lineWidth = 1.5;
              ctx.beginPath();
              if (mark.shape === "circle") ctx.arc(x, v, r, 0, Math.PI * 2);
              else if (mark.shape === "diamond") {
                ctx.moveTo(x, v - r - 1);
                ctx.lineTo(x + r + 1, v);
                ctx.lineTo(x, v + r + 1);
                ctx.lineTo(x - r - 1, v);
                ctx.closePath();
              } else {
                ctx.moveTo(x - r, v + r);
                ctx.lineTo(x - r, v - r);
                ctx.lineTo(x + r, v - r);
                ctx.lineTo(x + 1, v);
                ctx.lineTo(x - r, v);
                ctx.stroke();
              }
              ctx.fill();
            }
          ctx.globalAlpha = 1;
          ctx.fillStyle = this.text;
          ctx.font = "12px ui-monospace, monospace";
          ctx.fillText(
            `VMC Cipher B #${this.ordinal} · WT ${p.wtChannelLen}/${p.wtAverageLen}/${p.wtMALen}`,
            12,
            18,
          );
          ctx.restore();
        });
      },
    };
  }
  destroy() {
    this.data = null;
  }
}
