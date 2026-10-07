import tempfile
import unittest
from unittest.mock import patch
from whales import address, positions, fills, merge_fills, WhaleTracker

USER = '0x6859da14835424957a1e6b397d8026b1d9ff7e1e'


class WhaleTests(unittest.TestCase):
    def test_address_validation_and_case(self):
        self.assertEqual(address('  ' + USER.upper().replace('0X', '0x') + ' '), USER)
        for value in ('0x', USER + '/', '', None):
            with self.assertRaises(ValueError): address(value)

    def test_short_position_valuation_and_missing_liquidation(self):
        state = {'assetPositions': [{'position': {'coin': 'BTC', 'szi': '-2', 'positionValue': '200', 'liquidationPx': None, 'unrealizedPnl': '-5', 'leverage': {'value': 3, 'type': 'cross'}}}]}
        p = positions(state, USER)[0]
        self.assertEqual((p['side'], p['size'], p['markPrice']), ('Short', 2, 100))
        self.assertIsNone(p['liquidationPrice'])
        self.assertEqual(p['pnl'], -5)

    def test_fill_deduplication_and_spot_exclusion(self):
        raw = [{'tid': 9007199254740993, 'coin': 'BTC', 'dir': 'Open Long', 'side': 'B', 'px': '10', 'sz': '2', 'time': 1000},
               {'tid': 2, 'coin': '@1', 'dir': 'Buy', 'side': 'B', 'px': '5', 'sz': '1', 'time': 1001}]
        rows = fills(raw, USER)
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]['id'], '9007199254740993')
        self.assertEqual(rows[0]['value'], 20)
        self.assertEqual(len(merge_fills(rows, rows)), 1)

    def test_watchlist_persists_and_remove_stops_tracking(self):
        with tempfile.TemporaryDirectory() as folder:
            tracker = WhaleTracker(folder, start=False)
            with patch.object(tracker, 'request_profile'):
                tracker.change({'address': USER, 'action': 'add', 'label': 'Кит'})
                tracker.change({'address': USER, 'action': 'add'})
                self.assertEqual(len(tracker.watched), 1)
                other = WhaleTracker(folder, start=False)
                self.assertEqual(other.watched[0]['label'], 'Кит')
                tracker.change({'address': USER, 'action': 'remove'})
                self.assertEqual(tracker.watched, [])
                other.close()
            tracker.close()


if __name__ == '__main__': unittest.main()
