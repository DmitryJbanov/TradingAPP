"""Isolated Model 3 collector; shares the existing service job protocol."""
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from playwright.sync_api import sync_playwright
from browser_runtime import launch_browser, context_options, create_page

# Available both in the repository and in the Docker image.
sys.path.insert(0, str(Path(__file__).resolve().parents[2] if len(Path(__file__).resolve().parents) > 2 else Path(__file__).resolve().parent))
from coinglass_heatmap.collector import collect


def run(request):
    folder = Path(os.environ.get('COINGLASS_DATA_DIR', './coinglass-data')) / 'runs' / request['id']
    with sync_playwright() as pw:
        browser = launch_browser(pw, folder)
        try:
            options = context_options()
            session = Path(os.environ.get('COINGLASS_SESSION_FILE', '/secrets/session.json'))
            if session.is_file():
                options['storage_state'] = str(session)
            _, page = create_page(browser, options, folder)
            data = collect(page, request['asset'])
            stamp = datetime.now(timezone.utc).isoformat()
            snapshot = dict(data, schemaVersion=1, complete=True, asset=request['asset'],
                            snapshotId=request['id'], collectedAt=stamp)
            result = dict(asset=request['asset'], snapshotId=request['id'], collectedAt=stamp,
                          range='365d', cellCount=len(data['liquidation_levels']), levels=[])
            print(json.dumps(dict(kind='result', result=result, snapshot=snapshot)), flush=True)
        finally:
            browser.close()


if __name__ == '__main__':
    try:
        run(json.loads(sys.stdin.readline()))
    except Exception:
        print(json.dumps(dict(kind='error', message='Model 3 недоступна: проверьте сессию CoinGlass и доступ к карте. Возможно, изменился модуль страницы. Можно импортировать JSON из coinglass_heatmap.')), flush=True)
        sys.exit(1)
