/** Pine-style na propagation. EMA seeds at first finite sample; RMA seeds with SMA. */
export type Values = (number | null)[];
export const finite = (v: number | null | undefined): v is number =>
  typeof v === "number" && Number.isFinite(v);
export function sma(x: Values, length: number): Values {
  const q: number[] = [];
  let sum = 0;
  return x.map((v) => {
    if (finite(v)) {
      q.push(v);
      sum += v;
      if (q.length > length) sum -= q.shift()!;
    }
    return q.length === length ? sum / length : null;
  });
}
export function ema(x: Values, length: number): Values {
  let state: number | null = null;
  const alpha = 2 / (length + 1);
  return x.map((v) => {
    if (finite(v)) state = state === null ? v : alpha * v + (1 - alpha) * state;
    return state;
  });
}
export function rma(x: Values, length: number): Values {
  let state: number | null = null,
    sum = 0,
    count = 0;
  return x.map((v) => {
    if (finite(v)) {
      if (state === null) {
        sum += v;
        if (++count === length) state = sum / length;
      } else state = (v + (length - 1) * state) / length;
    }
    return state;
  });
}
export function rsi(x: Values, length: number): Values {
  const changes = x.map((v, i) =>
    finite(v) && finite(x[i - 1]) ? v - x[i - 1]! : null,
  );
  const up = rma(
    changes.map((v) => (v === null ? null : Math.max(v, 0))),
    length,
  );
  const down = rma(
    changes.map((v) => (v === null ? null : Math.max(-v, 0))),
    length,
  );
  return up.map((u, i) =>
    !finite(u) || !finite(down[i])
      ? null
      : down[i] === 0
        ? u === 0
          ? null
          : 100
        : 100 - 100 / (1 + u / down[i]!),
  );
}
export function extrema(
  x: Values,
  i: number,
  length: number,
): [number, number] | null {
  const a = x.slice(Math.max(0, i - length + 1), i + 1).filter(finite);
  return a.length ? [Math.min(...a), Math.max(...a)] : null;
}
export function stochastic(x: Values, length: number): Values {
  return x.map((v, i) => {
    const r = extrema(x, i, length);
    return finite(v) && r && r[1] !== r[0]
      ? (100 * (v - r[0])) / (r[1] - r[0])
      : null;
  });
}
