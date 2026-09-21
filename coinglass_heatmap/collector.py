"""Production adapter for get_coinglass_liquidations.py (Model 3, symbol)."""
import math

RANGES = ('12h', '24h', '3d', '7d', '30d', '90d', '180d', '365d')
RANGE_LABELS = ('12 часов', '24 часа', '3 дня', '7 дней', '30 дней', '90 дней', '180 дней', '365 дней')


class SubscriptionRequired(RuntimeError):
    pass


class HeatmapApiError(RuntimeError):
    def __init__(self, code, asset, range_value):
        self.api_code = str(code) if type(code) in (str, int) and str(code).isdigit() and len(str(code)) <= 8 else 'unknown'
        label = RANGE_LABELS[RANGES.index(range_value)]
        detail = ('Требуется вход в аккаунт CoinGlass. Проверьте сохранённую сессию.'
                  if self.api_code == '40000' else
                  'Причина не указана. Проверьте доступность монеты и периода на сайте CoinGlass в том же аккаунте.')
        super().__init__(f'CoinGlass отклонил запрос карты {asset} за период {label} (код {self.api_code}). {detail}')


def validate_range(value):
    if value not in RANGES:
        raise ValueError('Неверный период карты')
    return value


def validate_map(data, asset, range_value='365d'):
    validate_range(range_value)
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
    result = dict(symbol=asset, range=range_value, y=axis, liquidation_levels=cells)
    # prices[i] = [timestamp, open, high, low, close, ...]; i is the liq X index.
    prices = data.get('prices')
    if isinstance(prices, list) and len(prices) <= 100000:
        result['prices'] = prices
    return result


def collect(page, asset, *, range_value='365d', reuse_frontend=False):
    validate_range(range_value)
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
    response = page.evaluate('''async ({asset, range}) => {
      let req;
      self.webpackChunk_N_E.push([[Math.random()], {}, r => { req = r; }]);
      const api = req(89390);
      if (typeof api.Yxh !== 'function') throw new Error('Model 3 module changed');
      return await api.Yxh({ merge: true, symbol: asset, range, cp: false });
    }''', dict(asset=asset, range=range_value))
    if isinstance(response, dict) and str(response.get('code')) == '40003':
        label = RANGE_LABELS[RANGES.index(range_value)]
        raise SubscriptionRequired(f'Карта {asset} за период {label} доступна только с подпиской CoinGlass. Выберите другой период или используйте аккаунт с подпиской.')
    if isinstance(response, dict) and (response.get('code') not in (None, '0', 0) or response.get('success') is False):
        raise HeatmapApiError(response.get('code'), asset, range_value)
    data = response.get('data') if isinstance(response, dict) else None
    if not isinstance(data, dict):
        raise ValueError('CoinGlass не вернул карту')
    return validate_map(dict(symbol=asset, y=data.get('y'), liquidation_levels=data.get('liq'), prices=data.get('prices')), asset, range_value)
