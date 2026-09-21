#!/usr/bin/env python3
"""CoinGlass top 20, 90d: decode frontend API data, export significant peaks."""
import argparse
import csv
import os
import json
import re
import sys
import time
from datetime import datetime, timezone
from decimal import Decimal
from pathlib import Path
from auth import authenticate, save_session, LoginError
from frontend_api import CoinglassApiError, INTERVALS, READY_JS
from browser_runtime import launch_browser, context_options, create_page
from login_flow import safe_path, error_code
from map_navigation import (MapNavigator, MapNavigationError, MAP_PATHS, MAP_HEADING,
                            SEARCH_NAME, PERIOD_90, symbol_heading)

URL = 'https://www.coinglass.com/pro/futures/LiquidationMap'
HEADERS = ['Символ', 'Текущая цена', 'Ближайший уровень ликвидности',
           '% до этого уровня ликвидности']
EXCHANGES = {'Binance', 'OKX', 'Bybit'}
SCRIPT_DIR = Path(__file__).resolve().parent


def number(text):
    value = text.strip().replace('\u00a0', '').replace(' ', '').replace(',', '')
    match = re.fullmatch(r'(\d+(?:\.\d+)?)([KMBT]?)', value, re.I)
    if not match:
        raise ValueError(f'Неизвестный формат числа: {text!r}')
    return Decimal(match[1]) * (Decimal(1000) ** ' KMBT'.index(match[2].upper() or ' '))


def parse_tooltip(raw, current=None, *, infer_current=False):
    price = number(raw['title'])
    if price <= 0:
        raise ValueError('Цена уровня должна быть положительной')
    exchanges, cumulative = {}, {}
    for item in raw['items']:
        name = item['name'].strip()
        if name in EXCHANGES:
            if name in exchanges:
                raise ValueError('Повтор биржи в подсказке')
            exchanges[name] = number(item['value'])
        elif 'Кумулятивное' in name or re.fullmatch(r'Cumulative (?:Long|Short) Liquidation Leverage', name):
            if 'лонговых' in name or name == 'Cumulative Long Liquidation Leverage':
                side = 'long'
            elif 'шортовых' in name or name == 'Cumulative Short Liquidation Leverage':
                side = 'short'
            else:
                raise ValueError(f'Неизвестная накопительная серия: {name}')
            if side in cumulative:
                raise ValueError('Повтор накопительной серии в подсказке')
            cumulative[side] = number(item['value'])
        else:
            raise ValueError(f'Неизвестная серия графика: {name}')
    # CoinGlass inserts a current-price marker into the x-axis. Its tooltip
    # contains BOTH cumulative curves at zero, and no exchange bars. Preserve
    # it for coverage/provenance, but never treat it as positive liquidity.
    if not exchanges and cumulative == {'long': Decimal(0), 'short': Decimal(0)}:
        if (current is None and not infer_current) or (current is not None and price != current):
            raise ValueError('Подсказка маркера текущей цены не совпадает с текущей ценой')
        return {'price': price, 'intensity': Decimal(0), 'side': 'reference',
                'exchanges': {}, 'kind': 'current_price_marker'}
    if not exchanges or not cumulative:
        raise ValueError('Неполная подсказка: нет бирж или стороны ликвидаций')
    if len(cumulative) != 1:
        raise ValueError('Неоднозначная сторона ликвидаций в подсказке')
    side = next(iter(cumulative))
    return {'price': price, 'intensity': sum(exchanges.values(), Decimal(0)),
            'side': side, 'exchanges': exchanges}


def select_level(levels, current, relative=Decimal(0), side='both'):
    if not current.is_finite() or current <= 0:
        raise ValueError('Текущая цена должна быть положительной')
    if not relative.is_finite() or not Decimal(0) <= relative <= Decimal(1):
        raise ValueError('Порог должен быть от 0 до 1')
    if not levels:
        raise ValueError('Нет уровней')
    threshold = max(p['intensity'] for p in levels) * relative
    candidates = [p for p in levels if p['intensity'] > 0
                  and p['intensity'] >= threshold
                  and (side == 'both' or (side == 'above' and p['price'] > current)
                       or (side == 'below' and p['price'] < current))]
    if not candidates:
        raise ValueError('Нет уровней, соответствующих фильтру')
    # Same distance: choose higher intensity, then lower price deterministically.
    best = min(candidates, key=lambda p: (abs(p['price'] - current),
                                          -p['intensity'], p['price']))
    distance = abs(best['price'] - current) / current * 100
    return best, distance


