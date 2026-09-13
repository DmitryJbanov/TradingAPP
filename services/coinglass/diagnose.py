"""python diagnose.py --probe | --latest | --version. Never reads credentials."""
import argparse
import json
import os
import sys
import uuid
from pathlib import Path

from browser_runtime import AUTH_REVISION, launch_browser, context_options, create_page, BrowserStartError
from login_flow import LoginFlow, LoginError


def latest_report(directory):
    files = list((Path(directory) / 'runs').glob('*/login-state.json'))
    if not files:
        return {'revision': AUTH_REVISION, 'message': 'Диагностики пока нет'}
    # UUID filenames are random. Compare actual write times, never names.
    path = max(files, key=lambda item: item.stat().st_mtime_ns)
    report = {'installed_revision': AUTH_REVISION, 'file': str(path),
              'diagnostic': json.loads(path.read_text(encoding='utf-8'))}
    map_path = path.parent / 'page-state.json'
    if map_path.is_file():
        try:
            report['collection_diagnostic'] = json.loads(map_path.read_text(encoding='utf-8'))
        except (OSError, ValueError):
            report['collection_diagnostic'] = {'error': 'page-state.json недоступен или повреждён'}
    return report


def probe(directory):
    from playwright.sync_api import sync_playwright
    folder = Path(directory) / 'runs' / ('probe-' + uuid.uuid4().hex)
    folder.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as pw:
        browser = launch_browser(pw, diagnostics_dir=folder)
        try:
            # Fresh context: no password or existing session is loaded by a probe.
            _, page = create_page(browser, context_options(), diagnostics_dir=folder)
            page.set_default_timeout(60000)
            flow = LoginFlow(page, folder)
            try:
                result = flow.run(probe=True)
                return 0 if result == 'form_ready' else 1
            except LoginError as error:
                print(str(error), flush=True)
                return 1
            finally:
                print(json.dumps(flow.save(), ensure_ascii=False, indent=2), flush=True)
        finally:
            browser.close()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument('--probe', action='store_true')
    mode.add_argument('--latest', action='store_true')
    mode.add_argument('--version', action='store_true')
    args = parser.parse_args()
    directory = Path(os.environ.get('COINGLASS_DATA_DIR', './coinglass-data')).resolve()
    if args.version:
        print(AUTH_REVISION)
        return 0
    if args.latest:
        print(json.dumps(latest_report(directory), ensure_ascii=False, indent=2))
        return 0
    os.environ['PWDEBUG'] = '0'
    try:
        return probe(directory)
    except BrowserStartError as error:
        print(str(error), flush=True)
        print(json.dumps(latest_report(directory), ensure_ascii=False, indent=2), flush=True)
        return 1
    except Exception as error:
        print(f'[{AUTH_REVISION}] Проверка не запустилась ({type(error).__name__}). '
              'Проверьте установку Chromium и права каталога данных.')
        return 1


if __name__ == '__main__':
    sys.exit(main())
