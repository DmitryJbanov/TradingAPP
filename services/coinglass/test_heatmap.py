import contextlib
import io
import json
import subprocess
import sys
import tempfile
import threading
import unittest
from pathlib import Path
from urllib.request import urlopen, Request
from http.server import ThreadingHTTPServer
from unittest.mock import MagicMock, patch
from service import Manager, HeatmapManager, Handler

root = Path(__file__).resolve()
sys.path.insert(0, str(root.parents[2] if len(root.parents) > 2 else root.parent))
from coinglass_heatmap.collector import validate_map


class HeatmapTests(unittest.TestCase):
    def test_map_and_heatmap_share_worker_and_fifo_queue(self):
        with tempfile.TemporaryDirectory() as folder, contextlib.redirect_stdout(io.StringIO()):
            owner = Manager(Path(folder), start_worker=False)
            owner.worker = MagicMock()
            manager = HeatmapManager(Path(folder)/'heatmap', owner=owner)
            self.assertIs(manager.worker, owner.worker)
            self.assertIs(manager.queue, owner.queue)
            self.assertIs(manager.lock, owner.lock)
            manager.request_browser()
            self.assertTrue(owner.browser_requested.is_set())
            first, _ = owner.submit('BTC', {})
            second, _ = manager.submit('BTC', {})
            third, _ = owner.submit('ETH', {})
            owner.worker.collect.side_effect = lambda *args: iter([{'kind':'result', 'result':{'levels':[]}}])
            seen = []
            def collect(request, *_):
                seen.append(request['type'])
                if len(seen) == 3: owner.stopping = True
                yield {'kind':'result', 'result':{'levels':[]}}
            owner.worker.collect.side_effect = collect
            owner.loop()
            self.assertEqual(seen, ['map', 'heatmap', 'map'])
            self.assertTrue(all(job['state'] == 'done' for job in [first, second, third]))
            manager.close()
            owner.worker.shutdown.assert_not_called()
            owner.close()
            owner.worker.shutdown.assert_called_once()

    def test_heatmap_uses_existing_context_and_does_not_close_it(self):
        from heatmap_worker import run
        with tempfile.TemporaryDirectory() as folder:
            runtime = MagicMock()
            runtime.data = Path(folder)
            context, page = MagicMock(), MagicMock()
            runtime.ensure.return_value = (context, page)
            data = dict(symbol='BTC', range='365d', y=[100,110], liquidation_levels=[[0,1,5]])
            with patch('heatmap_worker.collect', return_value=data) as collect, patch('heatmap_worker.save_session') as save, patch('heatmap_worker.open_frontend_map', return_value=None):
                result, snapshot = run(dict(id='a'*32, asset='BTC'), runtime, Path(folder))
                collect.assert_called_once_with(page, 'BTC', reuse_frontend=True)
                save.assert_called_once_with(context, Path(folder)/'session.json')
                self.assertEqual(result['cellCount'], 1)
                self.assertEqual(snapshot['snapshotId'], 'a'*32)
                runtime.close.assert_not_called()
                context.close.assert_not_called()

    def test_validation(self):
        data = dict(symbol='BTC', y=[100, 110], liquidation_levels=[[0, 1, 50]])
        self.assertEqual(validate_map(data, 'BTC')['range'], '365d')
        for change in [dict(symbol='ETH'), dict(y=[110, 100]), dict(y=[100, float('nan')]), dict(liquidation_levels=[[0, 2, 5]]), dict(liquidation_levels=[[0, 1, -1]])]:
            with self.assertRaises(ValueError): validate_map(dict(data, **change), 'BTC')

    def test_job_routes_and_snapshot_isolation(self):
        with tempfile.TemporaryDirectory() as folder, contextlib.redirect_stdout(io.StringIO()):
            class TestHandler(Handler): pass
            TestHandler.manager = Manager(Path(folder)/'old', start_worker=False)
            TestHandler.heatmap_manager = HeatmapManager(Path(folder)/'heatmap', owner=TestHandler.manager)
            server = ThreadingHTTPServer(('127.0.0.1', 0), TestHandler)
            thread=threading.Thread(target=server.serve_forever, daemon=True); thread.start()
            base='http://127.0.0.1:'+str(server.server_port)
            try:
                request=Request(base+'/heatmap/jobs', data=json.dumps(dict(asset='BTC')).encode(), headers={'Content-Type':'application/json'})
                with urlopen(request) as response: job=json.load(response)['job']
                self.assertNotIn('BTC',TestHandler.manager.jobs)
                self.assertEqual(TestHandler.heatmap_manager.jobs['BTC']['id'],job['id'])
                snapshot=dict(schemaVersion=1,complete=True,snapshotId=job['id'],asset='BTC',symbol='BTC',range='365d',y=[100,110],liquidation_levels=[[0,1,5]])
                TestHandler.heatmap_manager.save_snapshot(job,snapshot)
                with urlopen(base+'/heatmap/snapshot?asset=BTC&snapshotId='+job['id']) as response:
                    self.assertEqual(json.load(response)['snapshot']['y'],[100,110])
                with urlopen(base+'/status?asset=BTC') as response: self.assertIsNone(json.load(response)['job'])
            finally: server.shutdown(); server.server_close(); thread.join()
