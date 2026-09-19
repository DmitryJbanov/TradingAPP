"""One isolated, strictly headless collection. stdout is a JSON event protocol."""
import contextlib
import json
import os
import sys
from pathlib import Path
from types import SimpleNamespace
from collector import collect_symbol, UnsupportedSymbol, CollectionError
from auth import authenticate, LoginError
from browser_runtime import launch_browser, context_options, create_page, BrowserStartError


def emit(kind, **data):
    print(json.dumps(dict(kind=kind, **data), ensure_ascii=False), flush=True)


class Messages:
    def write(self, text):
        # Only known non-sensitive status messages from auth are forwarded.
        if any(s in text for s in ('Сохранённая сессия принята', 'Вход в CoinGlass с данными', 'Ожидаю результат входа', 'Форма входа закрыта')):
            emit('log', message=text.strip())
    def flush(self):
        pass


def run(request):
    from playwright.sync_api import sync_playwright
    data = Path(os.environ.get('COINGLASS_DATA_DIR', './coinglass-data')).resolve()
    folder = data / 'runs' / request['id']
    folder.mkdir(parents=True, exist_ok=True)
    p = request['params']
    args = SimpleNamespace(headless=True, price=None, tesseract=os.environ.get('TESSERACT', 'tesseract'),
        session=data / 'session.json', hover_ms=p['hoverMs'], min_relative=str(p['minRelative']),
        min_prominence=str(p['minProminence']), side=p['side'], limit=p['limit'],
        progress=lambda percent, message: emit('progress', progress=percent, message=message))
    credentials = Path(os.environ.get('COINGLASS_CREDENTIALS', str(data / 'credentials.txt')))
    with sync_playwright() as pw:
        # No headed fallback, no xvfb, no browser window even if authentication fails.
        browser = launch_browser(pw, diagnostics_dir=folder)
        try:
            opts = context_options()
            imported = Path(os.environ.get('COINGLASS_SESSION_FILE', str(data / 'imported-session.json')))
            session = imported if imported.is_file() else args.session
            if session.exists(): opts['storage_state'] = str(session)
            context, page = create_page(browser, opts, diagnostics_dir=folder)
            page.set_default_timeout(60000)
            emit('progress', progress=5, message='Проверка входа CoinGlass')
            authenticate(page, credentials, headless=True, timeout=90,
                         diagnostics_dir=folder,
                         report=lambda message: emit('log', message=message))
            with contextlib.redirect_stdout(Messages()):
                current, peaks = collect_symbol(args, folder, page, context, request['asset'])
            from selection import preview
            record = json.loads((folder / 'observations.json').read_text(encoding='utf-8'))
            snapshot = dict(schemaVersion=1, snapshotId=request['id'], asset=request['asset'],
                rangeDays=90, currentPrice=str(current), collectedAt=record['finished_utc'],
                points=record['levels'], precision=record['precision'], complete=True,
                hoverMs=p['hoverMs'])
            # Only the chart crop, never a whole page, credentials or browser state.
            chart = folder / 'chart-after.png'
            if chart.is_file() and chart.stat().st_size <= 2_000_000:
                import base64
                snapshot['imageDataUrl'] = 'data:image/png;base64,' + base64.b64encode(chart.read_bytes()).decode('ascii')
            emit('result', result=preview(snapshot, p)['result'], snapshot=snapshot)
        finally:
            browser.close()


if __name__ == '__main__':
    # Keep stdout usable while parser messages are redirected.
    output = sys.stdout
    def emit(kind, **data):
        print(json.dumps(dict(kind=kind, **data), ensure_ascii=False), file=output, flush=True)
    try:
        run(json.loads(sys.stdin.readline()))
    except (LoginError, BrowserStartError, CollectionError) as exc:
        emit('error', message=str(exc))
        sys.exit(1)
    except UnsupportedSymbol:
        emit('error', message='Этот актив не поддерживается картой CoinGlass')
        sys.exit(1)
    except Exception as exc:
        # Never forward raw browser exception text, credentials or session state.
        emit('error', message=f'Сбор не завершён ({type(exc).__name__}). Проверьте доступ к карте, OCR и диагностические файлы на сервере.')
        sys.exit(1)
