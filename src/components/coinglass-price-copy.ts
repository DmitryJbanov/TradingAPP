import type { IChartApi, ISeriesApi } from "lightweight-charts";

/** Keep copying available on local HTTP installations without Clipboard API. */
export async function copyCoinglassPrice(
  price: number,
  notify: (message: string) => void,
) {
  const text = String(price);
  try {
    if (!navigator.clipboard?.writeText)
      throw new Error("Clipboard unavailable");
    await navigator.clipboard.writeText(text);
  } catch {
    const active = document.activeElement as HTMLElement | null;
    const field = document.createElement("textarea");
    field.value = text;
    field.readOnly = true;
    field.style.cssText =
      "position:fixed;opacity:0;pointer-events:none;left:0;top:0";
    // Stay inside an open modal's focus trap when copying from its preview.
    (active?.closest('[role="dialog"]') ?? document.body).appendChild(field);
    try {
      field.focus();
      field.select();
      if (!document.execCommand("copy")) throw new Error("Copy failed");
    } catch {
      notify(`Не удалось скопировать. Цена уровня: ${text}`);
      return;
    } finally {
      field.remove();
      active?.focus({ preventScroll: true });
    }
  }
  notify(`Цена ${text} скопирована`);
}

/** Canvas axis labels have no DOM target; hit-test only the main pane's price axis. */
export function bindCoinglassPriceCopy(
  host: HTMLElement,
  chart: IChartApi,
  series: ISeriesApi<"Candlestick">,
  prices: number[],
  notify: (message: string) => void,
) {
  async function click(event: MouseEvent) {
    const bounds = host.getBoundingClientRect();
    const x = event.clientX - bounds.left;
    const y = event.clientY - bounds.top;
    const axisWidth = chart.priceScale("right").width();
    if (
      x < bounds.width - axisWidth ||
      x > bounds.width ||
      y < 0 ||
      y > chart.panes()[0].getHeight()
    )
      return;
    const price = nearestLevelPrice(prices, y, (p) =>
      series.priceToCoordinate(p),
    );
    if (price === undefined) return;
    await copyCoinglassPrice(price, notify);
  }
  host.addEventListener("click", click);
  return () => host.removeEventListener("click", click);
}

export function nearestLevelPrice(
  prices: number[],
  y: number,
  coordinate: (price: number) => number | null,
) {
  let nearest: number | undefined;
  let distance = 11;
  for (const price of prices) {
    if (!Number.isFinite(price) || price <= 0) continue;
    const at = coordinate(price);
    if (at === null || at < 0) continue;
    const delta = Math.abs(at - y);
    if (delta < distance) {
      nearest = price;
      distance = delta;
    }
  }
  return nearest;
}
