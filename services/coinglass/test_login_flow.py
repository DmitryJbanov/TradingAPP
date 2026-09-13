"""Stateful page simulation: complete flow, no network or real credentials."""
import json
import os
import tempfile
import unittest
from decimal import Decimal
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock, patch
from urllib.parse import urlsplit

from browser_runtime import AUTH_REVISION, launch_browser
from diagnose import latest_report
from login_flow import (LoginFlow, LoginError, ORIGIN, EMAIL, PASSWORD, safe_path,
                        OTP_INPUT, VERIFICATION_HEADING)


class Locator:
    def __init__(self, page, kind):
        self.page, self.kind = page, kind
        self.first = self

    def and_(self, other):
        return self

    def get_by_role(self, *args, **kwargs):
        return Locator(self.page, 'cookie')

    def is_visible(self):
        p = self.page
        p.read(self.kind, 'is_visible')
        return {'email': p.mode == 'form' and p.email_present,
                'password': p.mode == 'form', 'challenge': p.mode == 'challenge',
                'frame': False, 'cookie': p.cookie_visible, 'region': False,
                'heading': p.mode in {'home', 'success'},
                'body': p.mode != 'blank',
                'otp': p.mode == 'otp', 'verification_heading': p.mode == 'verify_email',
                'link': p.mode == 'home' and p.link_present,
                'submit': p.mode == 'form'}.get(self.kind, False)

    def count(self):
        self.page.read(self.kind, 'count')
        return int(self.is_visible())

    def is_enabled(self, **kwargs):
        self.page.read(self.kind, 'is_enabled')
        return self.is_visible()

    def fill(self, value, **kwargs):
        if self.page.fill_error:
            raise RuntimeError('typed secret_value')
        self.page.filled.append(self.kind)

    def click(self, **kwargs):
        p = self.page
        if self.kind == 'link':
            p.actions.append('click_login')
            p.mode = 'error' if p.broken_link else 'form'
            p.url = ORIGIN + p.login_path
            if p.link_error:
                raise p.link_error
            if p.broken_link:
                p.respond(404)
        elif self.kind == 'submit':
            p.actions.append('submit')
            if p.accept_login:
                p.url, p.mode = p.post_submit_url, p.post_submit_mode
                if p.post_submit_status is not None:
                    p.respond(p.post_submit_status)
        elif self.kind == 'cookie':
            p.cookie_visible = p.cookie_stays
            if p.cookie_error:
                raise p.cookie_error


class Page:
    def __init__(self):
        self.url, self.mode = 'about:blank', 'blank'
        self.main_frame = object()
        self.listeners, self.actions, self.filled = {}, [], []
        self.clock = 0
        self.routes = {}
        self.email_present = self.link_present = self.accept_login = True
        self.fill_error = self.broken_link = False
        self.login_path = '/ru/login'
        self.link_error = None
        self.read_failures = {}
        self.cookie_visible = self.cookie_stays = False
        self.cookie_error = None
        self.post_submit_url = ORIGIN + '/ru'
        self.post_submit_mode = 'success'
        self.post_submit_status = 200

    def read(self, kind, method):
        failures = self.read_failures.get((self.mode, kind, method), [])
        if failures:
            raise failures.pop(0)

    def locator(self, selector):
        kind = ('email' if selector == EMAIL else 'password' if selector == PASSWORD
                else 'otp' if selector == OTP_INPUT else 'body' if selector == 'body'
                else 'frame' if 'iframe' in selector else 'link' if 'a[href' in selector
                else 'submit')
        return Locator(self, kind)

    def get_by_role(self, role, **kwargs):
        if role == 'heading' and kwargs.get('name') is VERIFICATION_HEADING:
            return Locator(self, 'verification_heading')
        return Locator(self, {'link': 'link', 'button': 'submit',
                              'heading': 'heading', 'region': 'region'}[role])

    def get_by_text(self, *args):
        return Locator(self, 'challenge')

    def on(self, event, callback):
        self.listeners[event] = callback

    def remove_listener(self, event, callback):
        del self.listeners[event]

    def respond(self, status):
        response = SimpleNamespace(status=status, url=self.url,
                                   request=SimpleNamespace(resource_type='document', frame=self.main_frame))
        if 'response' in self.listeners:
            self.listeners['response'](response)
        return response

    def goto(self, url, **kwargs):
        path = urlsplit(url).path
        self.actions.append(path)
        status, self.mode = self.routes.get(path, (200, 'home' if path in {'/', '/ru'} else 'form'))
        self.url = ORIGIN + ('/ru' if self.mode == 'success' else path)
        return self.respond(status)

    def wait_for_timeout(self, ms):
        self.clock += ms / 1000