def significant_peaks(levels, relative=Decimal('0.50'), min_prominence=Decimal('0.35')):
    from selection import explain_selection
    report = explain_selection(levels, Decimal(1), relative, min_prominence, limit=50)
    return [{**{k: v for k, v in p.items() if k in {'price', 'intensity', 'side', 'exchanges', 'kind'}},
             'prominence': p['prominence']} for p in report['points'] if p['isPeak'] and not any(r in p['reasons'] for r in ('height', 'prominence'))]


def select_significant_levels(levels, current, relative=Decimal('0.50'),
                              min_prominence=Decimal('0.35'), side='both', limit=5):
    from selection import explain_selection
    report = explain_selection(levels, current, relative, min_prominence, side, limit)
    return [(dict(price=p['price'], intensity=p['intensity'], side=p.get('side', ''),
                  exchanges=p.get('exchanges', {}), prominence=p['prominence']),
             p['distancePercent']) for p in report['selected']]


def write_csv(path, current, selected, symbol="BTC"):
    with Path(path).open('w', encoding='utf-8-sig', newline='') as f:
        writer = csv.writer(f, delimiter=';')
        writer.writerow(HEADERS)
        for point, distance in selected:
            writer.writerow([symbol, format(current, 'f'), format(point['price'], 'f'),
                             format(distance.quantize(Decimal('0.000001')), 'f')])


def validate_coverage(levels, current):
    if not current.is_finite() or current <= 0:
        raise ValueError('Некорректная текущая цена')
    if len({p['price'] for p in levels}) != len(levels):
        raise ValueError('В данных повторяются цены')
    for p in levels:
        if not p['price'].is_finite() or p['price'] <= 0:
            raise ValueError('Некорректная цена уровня')
        if 'intensity' in p and (not p['intensity'].is_finite() or p['intensity'] < 0):
            raise ValueError('Некорректная интенсивность уровня')
    ordinary = [p for p in levels if p.get('kind') != 'current_price_marker']
    markers = [p for p in levels if p.get('kind') == 'current_price_marker']
    if any(p['price'] != current or p['intensity'] != 0 for p in markers):
        raise ValueError('Некорректный маркер текущей цены')
    if len(ordinary) < 30:
        raise ValueError('Собрано слишком мало уровней: проверьте график')
    if any(p['side'] not in {'long', 'short'} for p in ordinary):
        raise ValueError('Некорректная сторона ликвидаций')
    long_prices = [p['price'] for p in ordinary if p['side'] == 'long']
    short_prices = [p['price'] for p in ordinary if p['side'] == 'short']
    if not long_prices or not short_prices:
        raise ValueError('Не собраны обе стороны карты')
    if not max(long_prices) <= current <= min(short_prices):
        raise ValueError('Текущая цена не совпадает с границей лонгов/шортов. '
                         'Возможно изменение данных во время сбора')
    return spacing_report(levels)


