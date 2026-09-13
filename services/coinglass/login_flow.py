"""Bounded UI login with per-run diagnostics and no logging of browser payloads."""
import json
import re
import time
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlsplit

from browser_runtime import AUTH_REVISION

ORIGIN = 'https://www.coinglass.com'
PASSWORD = 'input[name="password"]:visible, input[type="password"]:visible'
EMAIL = 'input[name="email"]:visible, input[type="email"]:visible'
LOGIN_NAME = re.compile(r'^(?:Войти|Login|Log in|Sign in)$', re.I)
LOGIN_LINK = 'a[href="/ru/login"], a[href="/login"]'
OTP_INPUT = 'input[autocomplete="one-time-code"]:visible, input[name="otp"]:visible, input[name="totp"]:visible'
VERIFICATION_HEADING = re.compile(
    r'^(?:Two[- ]factor authentication|Enter (?:the )?verification code|'
    r'Email verification|Verify your email|Двухфакторная аутентификация|'
    r'Введите код подтверждения|Подтверждение электронной почты)\b', re.I)
CHALLENGE = re.compile(r'verify (?:that )?you are human|checking your browser|'
                       r'just a moment|подтвердите,? что вы человек', re.I)
SAFE_PATHS = {'/', '/ru', '/login', '/ru/login', '/pro/futures/LiquidationMap',
              '/ru/pro/futures/LiquidationMap'}


class LoginError(RuntimeError):
    pass


def error_code(error):
    """Classify locally; never return browser messages (they can contain secrets)."""
    message = str(error).lower()
    if type(error).__name__ == 'TargetClosedError' or 'target page, context or browser has been closed' in message:
        return 'target_closed'
    if 'strict mode violation' in message:
        return 'ambiguous_locator'
    if any(marker in message for marker in (
            'execution context was destroyed', 'cannot find context with specified id',
            'cannot find object with id', 'frame was detached',
            'element is not attached to the dom', 'element was detached')):
        return 'navigation_changed_dom'
    if type(error).__name__ == 'TimeoutError':
        return 'timeout'
    return 'unexpected_error'


def safe_path(url):
    """No queries, fragments, account identifiers or unexpected redirect addresses."""
    parts = urlsplit(url)
    if parts.scheme != 'https' or parts.netloc != 'www.coinglass.com':
        return 'external_or_blank'
    return parts.path if parts.path in SAFE_PATHS else 'other_coinglass_page'


def page_kind(url):
    """Routing category only; never expose private path components."""
    path = safe_path(url)
    if path == 'external_or_blank':
        return 'external_or_blank'
    segments = set(urlsplit(url).path.strip('/').lower().split('/'))
    if segments & {'login', 'signin', 'sign-in', 'register', 'signup', 'reset-password', 'forgot-password'}:
        return 'auth_form'
    if segments & {'2fa', 'mfa', 'verify-email', 'verifyemail', 'verification', 'verify', 'two-factor'}:
        return 'verification'
    return 'coinglass_page'


