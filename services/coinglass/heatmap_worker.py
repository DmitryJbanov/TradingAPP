"""Model 3 collection inside the common persistent browser runtime."""
import sys
import os
from datetime import datetime, timezone
from pathlib import Path
from auth import save_session, authenticate, LoginError
from collector import save_page_diagnostics, CollectionError
from map_navigation import MapNavigationError

# Available both in the repository and in the Docker image.
sys.path.insert(0, str(Path(__file__).resolve().parents[2] if len(Path(__file__).resolve().parents) > 2 else Path(__file__).resolve().parent))
from coinglass_heatmap.collector import collect, SubscriptionRequired, HeatmapApiError, validate_range, open_heatmap_page


def run(request, runtime, folder):
    context, page = runtime.ensure(folder)
    stage='heatmap_page'
    response=None
    try:
        response=open_heatmap_page(page, request['asset'])
        range_value=request.get('params', {}).get('range','365d')
        stage='heatmap_request'
        refreshed=False
        authenticated=False
        while True:
            try:
                data=collect(page,request['asset'],range_value=range_value,reuse_frontend=True)
                break
            except HeatmapApiError as error:
                if error.api_code=='40001' and not refreshed:
                    refreshed=True
                    stage='heatmap_reload'
                    response=open_heatmap_page(page,request['asset'],force_reload=True)
                elif error.api_code=='40000' and not authenticated:
                    credentials=Path(os.environ.get('COINGLASS_CREDENTIALS', str(runtime.data/'credentials.txt')))
                    if not credentials.is_file():raise
                    authenticated=True
                    stage='heatmap_authentication'
                    authenticate(page,credentials,headless=True,timeout=90,diagnostics_dir=folder)
                    save_session(context,runtime.data/'session.json')
                    response=open_heatmap_page(page,request['asset'])
                else:raise
                stage='heatmap_request_retry'
    except Exception as error:
        try:
            save_page_diagnostics(page,folder,stage,True,error=error,
                                  http_status=response.status if response is not None else None)
        except Exception:
            pass  # A closed page or diagnostics failure must not mask the original error.
        if isinstance(error,(HeatmapApiError,SubscriptionRequired,MapNavigationError,LoginError)):raise
        raise CollectionError(stage,error) from None
    save_session(context, runtime.data / 'session.json')
    stamp = datetime.now(timezone.utc).isoformat()
    snapshot = dict(data, schemaVersion=1, complete=True, asset=request['asset'],
                    snapshotId=request['id'], collectedAt=stamp)
    result = dict(asset=request['asset'], snapshotId=request['id'], collectedAt=stamp,
                  range=data['range'], cellCount=len(data['liquidation_levels']), levels=[])
    return result, snapshot
