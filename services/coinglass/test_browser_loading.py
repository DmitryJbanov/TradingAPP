import json
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock, call, patch

from collector import CollectionError, collect_symbol, save_page_diagnostics, wait_for_map
from diagnose import latest_report


class BrowserLoadingTests(unittest.TestCase):
    def test_collection_error_preserves_stage_and_type_without_payload(self):
        page, context = MagicMock(), MagicMock()
        page.goto.return_value.status = 200
        page.url = 'https://www.coinglass.com/pro/futures/LiquidationMap'
        page.goto.return_value.status = 200
        api = SimpleNamespace(expect=MagicMock())
        with tempfile.TemporaryDirectory() as tmp, \
                patch.dict('sys.modules', {'playwright.sync_api': api}), \
                patch('collector.MapNavigator', return_value=SimpleNamespace(open=lambda: None, status=200, steps=[])), \
                patch('frontend_api.fetch_liquidation_map', side_effect=TimeoutError('secret_value')), \
                patch('collector.save_page_diagnostics') as diagnostic:
            args = SimpleNamespace(progress=None, headless=True)
            with self.assertRaises(CollectionError) as caught:
                collect_symbol(args, Path(tmp), page, context, 'BTC')
            self.assertEqual(caught.exception.stage, 'frontend_request')
            self.assertEqual(caught.exception.error_type, 'TimeoutError')
            self.assertEqual(caught.exception.code, 'timeout')
            self.assertNotIn('secret_value', str(caught.exception))
            self.assertEqual(diagnostic.call_args.kwargs['http_status'], 200)

    def test_latest_includes_collection_from_same_run_only(self):
        with tempfile.TemporaryDirectory() as tmp:
            run = Path(tmp) / 'runs' / 'job'
            run.mkdir(parents=True)
            (run / 'login-state.json').write_text(json.dumps({'outcome': 'session_candidate'}))
            (run / 'page-state.json').write_text(json.dumps({'stage': 'map_heading_and_canvas'}))
            other = run.parent / 'other'
            other.mkdir()
            (other / 'page-state.json').write_text(json.dumps({'stage': 'unrelated'}))
            report = latest_report(tmp)
            self.assertEqual(report['collection_diagnostic']['stage'], 'map_heading_and_canvas')
            (run / 'page-state.json').write_text('{')
            self.assertIn('error', latest_report(tmp)['collection_diagnostic'])

    def test_map_diagnostics_redact_unknown_paths_and_original_exception(self):
        page = MagicMock()
        page.url = 'https://www.coinglass.com/account/private_identifier?token=secret_value'
        page.locator.return_value.count.return_value = 0
        page.locator.return_value.first.is_visible.return_value = False
        page.get_by_role.return_value.count.return_value = 0
        with tempfile.TemporaryDirectory() as tmp:
            save_page_diagnostics(page, Path(tmp), 'map_navigation', True,
                                  error=TimeoutError('secret_value'), http_status=200)
            text = (Path(tmp) / 'page-state.json').read_text()
            state = json.loads(text)
            self.assertEqual(state['error_code'], 'timeout')
            self.assertEqual(state['http_status'], 200)
            self.assertEqual(state['page_path'], 'other_coinglass_page')
            self.assertNotIn('secret_value', text)
            self.assertNotIn('private_identifier', text)
            page.screenshot.assert_not_called()

    def test_map_validation_failure_never_saves_candidate_session(self):
        page, context = MagicMock(), MagicMock()
        page.goto.return_value.status = 200
        page.url = 'https://www.coinglass.com/pro/futures/LiquidationMap'
        api = SimpleNamespace(expect=MagicMock())
        with tempfile.TemporaryDirectory() as tmp, \
                patch.dict('sys.modules', {'playwright.sync_api': api}), \
                patch('collector.MapNavigator', return_value=SimpleNamespace(open=lambda: None, status=200, steps=[])), \
                patch('frontend_api.fetch_liquidation_map', side_effect=TimeoutError('map unavailable')), \
                patch('collector.save_page_diagnostics'), patch('collector.save_session') as save:
            args = SimpleNamespace(session=Path(tmp) / 'session.json', progress=None)
            with self.assertRaisesRegex(RuntimeError, 'frontend_request'):
                collect_symbol(args, Path(tmp), page, context, 'BTC')
            save.assert_not_called()
            self.assertFalse(args.session.exists())

    def test_heading_scrolled_before_canvas_is_required(self):
        page = MagicMock()
        heading = page.get_by_role.return_value
        card = wait_for_map(page)
        self.assertEqual(heading.mock_calls[:4], [
            call.wait_for(state='attached', timeout=60000),
            call.scroll_into_view_if_needed(timeout=15000),
            call.locator('xpath=ancestor::*[.//canvas][1]'),
            call.locator().wait_for(state='visible', timeout=60000)])
        self.assertIs(card, heading.locator.return_value)

    def test_map_failure_before_canvas_saves_json_without_screenshot(self):
        page = MagicMock()
        page.url = 'https://www.coinglass.com/ru/pro/futures/LiquidationMap?secret=example'
        page.locator.return_value.count.return_value = 0
        page.locator.return_value.first.is_visible.return_value = False
        page.get_by_role.return_value.count.return_value = 1
        with tempfile.TemporaryDirectory() as tmp:
            save_page_diagnostics(page, Path(tmp), 'map_heading_and_canvas', True)
            text = (Path(tmp) / 'page-state.json').read_text()
            self.assertNotIn('secret', text)
            self.assertEqual(json.loads(text)['canvas_count'], 0)
            page.screenshot.assert_not_called()
            self.assertNotIn('screenshot', json.loads(text))

    def test_auth_pages_and_password_form_are_not_screenshotted(self):
        for url, password_visible in [
            ('https://www.coinglass.com/ru/login', False),
            ('https://www.coinglass.com/ru/pro/futures/LiquidationMap', True)]:
            page = MagicMock()
            page.url = url
            page.locator.return_value.count.return_value = 0
            page.locator.return_value.first.is_visible.return_value = password_visible
            page.get_by_role.return_value.count.return_value = 0
            with tempfile.TemporaryDirectory() as tmp:
                save_page_diagnostics(page, Path(tmp), 'map_navigation', True)
                page.screenshot.assert_not_called()


if __name__ == '__main__':
    unittest.main()