class LoginFlow:
    def __init__(self, page, folder=None, report=None):
        self.page = page
        self.folder = Path(folder) if folder is not None else None
        self.report = report or (lambda message: print(message, flush=True))
        self.stage = 'starting'
        self.status = None
        self.outcome = 'running'
        self.submission = 'not_sent'
        self.steps = []
        self.failed_resources = Counter()
        self.challenge = False
        self.operation = 'starting'
        self.last_error = None
        self.observation_retries = 0
        self.submitted_path = None  # Compared in memory only; never written to diagnostics.
        self.redirect_basis = None
        self.additional_verification = False
        self._response_callback = self.on_response
        self._failure_callback = self.on_failure

    def on_response(self, response):
        # Record only resource types/statuses, never headers, bodies or URLs.
        request = response.request
        if request.resource_type == 'document' and request.frame == self.page.main_frame:
            self.status = response.status
            self.steps.append({'stage': self.stage, 'path': safe_path(response.url),
                               'http_status': response.status})
            self.steps = self.steps[-20:]
        if response.status >= 400:
            kind = request.resource_type
            if kind in {'document', 'script', 'stylesheet', 'fetch', 'xhr'}:
                self.failed_resources[f'{kind}:HTTP{response.status}'] += 1

    def on_failure(self, request):
        if request.resource_type in {'document', 'script', 'stylesheet', 'fetch', 'xhr'}:
            self.failed_resources[request.resource_type + ':network'] += 1

    def checkpoint(self, message):
        self.report(f'[{AUTH_REVISION}] {message}')
        self.save()

    def record_error(self, error):
        self.last_error = dict(stage=self.stage, operation=self.operation,
                               error_type=type(error).__name__, code=error_code(error))

    def observe(self, operation, action, *, retry_timeout=False):
        """Retry DOM reads only, bounded to 3 seconds; never replay a submission."""
        self.operation = operation
        deadline = time.monotonic() + 3
        while True:
            try:
                return action()
            except Exception as error:
                self.record_error(error)
                code = self.last_error['code']
                retryable = (code == 'navigation_changed_dom'
                             or (retry_timeout and code == 'timeout'))
                if not retryable or time.monotonic() >= deadline:
                    raise
                self.observation_retries += 1
                # No DOM snapshot here: the execution context is still changing.
                if self.observation_retries == 1:
                    self.report(f'[{AUTH_REVISION}] {operation}: {code}; повторная проверка DOM.')
                self.page.wait_for_timeout(250)

    def save(self):
        state = dict(revision=AUTH_REVISION, saved_at=datetime.now(timezone.utc).isoformat(),
                     run_id=self.folder.name if self.folder else None, stage=self.stage,
                     outcome=self.outcome, credential_submission=self.submission,
                     browser_channel='chromium', headless=True, http_status=self.status,
                     challenge_detected=self.challenge, navigation=list(self.steps),
                     failed_resources=dict(self.failed_resources), operation=self.operation,
                     last_error=self.last_error, observation_retries=self.observation_retries,
                     redirect_basis=self.redirect_basis,
                     additional_verification_detected=self.additional_verification)
        try:
            state['page_path'] = safe_path(self.page.url)
            state['page_kind'] = page_kind(self.page.url)
            state['email_input_count'] = self.page.locator(EMAIL).count()
            state['password_input_count'] = self.page.locator(PASSWORD).count()
            state['email_input_visible'] = state['email_input_count'] > 0
            state['password_input_visible'] = state['password_input_count'] > 0
        except Exception:
            state['dom_unavailable'] = True
        if self.folder is not None:
            try:
                self.folder.mkdir(parents=True, exist_ok=True)
                path = self.folder / 'login-state.json'
                temporary = path.with_suffix('.tmp')
                temporary.write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding='utf-8')
                temporary.replace(path)
            except OSError:
                pass  # Do not replace the original browser failure with an I/O error.
        return state

    def check_page(self):
        self.operation = 'check_origin'
        if safe_path(self.page.url) == 'external_or_blank':
            raise LoginError('Страница находится вне www.coinglass.com; вход остановлен.')
        # Visible challenge only; hidden Turnstile fields aren't proof of blocking.
        text = self.page.get_by_text(CHALLENGE).first
        frame = self.page.locator('iframe[src*="challenges.cloudflare.com"]:visible').first
        if self.observe('check_challenge', lambda: text.is_visible() or frame.is_visible()):
            self.challenge = True
            raise LoginError('CoinGlass требует проверку браузера; фоновый вход остановлен.')
        self.operation = 'check_http'
        if self.status in (401, 403, 429):
            raise LoginError(f'CoinGlass вернул HTTP {self.status}; вход остановлен.')

    def dismiss_cookies(self):
        region = self.page.get_by_role('region', name='Cookie Consent Prompt')
        decline = region.get_by_role('button', name='Decline', exact=True).first
        if self.observe('check_cookie_prompt', decline.is_visible):
            self.operation = 'dismiss_cookies'
            try:
                decline.click(timeout=3000)
            except Exception as error:
                self.record_error(error)
                if error_code(error) not in {'navigation_changed_dom', 'timeout'}:
                    raise
                # Consent widgets may unmount during routing. Only ignore the
                # failed click if its target has actually disappeared.
                if self.observe('check_cookie_after_click', decline.is_visible):
                    self.operation = 'dismiss_cookies'
                    raise

    def form_ready(self):
        email, password = self.page.locator(EMAIL), self.page.locator(PASSWORD)
        return (self.observe('count_email', email.count) == 1
                and self.observe('count_password', password.count) == 1
                and self.observe('email_enabled', lambda: email.is_enabled(timeout=500), retry_timeout=True)
                and self.observe('password_enabled', lambda: password.is_enabled(timeout=500), retry_timeout=True))

    def check_additional_verification(self):
        self.operation = 'check_additional_verification'
        if (page_kind(self.page.url) == 'verification'
                or self.observe('check_verification_input', lambda: self.page.locator(OTP_INPUT).count() > 0)
                or self.observe('check_verification_heading', lambda: self.page.get_by_role(
                    'heading', name=VERIFICATION_HEADING).first.is_visible())):
            self.additional_verification = True
            raise LoginError('CoinGlass запросил дополнительное подтверждение входа (код/2FA/email). '
                             'Фоновый вход остановлен; пароль повторно не отправлялся.')

    def redirected_after_login(self):
        # A candidate permits only the collector's existing 90-day map check.
        # The diagnostic allowlist in safe_path must NOT define valid redirects.
        self.operation = 'verify_login_redirect'
        self.redirect_basis = None
        path = safe_path(self.page.url)
        if page_kind(self.page.url) != 'coinglass_page':
            return False
        if self.status is not None and self.status >= 400:
            return False
        fields_absent = self.observe('verify_login_fields_absent', lambda: (
            self.page.locator(EMAIL).count() == 0 and self.page.locator(PASSWORD).count() == 0))
        if not fields_absent:
            return False
        if self.submission == 'attempted':
            if urlsplit(self.page.url).path == self.submitted_path:
                return False
            # A translated heading or an account redirect is not proof of
            # failure. Require a rendered page; access is tested by the map.
            if self.observe('verify_redirect_document', lambda: self.page.locator('body').is_visible()):
                self.redirect_basis = 'post_submit_route_changed_form_absent'
                return True
            return False
        # Keep the conservative rule for a saved session (no submission).
        if path not in {'/', '/ru', '/ru/pro/futures/LiquidationMap', '/pro/futures/LiquidationMap'}:
            return False
        heading = self.page.get_by_role('heading', name=re.compile(
            r'^(?:Анализ данных мировых активов|Global Asset Data Analytics|'
            r'Карта Ликвидаций Биржи |Exchange Liquidation Map)'))
        ready = self.observe('verify_login_redirect', lambda: (
            heading.first.is_visible()
            and self.page.locator('a[href="/ru/login"]:visible, a[href="/login"]:visible').count() == 0))
        if ready:
            self.redirect_basis = 'saved_session_page_candidate'
        return ready

    def navigate(self, path):
        self.status = None
        self.operation = 'navigate'
        response = self.page.goto(ORIGIN + path, wait_until='domcontentloaded', timeout=60000)
        if response is not None:
            self.status = response.status
        self.check_page()
        self.checkpoint(f'{self.stage}: {path}, HTTP {self.status or "неизвестен"}')

    def wait_form(self, seconds, allow_redirect=False):
        deadline = time.monotonic() + seconds
        while time.monotonic() < deadline:
            self.check_page()
            self.dismiss_cookies()
            if self.form_ready():
                return 'form_ready'
            if allow_redirect and self.redirected_after_login():
                return 'session_candidate'
            if self.status is not None and self.status >= 400:
                return None
            self.page.wait_for_timeout(250)
        return None

    def open_form(self):
        self.stage = 'bootstrap'
        self.navigate('/ru')
        if self.status == 404:
            self.navigate('/')
        if self.status is not None and self.status >= 400:
            raise LoginError(f'Главная CoinGlass недоступна: HTTP {self.status}.')
        self.stage = 'site_login_link'
        # The site's own router handles the transition, when available.
        link = self.page.get_by_role('link', name=LOGIN_NAME).and_(
            self.page.locator(LOGIN_LINK)).first
        deadline = time.monotonic() + 5
        while time.monotonic() < deadline:
            self.check_page()
            self.dismiss_cookies()
            if self.form_ready():
                return 'form_ready'
            if self.observe('find_login_link', link.is_visible):
                self.status = None  # SPA navigation may have no document response.
                self.operation = 'open_login_link'
                try:
                    link.click(timeout=10000)
                except Exception as error:
                    self.record_error(error)
                    if error_code(error) not in {'navigation_changed_dom', 'timeout'}:
                        raise
                    self.checkpoint('Ссылка входа не завершила переход; проверяю форму.')
                result = self.wait_form(20, allow_redirect=False)
                if result:
                    return result
                break
            self.page.wait_for_timeout(250)
        # Compatibility fallback, only for absent/broken UI route or HTTP 404.
        # Never retry a password submission or continue after a challenge/403/429.
        self.stage = 'direct_login'
        self.navigate('/ru/login')
        if self.status == 404:
            self.navigate('/login')
        result = self.wait_form(60, allow_redirect=True)
        if result:
            return result
        raise LoginError(f'Форма не готова; HTTP {self.status or "неизвестен"}. '
                         'Учётные данные не отправлялись; смотрите login-state.json.')

    def run(self, credentials_path=None, *, timeout=180, probe=False):
        self.page.on('response', self._response_callback)
        self.page.on('requestfailed', self._failure_callback)
        self.checkpoint('Запуск: полный Chromium, режим без окон')
        try:
            result = self.open_form()
            self.outcome = result
            self.checkpoint('Форма готова' if result == 'form_ready' else
                            'Перенаправление после входа; требуется проверка 90-дневной карты')
            if probe or result == 'session_candidate':
                return result
            self.stage = 'submit'
            self.outcome = 'running'
            self.check_page()
            from auth import read_credentials
            self.operation = 'read_credentials'
            email, password = read_credentials(credentials_path)
            try:
                self.operation = 'fill_email'
                self.page.locator(EMAIL).fill(email, timeout=10000)
                self.check_page()
                self.operation = 'fill_password'
                self.page.locator(PASSWORD).fill(password, timeout=10000)
                self.check_page()
                submit = self.page.get_by_role('button', name=LOGIN_NAME).and_(
                    self.page.locator('button:not(header button):not(a button):visible'))
                self.submission = 'attempted'
                self.submitted_path = urlsplit(self.page.url).path
                self.operation = 'submit_login'
                self.checkpoint('Отправка формы входа — одна попытка')
                submit.click(timeout=15000)
            finally:
                del email, password
            self.stage = 'await_login'
            deadline = time.monotonic() + timeout
            stable = None
            stable_path = None
            while time.monotonic() < deadline:
                self.check_page()
                self.check_additional_verification()
                if self.redirected_after_login():
                    current_path = urlsplit(self.page.url).path
                    if stable is None or stable_path != current_path:
                        stable = time.monotonic()
                        stable_path = current_path
                    if time.monotonic() - stable >= 2:
                        self.outcome = 'session_candidate'
                        self.checkpoint('Форма закрыта; дальше проверяется доступ к 90-дневной карте')
                        return self.outcome
                else:
                    stable = None
                    stable_path = None
                self.page.wait_for_timeout(250)
            raise LoginError('Форма отправлена, но переход к проверке карты не подтверждён. '
                             'Причина не определена; смотрите login-state.json. '
                             'Пароль повторно не отправлялся.')
        except LoginError:
            self.outcome = 'error'
            raise
        except Exception as error:
            self.outcome = 'error'
            self.record_error(error)
            # Browser exceptions may contain typed credentials, never forward them.
            raise LoginError(f'Сбой {self.stage}/{self.operation}: '
                             f'{self.last_error["error_type"]} ({self.last_error["code"]}). '
                             'Смотрите login-state.json; содержимое полей скрыто.') from None
        finally:
            self.save()
            self.page.remove_listener('response', self._response_callback)
            self.page.remove_listener('requestfailed', self._failure_callback)

    def authenticate(self, credentials_path, *, timeout=180):
        return self.run(credentials_path, timeout=timeout)
