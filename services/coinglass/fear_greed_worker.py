"""Collect CoinMarketCap's published Fear & Greed history in the browser worker."""
from datetime import datetime, timezone
import json
import os
from pathlib import Path


class FearGreedError(RuntimeError):
    pass


def run(request, runtime, folder):
    _, page = runtime.ensure(folder)
    latest_response = page.request.get(
        'https://pro-api.coinmarketcap.com/public-api/v3/fear-and-greed/latest',
        timeout=60000, headers={'Accept': 'application/json'})
    if not latest_response.ok:
        raise FearGreedError(f'CoinMarketCap не вернул текущее значение (HTTP {latest_response.status}).')
    latest_data = latest_response.json().get('data')
    try:
        current_value = int(latest_data['value'])
        current_stamp = datetime.fromisoformat(str(latest_data['update_time']).replace('Z', '+00:00'))
        current_label = str(latest_data['value_classification'])
    except (KeyError, TypeError, ValueError):
        raise FearGreedError('CoinMarketCap вернул текущее значение в неверном формате.') from None
    if not 0 <= current_value <= 100 or current_stamp.tzinfo is None:
        raise FearGreedError('CoinMarketCap вернул неверное текущее значение индекса.')
    current = dict(timestamp=current_stamp.astimezone(timezone.utc).isoformat(), value=current_value,
                   classification=current_label)

    url = 'https://pro-api.coinmarketcap.com/public-api/v3/fear-and-greed/historical?start=1&limit=500'
    response = page.request.get(url, timeout=60000, headers={'Accept': 'application/json'})
    payload = response.json() if response.ok else None
    records = payload.get('data') if isinstance(payload, dict) else None
    if not isinstance(records, list) or not records:
        snapshot_dir = Path(os.environ.get('COINGLASS_DATA_DIR', './coinglass-data')) / 'fear-greed' / 'snapshots'
        records = []
        for path in sorted(snapshot_dir.glob('*.json'), key=lambda item: item.stat().st_mtime, reverse=True):
            try:
                previous = json.loads(path.read_text(encoding='utf-8'))
                records = [dict(value=point['value'], timestamp=point['timestamp'],
                                value_classification=point.get('classification', ''))
                           for point in previous.get('points', [])]
                if records:
                    break
            except (OSError, json.JSONDecodeError, KeyError, TypeError):
                continue
    if not records:
        detail = f' (HTTP {response.status})' if not response.ok else ''
        raise FearGreedError(f'CoinMarketCap не вернул историю индекса{detail}.')
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
    current_day = current_stamp.astimezone(timezone.utc).date()
    points = [point for point in points if datetime.fromisoformat(point['timestamp']).astimezone(timezone.utc).date() != current_day]
    points.append(current)
    points.sort(key=lambda point: point['timestamp'])
    collected_at = datetime.now(timezone.utc).isoformat()
    snapshot = dict(schemaVersion=1, complete=True, asset='CMC', snapshotId=request['id'], collectedAt=collected_at,
                    current=current, points=points)
    latest = points[-1]
    result = dict(asset='CMC', snapshotId=request['id'], collectedAt=collected_at, latest=latest, count=len(points))
    return result, snapshot
