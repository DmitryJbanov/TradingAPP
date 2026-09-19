// Run in DevTools Console while the CoinGlass Model 3 page is open.
// It downloads a complete, self-contained map dataset without an API key.
(async () => {
  let req;
  self.webpackChunk_N_E.push([[Math.random()], {}, r => { req = r; }]);

  const response = await req(89390).Yxh({
    merge: true,
    symbol: "BTC",
    range: "365d",
    cp: false
  });

  if (!response?.data?.liq || !response.data.y) {
    throw new Error("CoinGlass did not return liquidation levels and price axis");
  }

  const data = response.data;
  const out = {
    symbol: "BTC",
    range: "365d",
    instrument: data.instrument,
    liquidation_levels: data.liq,
    y: data.y,
    prices: data.prices,
    precision: data.precision,
    rangeHigh: data.rangeHigh,
    rangeLow: data.rangeLow,
    updateTime: data.updateTime
  };

  const blob = new Blob([JSON.stringify(out)], {type: "application/json"});
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "coinglass_btc_liquidation_map_365d_complete.json";
  a.click();
  console.log(`Saved ${data.liq.length} liquidation cells and ${data.y.length} price levels`);
})();
