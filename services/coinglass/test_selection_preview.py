import contextlib
import io
import json
import tempfile
import unittest
from decimal import Decimal as D
from pathlib import Path
from collector import select_significant_levels
from selection import explain_selection, preview
from service import Manager, params


def terrain(heights):
    return [dict(price=D(i), intensity=D(h), side='long', exchanges={'Binance': str(h)})
            for i, h in enumerate(heights, 1)]


class PreviewTests(unittest.TestCase):
    def test_preview_keeps_source_period_when_next_collection_settings_change(self):
        snapshot = dict(asset='BTC', rangeDays=7, requestLimit=500, currentPrice='3',
                        collectedAt='2026-09-19T00:00:00Z', snapshotId='a'*32,
                        points=terrain([0, 100, 0]))
        result = preview(snapshot, params({'rangeDays': 30, 'requestLimit': 720}))['result']
        self.assertEqual(result['rangeDays'], 7)
        self.assertEqual(result['params']['rangeDays'], 7)
        self.assertEqual(result['params']['requestLimit'], 500)

    def test_actual_fixture_matches_collector(self):
        record = json.loads(Path(__file__).with_name('examples').joinpath('observations-20260905.json').read_text())
        snapshot = dict(asset='BTC', rangeDays=90, currentPrice=record['current_price'], collectedAt=record['finished_utc'], snapshotId='a'*32, points=record['levels'])
        points = [{**p, 'price': D(p['price']), 'intensity': D(p['intensity'])} for p in record['levels']]
        for side in ['both', 'above', 'below']:
            for relative in ['0', '.5', '1']:
                settings = params(dict(side=side, minRelative=float(relative)))
                result = preview(snapshot, settings)
                expected = select_significant_levels(points, D(record['current_price']), D(relative), side=side)
                self.assertEqual([l['price'] for l in result['result']['levels']], [float(p['price']) for p, _ in expected])
                self.assertEqual(len(result['points']), sum(p.get('kind') != 'current_price_marker' for p in points))

    def test_prominence_height_plateau_ties_limit_and_side(self):
        p = terrain([0, 100, 0, 80, 60, 75, 0])
        report = explain_selection(p, D(3), D('.5'), D('.35'), limit=1)
        self.assertEqual(report['points'][5]['base'], D(60))
        self.assertEqual(report['points'][5]['reasons'], ['prominence'])
        self.assertEqual(report['selected'][0]['price'], D(2))  # equal distance: larger intensity
        self.assertEqual(report['points'][3]['reasons'], ['limit'])
        report = explain_selection(terrain([0, 100, 100, 0, 100, 0]), D(3), D(1), D(1), 'above', 5)
        self.assertEqual(report['points'][1]['reasons'], ['side'])
        self.assertEqual(report['points'][2]['reasons'], ['plateau'])
        self.assertEqual([p['price'] for p in report['selected']], [D(5)])
        report = explain_selection(terrain([0, 100, 0, 100, 0]), D(3), limit=1)
        self.assertEqual(report['selected'][0]['price'], D(2))  # equal height: lower price

    def test_empty_and_reference_marker(self):
        self.assertEqual(explain_selection(terrain([1, 2, 3]), D(2))['selected'], [])
        self.assertEqual(explain_selection([], D(2))['maximum'], 0)
        p = terrain([0, 100, 80, 90, 0])
        p.append(dict(price=D('3.5'), intensity=D(0), kind='current_price_marker'))
        report = explain_selection(p, D('3.5'))
        self.assertEqual(report['points'][3]['prominence'], 10)
        self.assertEqual(report['points'][3]['reasons'], ['prominence'])

    def test_snapshots_survive_restart_and_previews_do_not_mutate_jobs(self):
        with tempfile.TemporaryDirectory() as directory, contextlib.redirect_stdout(io.StringIO()):
            manager = Manager(directory, start_worker=False)
            job, _ = manager.submit('BTC', {})
            snapshot = dict(schemaVersion=1, complete=True, asset='BTC', snapshotId=job['id'],
                rangeDays=90, currentPrice='3', collectedAt='2026-09-18T00:00:00Z',
                points=json.loads(json.dumps(terrain([0, 100, 0, 80, 0]), default=str)))
            manager.save_snapshot(job, snapshot)
            manager.update(job, state='done', result=preview(snapshot, params({}))['result'])
            before = json.dumps(job, sort_keys=True)
            preview(manager.snapshot('BTC', job['id']), params({'side': 'above', 'limit': 1}))
            self.assertEqual(before, json.dumps(job, sort_keys=True))
            restored = Manager(directory, start_worker=False)
            self.assertEqual(restored.snapshot('BTC'), snapshot)
            with self.assertRaises(ValueError): restored.snapshot('ETH', job['id'])
            with self.assertRaises(ValueError): restored.snapshot('BTC', '../session')
            with self.assertRaises(FileNotFoundError): restored.snapshot('ETH')
            # A subsequent job never deletes a previously pinned snapshot.
            restored.submit('BTC', {})
            self.assertEqual(restored.snapshot('BTC', job['id']), snapshot)

class PreviewHttpTests(unittest.TestCase):
    def test_http_snapshot_preview_auth_and_isolation(self):
        import threading
        import urllib.request
        import urllib.error
        from http.server import ThreadingHTTPServer
        from service import Handler
        with tempfile.TemporaryDirectory() as directory, contextlib.redirect_stdout(io.StringIO()):
            class TestHandler(Handler): pass
            manager = Manager(directory, start_worker=False)
            job, _ = manager.submit('BTC', {})
            snapshot = dict(schemaVersion=1, complete=True, asset='BTC', snapshotId=job['id'], rangeDays=90,
                currentPrice='3', collectedAt='2026-09-18T00:00:00Z',
                points=json.loads(json.dumps(terrain([0, 100, 0, 80, 0]), default=str)))
            manager.save_snapshot(job, snapshot)
            manager.update(job, state='done', result=preview(snapshot, params({}))['result'])
            TestHandler.manager = manager
            TestHandler.token = 'test'
            server = ThreadingHTTPServer(('127.0.0.1', 0), TestHandler)
            thread = threading.Thread(target=server.serve_forever, daemon=True)
            thread.start()
            def call(path, body=None, token=True):
                request = urllib.request.Request(f'http://127.0.0.1:{server.server_port}'+path,
                    data=json.dumps(body).encode() if body is not None else None,
                    headers={'Authorization': 'Bearer test'} if token else {})
                try:
                    with urllib.request.urlopen(request) as response: return response.status, json.load(response)
                except urllib.error.HTTPError as error: return error.code, json.load(error)
            try:
                before = json.dumps(job, sort_keys=True)
                self.assertEqual(call('/snapshot?asset=BTC', token=False)[0], 401)
                self.assertEqual(call('/snapshot?asset=BTC')[1]['snapshot'], snapshot)
                request = dict(asset='BTC', snapshotId=job['id'], params=params({'side':'above'}))
                response = call('/preview', request)
                self.assertEqual(response[0], 200)
                self.assertEqual([p['price'] for p in response[1]['result']['levels']], [4])
                self.assertEqual(call('/preview', {**request, 'snapshotId':'../session'})[0], 400)
                self.assertEqual(call('/preview', {**request, 'asset':'ETH'})[0], 400)
                self.assertEqual(call('/preview', {**request, 'snapshotId':'b'*32})[0], 404)
                self.assertEqual(call('/preview', {**request, 'params':params({'side':'above','minRelative':1})})[1]['result']['levels'], [])
                self.assertEqual(before, json.dumps(job, sort_keys=True))
            finally:
                server.shutdown(); server.server_close(); thread.join()
