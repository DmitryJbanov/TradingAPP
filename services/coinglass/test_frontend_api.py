import copy
import json
import os
import tempfile
import unittest
from decimal import Decimal
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from collector import CollectionError, collect_symbol, open_frontend_map
from frontend_api import CoinglassApiError, fetch_liquidation_map, parse_liquidation_map


def response():
    return {'code': '0', 'success': True, 'data': {
        'lastPrice': 100, 'rangeLow': 80, 'rangeHigh': 120, 'data': [{
            'instrument': {'exName': 'Binance', 'instrumentId': 'BTCUSDT',
                           'baseAsset': 'BTC', 'quoteAsset': 'USDT', 'maxLeverage': 150},
            'liqMapV2': {'90': [[90, 1.25, None, {'keep': True}], [90, 2.5, 7, 8]],
                         '95': [[95, 20, None, None]], '110': [[110, 1, None, None]]}}]}}


class FrontendTests(unittest.TestCase):
    def test_ready_map_is_reused_without_navigation(self):
        page = MagicMock()
        page.url = 'about:blank'
        page.url = 'https://www.coinglass.com/pro/futures/LiquidationMap'
        page.evaluate.return_value = True
        steps = []
        self.assertIsNone(open_frontend_map(page, steps))
        page.goto.assert_not_called()
        self.assertEqual(steps[0]['method'], 'reuse_frontend')

    def test_double_404_uses_site_router_and_records_steps(self):
        page = MagicMock()
        page.url = 'about:blank'
        page.url = 'about:blank'
        page.goto.return_value = SimpleNamespace(status=404)
        steps = []
        with patch('collector.MapNavigator') as navigator:
            navigator.return_value.steps = [dict(method='site_link', http_status=None)]
            self.assertIsNone(open_frontend_map(page, steps))
            navigator.return_value.open.assert_called_once()
            self.assertEqual(steps[-1]['method'], 'site_link')

    def test_localized_map_fallback_only_for_404(self):
        page = MagicMock()
        page.url = 'about:blank'
        page.goto.side_effect = [SimpleNamespace(status=404), SimpleNamespace(status=200)]
        self.assertEqual(open_frontend_map(page).status, 200)
        self.assertTrue(page.goto.call_args.args[0].endswith('/ru/pro/futures/LiquidationMap'))
        for status in (200, 403, 429, 500):
            page.reset_mock(side_effect=True)
            page.goto.return_value = SimpleNamespace(status=status)
            self.assertEqual(open_frontend_map(page).status, status)
            page.goto.assert_called_once()

    def test_every_record_and_instrument_is_aggregated_and_raw_preserved(self):
        raw = response()
        second = copy.deepcopy(raw['data']['data'][0])
        second['instrument'].update(exName='Other', instrumentId='BTCUSD', quoteAsset='USD')
        second['liqMapV2'] = {'90': [[90, 10, 'unused', None]]}
        raw['data']['data'].append(second)
        before = copy.deepcopy(raw)
        result = parse_liquidation_map(raw, 'BTC')
        self.assertEqual(result['levels'][0]['intensity'], Decimal('13.75'))
        self.assertEqual(result['levels'][0]['exchanges'], {'Binance': Decimal('3.75'), 'Other': Decimal(10)})
        self.assertEqual(result['instruments'][0]['liqMapV2']['90'][0][3], {'keep': True})
        self.assertEqual(result['instruments'][1]['instrument_id'], 'BTCUSD')
        self.assertEqual(result['current_price'], 100)
        self.assertEqual([p['side'] for p in result['levels']], ['long', 'long', 'short'])
        self.assertEqual(raw, before)

    def test_rejects_invalid_envelopes_and_missing_fields(self):
        bad = [None, {}, {'code': 0, 'success': True, 'data': {}},
               {**response(), 'success': 1}, {**response(), 'code': '1'}]
        for key in ('lastPrice', 'rangeLow', 'rangeHigh', 'data'):
            raw = response()
            del raw['data'][key]
            bad.append(raw)
        for raw in bad:
            with self.subTest(raw=raw), self.assertRaises(ValueError):
                parse_liquidation_map(raw, 'BTC')

    def test_bad_entries_never_silently_skipped(self):
        for entry in ([90], None, [False, 1], [90, -1], [90, 'NaN'], [90, float('inf')]):
            raw = response()
            raw['data']['data'][0]['liqMapV2']['90'].append(entry)
            with self.subTest(entry=entry), self.assertRaises(ValueError):
                parse_liquidation_map(raw, 'BTC')
        for data in ([], {}, None):
            raw = response()
            raw['data']['data'] = data
            with self.assertRaises(ValueError):
                parse_liquidation_map(raw, 'BTC')

    def test_frontend_request_parameters(self):
        page = MagicMock()
        page.url = 'about:blank'
        fetch_liquidation_map(page, 'BTC')
        self.assertEqual(page.evaluate.call_args.args[1],
                         {'merge': True, 'symbol': 'BTC', 'interval': '90d', 'limit': 1440})
        fetch_liquidation_map(page, 'BTC', 30, 720)
        self.assertEqual(page.evaluate.call_args.args[1],
                         {'merge': True, 'symbol': 'BTC', 'interval': 30, 'limit': 720})
        for days, interval in [(1, 1), (7, 5), (30, 30), (90, '90d'), (180, '180d'), (365, '365d')]:
            fetch_liquidation_map(page, 'ETH', days)
            self.assertEqual(page.evaluate.call_args.args[1]['interval'], interval)
        for days, limit in ((0, 720), (True, 720), (90, 0), (90, 1441), (90, 1.5)):
            with self.assertRaises(ValueError):
                fetch_liquidation_map(page, 'BTC', days, limit)

    def test_login_rejection_has_safe_actionable_diagnostic(self):
        with self.assertRaises(CoinglassApiError) as caught:
            parse_liquidation_map({'code': '40000', 'success': False, 'msg': 'secret_value'}, 'BTC')
        error = CollectionError('response_validation', caught.exception)
        self.assertEqual(error.code, 'coinglass_api_40000')
        self.assertIn('credentials.txt', str(error))
        self.assertNotIn('secret_value', str(error))

    def test_40001_refreshes_once_without_changing_request_or_logging_in(self):
        for second in (response(), {'code': '40001', 'success': False}):
            with tempfile.TemporaryDirectory() as folder, \
                    patch('frontend_api.fetch_liquidation_map', side_effect=[{'code': '40001'}, second]) as fetch, \
                    patch('collector.open_frontend_map', return_value=None) as navigate, \
                    patch('collector.authenticate') as login, patch('collector.save_session'), \
                    patch('collector.save_page_diagnostics'):
                args = SimpleNamespace(price=None, session=None, min_relative='0.5',
                                       min_prominence='0.35', side='both', limit=5,
                                       range_days=30, request_limit=720)
                page, context = MagicMock(), MagicMock()
                if second.get('code') == '40001':
                    with self.assertRaises(CollectionError) as caught:
                        collect_symbol(args, Path(folder), page, context, 'BTC')
                    self.assertEqual(caught.exception.code, 'coinglass_api_40001')
                    self.assertIn('Причина не указана', str(caught.exception))
                    self.assertFalse((Path(folder)/'observations.json').exists())
                else:
                    collect_symbol(args, Path(folder), page, context, 'BTC')
                    self.assertTrue((Path(folder)/'observations.json').exists())
                self.assertEqual(fetch.call_count, 2)
                fetch.assert_called_with(page, 'BTC', 30, 720)
                self.assertEqual(navigate.call_count, 2)
                self.assertTrue(navigate.call_args.kwargs['force_reload'])
                login.assert_not_called()
                context.close.assert_not_called()

    def test_login_retries_once_and_preserves_browser(self):
        rejected = {'code': '40000', 'success': False}
        for second in (response(), rejected):
            with self.subTest(success=second.get('success')), tempfile.TemporaryDirectory() as folder:
                root = Path(folder)
                credentials = root / 'credentials.txt'
                credentials.write_text('fixture')
                args = SimpleNamespace(price=None, credentials=credentials, session=root/'session.json',
                                       min_relative='0.5', min_prominence='0.35', side='both', limit=5)
                page, context = MagicMock(), MagicMock()
                page.url = 'about:blank'
                page.goto.return_value.status = 200
                with patch('frontend_api.fetch_liquidation_map', side_effect=[rejected, second]) as fetch, \
                        patch('collector.authenticate') as login, patch('collector.save_session') as save, \
                        patch('collector.save_page_diagnostics'):
                    if second is rejected:
                        with self.assertRaises(CollectionError) as caught:
                            collect_symbol(args, root, page, context, 'BTC')
                        self.assertEqual(caught.exception.code, 'coinglass_api_40000')
                        self.assertFalse((root/'observations.json').exists())
                    else:
                        collect_symbol(args, root, page, context, 'BTC')
                        self.assertTrue((root/'observations.json').exists())
                    login.assert_called_once()
                    self.assertIs(login.call_args.args[0], page)
                    self.assertEqual(fetch.call_count, 2)
                    save.assert_any_call(context, args.session)
                    context.close.assert_not_called()

    def test_no_login_for_missing_credentials_or_other_api_error(self):
        for code in ('40000', '50000'):
            with tempfile.TemporaryDirectory() as folder, \
                    patch('frontend_api.fetch_liquidation_map', return_value={'code': code}) as fetch, \
                    patch('collector.authenticate') as login, patch('collector.save_page_diagnostics'):
                page = MagicMock()
                page.url = 'about:blank'
                page.goto.return_value.status = 200
                with self.assertRaises(CollectionError):
                    collect_symbol(SimpleNamespace(price=None), Path(folder), page, MagicMock(), 'BTC')
                login.assert_not_called()
                fetch.assert_called_once()

    def test_collection_without_mouse_and_failure_without_snapshot(self):
        for valid in (True, False):
            page, context = MagicMock(), MagicMock()
            page.url = 'about:blank'
            page.goto.return_value.status = 200
            with tempfile.TemporaryDirectory() as folder, patch('collector.save_session'), \
                    patch('collector.save_page_diagnostics'), \
                    patch('frontend_api.fetch_liquidation_map', return_value=response() if valid else {}) as fetch:
                args = SimpleNamespace(price=None, session=None, min_relative='0.5',
                                       min_prominence='0.35', side='both', limit=5,
                                       range_days=30, request_limit=720)
                if valid:
                    current, peaks = collect_symbol(args, Path(folder), page, context, 'BTC')
                    self.assertEqual(current, 100)
                    self.assertEqual(peaks[0][0]['price'], 95)
                    saved = json.loads((Path(folder) / 'observations.json').read_text(encoding='utf-8'))
                    self.assertTrue(saved['complete'])
                    self.assertEqual(saved['price_source'], 'data.lastPrice')
                    self.assertEqual(saved['range_days'], 30)
                    self.assertEqual(saved['request']['limit'], 720)
                    fetch.assert_called_once_with(page, 'BTC', 30, 720)
                    self.assertEqual(json.loads((Path(folder) / 'response-raw.json').read_text()), response())
                else:
                    with self.assertRaises(CollectionError) as error:
                        collect_symbol(args, Path(folder), page, context, 'BTC')
                    self.assertEqual(error.exception.stage, 'response_validation')
                    self.assertFalse((Path(folder) / 'observations.json').exists())
                page.mouse.move.assert_not_called()
                page.screenshot.assert_not_called()