def spacing_report(levels):
    # Chart categories need not form a continuous price grid. A gap in prices
    # is diagnostic information, not evidence of a skipped DOM tooltip.
    prices = sorted({p['price'] for p in levels if p.get('kind') != 'current_price_marker'})
    if len(prices) < 2:
        return {'typical_step': None, 'intervals': []}
    steps = sorted(b-a for a, b in zip(prices, prices[1:]))
    typical_step = steps[len(steps)//2]
    intervals = [{'left': a, 'right': b, 'width': b-a}
                 for a, b in zip(prices, prices[1:]) if b-a > typical_step * Decimal('1.8')]
    return {'typical_step': typical_step, 'intervals': intervals,
            'interpretation': 'Uneven price categories; missing values are not inferred or filled.'}


def reprocess_snapshot(args, run):
    from frontend_api import RANGE_DAYS
    record = json.loads(args.from_json.read_text(encoding='utf-8-sig'))
    if (not isinstance(record.get('symbol'), str) or not re.fullmatch(r'[A-Z0-9][A-Z0-9._-]{0,39}', record.get('symbol', '')) or record.get('range_days') not in RANGE_DAYS
            or record.get('source') not in {'https://www.coinglass.com' + path for path in MAP_PATHS}
            or record.get('complete') is False
            or not record.get('finished_utc')):
        raise ValueError('Нужен завершённый observations.json карты символа; '
                         'частичный файл для пересчёта не подходит')
    if args.price is not None:
        raise ValueError('--from-json использует цену исходного снимка; --price не применяется')
    current = Decimal(str(record['current_price']))
    points = []
    for item in record['levels']:
        point = dict(item)
        point['price'] = Decimal(str(point['price']))
        point['intensity'] = Decimal(str(point['intensity']))
        if point.get('side') not in {'long', 'short', 'reference'}:
            raise ValueError('Некорректная сторона уровня в снимке')
        points.append(point)
    report = (spacing_report(points) if record.get('collection_method') == 'frontend_bvP'
              else validate_coverage(points, current))
    selected = select_significant_levels(points, current, Decimal(args.min_relative),
                                        Decimal(args.min_prominence), args.side, args.limit)
    record.update({'reprocessed_utc': datetime.now(timezone.utc).isoformat(),
                   'processing_mode': 'saved_snapshot_no_live_refresh',
                   'spacing': report, 'min_relative': args.min_relative,
                   'min_prominence': args.min_prominence, 'side': args.side, 'limit': args.limit,
                   'selected_peaks': [dict(p, distance_percent=d) for p, d in selected]})
    (run / 'observations.json').write_text(json.dumps(record, ensure_ascii=False,
                                                     indent=2, default=str), encoding='utf-8')
    print(f'Пересчёт снимка от {record["finished_utc"]}; котировка не обновлялась.')
    print(f'Точек: {len(points)}; неравномерных интервалов: {len(report["intervals"])}.')
    return current, selected


TOOLTIP_JS = r"""root => {
  const box = root.querySelector('.cg-toolti-box');
  if (!box || !box.getBoundingClientRect().width) return null;
  // ECharts may hide the tooltip between frames while retaining the latest data.
  // Repeated titles are collapsed by price and coverage is checked after scanning.
  return {title: box.querySelector('.cg-toolti-title')?.textContent?.trim(),
    items: [...box.querySelectorAll('.cg-tooltip-item')].map(e => ({
      name: e.querySelector('.cg-tooltip-item-title')?.textContent?.trim(),
      value: e.querySelector('.pl20')?.textContent?.trim()
    }))};
}"""


ARM_TOOLTIP_JS = r"""root => {
  root.__cgHover?.observer.disconnect();
  const position = () => {
    const style = root.querySelector('.cg-toolti-box')?.style;
    return style ? [style.left, style.top, style.transform].join('|') : '';
  };
  const state = {fresh: false, position: position()};
  state.observer = new MutationObserver(records => {
    const box = root.querySelector('.cg-toolti-box');
    if (!box) return;
    // ECharts can reuse content for adjacent pixels in the same category.
    // A new tooltip position acknowledges that mouse movement as well.
    if (position() !== state.position || records.some(record =>
      record.type !== 'attributes' &&
      (box.contains(record.target) || [...record.addedNodes].some(n => n === box || n.contains?.(box))))) {
      state.fresh = true;
    }
  });
  state.observer.observe(root, {subtree: true, childList: true,
    characterData: true, attributes: true, attributeFilter: ['style']});
  root.__cgHover = state;
}"""


WAIT_TOOLTIP_JS = r"""(root, timeoutMs) => {
  const read = READ_TOOLTIP;
  return new Promise(resolve => {
    let frame, previous, finished = false;
    const finish = value => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      cancelAnimationFrame(frame);
      root.__cgHover?.observer.disconnect();
      delete root.__cgHover;
      resolve(value);
    };
    const timer = setTimeout(() => finish(null), timeoutMs);
    const poll = () => {
      const raw = read(root);
      const box = root.querySelector('.cg-toolti-box');
      const visible = box && getComputedStyle(box).visibility !== 'hidden' &&
        getComputedStyle(box).display !== 'none' && getComputedStyle(box).opacity !== '0';
      const complete = root.__cgHover?.fresh && visible && raw?.title && raw.items.length &&
        raw.items.every(item => item.name && item.value);
      const signature = complete ? JSON.stringify(raw) : null;
      // Require matching complete values in two consecutive browser frames.
      if (signature && signature === previous) return finish(raw);
      previous = signature;
      frame = requestAnimationFrame(poll);
    };
    frame = requestAnimationFrame(poll);
  });
}""".replace('READ_TOOLTIP', TOOLTIP_JS)


def hover_tooltip(page, chart, bounds, dx, timeout_ms):
    """Wait for fresh HTML, including when adjacent pixels share a category."""
    chart.evaluate(ARM_TOOLTIP_JS)
    page.mouse.move(bounds['x'] + dx, bounds['y'] + bounds['height'] * .48)
    return chart.evaluate(WAIT_TOOLTIP_JS, timeout_ms)


def tooltip_signature(page, chart):
    """Sample rendered HTML at fixed positions, without reading canvas pixels."""
    canvas = chart.locator('canvas')
    canvas.scroll_into_view_if_needed()
    bounds = canvas.bounding_box()
    if not bounds:
        return None
    samples = []
    for fraction in (.25, .5, .75):
        raw = hover_tooltip(page, chart, bounds, bounds['width'] * fraction, 1000)
        if not raw or not raw.get('title') or not raw.get('items'):
            return None
        parse_tooltip(raw, infer_current=True)
        samples.append(raw)
    return samples


def wait_for_tooltips(page, chart, previous=None):
    deadline = time.monotonic() + 60
    stable, last = 0, None
    while stable < 3:
        if time.monotonic() > deadline:
            raise TimeoutError('HTML-подсказки карты не обновились или не стабилизировались')
        sample = tooltip_signature(page, chart)
        stable = stable + 1 if sample and sample != previous and sample == last else 0
        last = sample
        page.wait_for_timeout(500)


class CollectionError(RuntimeError):
    """Only generated stage/type/code text is safe for the backend journal."""
    def __init__(self, stage, error):
        self.stage = stage
        self.error_type = type(error).__name__
        self.code = error.code if isinstance(error, CoinglassApiError) else error_code(error)
        detail = ('Не загрузился заголовок или график сводной карты. '
                  if stage == 'map_heading_and_canvas' else '')
        if isinstance(error, (MapNavigationError, LoginError, CoinglassApiError)):
            detail = str(error) + ' '
        super().__init__(f'{detail}Этап {stage}: {self.error_type} ({self.code}). '
                         'Смотрите page-state.json или diagnose.py --latest.')


def save_page_diagnostics(page, run, stage, headless, *, error=None, http_status=None, navigation=None):
    """Capture map-loading failures, even before a canvas exists; no auth state."""
    state = {'stage': stage, 'headless': headless, 'browser_channel': 'chromium',
             'page_origin': 'https://www.coinglass.com' if safe_path(page.url) != 'external_or_blank' else 'external_or_blank',
             'page_path': safe_path(page.url), 'http_status': http_status,
             'saved_at': datetime.now(timezone.utc).isoformat(), 'run_id': run.name}
    if navigation is not None:
        state['navigation'] = list(navigation)
    if error is not None:
        state['error_type'] = type(error).__name__
        state['error_code'] = error.code if isinstance(error, CoinglassApiError) else error_code(error)
    try:
        state['canvas_count'] = page.locator('canvas').count()
        state['password_form_visible'] = page.locator('input[type="password"]').first.is_visible()
        state['map_heading_count'] = page.get_by_role(
            'heading', name=MAP_HEADING).count()
    except Exception:
        state['diagnostics_incomplete'] = True
    (run / 'page-state.json').write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding='utf-8')


