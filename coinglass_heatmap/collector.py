"""Production adapter for get_coinglass_liquidations.py (Model 3, symbol, 365d)."""
import math


def validate_map(data, asset):
    if not isinstance(data, dict) or data.get('symbol') != asset:
        raise ValueError('Карта другого актива')
    axis = data.get('y')
    cells = data.get('liquidation_levels')
    if not isinstance(axis, list) or not 2 <= len(axis) <= 10000:
        raise ValueError('CoinGlass не вернул ценовую ось')
    if any(type(p) not in (int, float) or not math.isfinite(p) or p <= 0 for p in axis):
        raise ValueError('Некорректная ценовая ось')
    if any(a >= b for a, b in zip(axis, axis[1:])):
        raise ValueError('Ценовая ось должна возрастать')
    if not isinstance(cells, list) or not 1 <= len(cells) <= 1000000:
        raise ValueError('Карта пуста или превышает лимит ячеек')
    for cell in cells:
        if not isinstance(cell, list) or len(cell) != 3:
            raise ValueError('Некорректная ячейка')
        x, y, value = cell
        if type(x) is not int or not 0 <= x < 100000 or type(y) is not int or not 0 <= y < len(axis):
            raise ValueError('Ячейка вне диапазона карты')
        if type(value) not in (int, float) or not math.isfinite(value) or value < 0:
            raise ValueError('Некорректная интенсивность')
    return dict(symbol=asset, range='365d', y=axis, liquidation_levels=cells)


def collect(page, asset, *, reuse_frontend=False):
    if not reuse_frontend:
        page.goto('https://www.coinglass.com/ru/pro/futures/LiquidationHeatMapModel3?coin=' + asset + '&type=symbol', wait_until='domcontentloaded', timeout=60000)
    page.wait_for_function('''() => {
      const chunks = self.webpackChunk_N_E;
      if (!Array.isArray(chunks) || chunks.push === Array.prototype.push) return false;
      let req;
      chunks.push([[`heatmap_ready_${Date.now()}_${Math.random()}`], {}, r => { req = r; }]);
      return Boolean(req?.m?.[89390]);
    }''', timeout=30000)
    # Same frontend entry point as the supplied prototype. No guessed price axis.
    data = page.evaluate('''async (asset) => {
      let req;
      self.webpackChunk_N_E.push([[Math.random()], {}, r => { req = r; }]);
      const api = req(89390);
      if (typeof api.Yxh !== 'function') throw new Error('Model 3 module changed');
      const response = await api.Yxh({ merge: true, symbol: asset, range: '365d', cp: false });
      const data = response?.data;
      if (!Array.isArray(data?.liq) || !Array.isArray(data?.y)) throw new Error('Map unavailable');
      return { symbol: asset, y: data.y, liquidation_levels: data.liq };
    }''', asset)
    return validate_map(data, asset)
