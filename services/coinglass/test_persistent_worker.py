import os
import io
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

from persistent_worker import PersistentWorker
from worker import BrowserRuntime, serve


FIXTURE = '''
import json, sys, time
print(json.dumps({'kind': 'ready'}), flush=True)
for line in sys.stdin:
    request = json.loads(line)
    if request['id'] == 'crash': sys.exit(1)
    if request['id'] == 'timeout': time.sleep(30)
    print(json.dumps({'kind': 'result', 'request_id': 'old', 'result': 'stale'}), flush=True)
    print(json.dumps({'kind': 'result', 'request_id': request['id'], 'result': request['id']}), flush=True)
'''


class PersistentWorkerTests(unittest.TestCase):
    def test_failed_request_keeps_browser_for_next_request(self):
        from types import SimpleNamespace
        runtime = MagicMock()
        calls = []
        def run(request, owned):
            self.assertIs(owned, runtime)
            runtime.close.assert_not_called()
            calls.append(request['id'])
            if request['id'] == 'first':
                raise ValueError('Invalid API response')
        def thread(*, target, **kwargs):
            return SimpleNamespace(start=target)
        api = SimpleNamespace(sync_playwright=MagicMock())
        with patch.dict('sys.modules', {'playwright.sync_api': api}), \
                patch('worker.BrowserRuntime', return_value=runtime), \
                patch('worker.threading.Thread', side_effect=thread), \
                patch('worker.sys.stdin', io.StringIO('{"id":"first"}\n{"id":"second"}\n')), \
                patch('worker.run', side_effect=run), patch('worker.emit'):
            serve()
        self.assertEqual(calls, ['first', 'second'])
        runtime.ensure.assert_called_once()
        runtime.close.assert_called_once()

    def test_reuses_process_filters_old_responses_and_recovers(self):
        original = subprocess.Popen
        spawned = []
        def spawn(command, **kwargs):
            if command[0] != sys.executable:  # Windows taskkill from close().
                return original(command, **kwargs)
            self.assertEqual(kwargs['env']['PWDEBUG'], '0')
            process = original([sys.executable, '-u', '-c', FIXTURE], **kwargs)
            spawned.append(process.pid)
            return process
        with tempfile.TemporaryDirectory() as folder, patch('persistent_worker.subprocess.Popen', side_effect=spawn):
            worker = PersistentWorker(folder)
            try:
                self.assertIsNone(worker.process)
                worker.ensure()
                worker.ensure()
                for name in ('first', 'second'):
                    result = list(worker.collect({'id': name}, 5, lambda: False))
                    self.assertEqual(result[0]['result'], name)
                self.assertEqual(len(spawned), 1)
                with self.assertRaises(RuntimeError):
                    list(worker.collect({'id': 'crash'}, 5, lambda: False))
                self.assertEqual(list(worker.collect({'id': 'recovered'}, 5, lambda: False))[0]['result'], 'recovered')
                self.assertEqual(len(spawned), 2)
                with self.assertRaises(TimeoutError):
                    list(worker.collect({'id': 'timeout'}, .1, lambda: False))
                self.assertIsNone(worker.process)
                worker.ensure()
                self.assertEqual(len(spawned), 3)
            finally:
                worker.close()

    def test_runtime_reuses_browser_context_and_page_until_disconnect(self):
        browser, context, page = MagicMock(), MagicMock(), MagicMock()
        browser.is_connected.return_value = True
        page.is_closed.return_value = False
        with tempfile.TemporaryDirectory() as folder, \
                patch('worker.launch_browser', return_value=browser) as launch, \
                patch('worker.create_page', return_value=(context, page)) as create:
            runtime = BrowserRuntime(MagicMock(), Path(folder))
            runtime.ensure()
            runtime.ensure()
            launch.assert_called_once()
            create.assert_called_once()
            page.is_closed.return_value = True
            replacement = context.new_page.return_value
            replacement.is_closed.return_value = False
            self.assertEqual(runtime.ensure(), (context, replacement))
            context.close.assert_not_called()
            create.assert_called_once()
            launch.assert_called_once()
            browser.is_connected.return_value = False
            runtime.ensure()
            self.assertEqual(launch.call_count, 2)
            self.assertEqual(create.call_count, 2)
            runtime.close()