def wait_for_map(page):
    heading = page.get_by_role('heading', name=MAP_HEADING)
    heading.wait_for(state='attached', timeout=60000)
    # Scroll to the heading before requiring the canvas. Otherwise a lazily
    # rendered chart below the viewport cannot satisfy the ancestor selector.
    heading.scroll_into_view_if_needed(timeout=15000)
    card = heading.locator('xpath=ancestor::*[.//canvas][1]')
    card.wait_for(state='visible', timeout=60000)
    return card


class UnsupportedSymbol(ValueError):
    pass


def select_symbol(page, card, symbol):
    from playwright.sync_api import expect
    search = card.get_by_role('combobox', name=SEARCH_NAME)
    if search.input_value() == symbol:
        return
    # Editing the input is not a selection: require an exact option and click it.
    chart = card.locator('.echarts-for-react')
    previous = tooltip_signature(page, chart)
    search.fill(symbol)
    option = page.get_by_role('option', name=symbol, exact=True)
    try:
        option.wait_for(state='visible', timeout=10000)
    except Exception:
        search.press('Escape')
        raise UnsupportedSymbol(f'{symbol}: нет точного варианта в списке CoinGlass') from None
    option.click()
    expect(search).to_have_value(symbol)
    expect(search).not_to_have_attribute('aria-expanded', 'true')
    # Verify committed selection independently from the editable input.
    if symbol != 'BTC':
        expect(card.get_by_role('heading')).to_have_text(symbol_heading(symbol))
    wait_for_tooltips(page, chart, previous)


