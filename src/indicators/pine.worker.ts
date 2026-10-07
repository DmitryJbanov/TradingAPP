import { runPine } from "./pine-runtime";
// Pine requests are served from candles supplied by the host.
self.fetch = async () => {
  throw Error("Сетевые запросы из Pine Script не поддерживаются.");
};
self.onmessage = async (event) => {
  try {
    const {
      script,
      bars,
      symbol,
      timeframe,
      higherTimeframeBars,
      mintick,
      settings,
    } = event.data;
    self.postMessage({
      result: await runPine(
        script,
        bars,
        symbol,
        timeframe,
        higherTimeframeBars,
        mintick,
        settings,
      ),
    });
  } catch (error) {
    self.postMessage({
      error: error instanceof Error ? error.message : String(error),
    });
  }
};
