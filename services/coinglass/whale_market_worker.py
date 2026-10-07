"""Public CoinGlass whale positions, trader distribution and published history."""
from datetime import datetime, timezone
from frontend_api import READY_JS, CoinglassApiError
from whales import number


def run(request, runtime, folder):
    _, page = runtime.ensure(folder)
    try:
        page.wait_for_function(READY_JS, timeout=3000)
    except Exception:
        page.goto('https://www.coinglass.com/', wait_until='load', timeout=60000)
        page.wait_for_function(READY_JS, timeout=30000)
    params = request['params']
    raw = page.evaluate('''async params => {
      let req; self.webpackChunk_N_E.push([[Math.random()], {}, r => { req = r; }]);
      const api = req(89390);
      const call = async (path, args) => {
        const entry = Object.entries(api).find(([,fn]) => typeof fn === 'function' && String(fn).includes('url:"'+path+'"'));
        if (!entry) throw Error('CoinGlass endpoint unavailable: '+path);
        return await entry[1](args);
      };
      const [positions, coins, history] = await Promise.all([
        call('/api/hyperliquid/topPosition', {}),
        call('https://fapi.coinglass.com/api/hyperliquid/position/symbol/shortAndLong', {}),
        call('/api/hyperliquid/position/user/count', {coin:params.coin, interval:params.interval})
      ]);
      return {positions, coins, history};
    }''', params)
    for response in raw.values():
        if response.get('code') not in ('0', 0): raise CoinglassApiError(response.get('code'))
        if not isinstance(response.get('data'), list): raise ValueError('CoinGlass: неверный формат данных китов')
    positions = []
    for p in raw['positions']['data']:
        size = number(p.get('size'))
        if not size: continue
        margin, pnl, funding = number(p.get('margin')), number(p.get('unrealizedPnl')), number(p.get('fundingFee'))
        positions.append(dict(address=p['userId'].lower(), coin=p['coin'], side='Long' if size > 0 else 'Short',
                              size=abs(size), value=number(p.get('positionUsd')), entryPrice=number(p.get('entryPrice')),
                              markPrice=number(p.get('price')), leverage=number(p.get('leverage')), marginType=p.get('positionType'),
                              pnl=pnl, roe=pnl / margin * 100 if pnl is not None and margin else None,
                              liquidationPrice=number(p.get('liquidationPrice')), margin=margin,
                              funding=-funding if funding is not None else None))
    if not positions: raise ValueError('CoinGlass не вернул позиции китов')
    coins = [dict(coin=c['symbol'], long=c['longUserSize'], short=c['shortUserSize'],
                  total=c['longUserSize'] + c['shortUserSize'], longPercent=c['longUserPercent']) for c in raw['coins']['data']]
    history = []
    for h in raw['history']['data']:
        timestamp, long, short = number(h.get('dateTime')), number(h.get('longUserSize')), number(h.get('shortUserSize'))
        if timestamp is not None and long is not None and short is not None and long >= 0 and short >= 0:
            history.append(dict(time=int(timestamp), long=int(long), short=int(short), total=int(long + short)))
    history.sort(key=lambda h: h['time'])
    if not history: raise ValueError('CoinGlass не вернул историю трейдеров')
    snapshot = dict(schemaVersion=1, complete=True, asset=request['asset'], snapshotId=request['id'],
                    collectedAt=datetime.now(timezone.utc).isoformat(), source='CoinGlass',
                    coin=params['coin'], interval=params['interval'], positions=positions, coinRatios=coins, history=history)
    return dict(asset=request['asset'], snapshotId=request['id'], collectedAt=snapshot['collectedAt']), snapshot