def open_frontend_map(page, navigation=None, *, force_reload=False):
    # The persistent page already has the client needed for every symbol/period.
    # Avoid a hard reload: CoinGlass can reject deep links while its router works.
    if not force_reload and safe_path(page.url) in MAP_PATHS and page.evaluate(READY_JS) is True:
        if navigation is not None:
            navigation.append(dict(method='reuse_frontend', path=safe_path(page.url), http_status=None))
        return None
    response = page.goto(URL, wait_until='domcontentloaded', timeout=60000)
    if navigation is not None:
        navigation.append(dict(method='direct', path=safe_path(page.url), http_status=response.status if response is not None else None))
    if response is not None and response.status == 404:
        response = page.goto('https://www.coinglass.com' + MAP_PATHS[0],
                             wait_until='domcontentloaded', timeout=60000)
        if navigation is not None:
            navigation.append(dict(method='direct', path=safe_path(page.url), http_status=response.status if response is not None else None))
    if response is not None and response.status == 404:
        navigator = MapNavigator(page)
        try:
            navigator.open()
        finally:
            if navigation is not None:
                navigation.extend(navigator.steps)
        return None  # Client-side navigation has no new document response.
    return response


def collect_symbol(args, run, page, context, symbol):
    from frontend_api import fetch_liquidation_map, parse_liquidation_map
    started = datetime.now(timezone.utc).isoformat()
    stage = 'map_navigation'
    status = None
    navigation = []
    range_days = getattr(args, 'range_days', 90)
    request_limit = getattr(args, 'request_limit', 1440)
    try:
        if getattr(args, 'price', None) is not None:
            raise ValueError('Frontend collection requires data.lastPrice')
        if getattr(args, 'progress', None): args.progress(15, 'Загрузка CoinGlass frontend')
        response = open_frontend_map(page, navigation)
        status = response.status if response is not None else None
        if status is not None and status >= 400:
            raise MapNavigationError(f'Страница карты вернула HTTP {status}; сбор остановлен.')
        stage = 'frontend_request'
        if getattr(args, 'progress', None): args.progress(35, f'Получение и декодирование карты за {range_days} дн.')
        raw = fetch_liquidation_map(page, symbol, range_days, request_limit)
        if isinstance(raw, dict) and str(raw.get('code')) == '40001':
            # Refresh a potentially stale frontend once, retaining the account/session.
            if getattr(args, 'progress', None): args.progress(35, 'CoinGlass вернул 40001; обновление страницы и повтор запроса')
            stage = 'map_navigation'
            response = open_frontend_map(page, navigation, force_reload=True)
            status = response.status if response is not None else None
            if status is not None and status >= 400:
                raise MapNavigationError(f'Страница карты вернула HTTP {status}; сбор остановлен.')
            stage = 'frontend_request'
            raw = fetch_liquidation_map(page, symbol, range_days, request_limit)
        stage = 'response_validation'
        try:
            parsed = parse_liquidation_map(raw, symbol)
        except CoinglassApiError as error:
            if error.api_code != '40000':
                raise
            credentials = getattr(args, 'credentials', None)
            if not credentials or not Path(credentials).is_file():
                raise
            stage = 'authentication'
            if getattr(args, 'progress', None): args.progress(35, 'CoinGlass требует входа; восстановление сессии')
            authenticate(page, credentials, headless=True,
                         timeout=getattr(args, 'login_timeout', 90), diagnostics_dir=run,
                         report=lambda message: args.progress(35, message) if getattr(args, 'progress', None) else None)
            save_session(context, args.session)
            stage = 'map_navigation'
            response = open_frontend_map(page, navigation)
            status = response.status if response is not None else None
            if status is not None and status >= 400:
                raise MapNavigationError(f'Страница карты вернула HTTP {status}; сбор остановлен.')
            stage = 'frontend_request'
            raw = fetch_liquidation_map(page, symbol, range_days, request_limit)
            stage = 'response_validation'
            parsed = parse_liquidation_map(raw, symbol)
        (run / 'response-raw.json').write_text(
            json.dumps(raw, ensure_ascii=False, indent=2, allow_nan=False), encoding='utf-8')
        current, points = parsed['current_price'], parsed['levels']
        stage = 'peak_selection'
        if getattr(args, 'progress', None): args.progress(90, 'Расчёт значимых пиков')
        selected = select_significant_levels(points, current, Decimal(args.min_relative),
                                            Decimal(args.min_prominence), args.side, args.limit)
        record = {'source': URL, 'symbol': symbol, 'range_days': range_days,
                  'navigation': navigation,
                  'endpoint': '/api/index/2/exLiqMap',
                  'request': {'merge': True, 'symbol': symbol, 'interval': INTERVALS[range_days], 'limit': request_limit},
                  'started_utc': started, 'finished_utc': datetime.now(timezone.utc).isoformat(),
                  **parsed, 'price_source': 'data.lastPrice',
                  'min_relative': args.min_relative, 'min_prominence': args.min_prominence,
                  'side': args.side, 'limit': args.limit,
                  'collection_method': 'frontend_bvP',
                  'selection_method': 'local_maxima_with_height_and_prominence',
                  'side_interpretation': 'long below lastPrice; short above; reference at lastPrice',
                  'precision': 'Decoded frontend response values (no tooltip rounding)',
                  'spacing': spacing_report(points), 'complete': True,
                  'selected_peaks': [dict(p, distance_percent=d) for p, d in selected]}
        stage = 'session_save'
        save_session(context, args.session)
        (run / 'observations.json').write_text(
            json.dumps(record, ensure_ascii=False, indent=2, default=str), encoding='utf-8')
        return current, selected
    except Exception as error:
        try:
            save_page_diagnostics(page, run, stage, getattr(args, 'headless', True),
                                  error=error, http_status=status, navigation=navigation)
        except Exception:
            pass
        raise CollectionError(stage, error) from None

