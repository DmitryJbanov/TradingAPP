"""Public Hyperliquid data and persistent personal whale watchlist."""
import json
import math
import re
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path
from urllib.request import Request, urlopen


def address(value):
    if not isinstance(value, str) or not re.fullmatch(r'0x[0-9a-fA-F]{40}', value.strip()):
        raise ValueError('Адрес должен содержать 0x и 40 шестнадцатеричных символов.')
    return value.strip().lower()


def number(value):
    try:
        result = float(value)
        return result if math.isfinite(result) else None
    except (TypeError, ValueError):
        return None


def stamp():
    return datetime.now(timezone.utc).isoformat()


def fetch_json(payload=None, url='https://api.hyperliquid.xyz/info'):
    data = json.dumps(payload).encode() if payload is not None else None
    request = Request(url, data=data, headers={'Content-Type': 'application/json', 'User-Agent': 'DiVMoney/0.5.0-alpha'})
    with urlopen(request, timeout=12) as response:
        return json.load(response)


def positions(state, user):
    result = []
    for row in state.get('assetPositions', []):
        p = row.get('position', {})
        size = number(p.get('szi'))
        if size is None or size == 0:
            continue
        value = number(p.get('positionValue'))
        roe = number(p.get('returnOnEquity'))
        result.append(dict(address=user, coin=p.get('coin', ''), side='Long' if size > 0 else 'Short',
                           size=abs(size), value=value, entryPrice=number(p.get('entryPx')),
                           markPrice=value / abs(size) if value is not None else None,
                           leverage=p.get('leverage', {}).get('value'), marginType=p.get('leverage', {}).get('type'),
                           pnl=number(p.get('unrealizedPnl')), roe=roe * 100 if roe is not None else None,
                           liquidationPrice=number(p.get('liquidationPx')), margin=number(p.get('marginUsed')),
                           funding=number(p.get('cumFunding', {}).get('sinceOpen'))))
    return result


def fills(rows, user):
    result = []
    for row in rows:
        # The tracker covers perpetual contracts; spot trades are not included.
        if not isinstance(row, dict) or not any(s in row.get('dir', '') for s in ('Long', 'Short')):
            continue
        px, size, timestamp = number(row.get('px')), number(row.get('sz')), number(row.get('time'))
        if px is None or size is None or timestamp is None:
            continue
        identity = str(row.get('tid', f"{row.get('hash')}:{timestamp}:{row.get('coin')}:{size}"))
        result.append(dict(id=identity, address=user, coin=row.get('coin', ''), side='Buy' if row.get('side') == 'B' else 'Sell',
                           action=row.get('dir', ''), price=px, size=size, value=px * size, time=int(timestamp),
                           pnl=number(row.get('closedPnl')), fee=number(row.get('fee')), hash=row.get('hash', '')))
    return result


def merge_fills(previous, current, limit=5000):
    rows = {row['id']: row for row in previous + current}
    return sorted(rows.values(), key=lambda row: row['time'], reverse=True)[:limit]


