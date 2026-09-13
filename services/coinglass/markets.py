"""Market-cap universe and isolated, checkpointed collection of multiple symbols."""
import csv
import json
import os
import re
import time
from collections import Counter
from datetime import datetime, timezone
from decimal import Decimal
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

MARKETS_URL = ('https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd'
               '&order=market_cap_desc&per_page=20&page=1&sparkline=false')


def valid_symbol(value):
    if not isinstance(value, str) or not re.fullmatch(r'[A-Z0-9][A-Z0-9._-]{0,39}', value):
        raise ValueError('Некорректный символ в списке монет')
    return value


def manual_symbols(symbols):
    values = [valid_symbol(s.upper()) for s in symbols]
    if len(set(values)) != len(values):
        raise ValueError('Символы в --symbols не должны повторяться')
    return [{'symbol': s, 'id': None, 'name': s, 'market_cap_rank': None} for s in values]


def parse_ranking(payload):
    if not isinstance(payload, list) or len(payload) != 20:
        raise ValueError('CoinGecko не вернул полный список из 20 монет')
    coins = []
    for item in payload:
        cap = Decimal(str(item.get('market_cap')))
        if not cap.is_finite() or cap <= 0:
            raise ValueError('В рейтинге отсутствует положительная капитализация')
        coins.append({'id': item['id'], 'name': item['name'],
                      'symbol': valid_symbol(item['symbol'].upper()),
                      'market_cap_rank': item['market_cap_rank'],
                      'market_cap_usd': str(cap)})
    if (len({c['id'] for c in coins}) != 20
            or {c['market_cap_rank'] for c in coins} != set(range(1, 21))):
        raise ValueError('Неоднозначный рейтинг: ожидаются уникальные монеты с местами 1–20')
    coins.sort(key=lambda c: c['market_cap_rank'])
    caps = [Decimal(c['market_cap_usd']) for c in coins]
    if any(a < b for a, b in zip(caps, caps[1:])):
        raise ValueError('Порядок рейтинга не совпадает с капитализацией')
    return coins


def fetch_top20():
    # Public endpoint may work without a key; Demo deployments require one.
    # Credentials are sent only in the header, never in logs or saved ranking.
    headers = {'Accept': 'application/json', 'User-Agent': 'CoinGlassCollector/2.0'}
    key = os.environ.get('COINGECKO_API_KEY', '').strip()
    if key:
        headers['x-cg-demo-api-key'] = key
    for attempt in range(3):
        try:
            with urlopen(Request(MARKETS_URL, headers=headers), timeout=30) as response:
                return parse_ranking(json.load(response))
        except HTTPError as exc:
            if exc.code in (401, 403):
                raise RuntimeError('CoinGecko отказал в доступе. Укажите Demo API key '
                                   'в переменной COINGECKO_API_KEY или используйте --symbols.') from None
            if exc.code != 429 and exc.code < 500:
                raise RuntimeError(f'CoinGecko: HTTP {exc.code}') from None
        except (URLError, TimeoutError):
            pass
        if attempt < 2:
            time.sleep(5 * (attempt + 1))
    raise RuntimeError('Не удалось получить актуальный топ-20 CoinGecko после трёх попыток. '
                       'Старый или произвольный список не подставляется; повторите позже '
                       'или задайте --symbols вручную.')


def write_results(path, rows, headers):
    temp = path.with_suffix('.tmp')
    with temp.open('w', encoding='utf-8-sig', newline='') as file:
        writer = csv.writer(file, delimiter=';')
        writer.writerow(headers)
        writer.writerows(rows)
    temp.replace(path)


def run_batch(coins, run, collect_one, headers, unsupported_error):
    rows, statuses = [], []
    counts = Counter(c['symbol'] for c in coins)
    output = run / 'liquidation_90d.csv'
    for index, coin in enumerate(coins, 1):
        symbol = coin['symbol']
        folder = run / f'{index:02d}_{symbol}'
        folder.mkdir()
        status = dict(coin, started_utc=datetime.now(timezone.utc).isoformat())
        print(f'[{index}/{len(coins)}] {symbol}: сбор карты за 90 дней...', flush=True)
        try:
            if counts[symbol] != 1:
                raise unsupported_error('Несколько монет имеют этот тикер; автоматическое сопоставление неоднозначно')
            current, selected = collect_one(coin, folder)
            new_rows = [[symbol, format(current, 'f'), format(point['price'], 'f'),
                         format(distance.quantize(Decimal('0.000001')), 'f')]
                        for point, distance in selected]
            if not new_rows:
                raise ValueError('Значимых пиков не найдено')
            rows.extend(new_rows)
            status.update(status='ok', selected_levels=len(new_rows))
        except Exception as exc:
            status.update(status='unsupported' if isinstance(exc, unsupported_error) else 'error',
                          error=str(exc))
            (folder / 'FAILED.txt').write_text(str(exc), encoding='utf-8')
            print(f'{symbol}: {status["status"]}: {exc}', flush=True)
        status['finished_utc'] = datetime.now(timezone.utc).isoformat()
        statuses.append(status)
        # Persist after every symbol so a later failure does not lose earlier data.
        if rows:
            write_results(output, rows, headers)
        report = {'requested': len(coins), 'processed': len(statuses),
                  'successful': sum(s['status'] == 'ok' for s in statuses),
                  'complete': len(statuses) == len(coins) and all(s['status'] == 'ok' for s in statuses),
                  'symbols': statuses}
        temporary = run / 'status.tmp'
        temporary.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
        temporary.replace(run / 'status.json')
    succeeded = sum(s['status'] == 'ok' for s in statuses)
    print(f'Завершено: {succeeded}/{len(coins)} символов, {len(rows)} значимых уровней.')
    print(f'Отчёт: {run / "status.json"}')
    if rows:
        print(f'CSV: {output}')
    else:
        print('CSV не создан: нет успешно собранных символов.')
    return 0 if succeeded == len(coins) else (2 if succeeded else 1)