def collect(args, run):
    from playwright.sync_api import sync_playwright
    from markets import fetch_top20, manual_symbols, run_batch
    coins = manual_symbols(args.symbols) if args.symbols else fetch_top20()
    (run / 'ranking.json').write_text(json.dumps({
        'source': 'manual' if args.symbols else 'CoinGecko coins/markets market_cap_desc',
        'fetched_utc': datetime.now(timezone.utc).isoformat(), 'coins': coins,
    }, ensure_ascii=False, indent=2), encoding='utf-8')
    with sync_playwright() as pw:
        browser = launch_browser(pw, diagnostics_dir=run)
        try:
            options = context_options()
            if args.session.exists() and not args.reauth:
                options['storage_state'] = str(args.session)
            context, page = create_page(browser, options, diagnostics_dir=run)
            page.set_default_timeout(60000)
            return run_batch(coins, run,
                             lambda coin, folder: collect_symbol(args, folder, page, context, coin['symbol']),
                             HEADERS, UnsupportedSymbol)
        finally:
            browser.close()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--symbols', nargs='+', help='Только указанные символы; по умолчанию актуальный топ-20')
    parser.add_argument('--output', type=Path, default=Path('output'))
    parser.add_argument('--headless', action='store_true', default=True, help='Всегда включён: запуск только без окон')
    parser.add_argument('--hover-ms', type=int, default=100)
    parser.add_argument('--min-relative', default='0.50', help='Минимальная высота пика / максимум карты (0..1)')
    parser.add_argument('--min-prominence', default='0.35',
                        help='Минимальная выраженность пика / максимум карты (0..1)')
    parser.add_argument('--limit', type=int, default=5, help='Количество ближайших значимых пиков (по умолчанию 5)')
    parser.add_argument('--from-json', type=Path, help='Пересчитать observations.json без браузера и входа')
    parser.add_argument('--side', choices=['both', 'above', 'below'], default='both')
    parser.add_argument('--price', help='Устарело: frontend-сбор использует data.lastPrice')
    parser.add_argument('--credentials', type=Path, default=SCRIPT_DIR / 'credentials.txt',
                        help='Файл с email= и password=')
    parser.add_argument('--session', type=Path, default=SCRIPT_DIR / '.coinglass-session.json',
                        help='Файл сохранённой сессии браузера')
    parser.add_argument('--reauth', action='store_true', help='Войти заново, без сохранённой сессии')
    parser.add_argument('--login-timeout', type=int, default=180,
                        help='Сколько секунд ждать вход/CAPTCHA/код подтверждения')
    args = parser.parse_args()
    if args.login_timeout < 15 or args.login_timeout > 1800:
        parser.error('login-timeout: от 15 до 1800 секунд')
    threshold = Decimal(args.min_relative)
    prominence = Decimal(args.min_prominence)
    if not prominence.is_finite() or not 0 <= prominence <= 1 or not 1 <= args.limit <= 50:
        parser.error('min-prominence: 0..1; limit: 1..50')
    if not threshold.is_finite() or not 0 <= threshold <= 1 or not 50 <= args.hover_ms <= 250:
        parser.error('Порог: 0..1; hover-ms: 50..250')
    if args.price and (not args.symbols or len(args.symbols) != 1) and not args.from_json:
        parser.error('--price разрешён только с одним --symbols')
    run = args.output / datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S_%fZ')
    run.mkdir(parents=True, exist_ok=False)
    try:
        if not args.from_json:
            return collect(args, run)
        current, selected_peaks = reprocess_snapshot(args, run)
        symbol = json.loads(args.from_json.read_text(encoding='utf-8-sig'))['symbol']
        range_days = json.loads(args.from_json.read_text(encoding='utf-8-sig'))['range_days']
        csv_path = run / f'{symbol.lower()}_{range_days}d.csv'
        write_csv(csv_path, current, selected_peaks, symbol)
        print(f'Готово: {csv_path}')
        print(f'Найдено значимых уровней для таблицы: {len(selected_peaks)}')
        for point, distance in selected_peaks:
            print(f'{symbol} | {current} | {point["price"]} | {distance:.6f}%')
    except Exception as exc:
        (run / 'FAILED.txt').write_text(str(exc), encoding='utf-8')
        print(f'Сбор не завершён, CSV не создан: {exc}\nДиагностика: {run}', file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
