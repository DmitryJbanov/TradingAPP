import json
import tempfile
import unittest
from decimal import Decimal
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from collector import CollectionError, collect_symbol, parse_tooltip, wait_for_tooltips
from test_collector import current_price_tooltip


class HtmlCollectionTests(unittest.TestCase):
    def test_user_tooltip_values(self):
        point = parse_tooltip({'title': '67576', 'items': [
            {'name': 'Cumulative Long Liquidation Leverage', 'value': '9.12B'},
            {'name': 'Binance', 'value': '66.54M'},
            {'name': 'OKX', 'value': '41.89M'},
            {'name': 'Bybit', 'value': '89.87M'},
        ]})
        self.assertEqual(point['price'], Decimal('67576'))
        self.assertEqual(point['intensity'], Decimal('198300000'))
        self.assertEqual(point['side'], 'long')

    def test_wait_requires_changed_stable_html(self):
        page = MagicMock()
        with patch('collector.tooltip_signature', side_effect=[None, 'old', 'new', 'new', None,
                                                               'new', 'new', 'new', 'new']) as read:
            wait_for_tooltips(page, MagicMock(), 'old')
        self.assertEqual(read.call_count, 9)

    def test_wait_rejects_stale_html(self):
        with patch('collector.tooltip_signature', return_value='old'), \
                patch('collector.time.monotonic', side_effect=[0, 0, 61]):
            with self.assertRaises(TimeoutError):
                wait_for_tooltips(MagicMock(), MagicMock(), 'old')

