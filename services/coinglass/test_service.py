import contextlib
import io
import json
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from service import Manager, params

class ServiceTests(unittest.TestCase):
    def test_validation(self):
        for value in [None, {'limit':True}, {'limit':0}, {'hoverMs':10}, {'minRelative':float('nan')}, {'side':'x'},
                      {'rangeDays': 2}, {'rangeDays': True}, {'requestLimit': 0}, {'requestLimit': 1441}]:
            with self.assertRaises(ValueError): params(value)
        self.assertEqual(params({})['hoverMs'],180)
        self.assertEqual(params({})['rangeDays'], 90)
        self.assertEqual(params({})['requestLimit'], 1440)
        self.assertEqual(params({'rangeDays': 7, 'requestLimit': 500})['requestLimit'], 500)

    def test_status_distinguishes_startup_from_reuse(self):
        from unittest.mock import MagicMock
        with tempfile.TemporaryDirectory() as folder, contextlib.redirect_stdout(io.StringIO()):
            manager = Manager(folder, start_worker=False)
            manager.worker = MagicMock()
            for running in (False, True):
                manager.worker.is_running.return_value = running
                job, _ = manager.submit('BTC', {'rangeDays': 30, 'requestLimit': 720})
                statuses = []
                def collect(*args):
                    statuses.append(job['message'])
                    yield {'kind': 'result', 'result': {'levels': []}}
                manager.worker.collect.side_effect = collect
                manager.execute(job)
                self.assertEqual(statuses, ['Получение данных через открытый браузер' if running
                                            else 'Запуск фонового браузера'])

    def test_dedup_persistence_interrupted_and_secret_files_ignored(self):
        with tempfile.TemporaryDirectory() as folder, contextlib.redirect_stdout(io.StringIO()):
            manager=Manager(folder,start_worker=False)
            job,created=manager.submit('BTC',{})
            self.assertTrue(created)
            self.assertFalse(manager.submit('BTC',{})[1])
            with self.assertRaises(ValueError): manager.submit('../credentials',{})
            Path(folder,'session.json').write_text('{"cookies":[]}')
            restored=Manager(folder,start_worker=False)
            self.assertEqual(restored.jobs['BTC']['state'],'error')
            self.assertEqual(list(restored.jobs),['BTC'])

    def test_worker_success_failure_keeps_previous_result_and_timeout(self):
        from unittest.mock import MagicMock
        with tempfile.TemporaryDirectory() as folder, contextlib.redirect_stdout(io.StringIO()):
            manager = Manager(folder, start_worker=False)
            job, _ = manager.submit('BTC', {})
            fixture = {'levels': [{'price': 110}]}
            manager.worker = MagicMock()
            manager.worker.collect.return_value = iter([
                {'kind': 'progress', 'progress': 50, 'message': 'Сбор уровней'},
                {'kind': 'result', 'result': fixture}])
            manager.execute(job)
            self.assertEqual(job['state'], 'done')
            self.assertEqual(job['result'], fixture)
            job, _ = manager.submit('BTC', {})
            manager.worker.collect.return_value = iter([{'kind': 'error', 'message': 'Вход не подтверждён'}])
            manager.execute(job)
            self.assertEqual(job['state'], 'error')
            self.assertEqual(job['result'], fixture)
            job, _ = manager.submit('BTC', {})
            manager.worker.collect.side_effect = TimeoutError()
            manager.execute(job)
            self.assertEqual(job['state'], 'error')
            self.assertIn('время', job['message'])
            self.assertEqual(job['result'], fixture)


class HttpTests(unittest.TestCase):
    def test_http_auth_status_queue_and_events(self):
        import threading
        import urllib.request
        import urllib.error
        from http.server import ThreadingHTTPServer
        from service import Handler
        with tempfile.TemporaryDirectory() as folder, contextlib.redirect_stdout(io.StringIO()):
            class TestHandler(Handler): pass
            TestHandler.manager=Manager(folder,start_worker=False); TestHandler.token='local-test'
            server=ThreadingHTTPServer(('127.0.0.1',0),TestHandler)
            thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
            def call(path,body=None,token=True):
                request=urllib.request.Request(f'http://127.0.0.1:{server.server_port}'+path,data=None if body is None else json.dumps(body).encode(),headers={'Authorization':'Bearer local-test'} if token else {})
                try:
                    with urllib.request.urlopen(request,timeout=2) as response: return response.status,json.load(response)
                except urllib.error.HTTPError as error: return error.code,json.load(error)
            try:
                self.assertEqual(call('/status',token=False)[0],401)
                self.assertFalse(TestHandler.manager.browser_requested.is_set())
                self.assertEqual(call('/status')[0],200)
                self.assertTrue(TestHandler.manager.browser_requested.is_set())
                self.assertEqual(call('/jobs',{'asset':'BTC','params':{}})[0],202)
                self.assertEqual(call('/jobs',{'asset':'BTC','params':{}})[0],409)
                self.assertEqual(call('/status?asset=BTC')[1]['job']['state'],'queued')
                self.assertTrue(any('BTC' in event['message'] for event in call('/events')[1]['data']))
            finally: server.shutdown(); server.server_close(); thread.join()
