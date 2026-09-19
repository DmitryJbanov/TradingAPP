"""Download CoinGlass BTC liquidation levels without an API key.

Requirements:
    pip install playwright
    python -m playwright install chromium

Run:
    python get_coinglass_liquidations.py
"""

import asyncio
import json
from pathlib import Path

from playwright.async_api import async_playwright


URL = (
    "https://www.coinglass.com/ru/pro/futures/"
    "LiquidationHeatMapModel3?coin=BTC&type=symbol"
)
OUT = Path(__file__).with_name("coinglass_btc_liquidation_levels_365d.json")


async def main() -> None:
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(
            headless=False,
            executable_path=r"C:\Program Files\Google\Chrome\Application\chrome.exe",
        )
        page = await browser.new_page()
        await page.goto(URL, wait_until="domcontentloaded")
        await page.wait_for_timeout(4000)

        # Use the same internal frontend function as the chart. It generates
        # the temporary request token and decrypts the response in-page.
        result = await page.evaluate(
            """async () => {
                let req;
                self.webpackChunk_N_E.push([[Math.random()], {}, r => { req = r; }]);
                const response = await req(89390).Yxh({
                    merge: true,
                    symbol: "BTC",
                    range: "365d",
                    cp: false
                });
                if (!response || !response.data || !response.data.liq) {
                    throw new Error(JSON.stringify(response));
                }
                return {
                    symbol: "BTC",
                    range: "365d",
                    instrument: response.data.instrument,
                    liquidation_levels: response.data.liq,
                    precision: response.data.precision,
                    prices: response.data.prices,
                    rangeHigh: response.data.rangeHigh,
                    rangeLow: response.data.rangeLow,
                    updateTime: response.data.updateTime,
                    y: response.data.y
                };
            }"""
        )

        OUT.write_text(json.dumps(result, ensure_ascii=False), encoding="utf-8")
        print(f"Saved {len(result['liquidation_levels'])} points to: {OUT.resolve()}")
        await browser.close()


if __name__ == "__main__":
    asyncio.run(main())
