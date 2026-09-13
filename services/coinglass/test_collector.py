import unittest
import csv
import json
import tempfile
from pathlib import Path
from decimal import Decimal as D
from collector import number, parse_tooltip, select_level, validate_coverage
from collector import significant_peaks, select_significant_levels, write_csv, HEADERS


def current_price_tooltip(price='79656'):
    # Exact visible series from the user's failing screenshot, 2026-09-05.
    return {'title': price, 'items': [
        {'name': 'Кумулятивное плечо по ликвидации шортовых позиций', 'value': '0'},
        {'name': 'Кумулятивное плечо по ликвидации лонговых позиций', 'value': '0'}]}


class CalculationTests(unittest.TestCase):
    def test_significant_peaks_reject_nearby_noise_and_shoulder(self):
        # Synthetic terrain: the 170 shoulder is tall but rises only 50 above
        # its separating valley. The 180 peak is separated by deep valleys.
        heights = [0, 200, 10, 300, 120, 285, 120, 170, 10, 180, 10, 20, 215, 30, 220, 20, 0]
        points = [{'price': D(100+i), 'intensity': D(h)} for i, h in enumerate(heights)]
        expected = [D(112), D(109), D(114), D(105), D(103)]
        result = select_significant_levels(points, D('110.5'))
        self.assertEqual([p['price'] for p, _ in result], expected)
        self.assertNotIn(D(107), [p['price'] for p in significant_peaks(points)])
        # An inserted chart marker must not create an artificial deep valley.
        points.append({'price': D('106.5'), 'intensity': D(0), 'kind': 'current_price_marker'})
        self.assertEqual([p['price'] for p, _ in select_significant_levels(points, D('110.5'))], expected)

    def test_peak_plateau_and_side_limit(self):
        points = [{'price': D(i), 'intensity': D(h)} for i, h in enumerate([0, 100, 100, 0, 90, 0], 1)]
        self.assertEqual([p['price'] for p in significant_peaks(points)], [D(2), D(5)])
        self.assertEqual(select_significant_levels(points, D(3), side='above', limit=1)[0][0]['price'], D(5))
        self.assertEqual(select_significant_levels(points, D(3), side='below', limit=1)[0][0]['price'], D(2))

    def test_no_peaks_does_not_fall_back_to_nearest_bar(self):
        points = [{'price': D(i), 'intensity': D(i)} for i in range(1, 6)]
        with self.assertRaisesRegex(ValueError, 'Значимых пиков'):
            select_significant_levels(points, D(3))

    def test_csv_has_one_row_per_selected_peak(self):
        points = [{'price': D(i), 'intensity': D(h)} for i, h in enumerate([0, 100, 0, 90, 0], 1)]
        selected = select_significant_levels(points, D(3))
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / 'result.csv'
            write_csv(path, D(3), selected)
            with path.open(encoding='utf-8-sig', newline='') as stream:
                rows = list(csv.reader(stream, delimiter=';'))
        self.assertEqual(rows[0], HEADERS)
        self.assertEqual(len(rows), 3)
        self.assertEqual(rows[1], ['BTC', '3', '2', '33.333333'])
        self.assertEqual(rows[2], ['BTC', '3', '4', '33.333333'])

    def test_user_screenshot_marker_is_not_liquidity(self):
        marker = parse_tooltip(current_price_tooltip(), current=D(79656))
        self.assertEqual(marker['kind'], 'current_price_marker')
        self.assertEqual(marker['intensity'], 0)
        self.assertEqual(marker['side'], 'reference')
        points = [marker, {'price': D(79624), 'intensity': D(10)},
                  {'price': D(79741), 'intensity': D(100)}]
        selected, distance = select_level(points, D(79656))
        self.assertEqual(selected['price'], D(79624))
        self.assertGreater(distance, 0)

    def test_marker_requires_matching_current_price(self):
        with self.assertRaises(ValueError):
            parse_tooltip(current_price_tooltip(), current=D(79625))
        with self.assertRaises(ValueError):
            parse_tooltip(current_price_tooltip())

    def test_other_incomplete_tooltips_still_fail(self):
        raw = current_price_tooltip()
        raw['items'][0]['value'] = '1M'
        with self.assertRaises(ValueError):
            parse_tooltip(raw, current=D(79656))
        with self.assertRaises(ValueError):
            parse_tooltip({'title': '79656', 'items': [raw['items'][1]]}, current=D(79656))
        with self.assertRaises(ValueError):
            parse_tooltip({'title': '79656', 'items': []}, current=D(79656))

    def test_coverage_with_marker_between_bins_and_on_bin(self):
        for current in [D('99.5'), D(100)]:
            points = [{'price': D(i), 'intensity': D(1),
                       'side': 'long' if i < current else 'short'}
                      for i in range(80, 121) if D(i) != current]
            points.append(parse_tooltip(current_price_tooltip(str(current)), current=current))
            validate_coverage(points, current)
            self.assertNotEqual(select_level(points, current)[0].get('kind'), 'current_price_marker')
            report = validate_coverage([p for p in points if p['price'] != 95], current)
            self.assertIn({'left': D(94), 'right': D(96), 'width': D(2)}, report['intervals'])
            self.assertEqual(len(report['intervals']), 2 if current == 100 else 1)

    def test_rendered_tooltip_excludes_cumulative(self):
        raw = {'title': '79975', 'items': [
            {'name': 'Кумулятивное плечо по ликвидации шортовых позиций', 'value': '198.17M'},
            {'name': 'Binance', 'value': '53.84M'}, {'name': 'OKX', 'value': '23.53M'},
            {'name': 'Bybit', 'value': '1.24M'}]}
        point = parse_tooltip(raw)
        self.assertEqual(point['intensity'], D('78610000'))
        self.assertEqual(point['side'], 'short')

    def test_nearest_and_optional_threshold(self):
        points = [{'price': D(p), 'intensity': D(v)} for p, v in
                  [('99', '0'), ('98', '1'), ('104', '100'), ('90', '500')]]
        best, distance = select_level(points, D(100))
        self.assertEqual((best['price'], distance), (D(98), D(2)))
        self.assertEqual(select_level(points, D(100), D('.1'))[0]['price'], D(104))
        self.assertEqual(select_level(points, D(100), side='above')[0]['price'], D(104))

    def test_tie_and_current_level(self):
        p = [{'price': D(98), 'intensity': D(1)}, {'price': D(102), 'intensity': D(2)}]
        self.assertEqual(select_level(p, D(100))[0]['price'], D(102))
        self.assertEqual(select_level(p, D(102))[1], D(0))

    def test_fail_closed(self):
        for text in ['NaN', '-1', 'Infinity', '1.2.3', 'unknown']:
            with self.assertRaises(ValueError):
                number(text)
        with self.assertRaises(ValueError):
            parse_tooltip({'title': '100', 'items': [{'name': 'NewExchange', 'value': '1M'}]})
        with self.assertRaises(ValueError):
            select_level([], D(0))

    def test_coverage_and_ocr_cross_check(self):
        points = [{'price': D(i), 'side': 'long' if i < 100 else 'short'} for i in range(80, 121)]
        validate_coverage(points, D('99.5'))
        with self.assertRaises(ValueError):
            validate_coverage(points, D('995'))
        report = validate_coverage([p for p in points if p['price'] != 95], D('99.5'))
        self.assertEqual(len(report['intervals']), 1)

    def test_user_snapshot_uneven_categories_and_five_peaks(self):
        path = Path(__file__).parent / 'examples' / 'observations-20260905.json'
        record = json.loads(path.read_text(encoding='utf-8'))
        points = record['levels']
        for p in points:
            p['price'] = D(p['price'])
            p['intensity'] = D(p['intensity'])
        report = validate_coverage(points, D(record['current_price']))
        self.assertEqual(len(points), 179)
        self.assertEqual(report['typical_step'], D(117))
        self.assertEqual(len(report['intervals']), 10)
        self.assertEqual([p['price'] for p, _ in select_significant_levels(points, D('79634'))],
                         list(map(D, [80092, 77986, 81964, 75997, 75529])))

    def test_invalid_data_still_fails_validation(self):
        points = [{'price': D(i), 'intensity': D(1), 'side': 'long' if i < 100 else 'short'}
                  for i in range(80, 121)]
        with self.assertRaises(ValueError):
            validate_coverage(points + [points[0]], D('99.5'))
        with self.assertRaises(ValueError):
            validate_coverage(points[:10], D('99.5'))
        with self.assertRaises(ValueError):
            validate_coverage(points, D('NaN'))
        points[0]['intensity'] = D(-1)
        with self.assertRaises(ValueError):
            validate_coverage(points, D('99.5'))


if __name__ == '__main__':
    unittest.main()
