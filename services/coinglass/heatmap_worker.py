"""Model 3 collection inside the common persistent browser runtime."""
import sys
from datetime import datetime, timezone
from pathlib import Path
from auth import save_session
from collector import open_frontend_map
from map_navigation import MapNavigationError

# Available both in the repository and in the Docker image.
sys.path.insert(0, str(Path(__file__).resolve().parents[2] if len(Path(__file__).resolve().parents) > 2 else Path(__file__).resolve().parent))
from coinglass_heatmap.collector import collect, SubscriptionRequired, HeatmapApiError, validate_range


def run(request, runtime, folder):
    context, page = runtime.ensure(folder)
    response = open_frontend_map(page)
    if response is not None and response.status >= 400:
        raise MapNavigationError(f'Страница CoinGlass вернула HTTP {response.status}.')
    range_value = request.get('params', {}).get('range', '365d')
    try:
        data = collect(page, request['asset'], range_value=range_value, reuse_frontend=True)
    except HeatmapApiError as error:
        if error.api_code != '40001':
            raise
        response = open_frontend_map(page, force_reload=True)
        if response is not None and response.status >= 400:
            raise MapNavigationError(f'Страница CoinGlass вернула HTTP {response.status}.')
        data = collect(page, request['asset'], range_value=range_value, reuse_frontend=True)
    save_session(context, runtime.data / 'session.json')
    stamp = datetime.now(timezone.utc).isoformat()
    snapshot = dict(data, schemaVersion=1, complete=True, asset=request['asset'],
                    snapshotId=request['id'], collectedAt=stamp)
    result = dict(asset=request['asset'], snapshotId=request['id'], collectedAt=stamp,
                  range=data['range'], cellCount=len(data['liquidation_levels']), levels=[])
    return result, snapshot
