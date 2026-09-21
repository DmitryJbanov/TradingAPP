"""CoinGlass's frontend client handles transport decoding in its own session."""
from decimal import Decimal, InvalidOperation


READY_JS = """() => {
  const chunks = window.webpackChunk_N_E;
  if (!Array.isArray(chunks) || chunks.push === Array.prototype.push) return false;
  let req;
  chunks.push([[`cg_ready_${Date.now()}_${Math.random()}`], {}, r => { req = r; }]);
  return Boolean(req?.m?.[89390]);
}"""

FETCH_JS = """async params => {
  let req;
  const chunks = window.webpackChunk_N_E;
  chunks.push([[`cg_reader_${Date.now()}_${Math.random()}`], {}, r => { req = r; }]);
  if (!req) throw new Error('CoinGlass webpack runtime unavailable');
  const client = req(89390);
  if (typeof client?.bvP !== 'function') throw new Error('CoinGlass bvP unavailable');
  let timer;
  try {
    return await Promise.race([
      client.bvP(params),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('CoinGlass request timeout')), 60000);
      })
    ]);
  } finally { clearTimeout(timer); }
}"""


RANGE_DAYS = (1, 7, 30, 90, 180, 365)
INTERVALS = {1: 1, 7: 5, 30: 30, 90: '90d', 180: '180d', 365: '365d'}


class CoinglassApiError(ValueError):
    """Generated diagnostic only; never expose the server's message/payload."""
    def __init__(self, code):
        self.api_code = str(code) if type(code) in (str, int) and str(code).isdigit() and len(str(code)) <= 8 else 'unknown'
        self.code = 'coinglass_api_' + self.api_code
        messages = {
            '40000': 'CoinGlass требует входа в аккаунт (код 40000). Проверьте credentials.txt или сохранённую сессию.',
            '40001': 'CoinGlass отклонил запрос (код 40001). Причина не указана. Проверьте доступность выбранной монеты и периода на сайте CoinGlass в том же аккаунте.',
            '40003': 'Выбранная монета и период доступны только с подпиской CoinGlass (код 40003).',
        }
        super().__init__(messages.get(self.api_code, f'CoinGlass отклонил запрос (код {self.api_code}).'))


def fetch_liquidation_map(page, symbol, range_days=90, request_limit=1440):
    if type(range_days) is not int or range_days not in RANGE_DAYS:
        raise ValueError('Invalid liquidation period')
    if type(request_limit) is not int or not 1 <= request_limit <= 1440:
        raise ValueError('Invalid liquidation request limit')
    page.wait_for_function(READY_JS, timeout=60000)
    return page.evaluate(FETCH_JS, {'merge': True, 'symbol': symbol,
                                   'interval': INTERVALS[range_days], 'limit': request_limit})


def numeric(value, name, *, positive=False):
    if isinstance(value, bool) or not isinstance(value, (str, int, float, Decimal)):
        raise ValueError(f'Invalid {name}')
    try:
        result = Decimal(str(value))
    except InvalidOperation:
        raise ValueError(f'Invalid {name}') from None
    if not result.is_finite() or result < 0 or (positive and result == 0):
        raise ValueError(f'Invalid {name}')
    return result


def parse_liquidation_map(response, symbol):
    if isinstance(response, dict) and response.get('code') not in ('0', 0, None):
        raise CoinglassApiError(response.get('code'))
    if (not isinstance(response, dict) or response.get('code') != '0'
            or response.get('success') is not True or not isinstance(response.get('data'), dict)):
        raise ValueError('Invalid CoinGlass response envelope')
    data = response['data']
    if not {'lastPrice', 'rangeLow', 'rangeHigh', 'data'} <= data.keys():
        raise ValueError('Incomplete CoinGlass data')
    current = numeric(data['lastPrice'], 'lastPrice', positive=True)
    low = numeric(data['rangeLow'], 'rangeLow', positive=True)
    high = numeric(data['rangeHigh'], 'rangeHigh', positive=True)
    if not low <= current <= high:
        raise ValueError('Invalid CoinGlass price range')
    if not isinstance(data['data'], list) or not data['data']:
        raise ValueError('Empty or invalid CoinGlass instruments')
    instruments, levels = [], {}
    fields = {'exchange': 'exName', 'instrument_id': 'instrumentId',
              'base_asset': 'baseAsset', 'quote_asset': 'quoteAsset', 'max_leverage': 'maxLeverage'}
    for item in data['data']:
        if not isinstance(item, dict) or not isinstance(item.get('instrument'), dict):
            raise ValueError('Invalid instrument')
        instrument = item['instrument']
        if any(key not in instrument for key in fields.values()):
            raise ValueError('Incomplete instrument metadata')
        metadata = {key: instrument[value] for key, value in fields.items()}
        if any(not isinstance(metadata[key], str) or not metadata[key].strip()
               for key in ('exchange', 'instrument_id', 'base_asset', 'quote_asset')):
            raise ValueError('Invalid instrument metadata')
        if metadata['base_asset'] != symbol:
            raise ValueError('Unexpected instrument base asset')
        numeric(metadata['max_leverage'], 'maxLeverage', positive=True)
        liq_map = item.get('liqMapV2')
        if not isinstance(liq_map, dict):
            raise ValueError('Invalid liqMapV2')
        instruments.append({**metadata, 'liqMapV2': liq_map})
        for key, entries in liq_map.items():
            numeric(key, 'price key', positive=True)
            if not isinstance(entries, list):
                raise ValueError('Invalid liquidation entries')
            for entry in entries:
                if not isinstance(entry, list) or len(entry) < 2:
                    raise ValueError('Invalid liquidation entry')
                price = numeric(entry[0], 'price', positive=True)
                value = numeric(entry[1], 'liquidation_value')
                point = levels.setdefault(price, {
                    'price': price, 'intensity': Decimal(0),
                    'side': 'long' if price < current else 'short' if price > current else 'reference',
                    'exchanges': {}})
                point['intensity'] += value
                exchange = metadata['exchange']
                point['exchanges'][exchange] = point['exchanges'].get(exchange, Decimal(0)) + value
    if not levels:
        raise ValueError('Empty liquidation map')
    return {'current_price': current, 'range_low': low, 'range_high': high,
            'instruments': instruments, 'levels': sorted(levels.values(), key=lambda p: p['price'])}
