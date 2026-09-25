"""Collect the public RSI list through CoinGlass's own page client."""
import json
import re
from datetime import datetime, timezone


class RsiHeatmapError(RuntimeError):
    pass


PERIOD_FIELDS = {
    '4h': ('rsi4h',),
    '24h': ('rsi24h',),
    '1w': ('rsi1w',),
}
def _value(item, *names):
    for name in names:
        value = item.get(name)
        try:
            result = float(value)
        except (TypeError, ValueError):
            continue
        if result == result and abs(result) != float('inf'):
            return result
    return None


def run(request, runtime, folder):
    period = request.get('params', {}).get('period', '4h')
    if period not in PERIOD_FIELDS:
        raise RsiHeatmapError('Выбранный период RSI не поддерживается.')
    _, page = runtime.ensure(folder)
    if not page.evaluate('Boolean(self.webpackChunk_N_E)'):
        status = None
        for url in ('https://www.coinglass.com/', 'https://www.coinglass.com/pro/i/RsiHeatMap',
                    'https://www.coinglass.com/'):
            try:
                response = page.goto(url, wait_until='load', timeout=60000)
                status = response.status if response else None
                if status is not None and status >= 400:
                    page.wait_for_timeout(1200)
                    continue
                page.wait_for_function('Boolean(self.webpackChunk_N_E)', timeout=12000)
                break
            except Exception:
                continue
        if not page.evaluate('Boolean(self.webpackChunk_N_E)'):
            raise RsiHeatmapError(f'CoinGlass не загрузил клиент RSI (HTTP {status}, {page.url}).')
    raw = page.evaluate('''async () => {
      try {
        let req; self.webpackChunk_N_E.push([[Math.random()], {}, r => { req = r; }]);
        const api=req(89390);
        const mapEntry=Object.entries(api).find(([,fn])=>typeof fn==='function' && String(fn).includes('/api/index/rsiMap'));
        if (!mapEntry) return {ok:false,error:'RSI map endpoint is missing'};
        const response=await mapEntry[1]({});
        return {ok:true,data:response?.data};
      } catch (error) { return {ok:false,error:String(error),stack:String(error?.stack||'').slice(0,1200)}; }
    }''')
    if not raw.get('ok'):
        raise RsiHeatmapError('Не удалось получить RSI через клиент CoinGlass: '+json.dumps(raw, ensure_ascii=False)[:1800])
    source = raw.get('data')
    if not isinstance(source, list):
        raise RsiHeatmapError('CoinGlass вернул ответ RSI без списка инструментов.')

    fields = PERIOD_FIELDS[period]
    rows = []
    for item in source:
        if not isinstance(item, dict):
            continue
        symbol = re.sub(r'[^A-Z0-9]', '', str(item.get('symbol', item.get('coin', ''))).upper())
        value = _value(item, *fields)
        if not symbol or value is None or not 0 <= value <= 100:
            continue
        rows.append(dict(
            rank=len(rows) + 1, symbol=symbol,
            name=str(item.get('name') or item.get('fullName') or symbol),
            logo=item.get('logo') if isinstance(item.get('logo'), str) else None,
            weight=_value(item, 'marketCap', 'market_cap', 'marketCapUsd', 'market_cap_usd', 'volume24h', 'volume24H') or 0,
            price=_value(item, 'currentPrice', 'current_price', 'price'),
            change1h=_value(item, 'priceChangePercent1h', 'price_change_percent_1h'),
            change24h=_value(item, 'priceChangePercent24h', 'price_change_percent_24h'),
            rsi=value,
        ))
    if len(rows) < 50:
        raise RsiHeatmapError(f'CoinGlass вернул {len(rows)} из 50 строк RSI ({period}).')
    rows = rows[:50]
    for index, row in enumerate(rows, 1):
        row['rank'] = index
    collected_at = datetime.now(timezone.utc).isoformat()
    snapshot = dict(schemaVersion=1, complete=True, asset='TOP50',
                    snapshotId=request['id'], collectedAt=collected_at,
                    period=period, count=50, rows=rows)
    result = dict(asset='TOP50', snapshotId=request['id'], collectedAt=collected_at,
                  period=period, count=50)
    return result, snapshot
