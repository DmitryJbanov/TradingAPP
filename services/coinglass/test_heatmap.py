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
from coinglass_heatmap.collector import validate_map, collect, SubscriptionRequired, HeatmapApiError, RANGES


class HeatmapTests(unittest.TestCase):
    def test_common_worker_accepts_heatmap_params_without_map_settings(self):
        from worker import run
        with tempfile.TemporaryDirectory() as folder, patch.dict('os.environ', {'COINGLASS_DATA_DIR': folder}):
            runtime = MagicMock()
            runtime.ensure.return_value = (MagicMock(), MagicMock())
            request = dict(id='a'*32, asset='BTC', type='heatmap', params={'range': '7d'})
            with patch('heatmap_worker.run', return_value=({'range': '7d'}, {'complete': True})) as heatmap_run, \
                    patch('worker.collect_symbol') as map_run, patch('worker.emit') as emit:
                run(request, runtime)
                heatmap_run.assert_called_once_with(request, runtime, Path(folder)/'heatmap'/'runs'/request['id'])
                map_run.assert_not_called()
                emit.assert_any_call('result', result={'range': '7d'}, snapshot={'complete': True})

    def test_heatmap_rejected_response_keeps_code_and_request_context(self):
        page = MagicMock()
        for code in ('40001', 40001, '40000', '50000'):
            page.evaluate.return_value = dict(code=code, success=False, msg='secret_value')
            with self.assertRaises(HeatmapApiError) as caught:
                collect(page, 'ETH', range_value='7d', reuse_frontend=True)
            self.assertIn(str(code), str(caught.exception))
            self.assertIn('ETH', str(caught.exception))
            self.assertIn('7 дней', str(caught.exception))
            self.assertNotIn('secret_value', str(caught.exception))

    def test_heatmap_refreshes_once_on_40001(self):
        from heatmap_worker import run
        data = dict(symbol='BTC', range='7d', y=[100,110], liquidation_levels=[[0,1,5]])
        for second in (data, HeatmapApiError('40001', 'BTC', '7d')):
            with tempfile.TemporaryDirectory() as folder:
                runtime = MagicMock()
                runtime.data = Path(folder)
                runtime.ensure.return_value = (MagicMock(), MagicMock())
                with patch('heatmap_worker.collect', side_effect=[HeatmapApiError('40001', 'BTC', '7d'), second]) as fetch, \
                        patch('heatmap_worker.open_frontend_map', return_value=None) as navigate, \
                        patch('heatmap_worker.save_session'):
                    request = dict(id='a'*32, asset='BTC', params={'range': '7d'})
                    if isinstance(second, Exception):
                        with self.assertRaises(HeatmapApiError): run(request, runtime, Path(folder))
                    else:
                        result, snapshot = run(request, runtime, Path(folder))
                        self.assertEqual(result['range'], '7d')
                        self.assertEqual(snapshot['range'], '7d')
                    self.assertEqual(fetch.call_count, 2)
                    navigate.assert_called_with(runtime.ensure.return_value[1], force_reload=True)
                    runtime.close.assert_not_called()

    def test_periods_and_subscription(self):
        page = MagicMock()
        prices = [[1722676500, '100', '110', '99', '105']]
        for period in RANGES:
            page.evaluate.return_value = dict(data=dict(y=[100,110], liq=[[0,1,5]], prices=prices))
            result = collect(page, 'BTC', range_value=period, reuse_frontend=True)
            self.assertEqual(result['range'], period)
            self.assertEqual(result['prices'], prices)
            self.assertEqual(page.evaluate.call_args.args[1], dict(asset='BTC', range=period))
        for code in ('40003', 40003):
            page.evaluate.return_value = dict(code=code, msg='40003', success=False)
            with self.assertRaisesRegex(SubscriptionRequired, 'ETH.*7 дней.*только с подпиской'):
                collect(page, 'ETH', range_value='7d', reuse_frontend=True)
        with self.assertRaises(ValueError):
            collect(page, 'BTC', range_value='invalid')

    def test_subscription_message_reaches_job_and_preserves_snapshot(self):
        from worker import report_error
        with patch('worker.emit') as emit:
            report_error(SubscriptionRequired('Карта ETH за период 7 дней доступна только с подпиской CoinGlass.'))
        message = emit.call_args.kwargs['message']
        with tempfile.TemporaryDirectory() as folder, contextlib.redirect_stdout(io.StringIO()):
            owner = Manager(Path(folder), start_worker=False)
            owner.worker = MagicMock()
            manager = HeatmapManager(Path(folder)/'heatmap', owner=owner)
            manager.jobs['ETH'] = dict(state='done', result=dict(snapshotId='a'*32, range='365d'))
            job, _ = manager.submit('ETH', dict(range='7d'))
            owner.worker.collect.return_value = iter([dict(kind='error', message=message)])
            manager.execute(job)
            self.assertEqual(job['state'], 'error')
            self.assertEqual(job['message'], message)
            self.assertEqual(job['result']['snapshotId'], 'a'*32)
            self.assertEqual(owner.worker.collect.call_args.args[0]['params'], dict(range='7d'))
            with self.assertRaises(ValueError): manager.submit('BTC', dict(range='invalid'))
            owner.close()

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
                collect.assert_called_once_with(page, 'BTC', range_value='365d', reuse_frontend=True)
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
