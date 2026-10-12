import {
  validWhaleAddress,
  type WhaleFill,
  type WhalePosition,
  type WhaleProfile,
} from "./whales";
import type { Candle } from "./market";

/** The candle containing the execution; gaps and unloaded history have no anchor. */
export function whaleCandleTime(
  bars: Candle[],
  time: number | undefined,
  interval: number,
): number | null {
  if (
    !bars.length ||
    time === undefined ||
    !Number.isFinite(time) ||
    interval <= 0
  )
    return null;
  let lo = 0,
    hi = bars.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (bars[mid].time <= time) lo = mid + 1;
    else hi = mid;
  }
  const bar = bars[lo - 1];
  return bar && time < bar.time + interval ? bar.time : null;
}

export function whaleChartUrl(row: WhaleFill | WhalePosition) {
  if (!validWhaleAddress(row.address) || !/^[A-Z0-9]{1,20}$/.test(row.coin))
    return null;
  const query = new URLSearchParams({
    whale: row.address.toLowerCase(),
    coin: row.coin,
  });
  if ("id" in row) query.set("fill", row.id);
  else {
    query.set("position", row.side);
    if (row.positionId) query.set("positionId", row.positionId);
  }
  return `/pair/${encodeURIComponent(`FUTURES:${row.coin}USDT`)}?${query}`;
}

export interface WhaleChartSelection {
  address: string;
  coin: string;
  fill?: string;
  position?: string;
  positionId?: string;
}
export interface WhaleChartPoint {
  id: string;
  address: string;
  coin: string;
  price: number;
  time?: number;
  label: string;
  pnl: number | null;
  size: number;
  selected: boolean;
  color: string;
}
export function readWhaleSelection(
  search: string,
  symbol: string,
): WhaleChartSelection | undefined {
  const query = new URLSearchParams(search),
    address = query.get("whale") ?? "",
    coin = query.get("coin") ?? "";
  const fill = query.get("fill") ?? undefined,
    position = query.get("position") ?? undefined;
  const positionId = query.get("positionId") ?? undefined;
  if (
    !validWhaleAddress(address) ||
    !/^[A-Z0-9]{1,20}$/.test(coin) ||
    symbol.replace(/^FUTURES:/, "") !== `${coin}USDT`
  )
    return;
  if (fill && !/^[A-Za-z0-9:._-]{1,180}$/.test(fill)) return;
  if (position && !["Long", "Short"].includes(position)) return;
  if (positionId && !/^[A-Za-z0-9_-]{1,80}$/.test(positionId)) return;
  return { address: address.toLowerCase(), coin, fill, position, positionId };
}
export function whaleChartPoints(
  profile: WhaleProfile | undefined,
  selection: WhaleChartSelection | undefined,
  marketPosition?: WhalePosition,
): WhaleChartPoint[] {
  if (!profile || !selection || profile.address !== selection.address)
    return [];
  const fills = profile.fills.filter(
    (f) =>
      f.coin === selection.coin &&
      Number.isFinite(f.price) &&
      f.price > 0 &&
      Number.isFinite(f.time),
  );
  if (selection.position) {
    if (selection.positionId && !marketPosition) return [];
    const position = profile.positions.find(
      (p) => p.coin === selection.coin && p.side === selection.position,
    );
    if (!position?.entryPrice || !Number.isFinite(position.entryPrice))
      return [];
    const sourceTime = marketPosition?.entryTime ?? position.entryTime;
    const time =
      sourceTime != null && Number.isFinite(sourceTime) && sourceTime > 0
        ? sourceTime / 1000
        : undefined;
    return [
      {
        id: `position:${position.coin}:${position.side}`,
        address: profile.address,
        coin: position.coin,
        price: position.entryPrice,
        time,
        label: `Вход ${position.side} · средняя цена`,
        pnl: position.pnl,
        size: position.size,
        selected: true,
        color: position.side === "Long" ? "#22ab94" : "#f23645",
      },
    ];
  }
  return fills.map((f) => ({
    id: f.id,
    address: f.address,
    coin: f.coin,
    price: f.price,
    time: f.time / 1000,
    label: `${f.action.includes(">") ? "Выход → вход" : /Close|Liquidat/i.test(f.action) ? "Выход" : "Вход"} ${f.action.includes(">") ? f.action.replace(">", "→") : f.action.includes("Long") ? "Long" : "Short"}`,
    pnl: f.pnl,
    size: f.size,
    selected: f.id === selection.fill,
    color: f.side === "Buy" ? "#22ab94" : "#f23645",
  }));
}
