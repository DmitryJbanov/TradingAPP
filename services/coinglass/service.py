"""Local CoinGlass job API with one lazy, persistent browser worker."""
import hmac
import json
import os
import queue
import re
import signal
import shutil
import threading
import time
import uuid
from collections import deque
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit, parse_qs
from browser_runtime import AUTH_REVISION
from selection import preview
from persistent_worker import PersistentWorker
from frontend_api import RANGE_DAYS


def now():
    return datetime.now(timezone.utc).isoformat()


def params(value):
    if not isinstance(value, dict): raise ValueError('Неверные настройки')
    result = dict(minRelative=value.get('minRelative', .5), minProminence=value.get('minProminence', .35), limit=value.get('limit', 5), side=value.get('side', 'both'), hoverMs=value.get('hoverMs', 180))
    result.update(rangeDays=value.get('rangeDays', 90), requestLimit=value.get('requestLimit', 1440))
    if type(result['rangeDays']) is not int or result['rangeDays'] not in RANGE_DAYS:
        raise ValueError('Неверный период карты')
    for key in ('minRelative','minProminence'):
        if type(result[key]) not in (int,float) or not 0 <= result[key] <= 1: raise ValueError('Пороги: от 0 до 1')
    for key,lo,hi in [('limit',1,50),('hoverMs',50,250),('requestLimit',1,1440)]:
        if type(result[key]) is not int or not lo <= result[key] <= hi: raise ValueError('Неверный лимит или задержка')
    if result['side'] not in ('both','above','below'): raise ValueError('Неверная сторона')
    return result


