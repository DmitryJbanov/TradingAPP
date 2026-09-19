"""Attach the verified CoinGlass price axis and create price-mapped cells."""

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent
base = ROOT / "coinglass_btc_liquidation_levels_365d.json"
complete = ROOT / "coinglass_btc_liquidation_map_365d_complete.json"
mapped = ROOT / "coinglass_btc_liquidation_price_levels_365d.json"

data = json.loads(base.read_text(encoding="utf-8"))

# Verified from the live CoinGlass response for BTC / Model 3 / Symbol / 365d.
start = 46976.42
step = 425.28
axis = [round(start + step * i, 2) for i in range(244)]
assert axis[-1] == 150319.46

data["y"] = axis
data["precision"] = 0

complete.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")

data["price_levels"] = [
    {
        "x_index": x,
        "y_index": yi,
        "price": axis[yi],
        "liquidation_value": value,
    }
    for x, yi, value in data["liquidation_levels"]
]
mapped.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")

print(f"Complete map: {complete.resolve()}")
print(f"Price-mapped map: {mapped.resolve()}")
print(f"Axis levels: {len(axis)}; liquidation cells: {len(data['liquidation_levels'])}")
