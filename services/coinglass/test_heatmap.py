import contextlib
import io
import json
import sys
import tempfile
import threading
import unittest
from pathlib import Path
from urllib.request import urlopen, Request
from http.server import ThreadingHTTPServer
from service import Manager, Handler

root = Path(__file__).resolve()
sys.path.insert(0, str(root.parents[2] if len(root.parents) > 2 else root.parent))
from coinglass_heatmap.collector import validate_map


class HeatmapTests(unittest.TestCase):
    def test_validation(self):
        data = dict(symbol='BTC', y=[100, 110], liquidation_levels=[[0, 1, 50]])
        self.assertEqual(validate_map(data, 'BTC')['range'], '365d')
        for change in [dict(symbol='ETH'), dict(y=[110, 100]), dict(y=[100, float('nan')]), dict(liquidation_levels=[[0, 2, 5]]), dict(liquidation_levels=[[0, 1, -1]])]:
            with self.assertRaises(ValueError): validate_map(dict(data, **change), 'BTC')

    def test_job_routes_and_snapshot_isolation(self):
        with tempfile.TemporaryDirectory() as folder, contextlib.redirect_stdout(io.StringIO()):
            class TestHandler(Handler): pass
            TestHandler.manager = Manager(Path(folder)/'old', start_worker=False)
            TestHandler.heatmap_manager = Manager(Path(folder)/'heatmap', start_worker=False, worker='heatmap_worker.py')
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
