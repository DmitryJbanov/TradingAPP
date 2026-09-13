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
        for value in [None, {'limit':True}, {'limit':0}, {'hoverMs':10}, {'minRelative':float('nan')}, {'side':'x'}]:
            with self.assertRaises(ValueError): params(value)
        self.assertEqual(params({})['hoverMs'],180)

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
        original=subprocess.Popen
        with tempfile.TemporaryDirectory() as folder, contextlib.redirect_stdout(io.StringIO()):
            manager=Manager(folder,start_worker=False)
            job,_=manager.submit('BTC',{})
            fixture={'asset':'BTC','rangeDays':90,'currentPrice':100,'collectedAt':'2026-09-12T00:00:00Z','params':params({}),'levels':[{'price':110,'intensity':20,'prominence':10,'distancePercent':10}]}
            code='import sys,json; request=json.loads(sys.stdin.readline()); print(json.dumps({"kind":"progress","progress":50,"message":"Сбор уровней"}),flush=True); print(json.dumps({"kind":"result","result":'+repr(fixture)+'}),flush=True)'
            def spawn(command,**kwargs):
                self.assertNotIn('shell',kwargs)
                self.assertEqual(kwargs['env']['PWDEBUG'],'0')
                return original([command[0],'-c',code],**kwargs)
            with patch('service.subprocess.Popen',side_effect=spawn): manager.execute(job)
            self.assertEqual(job['state'],'done'); self.assertEqual(job['progress'],100)
            self.assertTrue(any('Сбор уровней' in e['message'] for e in manager.events))
            old=job['result']
            job,_=manager.submit('BTC',{})
            code='import sys,json; sys.stdin.readline(); print(json.dumps({"kind":"error","message":"Вход не подтверждён"}),flush=True); sys.exit(1)'
            with patch('service.subprocess.Popen',side_effect=spawn): manager.execute(job)
            self.assertEqual(job['state'],'error'); self.assertEqual(job['result'],old)
            job,_=manager.submit('BTC',{}); manager.timeout=.05
            code='import sys,time; sys.stdin.readline(); time.sleep(30)'
            with patch('service.subprocess.Popen',side_effect=spawn): manager.execute(job)
            self.assertEqual(job['state'],'error'); self.assertIn('время',job['message']); self.assertEqual(job['result'],old)

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
                self.assertEqual(call('/jobs',{'asset':'BTC','params':{}})[0],202)
                self.assertEqual(call('/jobs',{'asset':'BTC','params':{}})[0],409)
                self.assertEqual(call('/status?asset=BTC')[1]['job']['state'],'queued')
                self.assertTrue(any('BTC' in event['message'] for event in call('/events')[1]['data']))
            finally: server.shutdown(); server.server_close(); thread.join()