class WhaleTracker:
    def __init__(self, directory, start=True):
        self.directory = Path(directory)
        self.directory.mkdir(parents=True, exist_ok=True)
        self.lock = threading.RLock()
        self.pool = ThreadPoolExecutor(max_workers=4, thread_name_prefix='whale')
        self.stopped = threading.Event()
        self.pending = set()
        self.profiles = {}
        self.errors = {}
        self.last_requested = {}
        self.overview_busy = False
        self.overview_error = ''
        self.overview_data = self.read('overview.json', {})
        self.watched = self.read('watchlist.json', [])
        self.watched = [w for w in self.watched if isinstance(w, dict) and re.fullmatch(r'0x[0-9a-f]{40}', str(w.get('address', '')))][:20]
        for w in self.watched:
            p = self.read(w['address'] + '.json', None)
            if p: self.profiles[w['address']] = p
        if start:
            threading.Thread(target=self.loop, daemon=True, name='whale-monitor').start()

    def read(self, name, fallback):
        try: return json.loads((self.directory / name).read_text(encoding='utf-8'))
        except (OSError, ValueError): return fallback

    def save(self, name, data):
        temporary = self.directory / (name + '.tmp')
        temporary.write_text(json.dumps(data, ensure_ascii=False, allow_nan=False), encoding='utf-8')
        temporary.replace(self.directory / name)

    def loop(self):
        while not self.stopped.is_set():
            with self.lock: users = [w['address'] for w in self.watched]
            for user in users:
                try: self.request_profile(user)
                except ValueError: break  # Retry on the next pass when the queue has room.
            self.stopped.wait(30)

    def request_profile(self, user, force=False):
        with self.lock:
            if self.stopped.is_set() or user in self.pending or (not force and time.time() - self.last_requested.get(user, 0) < 60): return
            if len(self.pending) >= 64: raise ValueError('Очередь профилей заполнена. Повторите позже.')
            if len(self.last_requested) > 500:
                keep = self.pending | {w['address'] for w in self.watched}
                for key in list(self.last_requested)[:100]:
                    if key not in keep:
                        self.last_requested.pop(key, None)
                        self.errors.pop(key, None)
            self.pending.add(user)
            self.last_requested[user] = time.time()
        self.pool.submit(self.collect_profile, user)

    def collect_profile(self, user):
        try:
            state = fetch_json({'type': 'clearinghouseState', 'user': user})
            if not isinstance(state, dict) or 'marginSummary' not in state: raise ValueError('Некорректное состояние счёта')
            warnings = []
            with self.lock: old = self.profiles.get(user, {})
            def optional(kind, fallback, extra=None):
                if self.stopped.is_set(): return fallback
                try: return fetch_json({'type': kind, 'user': user, **(extra or {})})
                except Exception:
                    warnings.append(f'{kind}: данные временно недоступны')
                    return fallback
            raw_fills = []
            cursor = old.get('sourceCursor')
            for _ in range(5):
                page = optional('userFillsByTime' if cursor else 'userFills', [],
                                {'aggregateByTime': True, **({'startTime': max(0, cursor - 1)} if cursor else {})})
                if not isinstance(page, list): raise ValueError('Некорректная история сделок')
                raw_fills.extend(page)
                last = max((int(r.get('time', 0)) for r in page), default=0)
                if not cursor or len(page) < 2000 or last <= cursor: break
                cursor = last
            else: warnings.append('Высокая активность: достигнут предел одной выгрузки истории сделок.')
            current = fills(raw_fills, user)
            orders = optional('frontendOpenOrders', old.get('orders', []))
            portfolio = optional('portfolio', list(old.get('history', {}).items()))
            ledger = optional('userNonFundingLedgerUpdates', old.get('ledger', []), {'startTime': int((time.time() - 30 * 86400) * 1000)})
            history = {k: v for k, v in portfolio if isinstance(v, dict)}
            performance = {}
            for key, title in [('perpDay', 'day'), ('perpWeek', 'week'), ('perpMonth', 'month'), ('perpAllTime', 'allTime')]:
                values = history.get(key, {}).get('pnlHistory', [])
                performance[title] = number(values[-1][1]) if values else None
            summary = state['marginSummary']
            data = dict(address=user, collectedAt=stamp(), accountValue=number(summary.get('accountValue')),
                        marginUsed=number(summary.get('totalMarginUsed')), positionValue=number(summary.get('totalNtlPos')),
                        withdrawable=number(state.get('withdrawable')), positions=positions(state, user),
                        fills=merge_fills(old.get('fills', []), current), orders=[o for o in orders if not str(o.get('coin', '')).startswith('@')],
                        performance=performance, history=history, ledger=ledger, warnings=warnings,
                        sourceCursor=max((int(r.get('time', 0)) for r in raw_fills), default=old.get('sourceCursor', 0)))
            with self.lock:
                self.profiles[user] = data
                self.errors.pop(user, None)
                if any(w['address'] == user for w in self.watched): self.save(user + '.json', data)
                # Bound transient profiles requested by visitors.
                keep = {w['address'] for w in self.watched}
                for key in list(self.profiles)[:-100]:
                    if key not in keep: self.profiles.pop(key, None)
        except Exception as e:
            with self.lock: self.errors[user] = 'Не удалось обновить данные Hyperliquid: ' + str(e)[:180]
        finally:
            with self.lock: self.pending.discard(user)

    def profile(self, raw, force=False):
        user = address(raw)
        self.request_profile(user, force)
        with self.lock:
            cached = self.profiles.get(user)
            profile = dict(cached, fills=cached.get('fills', [])[:200]) if cached else None
            return dict(profile=profile, loading=user in self.pending, error=self.errors.get(user),
                        tracked=any(w['address'] == user for w in self.watched))

    def watchlist(self):
        with self.lock:
            users = list(self.watched)
            accounts = []
            for w in users:
                p = self.profiles.get(w['address'])
                summary = {k: p[k] for k in ('address', 'collectedAt', 'accountValue', 'positionValue', 'positions', 'performance')} if p else None
                if summary is not None: summary['fills'] = p.get('fills', [])[:20]
                accounts.append(dict(**w, profile=summary, loading=w['address'] in self.pending, error=self.errors.get(w['address'])))
        for w in users: self.request_profile(w['address'])
        return dict(data=accounts, pollSeconds=60, limit=20)

    def change(self, payload):
        user = address(payload.get('address'))
        action = payload.get('action')
        if action not in ('add', 'remove', 'rename'): raise ValueError('Неизвестное действие')
        label = str(payload.get('label', '')).strip()[:60]
        with self.lock:
            row = next((w for w in self.watched if w['address'] == user), None)
            if action == 'remove': self.watched = [w for w in self.watched if w['address'] != user]
            elif row:
                if label or action == 'rename': row['label'] = label
            elif action == 'add':
                if len(self.watched) >= 20: raise ValueError('Можно отслеживать до 20 адресов.')
                self.watched.append(dict(address=user, label=label, addedAt=stamp()))
            else: raise ValueError('Адрес не отслеживается')
            self.save('watchlist.json', self.watched)
        if action == 'add': self.request_profile(user, True)
        return self.watchlist()

    def overview(self, force=False, coin='all'):
        with self.lock:
            updated = self.overview_data.get('timestamp', 0)
            if not self.overview_busy and (force or time.time() - updated > 300) and not self.stopped.is_set():
                self.overview_busy = True
                threading.Thread(target=self.collect_overview, daemon=True, name='whale-overview').start()
            return dict(**self.overview_data, loading=self.overview_busy, error=self.overview_error)

    def collect_overview(self):
        try:
            raw = fetch_json(url='https://stats-data.hyperliquid.xyz/Mainnet/leaderboard')
            accounts = sorted(raw['leaderboardRows'], key=lambda r: number(r.get('accountValue')) or 0, reverse=True)[:50]
            rows = []
            for row in accounts:
                user = address(row['ethAddress'])
                windows = dict(row.get('windowPerformances', []))
                rows.append(dict(address=user, label=row.get('displayName') or '', accountValue=number(row.get('accountValue')),
                                 pnl=number(windows.get('allTime', {}).get('pnl')), pnl24h=number(windows.get('day', {}).get('pnl')),
                                 positions=[], collectedAt=None))
            with self.lock:
                self.overview_error = ''
                self.overview_data = dict(accounts=rows, activity=[], collectedAt=stamp(), timestamp=time.time(), loaded=0, total=len(rows))
            def load(user):
                state = fetch_json({'type': 'clearinghouseState', 'user': user})
                if not isinstance(state, dict) or 'marginSummary' not in state: raise ValueError('Некорректное состояние счёта')
                return positions(state, user)
            futures = {self.pool.submit(load, row['address']): row for row in rows}
            loaded = 0
            failed = 0
            for future in as_completed(futures):
                if self.stopped.is_set(): return
                try: items = future.result()
                except Exception:
                    failed += 1
                    continue
                with self.lock:
                    row = futures[future]
                    row['positions'], row['collectedAt'] = items, stamp()
                    loaded += 1
                    self.overview_data['loaded'] = loaded
            with self.lock:
                if failed: self.overview_error = f'Не обновлены позиции {failed} адресов; показаны доступные данные.'
                self.save('overview.json', self.overview_data)
        except Exception as e:
            with self.lock: self.overview_error = 'Обзор Hyperliquid недоступен: ' + str(e)[:180]
        finally:
            with self.lock: self.overview_busy = False

    def close(self):
        self.stopped.set()
        self.pool.shutdown(wait=False, cancel_futures=True)
