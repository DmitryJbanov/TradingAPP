"""Persistent browser subprocess, owned by the manager's single queue thread."""
import json
import os
import queue
import signal
import subprocess
import sys
import threading
import time
from pathlib import Path


class PersistentWorker:
    def __init__(self, directory):
        self.directory = Path(directory)
        self.process = None
        self.output = None
        self.stopped = False

    def is_running(self):
        return self.process is not None and self.process.poll() is None

    def ensure(self):
        if self.stopped:
            raise RuntimeError('Worker остановлен')
        if self.is_running():
            return
        self.close()
        options = ({'creationflags': subprocess.CREATE_NO_WINDOW | subprocess.CREATE_NEW_PROCESS_GROUP}
                   if os.name == 'nt' else {'start_new_session': True})
        process = subprocess.Popen(
            [sys.executable, '-u', str(Path(__file__).with_name('worker.py')), '--persistent'],
            stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
            text=True, encoding='utf-8',
            env={**os.environ, 'PWDEBUG': '0', 'COINGLASS_DATA_DIR': str(self.directory.resolve())},
            **options)
        self.process = process
        if self.stopped:
            self.close()
            raise RuntimeError('Worker остановлен')
        output = self.output = queue.Queue()

        def consume():
            try:
                for line in process.stdout:
                    try: output.put(json.loads(line))
                    except ValueError: pass
            finally:
                output.put({'kind': 'eof'})
                process.stdout.close()
        threading.Thread(target=consume, daemon=True).start()
        try:
            item = output.get(timeout=60)
            if item.get('kind') != 'ready':
                raise RuntimeError('Фоновый браузер не запустился')
        except Exception:
            self.close()
            raise

    def collect(self, request, timeout, stopping):
        self.ensure()
        process = self.process
        try:
            process.stdin.write(json.dumps(request) + '\n')
            process.stdin.flush()
            deadline = time.monotonic() + timeout
            while True:
                if stopping():
                    raise RuntimeError('Задание остановлено')
                if time.monotonic() > deadline:
                    raise TimeoutError('Превышено время парсинга')
                try: item = self.output.get(timeout=.1)
                except queue.Empty:
                    if process.poll() is not None:
                        raise RuntimeError('Фоновый браузер завершился; он будет перезапущен')
                    continue
                if item.get('kind') == 'eof':
                    raise RuntimeError('Фоновый браузер завершился; он будет перезапущен')
                if item.get('request_id') != request['id']:
                    continue
                yield item
                if item.get('kind') in ('result', 'error'):
                    return
        except Exception:
            self.close()
            raise

    def close(self):
        process, self.process = self.process, None
        if process is None:
            return
        try:
            if process.poll() is None:
                if os.name == 'nt':
                    subprocess.run(['taskkill', '/PID', str(process.pid), '/T', '/F'],
                                   capture_output=True, creationflags=subprocess.CREATE_NO_WINDOW, timeout=10)
                else:
                    try: os.killpg(process.pid, signal.SIGKILL)
                    except ProcessLookupError: pass
                process.wait(timeout=10)
        finally:
            process.stdin.close()
            # The reader owns stdout until EOF; closing it here races its read.

    def shutdown(self):
        self.stopped = True
        self.close()
