"""Identical browser engine for service, CLI collector and read-only probe."""
import json
import os
import re
import tempfile
from datetime import datetime, timezone
from pathlib import Path

AUTH_REVISION = 'coinglass-auth-v3.5'


class BrowserStartError(RuntimeError):
    """Safe startup failure, separate from login/map/OCR errors."""
    pass


def startup_state(folder, stage, error=None):
    # Classify known stderr markers without persisting raw browser output,
    # command lines, environment variables or storage_state contents.
    text = str(error).lower() if error is not None else ''
    patterns = {
        'read_only_filesystem': r'read.only file system|erofs',
        'permission_denied': r'permission denied|eacces',
        'crashpad': r'crashpad|--database is required',
        'missing_browser': r"executable doesn't exist|executable does not exist",
        'missing_library': r'error while loading shared libraries|missing dependencies',
        'resource_limit': r'cannot allocate memory|resource temporarily unavailable|no space left on device',
        'sigtrap': r'\bsigtrap\b',
        'sigsegv': r'\bsigsegv\b',
        'sigkill': r'\bsigkill\b',
    }
    signals = [name for name, pattern in patterns.items() if re.search(pattern, text)]
    state = dict(revision=AUTH_REVISION, saved_at=datetime.now(timezone.utc).isoformat(),
                 run_id=Path(folder).name if folder is not None else None,
                 stage=stage, outcome='error' if error is not None else 'starting',
                 credential_submission='not_sent', browser_channel='chromium', headless=True,
                 http_status=None, signals=signals)
    if error is not None:
        state['error_type'] = type(error).__name__
    if folder is not None:
        try:
            folder = Path(folder)
            folder.mkdir(parents=True, exist_ok=True)
            for name in ('browser-start.json', 'login-state.json'):
                path = folder / name
                temporary = path.with_suffix('.tmp')
                temporary.write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding='utf-8')
                temporary.replace(path)
        except OSError:
            pass
    return state


def startup_error(folder, stage, error):
    state = startup_state(folder, stage, error)
    evidence = ', '.join(state['signals']) or 'признаки причины не распознаны'
    return BrowserStartError(f'[{AUTH_REVISION}] Chromium: сбой этапа {stage} '
                             f'({type(error).__name__}; {evidence}). '
                             'Вход не начинался. Диагностика: diagnose.py --latest.')


def prepare_browser_dirs():
    # Explicit XDG paths are configured in the Docker image's writable /tmp.
    # Check actual writes, not just mode bits (the filesystem can be read-only).
    for variable in ('XDG_CONFIG_HOME', 'XDG_CACHE_HOME'):
        value = os.environ.get(variable)
        if value:
            folder = Path(value)
            folder.mkdir(parents=True, exist_ok=True, mode=0o700)
            with tempfile.TemporaryFile(dir=folder):
                pass


def launch_browser(playwright, diagnostics_dir=None):
    # Use full Chromium in its new headless mode, as the original CLI collector
    # did. The default launch without channel uses a different headless shell.
    stage = 'browser_directories'
    startup_state(diagnostics_dir, stage)
    try:
        prepare_browser_dirs()
        stage = 'browser_launch'
        startup_state(diagnostics_dir, stage)
        return playwright.chromium.launch(channel='chromium', headless=True)
    except Exception as error:
        raise startup_error(diagnostics_dir, stage, error) from None


def create_page(browser, options, diagnostics_dir=None):
    stage = 'context_create'
    try:
        context = browser.new_context(**options)
        stage = 'page_create'
        page = context.new_page()
        return context, page
    except Exception as error:
        raise startup_error(diagnostics_dir, stage, error) from None


def context_options():
    return dict(viewport={'width': 1440, 'height': 1100},
                device_scale_factor=1, locale='ru-RU')
