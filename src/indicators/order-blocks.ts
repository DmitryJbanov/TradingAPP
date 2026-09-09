// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. https://mozilla.org/MPL/2.0/
// Adapted from Sonarlab - Order Blocks 1.0.2, © ClayeWeight.
import type { Candle } from "../domain/market";
import { normalizeOrderBlockParams } from "./order-blocks-settings";

export const maxOrderBlocks = 20;
export interface OrderBlock {
  id: string;
  side: "bullish" | "bearish";
  startTime: number;
  createdAt: number;
  top: number;
  bottom: number;
}
export interface OrderBlockEvent {
  time: number;
  side: OrderBlock["side"];
  blockId: string;
  message: "Price inside Bearish OB" | "Price inside Bullish OB";
}
export interface OrderBlockResult {
  blocks: OrderBlock[];
  events: OrderBlockEvent[];
  roc: (number | null)[];
}

/** Replay the supplied history; rebuilding also rolls back an evolving last bar.
 * Deleted zones disappear from the whole chart, as with Pine box.delete(). */
export function computeOrderBlocks(
  bars: Candle[],
  raw: unknown = {},
): OrderBlockResult {
  const p = normalizeOrderBlockParams(raw);
  const threshold = p.sens / 100;
  const roc = bars.map((bar, i) => {
    const base = bars[i - 4]?.open;
    if (
      !Number.isFinite(bar.open) ||
      !Number.isFinite(base) ||
      base === 0 ||
      base === undefined
    )
      return null;
    const value = ((bar.open - base) / base) * 100;
    return Number.isFinite(value) ? value : null;
  });
  let crossIndex: number | null = null;
  let blocks: OrderBlock[] = [];
  const events: OrderBlockEvent[] = [];
  bars.forEach((bar, index) => {
    const pc = roc[index],
      previous = roc[index - 1];
    const bearish =
      pc != null &&
      previous != null &&
      pc < -threshold &&
      previous >= -threshold;
    const bullish =
      pc != null && previous != null && pc > threshold && previous <= threshold;
    if (bearish || bullish) {
      const previousCross = crossIndex;
      // Every crossing updates this shared index, even when creation is suppressed.
      crossIndex = index;
      if (previousCross !== null && index - previousCross > 5) {
        let sourceIndex = index; // The Pine loop defaults to offset 0 if none matches.
        for (let offset = 4; offset <= 15; offset++) {
          const source = bars[index - offset];
          if (
            source &&
            (bearish ? source.close > source.open : source.close < source.open)
          ) {
            sourceIndex = index - offset;
            break;
          }
        }
        const source = bars[sourceIndex];
        if (
          Number.isFinite(source.high) &&
          Number.isFinite(source.low) &&
          source.high >= source.low
        ) {
          blocks.push({
            id: `${bar.time}:${bearish ? "bearish" : "bullish"}`,
            side: bearish ? "bearish" : "bullish",
            startTime: source.time,
            createdAt: bar.time,
            top: source.high,
            bottom: source.low,
          });
          // Pine's max_boxes_count applies to both directions together, oldest first.
          if (blocks.length > maxOrderBlocks) blocks.shift();
        }
      }
    }
    const bullMitigation =
      p.OBMitigationType === "Close" ? bars[index - 1]?.close : bar.low;
    const bearMitigation =
      p.OBMitigationType === "Close" ? bars[index - 1]?.close : bar.high;
    const removed = new Set<string>();
    let event: OrderBlockEvent | undefined;
    // Pine visits newest bearish boxes first, then newest bullish boxes.
    for (const side of ["bearish", "bullish"] as const) {
      for (let i = blocks.length - 1; i >= 0; i--) {
        const block = blocks[i];
        if (block.side !== side) continue;
        if (
          side === "bearish"
            ? bearMitigation != null && bearMitigation > block.top
            : bullMitigation != null && bullMitigation < block.bottom
        )
          removed.add(block.id);
        // The source checks alerts after deletion, using the previously read bounds.
        // alert.freq_once_per_bar allows only the first matching call on this bar.
        if (
          !event &&
          (side === "bearish"
            ? p.sell_alert && bar.high > block.bottom
            : p.buy_alert && bar.low < block.top)
        ) {
          event = {
            time: bar.time,
            side,
            blockId: block.id,
            message:
              side === "bearish"
                ? "Price inside Bearish OB"
                : "Price inside Bullish OB",
          };
        }
      }
    }
    blocks = blocks.filter((block) => !removed.has(block.id));
    if (event) events.push(event);
  });
  return { blocks, events, roc };
}
