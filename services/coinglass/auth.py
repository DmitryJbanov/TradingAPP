"""Credential/session storage and the common entry point for CoinGlass login."""
import json
import os
import tempfile
from pathlib import Path
from urllib.parse import urlsplit

from login_flow import LoginError, LoginFlow


def read_credentials(path):
    try:
        lines = Path(path).read_text(encoding='utf-8-sig').splitlines()
    except OSError:
        raise LoginError('Не удалось прочитать credentials.txt. Проверьте путь и права файла.') from None
    values = {}
    for line in lines:
        if not line.strip() or line.lstrip().startswith('#'):
            continue
        if '=' not in line:
            raise LoginError('Формат credentials.txt: email=... и password=...')
        key, value = line.split('=', 1)
        key = key.strip().lower()
        if key not in {'email', 'password'} or key in values:
            raise LoginError('В credentials.txt нужны только уникальные поля email и password')
        values[key] = value.strip() if key == 'email' else value
    if not values.get('email') or not values.get('password'):
        raise LoginError('Заполните email= и password= в credentials.txt без кавычек.')
    return values['email'], values['password']


def is_site_url(url):
    parts = urlsplit(url)
    return parts.scheme == 'https' and parts.netloc == 'www.coinglass.com'


def save_session(context, path):
    """Write cookies/localStorage atomically, with restrictive POSIX permissions."""
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    state = context.storage_state()
    fd, temporary = tempfile.mkstemp(prefix='.session-', dir=path.parent)
    try:
        with os.fdopen(fd, 'w', encoding='utf-8') as stream:
            json.dump(state, stream, ensure_ascii=False)
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def authenticate(page, credentials_path, *, headless=True, timeout=180,
                 diagnostics_dir=None, report=None):
    # Kept compatible with CLI callers. Browser creation is always headless.
    flow = LoginFlow(page, diagnostics_dir, report=report)
    flow.authenticate(credentials_path, timeout=timeout)
