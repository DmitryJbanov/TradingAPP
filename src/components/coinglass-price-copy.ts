import type { IChartApi, ISeriesApi } from "lightweight-charts";

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
    try {
      await navigator.clipboard.writeText(String(price));
      notify(`Цена ${price} скопирована`);
    } catch {
      notify(`Не удалось скопировать. Цена уровня: ${price}`);
    }
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