class Manager:
    def __init__(self, directory, timeout=1200, start_worker=True, owner=None):
        self.directory=Path(directory); self.directory.mkdir(parents=True, exist_ok=True)
        self.timeout=timeout; self.lock=owner.lock if owner else threading.RLock(); self.jobs={}; self.events=deque(maxlen=100); self.sequence=0
        self.owner = owner
        self.kind = "map"
        self.queue = owner.queue if owner else queue.Queue(maxsize=20)
        self.stopping=False
        self.browser_requested = owner.browser_requested if owner else threading.Event()
        self.worker = owner.worker if owner else PersistentWorker(self.directory)
        self.next_browser_attempt = 0
        for path in sorted(self.directory.glob('*.json')):
            if not re.fullmatch(r'[A-Z0-9]{1,20}\.json',path.name): continue
            try:
                job=json.loads(path.read_text(encoding='utf-8'))
                if job['state'] in ('queued','running'): job.update(state='error', message='Задание прервано перезапуском сервиса', progress=0, updatedAt=now())
                self.jobs[job['asset']]=job
            except (ValueError,KeyError,OSError): pass
        self.event('INFO', f'Фоновый сервис запущен; {AUTH_REVISION}; Chromium headless')
        if start_worker and owner is None: threading.Thread(target=self.loop, daemon=True).start()

    def snapshot(self, asset, snapshot_id=None):
        if not isinstance(asset, str) or not re.fullmatch(r'[A-Z0-9]{1,20}', asset):
            raise ValueError('Неверный актив')
        if not snapshot_id:
            with self.lock:
                snapshot_id = (self.jobs.get(asset, {}).get('result') or {}).get('snapshotId')
        if not snapshot_id:
            raise FileNotFoundError('Для старого результата нужен новый сбор карты')
        if not isinstance(snapshot_id, str) or not re.fullmatch(r'[a-f0-9]{32}', snapshot_id):
            raise ValueError('Неверный снимок')
        record = json.loads((self.directory / 'snapshots' / (snapshot_id+'.json')).read_text(encoding='utf-8'))
        if record.get('asset') != asset or record.get('schemaVersion') != 1 or record.get('complete') is not True:
            raise ValueError('Снимок не соответствует активу или не завершён')
        return record

    def save_snapshot(self, job, snapshot):
        if snapshot.get('snapshotId') != job['id'] or snapshot.get('asset') != job['asset'] or snapshot.get('complete') is not True:
            raise ValueError('Некорректный снимок обработчика')
        directory = self.directory / 'snapshots'
        directory.mkdir(exist_ok=True)
        path = directory / (job['id']+'.json')
        temporary = path.with_suffix('.tmp')
        temporary.write_text(json.dumps(snapshot, ensure_ascii=False), encoding='utf-8')
        os.replace(temporary, path)

    def event(self, level, message):
        with self.lock:
            self.sequence+=1
            item=dict(id=self.sequence,time=now(),level=level,message='CoinGlass: '+message[:500])
            self.events.append(item)
            print(json.dumps(item,ensure_ascii=False),flush=True)

    def save(self, job):
        path=self.directory/(job['asset']+'.json'); temporary=path.with_suffix('.tmp')
        temporary.write_text(json.dumps(job,ensure_ascii=False),encoding='utf-8'); os.replace(temporary,path)

    def submit(self, asset, settings):
        if not isinstance(asset,str) or not re.fullmatch(r'[A-Z0-9]{1,20}',asset): raise ValueError('Неверный актив')
        settings=params(settings)
        with self.lock:
            old=self.jobs.get(asset,{})
            if old.get('state') in ('queued','running'): return old,False
            if self.queue.full(): raise ValueError('Очередь заполнена; повторите позже')
            job=dict(id=uuid.uuid4().hex,asset=asset,params=settings,state='queued',progress=0,message='В очереди',updatedAt=now(),result=old.get('result'))
            self.jobs[asset]=job; self.save(job); self.queue.put_nowait((self, job))
            self.event('INFO',f'{asset}: задание добавлено в очередь')
            return job,True

    def update(self,job,**changes):
        with self.lock:
            job.update(**changes,updatedAt=now()); self.save(job)

    def request_browser(self):
        self.browser_requested.set()

    def loop(self):
        while not self.stopping:
            try: manager, job=self.queue.get(timeout=.5)
            except queue.Empty:
                if self.browser_requested.is_set() and time.monotonic() >= self.next_browser_attempt:
                    try: self.worker.ensure()
                    except Exception:
                        self.next_browser_attempt = time.monotonic() + 5
                continue
            try: manager.execute(job)
            except Exception:
                manager.update(job,state='error',message='Не удалось запустить обработчик. Проверьте Python и зависимости.')
                self.event('ERROR',job['asset']+': ошибка запуска обработчика')
            finally: self.queue.task_done()

    def execute(self,job):
        self.update(job,state='running',progress=1,message=(
            'Получение данных через открытый браузер' if self.worker.is_running()
            else 'Запуск фонового браузера'))
        label = 'Heatmap Model 3 · 365d' if self.kind == 'heatmap' else f"карты за {job['params']['rangeDays']} дн."
        self.event('INFO', f"{job['asset']}: запуск парсинга {label}")
        self.request_browser()
        result = snapshot = failure = None
        try:
            for item in self.worker.collect({**{k: job[k] for k in ('id', 'asset', 'params')}, 'type': self.kind},
                                            self.timeout, lambda: self.stopping or bool(self.owner and self.owner.stopping)):
                if item.get('kind') == 'result':
                    result, snapshot = item['result'], item.get('snapshot')
                elif item.get('kind') == 'error':
                    failure = item['message']
                elif item.get('kind') in ('log', 'progress'):
                    message = item.get('message', '')
                    self.update(job, progress=max(job['progress'], min(99, int(item.get('progress', job['progress'])))), message=message)
                    self.event('INFO', job['asset'] + ': ' + message)
            if result and not failure:
                if snapshot is not None: self.save_snapshot(job, snapshot)
                self.update(job, state='done', progress=100, message='Уровни обновлены', result=result)
                self.event('INFO', f"{job['asset']}: готово, значимых уровней: {len(result['levels'])}")
            else:
                self.update(job, state='error', message=failure or 'Обработчик завершился без результата')
                self.event('ERROR', job['asset'] + ': ' + job['message'])
        except Exception as exc:
            message = ('Превышено время парсинга' if isinstance(exc, TimeoutError)
                       else 'Фоновый браузер недоступен; он будет перезапущен автоматически')
            self.update(job, state='error', message=message)
            self.event('ERROR', job['asset'] + ': ' + message)
        finally:
            # Keep at most 20 diagnostic runs; credentials and latest snapshots are outside this directory.
            runs=self.directory/"runs"
            if runs.exists():
                folders=sorted((p for p in runs.iterdir() if p.is_dir()),key=lambda p:p.stat().st_mtime,reverse=True)
                for folder in folders[20:]: shutil.rmtree(folder)

    def close(self):
        self.stopping = True
        if self.owner is None: self.worker.shutdown()


class HeatmapManager(Manager):
    """Separate snapshots and status, shared queue and browser owner."""
    def __init__(self, directory, owner, timeout=180):
        super().__init__(directory, timeout=timeout, start_worker=False, owner=owner)
        self.kind = 'heatmap'


