"""Collect CoinMarketCap's published Fear & Greed history in the browser worker."""
from datetime import datetime, timezone


class FearGreedError(RuntimeError):
    pass


def run(request, runtime, folder):
    _, page = runtime.ensure(folder)
    url = 'https://pro-api.coinmarketcap.com/public-api/v3/fear-and-greed/historical?start=1&limit=500'
    response = page.request.get(url, timeout=60000, headers={'Accept': 'application/json'})
    if not response.ok:
        raise FearGreedError(f'CoinMarketCap вернул HTTP {response.status}.')
    payload = response.json()
    records = payload.get('data') if isinstance(payload, dict) else None
    if not isinstance(records, list) or not records:
        raise FearGreedError('CoinMarketCap не вернул историю индекса.')
    points = []
    for item in records:
        try:
            value = int(item['value'])
            raw_stamp = item['timestamp']
            stamp = (datetime.fromtimestamp(float(raw_stamp), timezone.utc)
                     if isinstance(raw_stamp, (int, float)) or str(raw_stamp).isdigit()
                     else datetime.fromisoformat(str(raw_stamp).replace('Z', '+00:00')))
            label = str(item['value_classification'])
        except (KeyError, TypeError, ValueError):
            continue
        if 0 <= value <= 100 and stamp.tzinfo is not None:
            points.append(dict(timestamp=stamp.astimezone(timezone.utc).isoformat(), value=value, classification=label))
    points.sort(key=lambda point: point['timestamp'])
    if not points:
        raise FearGreedError('История индекса CoinMarketCap имеет неверный формат.')
    collected_at = datetime.now(timezone.utc).isoformat()
    snapshot = dict(schemaVersion=1, complete=True, asset='CMC', snapshotId=request['id'], collectedAt=collected_at, points=points)
    latest = points[-1]
    result = dict(asset='CMC', snapshotId=request['id'], collectedAt=collected_at, latest=latest, count=len(points))
    return result, snapshot
