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
        if isinstance(value, bool):
            continue
        try:
            result = float(value)
        except (TypeError, ValueError):
            continue
        if result == result and abs(result) != float('inf'):
            return result
    return None


def _period_rsi(item, period):
    direct = _value(item, *PERIOD_FIELDS[period])
    if direct is not None:
        return direct
    token = period.lower()
    accepted = {f'rsi{token}', f'{token}rsi'}
    if period == '1w':
        accepted.update(('rsiweek', 'weeklyrsi', 'rsweekly'))
    for name, value in item.items():
        normalized = re.sub(r'[^a-z0-9]', '', str(name).lower())
        if normalized not in accepted:
            continue
        try:
            parsed = float(value)
        except (TypeError, ValueError):
            continue
        if parsed == parsed and abs(parsed) != float('inf') and 0 <= parsed <= 100:
            return parsed
    return None


# Values come from the chart endpoint, never the separate spot-RSI table.
def normalize_rows(source, capitalization, period):
    cap_by_symbol = {}
    aliases = {'GOLD': ('XAU',), 'SILVER': ('XAG',), 'GOOG': ('GOOGL',),
               '000660.KS': ('SKHYNIX', 'SKHY')}
    for item in capitalization:
        if not isinstance(item, dict):
            continue
        symbol = str(item.get('symbol') or item.get('code') or '').upper()
        cap = _value(item, 'marketCap', 'market_cap', 'marketCapUsd')
        if cap is None or cap <= 0:
            continue
        for key in (symbol, *aliases.get(symbol, ())):
            cap_by_symbol[key] = (cap, str(item.get('name') or ''))
    selected = {}
    for item in source:
        if not isinstance(item, dict):
            continue
        rank = _value(item, 'rank')
        symbol = str(item.get('symbol') or '').upper()
        if rank is None or not rank.is_integer() or not 1 <= rank <= 50 or not re.fullmatch(r'[A-Z0-9]+', symbol):
            continue
        if symbol in selected:
            raise RsiHeatmapError('CoinGlass вернул повторяющийся инструмент RSI.')
        values = {key: _period_rsi(item, key) for key in PERIOD_FIELDS}
        values = {key: value if value is not None and 0 <= value <= 100 else None for key, value in values.items()}
        cap, full_name = cap_by_symbol.get(symbol, (None, ''))
        selected[symbol] = dict(
            rank=int(rank), sourceRank=int(rank), symbol=symbol,
            name=str(item.get('name') or item.get('fullName') or full_name or symbol),
            logo=item.get('logo') if isinstance(item.get('logo'), str) else None,
            marketCap=cap, weight=cap or 0,
            price=_value(item, 'currentPrice', 'current_price', 'price'),
            change1h=_value(item, 'priceChangePercent1h', 'price_change_percent_1h'),
            change24h=_value(item, 'priceChangePercent24h', 'price_change_percent_24h'),
            rsi=values[period], rsiValues=values,
            priceChanges={key: _value(item, "priceChangePercent" + key) for key in PERIOD_FIELDS},
        )
    if len(selected) != 50 or {row['sourceRank'] for row in selected.values()} != set(range(1, 51)):
        raise RsiHeatmapError(f'CoinGlass вернул неполный top 50 RSI ({len(selected)} инструментов).')
    # Use the same x-axis ranks as CoinGlass, including non-crypto instruments.
    rows = sorted(selected.values(), key=lambda row: row['sourceRank'])
    for index, row in enumerate(rows, 1):
        row['rank'] = index
    return rows

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
    raw = page.evaluate(r'''async () => {
      try {
        let req; self.webpackChunk_N_E.push([[Math.random()], {}, r => { req = r; }]);
        const api=req(89390);
        const mapEntry=Object.entries(api).find(([,fn])=>typeof fn==='function' && String(fn).includes('/api/index/rsiMap'));
        if (!mapEntry) return {ok:false,error:'RSI map endpoint is missing'};
        const response=await mapEntry[1]({});
        const capEntry=Object.entries(api).find(([,fn])=>typeof fn==='function' && String(fn).includes('/api/spot/marketCap/data'));
        const rankEntry=Object.entries(api).find(([,fn])=>typeof fn==='function' && /url:\s*["']\/api\/marketCapRank["']/.test(String(fn)));
        const capitalization=[];
        if (!capEntry || !rankEntry) return {ok:false,error:'Capitalization endpoints are missing'};
        const globalRanks=await rankEntry[1]({limit:1000,pageSize:1000,pageNum:1});
        if (!Array.isArray(globalRanks?.data)) return {ok:false,error:'Capitalization ranking is unavailable'};
        capitalization.push(...globalRanks.data);
        let pages=1;
        for (let pageNum=1;pageNum<=pages;pageNum++) {
          const capResponse=await capEntry[1]({pageSize:100,pageNum});
          const list=capResponse?.data?.list;
          if (!Array.isArray(list) || !list.length) return {ok:false,error:'Crypto capitalization page is unavailable'};
          capitalization.push(...list);
          const pageSize=Number(capResponse.data.pageSize);
          const total=Number(capResponse.data.total);
          if (!(pageSize>0) || !(total>0)) return {ok:false,error:"Invalid capitalization pagination"};
          pages=Math.ceil(total/pageSize);
          if (pages>30) return {ok:false,error:"Capitalization pagination exceeds limit"};
        }
        return {ok:true,data:response?.data,capitalization};
      } catch (error) { return {ok:false,error:String(error),stack:String(error?.stack||'').slice(0,1200)}; }
    }''')
    if not raw.get('ok'):
        raise RsiHeatmapError('Не удалось получить RSI через клиент CoinGlass: '+json.dumps(raw, ensure_ascii=False)[:1800])
    source = raw.get('data')
    if not isinstance(source, list):
        raise RsiHeatmapError('CoinGlass вернул ответ RSI без списка инструментов.')

    rows = normalize_rows(source, raw.get('capitalization', []), period)
    collected_at = datetime.now(timezone.utc).isoformat()
    snapshot = dict(schemaVersion=1, rsiRevision=3, order="coinglass", complete=True, asset='TOP50',
                    snapshotId=request['id'], collectedAt=collected_at,
                    period=period, count=50, rows=rows)
    result = dict(asset='TOP50', snapshotId=request['id'], collectedAt=collected_at,
                  period=period, count=50)
    return result, snapshot
