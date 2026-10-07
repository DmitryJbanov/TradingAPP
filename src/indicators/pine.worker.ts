import { runPine } from "./pine-runtime";
// Scripts execute on supplied candles. External data requests require a host adapter.
self.fetch = async () => {
  throw Error("Сетевые запросы из Pine Script не поддерживаются.");
};
self.onmessage = async (event) => {
  try {
    const { script, bars, symbol, timeframe } = event.data;
    self.postMessage({
      result: await runPine(script, bars, symbol, timeframe),
    });
  } catch (error) {
    self.postMessage({
      error: error instanceof Error ? error.message : String(error),
    });
  }
};