class LoginFlowTests(unittest.TestCase):
    def execute(self, page, *, probe=False, folder=None):
        self.messages = []
        self.flow = LoginFlow(page, folder, report=self.messages.append)
        with patch('login_flow.time.monotonic', side_effect=lambda: page.clock):
            return self.flow.run(Path('unused'), probe=probe, timeout=3)

    def test_complete_ui_flow_sends_once_then_requests_map_verification(self):
        page = Page()
        with patch('auth.read_credentials', return_value=('test@example.invalid', 'secret_value')):
            self.assertEqual(self.execute(page), 'session_candidate')
        self.assertEqual(page.actions, ['/ru', 'click_login', 'submit'])
        self.assertEqual(page.filled, ['email', 'password'])
        self.assertEqual(page.listeners, {})
        self.assertTrue(any('90-дневной' in message for message in self.messages))

    def test_probe_uses_same_ui_flow_without_reading_credentials(self):
        page = Page()
        with patch('auth.read_credentials') as reader:
            self.assertEqual(self.execute(page, probe=True), 'form_ready')
        reader.assert_not_called()
        self.assertNotIn('submit', page.actions)

    def test_unlisted_spa_redirect_without_heading_reaches_map_candidate(self):
        page = Page()
        page.routes['/ru'] = (404, 'error')
        page.login_path = '/login'
        # Synthetic account route; its exact value is private, never diagnostic.
        page.post_submit_url = ORIGIN + '/account/private_identifier?token=secret_value'
        page.post_submit_mode = 'landing'
        page.post_submit_status = None
        with patch('auth.read_credentials', return_value=('test@example.invalid', 'secret_value')), \
                patch('auth.save_session') as save_session:
            self.assertEqual(self.execute(page), 'session_candidate')
        save_session.assert_not_called()
        self.assertEqual(page.actions, ['/ru', '/', 'click_login', 'submit'])
        state = self.flow.save()
        self.assertEqual(state['page_path'], 'other_coinglass_page')
        self.assertIsNone(state['http_status'])
        self.assertEqual(state['redirect_basis'], 'post_submit_route_changed_form_absent')
        self.assertNotIn('private_identifier', json.dumps(state))
        self.assertNotIn('secret_value', json.dumps(state) + str(self.messages))

    def test_login_route_with_removed_form_is_not_a_candidate(self):
        for destination in ['/ru/login', '/en/login', '/login?done=1']:
            page = Page()
            page.post_submit_url = ORIGIN + destination
            page.post_submit_mode = 'landing'
            with patch('auth.read_credentials', return_value=('test@example.invalid', 'secret_value')):
                with self.assertRaisesRegex(LoginError, 'переход к проверке карты не подтверждён'):
                    self.execute(page)
            self.assertEqual(page.actions.count('submit'), 1)

    def test_extra_verification_stops_before_map_candidate(self):
        for path, mode in [('/account/verify', 'landing'), ('/account', 'otp'),
                           ('/account', 'verify_email')]:
            page = Page()
            page.post_submit_url = ORIGIN + path
            page.post_submit_mode = mode
            with patch('auth.read_credentials', return_value=('test@example.invalid', 'secret_value')):
                with self.assertRaisesRegex(LoginError, 'дополнительное подтверждение'):
                    self.execute(page)
            self.assertTrue(self.flow.save()['additional_verification_detected'])
            self.assertEqual(page.actions.count('submit'), 1)

    def test_external_redirect_and_http_errors_never_become_candidates(self):
        for url, status in [('https://outside.example/account', 200),
                            (ORIGIN + '/account', 403), (ORIGIN + '/account', 500)]:
            page = Page()
            page.post_submit_url, page.post_submit_status = url, status
            page.post_submit_mode = 'landing'
            with patch('auth.read_credentials', return_value=('test@example.invalid', 'secret_value')):
                with self.assertRaises(LoginError):
                    self.execute(page)
            self.assertEqual(self.flow.outcome, 'error')

    def test_unlisted_page_without_submission_is_not_assumed_signed_in(self):
        page = Page()
        page.url, page.mode = ORIGIN + '/account', 'landing'
        flow = LoginFlow(page, report=lambda _: None)
        self.assertFalse(flow.redirected_after_login())

    def test_form_still_visible_on_new_route_is_not_a_candidate(self):
        page = Page()
        page.post_submit_url = ORIGIN + '/account'
        page.post_submit_mode = 'form'
        with patch('auth.read_credentials', return_value=('test@example.invalid', 'secret_value')):
            with self.assertRaisesRegex(LoginError, 'переход к проверке карты не подтверждён'):
                self.execute(page)

    def test_changing_redirect_resets_stability_timer(self):
        page = Page()
        page.post_submit_url = ORIGIN + '/account'
        page.post_submit_mode = 'landing'
        original_wait = page.wait_for_timeout
        def wait(ms):
            original_wait(ms)
            if page.mode == 'landing':
                page.url = ORIGIN + '/account/' + str(page.clock)
        page.wait_for_timeout = wait
        with patch('auth.read_credentials', return_value=('test@example.invalid', 'secret_value')):
            with self.assertRaisesRegex(LoginError, 'переход к проверке карты не подтверждён'):
                self.execute(page)

    def test_reported_route_recovers_when_login_dom_changes(self):
        page = Page()
        page.routes['/ru'] = (404, 'error')
        page.login_path = '/login'
        page.read_failures[('form', 'email', 'count')] = [
            RuntimeError('Execution context was destroyed, secret_value')]
        with patch('auth.read_credentials') as reader:
            self.assertEqual(self.execute(page, probe=True), 'form_ready')
        reader.assert_not_called()
        self.assertEqual(page.actions, ['/ru', '/', 'click_login'])
        self.assertEqual(self.flow.observation_retries, 1)
        self.assertEqual(self.flow.last_error['operation'], 'count_email')
        self.assertNotIn('secret_value', json.dumps(self.flow.save()) + str(self.messages))

    def test_enabled_check_recovers_from_detached_input_timeout(self):
        page = Page()
        page.read_failures[('form', 'email', 'is_enabled')] = [TimeoutError('secret_value')]
        self.assertEqual(self.execute(page, probe=True), 'form_ready')
        self.assertEqual(page.actions, ['/ru', 'click_login'])
        self.assertEqual(self.flow.last_error['operation'], 'email_enabled')

    def test_link_click_timeout_checks_form_without_clicking_again(self):
        page = Page()
        page.link_error = TimeoutError('Navigation timeout secret_value')
        self.assertEqual(self.execute(page, probe=True), 'form_ready')
        self.assertEqual(page.actions, ['/ru', 'click_login'])

    def test_cookie_click_timeout_is_ignored_only_when_banner_disappears(self):
        for stays in (False, True):
            page = Page()
            page.cookie_visible = True
            page.cookie_stays = stays
            page.cookie_error = TimeoutError('secret_value')
            if stays:
                with self.assertRaisesRegex(LoginError, 'timeout'):
                    self.execute(page, probe=True)
            else:
                self.assertEqual(self.execute(page, probe=True), 'form_ready')

    def test_repeated_dom_failure_stops_with_operation_and_no_credentials(self):
        page = Page()
        page.read_failures[('form', 'email', 'count')] = [
            RuntimeError('Execution context was destroyed secret_value') for _ in range(100)]
        with patch('auth.read_credentials') as reader:
            with self.assertRaisesRegex(LoginError, 'site_login_link/count_email.*navigation_changed_dom'):
                self.execute(page)
        reader.assert_not_called()
        self.assertLessEqual(page.clock, 3.25)
        self.assertEqual(page.actions, ['/ru', 'click_login'])

    def test_nontransient_errors_are_not_retried_or_hidden(self):
        for error, code in [(RuntimeError('strict mode violation secret_value'), 'ambiguous_locator'),
                            (RuntimeError('Target page, context or browser has been closed'), 'target_closed'),
                            (ValueError('bad selector secret_value'), 'unexpected_error')]:
            page = Page()
            page.read_failures[('form', 'email', 'count')] = [error]
            with self.assertRaisesRegex(LoginError, code) as raised:
                self.execute(page, probe=True)
            state = self.flow.save()
            self.assertEqual(state['operation'], 'count_email')
            self.assertEqual(state['observation_retries'], 0)
            self.assertEqual(state['email_input_count'], 1)
            self.assertNotIn('secret_value', str(raised.exception) + json.dumps(state))

    def test_post_submit_dom_recovery_does_not_resubmit(self):
        page = Page()
        page.read_failures[('success', 'body', 'is_visible')] = [
            RuntimeError('Execution context was destroyed')]
        with patch('auth.read_credentials', return_value=('test@example.invalid', 'secret_value')):
            self.assertEqual(self.execute(page), 'session_candidate')
        self.assertEqual(page.actions.count('submit'), 1)
        self.assertEqual(page.filled, ['email', 'password'])

    def test_dom_error_during_fill_is_never_replayed(self):
        page = Page()
        with patch('auth.read_credentials', return_value=('test@example.invalid', 'secret_value')), \
                patch.object(Locator, 'fill', side_effect=RuntimeError('Execution context was destroyed')) as fill:
            with self.assertRaisesRegex(LoginError, 'fill_email.*navigation_changed_dom'):
                self.execute(page)
        self.assertEqual(fill.call_count, 1)
        self.assertNotIn('submit', page.actions)

    def test_ui_navigation_succeeds_even_if_deep_urls_return_404(self):
        page = Page()
        page.routes = {'/ru/login': (404, 'error'), '/login': (404, 'error')}
        self.assertEqual(self.execute(page, probe=True), 'form_ready')
        self.assertEqual(page.actions, ['/ru', 'click_login'])

    def test_404s_are_not_session_success_and_do_not_read_password(self):
        page = Page()
        page.broken_link = True
        page.routes = {'/ru/login': (404, 'error'), '/login': (404, 'error')}
        with patch('auth.read_credentials') as reader:
            with self.assertRaisesRegex(LoginError, '404'):
                self.execute(page)
        reader.assert_not_called()
        self.assertEqual(page.listeners, {})

    def test_home_without_login_link_is_not_assumed_to_be_signed_in(self):
        page = Page()
        page.link_present = False
        self.assertEqual(self.execute(page, probe=True), 'form_ready')
        self.assertIn('/ru/login', page.actions)

    def test_login_redirect_is_candidate_not_final_authorization(self):
        page = Page()
        page.link_present = False
        page.routes['/ru/login'] = (200, 'success')
        with patch('auth.read_credentials') as reader:
            self.assertEqual(self.execute(page), 'session_candidate')
        reader.assert_not_called()

    def test_403_and_challenge_stop_without_route_retry(self):
        for status, mode, expected in [(403, 'error', '403'), (200, 'challenge', 'проверку браузера')]:
            page = Page()
            page.routes['/ru'] = status, mode
            with self.assertRaisesRegex(LoginError, expected):
                self.execute(page)
            self.assertEqual(page.actions, ['/ru'])

    def test_both_fields_are_required(self):
        page = Page()
        page.email_present = False
        with patch('auth.read_credentials') as reader:
            with self.assertRaisesRegex(LoginError, 'Форма не готова'):
                self.execute(page)
        reader.assert_not_called()

    def test_login_rejection_does_not_resubmit(self):
        page = Page()
        page.accept_login = False
        with patch('auth.read_credentials', return_value=('test@example.invalid', 'secret_value')):
            with self.assertRaisesRegex(LoginError, 'переход к проверке карты не подтверждён'):
                self.execute(page)
        self.assertEqual(page.actions.count('submit'), 1)

    def test_browser_exception_and_queries_are_redacted(self):
        page = Page()
        page.fill_error = True
        with tempfile.TemporaryDirectory() as tmp:
            with patch('auth.read_credentials', return_value=('test@example.invalid', 'secret_value')):
                with self.assertRaises(LoginError) as error:
                    self.execute(page, folder=tmp)
            saved = (Path(tmp) / 'login-state.json').read_text()
            self.assertEqual(json.loads(saved)['revision'], AUTH_REVISION)
            self.assertNotIn('secret_value', saved + str(error.exception) + str(self.messages))
            self.assertNotIn('test@example.invalid', saved)
        self.assertEqual(safe_path(ORIGIN + '/login?token=secret_value'), '/login')
        self.assertEqual(safe_path('https://other.example/secret_value'), 'external_or_blank')

    def test_latest_diagnostic_selected_by_write_time_not_random_id(self):
        with tempfile.TemporaryDirectory() as tmp:
            for name, stamp in [('zzz', 100), ('aaa', 200)]:
                path = Path(tmp) / 'runs' / name / 'login-state.json'
                path.parent.mkdir(parents=True)
                path.write_text(json.dumps({'run_id': name}))
                os.utime(path, (stamp, stamp))
            self.assertEqual(latest_report(tmp)['diagnostic']['run_id'], 'aaa')

    def test_common_browser_launch_is_full_chromium_headless(self):
        pw = MagicMock()
        launch_browser(pw)
        pw.chromium.launch.assert_called_once_with(channel='chromium', headless=True)

    def test_failed_script_is_recorded_without_url_or_response_body(self):
        page = Page()
        flow = LoginFlow(page, report=lambda message: None)
        page.url = ORIGIN + '/ru/login?token=secret_value'
        flow.on_response(SimpleNamespace(status=404, url='https://cdn.example/secret_value',
                                         request=SimpleNamespace(resource_type='script')))
        state = flow.save()
        self.assertEqual(state['failed_resources'], {'script:HTTP404': 1})
        self.assertIsNone(state['http_status'])
        self.assertNotIn('secret_value', json.dumps(state))

    def test_worker_forwards_new_login_stages_to_service_protocol(self):
        from worker import run
        page = Page()
        page.post_submit_url = ORIGIN + '/account/private_identifier'
        page.post_submit_mode = 'landing'
        page.post_submit_status = None
        page.set_default_timeout = lambda milliseconds: None
        pw = MagicMock()
        pw.chromium.launch.return_value.new_context.return_value.new_page.return_value = page
        manager = MagicMock()
        manager.__enter__.return_value = pw
        api = SimpleNamespace(sync_playwright=lambda: manager)
        settings = dict(hoverMs=180, minRelative=.5, minProminence=.35, side='both', limit=5)
        def collected(args, folder, *_):
            (folder / 'observations.json').write_text(json.dumps({'finished_utc': '2026-01-01T00:00:00Z'}))
            return Decimal('100'), []
        with tempfile.TemporaryDirectory() as tmp, \
                patch.dict('sys.modules', {'playwright.sync_api': api}), \
                patch.dict(os.environ, {'COINGLASS_DATA_DIR': tmp}), \
                patch('auth.read_credentials', return_value=('test@example.invalid', 'secret_value')), \
                patch('login_flow.time.monotonic', side_effect=lambda: page.clock), \
                patch('worker.collect_symbol', side_effect=collected), patch('worker.emit') as emit:
            run(dict(id='worker-test', params=settings, asset='BTC'))
            state = json.loads((Path(tmp) / 'runs/worker-test/login-state.json').read_text())
        logs = [call.kwargs['message'] for call in emit.call_args_list if call.args[0] == 'log']
        self.assertTrue(any(AUTH_REVISION in message for message in logs))
        self.assertTrue(any('Отправка формы' in message for message in logs))
        self.assertNotIn('secret_value', str(emit.call_args_list))
        self.assertEqual(state['credential_submission'], 'attempted')
        pw.chromium.launch.assert_called_once_with(channel='chromium', headless=True)


if __name__ == '__main__':
    unittest.main()
