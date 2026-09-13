import csv
import json
import tempfile
import unittest
from decimal import Decimal as D
from pathlib import Path
from unittest.mock import MagicMock, patch
from urllib.error import HTTPError

from markets import parse_ranking, manual_symbols, run_batch, fetch_top20
from collector import HEADERS, UnsupportedSymbol, select_symbol


class MarketsTests(unittest.TestCase):
    def ranking(self):
        return [dict(id=f'coin-{i}', name=f'Coin {i}', symbol=f'c{i}',
                     market_cap_rank=i, market_cap=1000-i) for i in range(1, 21)]

    def test_ranking_is_exact_twenty_and_preserves_stablecoins(self):
        payload = self.ranking()
        payload[2].update(symbol='usdt', name='Tether')
        result = parse_ranking(list(reversed(payload)))
        self.assertEqual(len(result), 20)
        self.assertEqual(result[2]['symbol'], 'USDT')
        self.assertEqual(result[-1]['market_cap_rank'], 20)

    def test_invalid_or_incomplete_ranking_rejected(self):
        for change in ('short', 'duplicate', 'zero', 'unordered'):
            data = self.ranking()
            if change == 'short': data.pop()
            if change == 'duplicate': data[-1]['market_cap_rank'] = 1
            if change == 'zero': data[0]['market_cap'] = 0
            if change == 'unordered': data[-1]['market_cap'] = 2000
            with self.assertRaises(ValueError): parse_ranking(data)

    def test_manual_symbols_validate_paths(self):
        self.assertEqual(manual_symbols(['btc', 'ETH'])[0]['symbol'], 'BTC')
        for symbols in (['../BTC'], ['BTC', 'btc'], ['BTC/USDT']):
            with self.assertRaises(ValueError): manual_symbols(symbols)

    def test_batch_keeps_successes_and_continues_after_failure(self):
        calls = []
        def collect(coin, folder):
            calls.append(coin['symbol'])
            if coin['symbol'] == 'USDT': raise UnsupportedSymbol('No exact option')
            if coin['symbol'] == 'SOL': raise TimeoutError('Chart did not load')
            price = D('80000') if coin['symbol'] == 'BTC' else D('0.25')
            return price, [({'price': price * D('1.1')}, D(10))]
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            code = run_batch(manual_symbols(['BTC','USDT','SOL','ADA']), root, collect, HEADERS, UnsupportedSymbol)
            self.assertEqual(code, 2)
            self.assertEqual(calls, ['BTC','USDT','SOL','ADA'])
            with (root/'liquidation_90d.csv').open(encoding='utf-8-sig') as f:
                rows = list(csv.reader(f, delimiter=';'))
            self.assertEqual(rows[0], HEADERS)
            self.assertEqual(rows[1][0], 'BTC')
            self.assertEqual(rows[2], ['ADA', '0.25', '0.275', '10.000000'])
            report = json.loads((root/'status.json').read_text())
            self.assertEqual(report['successful'], 2)
            self.assertFalse(report['complete'])
            self.assertEqual(report['symbols'][1]['status'], 'unsupported')

    def test_duplicate_ticker_is_not_mapped_to_wrong_asset(self):
        coins = self.ranking()
        coins[0]['symbol'] = coins[1]['symbol'] = 'SAME'
        collect = MagicMock()
        with tempfile.TemporaryDirectory() as tmp:
            code = run_batch(coins[:2], Path(tmp), collect, HEADERS, UnsupportedSymbol)
            self.assertEqual(code, 1)
            collect.assert_not_called()
            self.assertFalse((Path(tmp)/'liquidation_90d.csv').exists())

    def test_api_auth_error_is_sanitized_and_actionable(self):
        with patch('markets.urlopen', side_effect=HTTPError('secret-url', 401, 'secret', {}, None)):
            with self.assertRaisesRegex(RuntimeError, 'COINGECKO_API_KEY') as cm:
                fetch_top20()
        self.assertNotIn('secret', str(cm.exception))

    def test_api_recovers_from_rate_limit(self):
        response = MagicMock()
        response.__enter__.return_value.read.return_value = json.dumps(self.ranking())
        with patch('markets.urlopen', side_effect=[HTTPError('x',429,'rate',{},None), response]), patch('markets.time.sleep'):
            self.assertEqual(len(fetch_top20()), 20)

    def test_missing_exact_symbol_never_uses_editable_input_as_proof(self):
        page, card = MagicMock(), MagicMock()
        card.get_by_role.return_value.input_value.return_value = 'BTC'
        page.get_by_role.return_value.wait_for.side_effect = TimeoutError()
        with patch.dict('sys.modules', {'playwright': MagicMock(), 'playwright.sync_api': MagicMock()}):
            with self.assertRaises(UnsupportedSymbol): select_symbol(page, card, 'ETH')
        page.get_by_role.assert_called_once_with('option', name='ETH', exact=True)
        page.get_by_role.return_value.click.assert_not_called()


if __name__ == '__main__':
    unittest.main()
