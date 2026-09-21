"""Headless browser worker: persistent service mode and one-shot CLI mode."""
import contextlib
import json
import os
import sys
import queue
import threading
from pathlib import Path
from types import SimpleNamespace
from collector import collect_symbol, UnsupportedSymbol, CollectionError
from auth import LoginError
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


def run(request, runtime=None):
    data = Path(os.environ.get('COINGLASS_DATA_DIR', './coinglass-data')).resolve()
    heatmap = request.get('type') == 'heatmap'
    folder = (data / 'heatmap' if heatmap else data) / 'runs' / request['id']
    folder.mkdir(parents=True, exist_ok=True)
    if runtime is None:
        from playwright.sync_api import sync_playwright
        with sync_playwright() as pw:
            owned = BrowserRuntime(pw, data)
            try:
                return run(request, owned)
            finally:
                owned.close()
    context, page = runtime.ensure(folder)
    emit('progress', progress=5, message='Использование текущей сессии CoinGlass')
    if heatmap:
        from heatmap_worker import run as run_heatmap
        result, snapshot = run_heatmap(request, runtime, folder)
        emit('result', result=result, snapshot=snapshot)
        return
    p = request['params']
    args = SimpleNamespace(headless=True, price=None,
        credentials=Path(os.environ.get('COINGLASS_CREDENTIALS', str(data / 'credentials.txt'))),
        range_days=p.get('rangeDays', 90), request_limit=p.get('requestLimit', 1440),
        session=data / 'session.json', hover_ms=p['hoverMs'], min_relative=str(p['minRelative']),
        min_prominence=str(p['minProminence']), side=p['side'], limit=p['limit'],
        progress=lambda percent, message: emit('progress', progress=percent, message=message))
    with contextlib.redirect_stdout(Messages()):
        current, peaks = collect_symbol(args, folder, page, context, request['asset'])
    from selection import preview
    record = json.loads((folder / 'observations.json').read_text(encoding='utf-8'))
    snapshot = dict(schemaVersion=1, snapshotId=request['id'], asset=request['asset'],
        rangeDays=record['range_days'], requestLimit=record['request']['limit'],
        currentPrice=str(current), collectedAt=record['finished_utc'],
        points=record['levels'], precision=record['precision'], complete=True,
        hoverMs=p['hoverMs'])
    emit('result', result=preview(snapshot, p)['result'], snapshot=snapshot)


class BrowserRuntime:
    def __init__(self, pw, data):
        self.pw, self.data = pw, data
        self.browser = self.context = self.page = None

    def ensure(self, folder=None):
        if self.browser is None or not self.browser.is_connected():
            self.close()
            self.browser = launch_browser(self.pw, diagnostics_dir=folder)
        if self.context is None:
            opts = context_options()
            imported = Path(os.environ.get('COINGLASS_SESSION_FILE', str(self.data / 'imported-session.json')))
            session = imported if imported.is_file() else self.data / 'session.json'
            if session.exists(): opts['storage_state'] = str(session)
            self.context, self.page = create_page(self.browser, opts, diagnostics_dir=folder)
            self.page.set_default_timeout(60000)
        elif self.page is None or self.page.is_closed():
            # Replacing a tab must not discard cookies/localStorage in memory.
            self.page = self.context.new_page()
            self.page.set_default_timeout(60000)
        return self.context, self.page

    def close(self):
        if self.browser is not None:
            try: self.browser.close()
            except Exception: pass
        self.browser = self.context = self.page = None


def report_error(exc):
    from heatmap_worker import SubscriptionRequired, HeatmapApiError
    from map_navigation import MapNavigationError
    if isinstance(exc, (LoginError, BrowserStartError, CollectionError, SubscriptionRequired, HeatmapApiError, MapNavigationError)):
        emit('error', message=str(exc))
    elif isinstance(exc, UnsupportedSymbol):
        emit('error', message='Этот актив не поддерживается картой CoinGlass')
    else:
        emit('error', message=f'Сбор не завершён ({type(exc).__name__}). Проверьте диагностические файлы на сервере.')


def serve():
    from playwright.sync_api import sync_playwright
    requests = queue.Queue()
    def read_requests():
        for line in sys.stdin:
            requests.put(json.loads(line))
        requests.put(None)
    threading.Thread(target=read_requests, daemon=True).start()
    data = Path(os.environ.get('COINGLASS_DATA_DIR', './coinglass-data')).resolve()
    with sync_playwright() as pw:
        runtime = BrowserRuntime(pw, data)
        try:
            runtime.ensure()
            emit('ready')
            while True:
                try: request = requests.get_nowait()
                except queue.Empty:
                    # Pump Playwright on its owning thread, and recover a closed
                    # browser/page even while there are no collection requests.
                    try:
                        _, page = runtime.ensure()
                        page.wait_for_timeout(200)
                    except Exception:
                        runtime.close()
                        raise  # Manager restarts a crashed worker with backoff.
                    continue
                if request is None:
                    break
                global request_id
                request_id = request['id']
                try:
                    run(request, runtime)
                except Exception as exc:
                    # A rejected API response or auth error does not invalidate
                    # the browser. ensure() recovers disconnected sessions;
                    # the manager terminates the process on a job timeout.
                    report_error(exc)
                finally:
                    request_id = None
        finally:
            runtime.close()


if __name__ == '__main__':
    output = sys.stdout
    request_id = None
    def emit(kind, **data):
        print(json.dumps(dict(kind=kind, request_id=request_id, **data), ensure_ascii=False),
              file=output, flush=True)
    if '--persistent' in sys.argv:
        serve()
    else:
        try:
            run(json.loads(sys.stdin.readline()))
        except Exception as exc:
            report_error(exc)
            sys.exit(1)
