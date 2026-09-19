"""Pure, Decimal-based selection shared by collection, CLI and visual preview."""
from decimal import Decimal


def explain_selection(levels, current, relative=Decimal('.5'), min_prominence=Decimal('.35'), side='both', limit=5):
    if not current.is_finite() or current <= 0:
        raise ValueError('Текущая цена должна быть положительной')
    if side not in {'both', 'above', 'below'} or type(limit) is not int or not 1 <= limit <= 50:
        raise ValueError('Некорректная сторона или количество уровней')
    for threshold in (relative, min_prominence):
        if not threshold.is_finite() or not 0 <= threshold <= 1:
            raise ValueError('Пороги должны быть от 0 до 1')
    points = sorted((p for p in levels if p.get('kind') != 'current_price_marker'), key=lambda p: p['price'])
    maximum = max((p['intensity'] for p in points), default=Decimal(0))
    rows = [dict(p, isPeak=False, prominence=Decimal(0), base=Decimal(0),
                 relativeHeight=p['intensity'] / maximum if maximum else Decimal(0),
                 relativeProminence=Decimal(0), distancePercent=abs(p['price']-current)/current*100,
                 reasons=['not_peak'], rank=None, selected=False) for p in points]
    i = 1
    while i < len(points)-1:
        start = end = i
        height = points[i]['intensity']
        while end+1 < len(points) and points[end+1]['intensity'] == height:
            end += 1
        if end < len(points)-1 and height > points[start-1]['intensity'] and height > points[end+1]['intensity'] and height > 0:
            left_min = right_min = height
            for j in range(start-1, -1, -1):
                if points[j]['intensity'] > height: break
                left_min = min(left_min, points[j]['intensity'])
            for j in range(end+1, len(points)):
                if points[j]['intensity'] > height: break
                right_min = min(right_min, points[j]['intensity'])
            base = max(left_min, right_min)
            row = rows[(start+end)//2]
            reasons = []
            if height < maximum * relative: reasons.append('height')
            if height-base < maximum * min_prominence: reasons.append('prominence')
            if (side == 'above' and row['price'] <= current) or (side == 'below' and row['price'] >= current): reasons.append('side')
            row.update(isPeak=True, base=base, prominence=height-base,
                       relativeProminence=(height-base)/maximum, reasons=reasons)
            for j in range(start, end+1):
                if j != (start+end)//2: rows[j]['reasons'] = ['plateau']
        i = end+1
    eligible = sorted((r for r in rows if r['isPeak'] and not r['reasons']),
                      key=lambda r: (abs(r['price']-current), -r['intensity'], r['price']))
    for rank, row in enumerate(eligible, 1):
        row['rank'] = rank
        row['selected'] = rank <= limit
        if rank > limit: row['reasons'] = ['limit']
    return dict(maximum=maximum, heightThreshold=maximum*relative,
                prominenceThreshold=maximum*min_prominence, points=rows,
                selected=[r for r in eligible if r['selected']])


def numeric(value):
    if isinstance(value, Decimal): return float(value)
    if isinstance(value, dict): return {k: numeric(v) for k, v in value.items()}
    if isinstance(value, list): return [numeric(v) for v in value]
    return value


def preview(snapshot, settings):
    points = []
    for item in snapshot['points']:
        point = dict(item)
        for key in ('price', 'intensity'): point[key] = Decimal(str(point[key]))
        points.append(point)
    report = explain_selection(points, Decimal(str(snapshot['currentPrice'])),
        Decimal(str(settings['minRelative'])), Decimal(str(settings['minProminence'])), settings['side'], settings['limit'])
    result = {k: snapshot[k] for k in ('asset', 'rangeDays', 'currentPrice', 'collectedAt', 'snapshotId')}
    result['currentPrice'] = float(snapshot['currentPrice'])
    result.update(params=settings, levels=[{k: p[k] for k in ('price', 'intensity', 'prominence', 'distancePercent')} for p in report['selected']])
    return numeric(dict(result=result, **{k: v for k, v in report.items() if k != 'selected'}))
