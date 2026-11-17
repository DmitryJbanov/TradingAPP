import type { IChartApi, ISeriesApi, Logical } from "lightweight-charts";
import { logicalAtTime, timeAtLogical } from "../domain/drawings";
import type { Candle } from "../domain/market";

export function chartStorageKey(
  user = "local",
  profile = "local",
  exchange: string,
  symbol: string,
) {
  return `vector.viewport.v1:${user}:${profile}:${exchange}:${symbol}`;
}
export function readChartStorage<T>(key: string): T | undefined {
  try {
    return JSON.parse(localStorage.getItem(key) ?? "null") ?? undefined;
  } catch {
    return undefined;
  }
}
export function writeChartStorage(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}
type Viewport = {
  from: number;
  to: number;
  auto: boolean;
  price?: { from: number; to: number };
};
export function restoreViewport(
  chart: IChartApi,
  series: ISeriesApi<"Candlestick">,
  bars: Candle[],
  interval: number,
  key: string,
) {
  const saved = readChartStorage<Viewport>(key);
  if (
    !saved ||
    !Number.isFinite(saved.from) ||
    !Number.isFinite(saved.to) ||
    saved.to <= saved.from ||
    !bars.length
  )
    return false;
  chart.timeScale().setVisibleLogicalRange({
    from: logicalAtTime(bars, saved.from, interval),
    to: logicalAtTime(bars, saved.to, interval),
  });
  const scale = series.priceScale();
  scale.setAutoScale(saved.auto !== false);
  if (
    saved.auto === false &&
    saved.price &&
    Number.isFinite(saved.price.from) &&
    Number.isFinite(saved.price.to) &&
    saved.price.to > saved.price.from
  )
    scale.setVisibleRange(saved.price);
  return true;
}
export function bindViewport(
  chart: IChartApi,
  series: ISeriesApi<"Candlestick">,
  container: HTMLElement,
  bars: Candle[],
  interval: number,
  key: string,
) {
  let frame = 0,
    timer: ReturnType<typeof setTimeout> | undefined;
  let disposed = false;
  let interacting = false,
    dirty = false;
  const save = () => {
    if (!dirty || !bars.length) return;
    dirty = false;
    const range = chart.timeScale().getVisibleLogicalRange();
    if (!range) return;
    const scale = series.priceScale();
    writeChartStorage(key, {
      from: timeAtLogical(bars, range.from as Logical, interval),
      to: timeAtLogical(bars, range.to as Logical, interval),
      auto: scale.options().autoScale,
      price: scale.getVisibleRange(),
    });
  };
  const queue = () => {
    dirty = true;
    clearTimeout(timer);
    timer = setTimeout(save, 180);
  };
  const start = (event: Event) => {
    if (
      (event.target as Element)?.closest(
        "button,input,select,textarea,.frvp-context-panel,.drawing-toolbar",
      )
    )
      return;
    interacting = true;
    queue();
  };
  const end = (event: PointerEvent) => {
    if (interacting || container.contains(event.target as Node)) {
      interacting = false;
      queue();
    }
  };
  const changed = () => {
    if (interacting) queue();
  };
  const wheel = (event: Event) => {
    if (
      (event.target as Element)?.closest(
        "button,input,select,textarea,.frvp-context-panel,.drawing-toolbar",
      )
    )
      return;
    start(event);
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      queue();
      interacting = false;
    });
  };
  chart.timeScale().subscribeVisibleLogicalRangeChange(changed);
  container.addEventListener("pointerdown", start);
  container.addEventListener("wheel", wheel, { passive: true });
  container.addEventListener("dblclick", wheel);
  window.addEventListener("pointerup", end);
  window.addEventListener("pagehide", save);
  return () => {
    if (disposed) return;
    disposed = true;
    clearTimeout(timer);
    cancelAnimationFrame(frame);
    save();
    chart.timeScale().unsubscribeVisibleLogicalRangeChange(changed);
    container.removeEventListener("pointerdown", start);
    container.removeEventListener("wheel", wheel);
    container.removeEventListener("dblclick", wheel);
    window.removeEventListener("pointerup", end);
    window.removeEventListener("pagehide", save);
  };
}