@unittest.skipUnless(os.environ.get('COINGLASS_BROWSER_TESTS') == '1', 'requires Chromium')
class FrontendBrowserTests(unittest.TestCase):
    def test_frontend_runtime_invocation_in_chromium(self):
        from playwright.sync_api import sync_playwright
        with sync_playwright() as pw:
            browser = pw.chromium.launch(channel='chromium', headless=True)
            try:
                page = browser.new_page()
                page.set_content('<html><body>Frontend fixture</body></html>')
                page.evaluate("""() => {
                  const req = id => {
                    if (id !== 89390) throw new Error('Wrong module');
                    return {bvP: async params => ({code: '0', success: true, params})};
                  };
                  req.m = {89390: true};
                  window.webpackChunk_N_E = [];
                  window.webpackChunk_N_E.push = chunk => chunk[2](req);
                }""")
                result = fetch_liquidation_map(page, 'BTC')
                self.assertEqual(result, {'code': '0', 'success': True, 'params': {
                    'merge': True, 'symbol': 'BTC', 'interval': '90d', 'limit': 1440}})
                page.evaluate("""() => {
                  const req = () => ({bvP: async () => { throw new Error('decode failed'); }});
                  req.m = {89390: true};
                  window.webpackChunk_N_E.push = chunk => chunk[2](req);
                }""")
                with self.assertRaisesRegex(Exception, 'decode failed'):
                    fetch_liquidation_map(page, 'BTC')
            finally:
                browser.close()
