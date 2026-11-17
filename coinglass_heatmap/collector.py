"""Production adapter for get_coinglass_liquidations.py (Model 3, symbol)."""
import math
from urllib.parse import urlsplit
from .frontend import READY_JS, fetch_frontend

RANGES = ('12h', '24h', '3d', '7d', '14d', '30d', '90d', '180d', '365d')
RANGE_LABELS = ('12 часов', '24 часа', '3 дня', '7 дней', '2 недели', '30 дней', '90 дней', '180 дней', '365 дней')


class SubscriptionRequired(RuntimeError):
    pass


class HeatmapApiError(RuntimeError):
    def __init__(self, code, asset, range_value):
        self.api_code = str(code) if type(code) in (str, int) and str(code).isdigit() and len(str(code)) <= 8 else 'unknown'
        label = RANGE_LABELS[RANGES.index(range_value)]
        detail = ('Требуется вход в аккаунт CoinGlass. Проверьте сохранённую сессию.'
                  if self.api_code == '40000' else
                  'Превышен лимит запросов CoinGlass. Повторите загрузку позже.' if self.api_code == '50001' else
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


def open_heatmap_page(page, asset, *, force_reload=False):
    paths=('/liquidation-heatmap-model3', '/ru/liquidation-heatmap-model3', '/pro/futures/LiquidationMap', '/ru/pro/futures/LiquidationMap', '/pro/futures/LiquidationHeatMap', '/')
    if not force_reload and urlsplit(page.url).path in paths and page.evaluate(READY_JS) is True:
        return None
    response=page.goto('https://www.coinglass.com'+paths[0],
                       wait_until='domcontentloaded',timeout=60000)
    if response is not None and response.status==404:
        # Same page client exports the Model 3 method; only bootstrap navigation changes.
        response=page.goto('https://www.coinglass.com/pro/futures/LiquidationMap',
                           wait_until='domcontentloaded',timeout=60000)
    if response is not None and response.status==404:
        response=page.goto('https://www.coinglass.com/pro/futures/LiquidationHeatMap',
                           wait_until='domcontentloaded',timeout=60000)
    if response is not None and response.status==404:
        response=page.goto('https://www.coinglass.com/',
                           wait_until='domcontentloaded',timeout=60000)
    if response is not None and response.status>=400:
        raise ValueError(f'Страница Model 3 вернула HTTP {response.status}')
    return response


def collect(page, asset, *, range_value='365d', reuse_frontend=False):
    validate_range(range_value)
    if not reuse_frontend:
        open_heatmap_page(page, asset)
    # Same aggregate Model 3 method as the current symbol-mode page.
    response = fetch_frontend(page, 'https://fapi.coinglass.com/api/index/v4/aggregate/liqHeatMap',
                              dict(merge=True, symbol=asset, range=range_value, cp=False))
    if isinstance(response, dict) and str(response.get('code')) == '40003':
        label = RANGE_LABELS[RANGES.index(range_value)]
        raise SubscriptionRequired(f'Карта {asset} за период {label} доступна только с подпиской CoinGlass. Выберите другой период или используйте аккаунт с подпиской.')
    if isinstance(response, dict) and (response.get('code') not in (None, '0', 0) or response.get('success') is False):
        raise HeatmapApiError(response.get('code'), asset, range_value)
    data = response.get('data') if isinstance(response, dict) else None
    if not isinstance(data, dict):
        raise ValueError('CoinGlass не вернул карту')
    if range_value == '14d':
        prices = data.get('prices')
        if not isinstance(prices, list) or len(prices) < 2:
            raise ValueError('CoinGlass не вернул временную ось для прямого периода 14 дней')
        times = []
        for row in prices:
            if not isinstance(row, list) or not row or type(row[0]) not in (int, float) or not math.isfinite(row[0]):
                raise ValueError('Некорректная временная ось карты за 14 дней')
            times.append(row[0] / 1000 if row[0] > 100000000000 else row[0])
        step = abs(times[1] - times[0])
        if max(times) - min(times) > 14 * 86400 + step:
            raise ValueError('CoinGlass вернул другой период вместо 14 дней; карта не обрезается')
    return validate_map(dict(symbol=asset, y=data.get('y'), liquidation_levels=data.get('liq'), prices=data.get('prices')), asset, range_value)
