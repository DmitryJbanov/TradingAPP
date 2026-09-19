#!/usr/bin/env python3
"""CoinGlass top 20, 90d: collect chart tooltips, export significant peaks."""
import argparse
import csv
import io
import os
import json
import re
import subprocess
import sys
import tempfile
import time
from datetime import datetime, timezone
from decimal import Decimal
from pathlib import Path
from urllib.parse import urlsplit
from auth import authenticate, save_session, LoginError
from browser_runtime import launch_browser, context_options, create_page
from login_flow import safe_path, error_code
from map_navigation import (MapNavigator, MapNavigationError, MAP_PATHS, MAP_HEADING,
                            SEARCH_NAME, PERIOD_90, symbol_heading)

URL = 'https://www.coinglass.com/ru/pro/futures/LiquidationMap'
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


def parse_tooltip(raw, current=None):
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
        if current is None or price != current:
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


def ocr_price(png, executable):
    from PIL import Image
    image = Image.open(io.BytesIO(png)).convert('RGB')
    # Observed CoinGlass canvas layout: legend at y=12, current-price label y=28.
    strip = image.crop((0, 18, image.width, 40))
    found = []
    with tempfile.TemporaryDirectory() as tmp:
        for scale in (3, 4):
            target = Path(tmp) / f'price-{scale}.png'
            strip.resize((strip.width * scale, strip.height * scale)).save(target)
            result = subprocess.run([executable, str(target), 'stdout', '-l', 'eng',
                                     '--psm', '7'], capture_output=True, text=True,
                                    check=True, timeout=20, creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0)
            values = re.findall(r':\s*(\d[\d,]*(?:\.\d+)?)', result.stdout)
            if len(values) != 1:
                raise ValueError('Цена OCR неоднозначна. Проверьте chart-before.png; '
                                 'при необходимости используйте --price')
            found.append(number(values[0]))
    if found[0] != found[1] or found[0] <= 0:
        raise ValueError('Два прохода OCR дали разные цены')
    return found[0]


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
                         'Возможна ошибка OCR или изменение данных во время сбора')
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
    record = json.loads(args.from_json.read_text(encoding='utf-8-sig'))
    if (not isinstance(record.get('symbol'), str) or not re.fullmatch(r'[A-Z0-9][A-Z0-9._-]{0,39}', record.get('symbol', '')) or record.get('range_days') != 90
            or record.get('source') not in {'https://www.coinglass.com' + path for path in MAP_PATHS}
            or record.get('complete') is False
            or not record.get('finished_utc')):
        raise ValueError('Нужен завершённый observations.json карты символа за 90 дней; '
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
    report = validate_coverage(points, current)
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


class CollectionError(RuntimeError):
    """Only generated stage/type/code text is safe for the backend journal."""
    def __init__(self, stage, error):
        self.stage = stage
        self.error_type = type(error).__name__
        self.code = error_code(error)
        detail = ('Не загрузился заголовок или график сводной карты. '
                  if stage == 'map_heading_and_canvas' else '')
        if isinstance(error, (MapNavigationError, LoginError)):
            detail = str(error) + ' '
        super().__init__(f'{detail}Этап {stage}: {self.error_type} ({self.code}). '
                         'Смотрите page-state.json или diagnose.py --latest.')


def save_page_diagnostics(page, run, stage, headless, *, error=None, http_status=None, navigation=None):
    """Capture map-loading failures, even before a canvas exists; no auth state."""
    parts = urlsplit(page.url)
    state = {'stage': stage, 'headless': headless, 'browser_channel': 'chromium',
             'page_origin': 'https://www.coinglass.com' if safe_path(page.url) != 'external_or_blank' else 'external_or_blank',
             'page_path': safe_path(page.url), 'http_status': http_status,
             'saved_at': datetime.now(timezone.utc).isoformat(), 'run_id': run.name}
    if navigation is not None:
        state['navigation'] = list(navigation)
    if error is not None:
        state['error_type'] = type(error).__name__
        state['error_code'] = error_code(error)
    try:
        state['canvas_count'] = page.locator('canvas').count()
        state['password_form_visible'] = page.locator('input[type="password"]').first.is_visible()
        state['map_heading_count'] = page.get_by_role(
            'heading', name=MAP_HEADING).count()
        # Never screenshot the login flow. Mask inputs, header account details,
        # and embedded third-party frames on the map itself.
        if (parts.scheme == 'https' and parts.netloc == 'www.coinglass.com'
                and parts.path in MAP_PATHS
                and not state['password_form_visible']):
            page.screenshot(path=str(run / 'error.png'),
                            mask=[page.locator('input'), page.locator('header'), page.locator('iframe')],
                            timeout=10000)
            state['screenshot'] = 'error.png'
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
    chart = card.locator('canvas')
    previous = chart.screenshot()
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
    deadline = time.monotonic() + 60
    while chart.screenshot() == previous:
        if time.monotonic() > deadline:
            raise TimeoutError(f'{symbol}: график не обновился после выбора символа')
        page.wait_for_timeout(500)


def collect_symbol(args, run, page, context, symbol):
    from playwright.sync_api import expect
    started = datetime.now(timezone.utc).isoformat()
    map_started = False
    stage = 'map_navigation'
    source_url = URL
    navigator = MapNavigator(page, report=lambda message: (
        args.progress(15, message) if getattr(args, 'progress', None) else print(message, flush=True)))
    try:
        map_started = True
        stage = 'map_navigation'
        if getattr(args, 'progress', None): args.progress(15, 'Загрузка карты')
        navigator.open()
        source_url = 'https://www.coinglass.com' + safe_path(page.url)
        stage = 'map_heading_and_canvas'
        card = wait_for_map(page)
        if card.locator('canvas').count() != 1:
            raise ValueError('Структура страницы изменилась: карта не определена однозначно')
        stage = 'symbol_selection'
        select_symbol(page, card, symbol)
        expect(card.get_by_role('combobox', name=SEARCH_NAME)).to_have_value(symbol)
        chart = card.locator('.echarts-for-react')
        if getattr(args, 'progress', None): args.progress(20, 'Выбор периода 90 дней')
        stage = 'period_selection'
        canvas = chart.locator('canvas')
        canvas.scroll_into_view_if_needed()
        old_picture = canvas.screenshot()
        period = card.locator('button[role="combobox"]')
        already_90 = PERIOD_90.fullmatch(period.inner_text().strip()) is not None
        if not already_90:
            period.click()
            page.get_by_role('option', name=PERIOD_90).click()
        selected = card.get_by_role('combobox').filter(has_text=PERIOD_90)
        expect(selected).to_be_visible()
        stage = 'map_rendering_90d'
        # CoinGlass leaves an ARIA progressbar visible even after loading.
        # Require a new canvas image, then four equal frames (2 seconds).
        stable, previous, load_deadline = 0, None, time.monotonic() + 60
        while stable < 4:
            if time.monotonic() > load_deadline:
                raise TimeoutError('Карта за 90 дней не завершила перерисовку')
            page.wait_for_timeout(500)
            picture = canvas.screenshot()
            stable = stable + 1 if (already_90 or picture != old_picture) and picture == previous else 0
            previous = picture
        canvas.scroll_into_view_if_needed()
        page.wait_for_timeout(1000)
        before = canvas.screenshot()
        # Save authentication only after the requested chart has loaded.
        stage = 'session_save'
        save_session(context, args.session)
        (run / 'chart-before.png').write_bytes(before)
        stage = 'price_ocr'
        current = Decimal(args.price) if args.price else ocr_price(before, args.tesseract)
        if getattr(args, 'progress', None): args.progress(30, 'Сбор уровней карты')
        stage = 'tooltip_collection'
        bounds = canvas.bounding_box()
        if not bounds or bounds['width'] < 700:
            raise ValueError('График слишком узкий для сбора')
        levels = {}
        pixel_spans = {}
        deadline = time.monotonic() + 480
        # Sweep each CSS pixel, including margins; duplicate tooltips are collapsed.
        for dx in range(1, int(bounds['width']) - 1):
            if time.monotonic() > deadline:
                raise TimeoutError('Сбор превысил 8 минут')
            page.mouse.move(bounds['x'] + dx, bounds['y'] + bounds['height'] * .48)
            page.wait_for_timeout(args.hover_ms)
            raw = chart.evaluate(TOOLTIP_JS)
            if raw and raw.get('title') and raw.get('items'):
                point = parse_tooltip(raw, current=current)
                previous = levels.get(point['price'])
                if previous is not None and previous != point:
                    raise ValueError('Данные изменились во время сбора. Запустите заново')
                levels[point['price']] = point
                pixel_spans.setdefault(point['price'], [dx, dx])[1] = dx
            if dx % 200 == 0:
                if getattr(args, 'progress', None): args.progress(30 + int(50 * dx / bounds['width']), f'Собрано уровней: {len(levels)}')
                print(f'Собрано уровней: {len(levels)}', flush=True)
        # Slowly revisit spans around numeric discontinuities. This can
        # recover missed tooltips without inventing zero-valued levels.
        stage = 'gap_review'
        if getattr(args, 'progress', None): args.progress(82, 'Проверка пропущенных интервалов')
        gaps_before = spacing_report(list(levels.values()))['intervals']
        review_positions = set()
        for gap in gaps_before:
            left = pixel_spans[gap['left']][1]
            right = pixel_spans[gap['right']][0]
            review_positions.update(range(max(1, min(left, right)-2),
                                          min(int(bounds['width'])-1, max(left, right)+3)))
        count_before_review = len(levels)
        if review_positions:
            print(f'Повторная проверка неравномерных интервалов: {len(gaps_before)}...', flush=True)
        review_deadline = time.monotonic() + 180
        for dx in sorted(review_positions, reverse=True):
            if time.monotonic() > review_deadline: raise TimeoutError("Проверка интервалов превысила 3 минуты")
            page.mouse.move(bounds['x'] + dx, bounds['y'] + bounds['height'] * .48)
            page.wait_for_timeout(max(args.hover_ms, 200))
            raw = chart.evaluate(TOOLTIP_JS)
            if raw and raw.get('title') and raw.get('items'):
                point = parse_tooltip(raw, current=current)
                previous = levels.get(point['price'])
                if previous is not None and previous != point:
                    raise ValueError('Данные изменились при повторной проверке интервалов')
                levels[point['price']] = point
        spacing = spacing_report(list(levels.values()))
        spacing.update({'reviewed_pixel_positions': len(review_positions),
                        'additional_points_found': len(levels)-count_before_review})
        expect(selected).to_be_visible()
        expect(card.get_by_role('combobox', name=SEARCH_NAME)).to_have_value(symbol)
        page.mouse.move(bounds['x'] - 10, bounds['y'] - 10)
        page.wait_for_timeout(300)
        after = canvas.screenshot()
        (run / 'chart-after.png').write_bytes(after)
        stage = 'price_ocr_final'
        if not args.price and ocr_price(after, args.tesseract) != current:
            raise ValueError('Текущая цена изменилась во время сбора. Запустите заново')
        points = sorted(levels.values(), key=lambda p: p['price'])
        # Save provenance before validation so a failed scan remains inspectable.
        record = {'source': source_url, 'symbol': symbol, 'range_days': 90,
                  'started_utc': started, 'finished_utc': datetime.now(timezone.utc).isoformat(),
                  'current_price': current, 'price_source': 'manual' if args.price else 'chart_ocr',
                  'levels': points, 'min_relative': args.min_relative, 'side': args.side,
                  'min_prominence': args.min_prominence, 'limit': args.limit,
                  'selection_method': 'local_maxima_with_height_and_prominence',
                  'spacing': spacing,
                  'precision': 'Rounded values displayed in website tooltips'}
        (run / 'observations.json').write_text(json.dumps(record, ensure_ascii=False,
                                                         indent=2, default=str), encoding='utf-8')
        if getattr(args, "progress", None): args.progress(95, "Проверка полноты и расчёт значимых пиков")
        stage = 'coverage_validation'
        validate_coverage(points, current)
        record['complete'] = True
        stage = 'peak_selection'
        selected_peaks = select_significant_levels(
            points, current, Decimal(args.min_relative), Decimal(args.min_prominence),
            args.side, args.limit)
        record['selected_peaks'] = [dict(p, distance_percent=d) for p, d in selected_peaks]
        (run / 'observations.json').write_text(json.dumps(record, ensure_ascii=False,
                                                         indent=2, default=str), encoding='utf-8')
        return current, selected_peaks
    except Exception as error:
        if 'levels' in locals():
            # Chart data only. Preserve the last tooltip and collected
            # points even if parsing fails before observations.json exists.
            try:
                partial = {'source': source_url, 'symbol': symbol, 'range_days': 90,
                           'current_price': current, 'complete': False,
                           'last_tooltip': raw if 'raw' in locals() else None,
                           'levels': sorted(levels.values(), key=lambda p: p['price'])}
                (run / 'observations-partial.json').write_text(
                    json.dumps(partial, ensure_ascii=False, indent=2, default=str),
                    encoding='utf-8')
            except Exception:
                pass
        if map_started and 'page' in locals():
            try:
                save_page_diagnostics(page, run, stage, args.headless,
                                      error=error, http_status=navigator.status, navigation=navigator.steps)
            except Exception:
                pass
        if isinstance(error, UnsupportedSymbol):
            raise
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
            authenticate(page, args.credentials, headless=args.headless,
                         timeout=args.login_timeout, diagnostics_dir=run)
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
    parser.add_argument('--price', help='Цена с этого же графика вручную, вместо OCR')
    parser.add_argument('--tesseract', default='tesseract', help='Путь к tesseract.exe при необходимости')
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
        csv_path = run / f'{symbol.lower()}_90d.csv'
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
