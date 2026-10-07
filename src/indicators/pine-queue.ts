/** Finish the active calculation; collapse incoming candle ticks to the latest one. */
export function createPineQueue<T>(run: (value: T) => Promise<void>) {
  let pending: { value: T } | undefined;
  let running = false;
  let closed = false;
  return {
    async enqueue(value: T) {
      if (closed) return;
      pending = { value };
      if (running) return;
      running = true;
      try {
        while (pending && !closed) {
          const next = pending.value;
          pending = undefined;
          await run(next);
        }
      } finally {
        running = false;
      }
    },
    close() {
      closed = true;
      pending = undefined;
    },
  };
}