class Handler(BaseHTTPRequestHandler):
    manager=None
    heatmap_manager=None
    token=''
    def setup(self):
        super().setup(); self.connection.settimeout(10)
    def log_message(self,*args): pass
    def respond(self,status,body):
        data=json.dumps(body,ensure_ascii=False).encode()
        self.send_response(status); self.send_header('Content-Type','application/json; charset=utf-8'); self.send_header('Cache-Control','no-store'); self.send_header('Content-Length',str(len(data))); self.end_headers(); self.wfile.write(data)
    def authorized(self):
        if self.token and not hmac.compare_digest(self.headers.get('Authorization',''),'Bearer '+self.token):
            self.respond(401,{'error':'Доступ запрещён'}); return False
        return True
    def do_GET(self):
        if not self.authorized(): return
        self.manager = type(self).manager
        url=urlsplit(self.path)
        if url.path.startswith('/heatmap/'):
            self.manager = self.heatmap_manager
            url = url._replace(path=url.path.removeprefix('/heatmap'))
        if url.path in ('/status', '/snapshot', '/events'): self.manager.request_browser()
        with self.manager.lock:
            if url.path=='/status':
                asset=parse_qs(url.query).get('asset',[''])[0]
                if asset: body={'job':self.manager.jobs.get(asset)}
                else: body={'jobs':[{k:v for k,v in j.items() if k!='result'} for j in sorted(self.manager.jobs.values(),key=lambda j:j['updatedAt'],reverse=True)[:30]],'headless':True}
                self.respond(200,body)
            elif url.path=='/snapshot':
                try:
                    query=parse_qs(url.query)
                    self.respond(200, {'snapshot': self.manager.snapshot(query.get('asset',[''])[0], query.get('snapshotId',[None])[0])})
                except FileNotFoundError: self.respond(404, {'error':'Полная карта недоступна. Запустите новый сбор.'})
                except (ValueError, KeyError): self.respond(400, {'error':'Некорректный снимок'})
            elif url.path=='/events': self.respond(200,{'data':list(self.manager.events)})
            else: self.respond(404,{'error':'Not found'})
    def do_POST(self):
        if not self.authorized(): return
        self.manager = type(self).manager
        if self.path == '/heatmap/jobs':
            self.manager = self.heatmap_manager
            self.path = '/jobs'
        if self.path not in ('/jobs', '/preview'): self.respond(404,{'error':'Not found'}); return
        try:
            size=int(self.headers.get('Content-Length','0'))
            if not 0<size<=8192: raise ValueError('Неверный размер запроса')
            data=json.loads(self.rfile.read(size))
            if not isinstance(data,dict): raise ValueError('Неверный запрос')
            if self.path == '/preview':
                settings=params(data.get('params'))
                if not data.get('snapshotId'): raise ValueError('Не указан снимок')
                snapshot=self.manager.snapshot(data.get('asset'), data['snapshotId'])
                self.respond(200, preview(snapshot, settings))
                return
            job,created=self.manager.submit(data.get('asset'),data.get('params',{}))
            self.respond(202 if created else 409,{'job':job,'error':None if created else 'Для актива уже выполняется задание'})
        except FileNotFoundError: self.respond(404, {'error':'Снимок недоступен. Загрузите карту заново.'})
        except (ValueError,TypeError,KeyError): self.respond(400,{'error':'Некорректные параметры или очередь заполнена'})


if __name__=='__main__':
    os.umask(0o077)
    Handler.manager=Manager(os.environ.get('COINGLASS_DATA_DIR','./coinglass-data'))
    Handler.heatmap_manager=HeatmapManager(Path(os.environ.get('COINGLASS_DATA_DIR','./coinglass-data')) / 'heatmap', owner=Handler.manager)
    Handler.token=os.environ.get('COINGLASS_TOKEN','')
    server=ThreadingHTTPServer((os.environ.get('COINGLASS_HOST','127.0.0.1'),int(os.environ.get('COINGLASS_PORT','8090'))),Handler)
    def stop(*_):
        Handler.heatmap_manager.close()
        Handler.manager.close(); threading.Thread(target=server.shutdown,daemon=True).start()
    signal.signal(signal.SIGTERM,stop); signal.signal(signal.SIGINT,stop)
    try: server.serve_forever()
    finally: server.server_close(); Handler.manager.close(); Handler.heatmap_manager.close()
