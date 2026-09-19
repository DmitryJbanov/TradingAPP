"""Convert CoinGlass heatmap cells into rows with actual prices."""

import json
from pathlib import Path

src = Path(__file__).resolve().parent / "coinglass_btc_liquidation_map_365d_complete.json"
dst = src.with_name("coinglass_btc_liquidation_price_levels_365d.json")
data = json.loads(src.read_text(encoding="utf-8"))

rows = [
    {
        "x_index": x,
        "y_index": y_index,
        "price": data["y"][y_index],
        "liquidation_value": value,
    }
    for x, y_index, value in data["liquidation_levels"]
]

dst.write_text(json.dumps({**data, "price_levels": rows}, ensure_ascii=False), encoding="utf-8")
print(f"Saved {len(rows)} price-mapped cells to {dst.resolve()}")
