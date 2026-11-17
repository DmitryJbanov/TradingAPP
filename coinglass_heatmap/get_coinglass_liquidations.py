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
try:
    from .frontend import CLIENT_JS, READY_JS
except ImportError:
    from frontend import CLIENT_JS, READY_JS


URL = (
    "https://www.coinglass.com/liquidation-heatmap-model3?coin=BTC&type=symbol"
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
        await page.wait_for_function(READY_JS, timeout=45000)

        # Use the same internal frontend function as the chart. It generates
        # the temporary request token and decrypts the response in-page.
        result = await page.evaluate(
            """async () => {
                const {call}=__CG_CLIENT__();
                const response = await call('https://fapi.coinglass.com/api/index/v4/aggregate/liqHeatMap', {
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
            }""".replace('__CG_CLIENT__', '('+CLIENT_JS+')')
        )

        OUT.write_text(json.dumps(result, ensure_ascii=False), encoding="utf-8")
        print(f"Saved {len(result['liquidation_levels'])} points to: {OUT.resolve()}")
        await browser.close()


if __name__ == "__main__":
    asyncio.run(main())
