"""Local CoinGlass job API. One subprocess at a time; durable snapshots, bounded logs."""
import hmac
import json
import os
import queue
import re
import signal
import shutil
import subprocess
import sys
import threading
import time
import uuid
from collections import deque
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit, parse_qs
from browser_runtime import AUTH_REVISION


def now():
    return datetime.now(timezone.utc).isoformat()


def params(value):
    if not isinstance(value, dict): raise ValueError('Неверные настройки')
    result = dict(minRelative=value.get('minRelative', .5), minProminence=value.get('minProminence', .35), limit=value.get('limit', 5), side=value.get('side', 'both'), hoverMs=value.get('hoverMs', 180))
    for key in ('minRelative','minProminence'):
        if type(result[key]) not in (int,float) or not 0 <= result[key] <= 1: raise ValueError('Пороги: от 0 до 1')
    for key,lo,hi in [('limit',1,50),('hoverMs',50,250)]:
        if type(result[key]) is not int or not lo <= result[key] <= hi: raise ValueError('Неверный лимит или задержка')
    if result['side'] not in ('both','above','below'): raise ValueError('Неверная сторона')
    return result


class Manager:
    def __init__(self, directory, timeout=1200, start_worker=True):
        self.directory=Path(directory); self.directory.mkdir(parents=True, exist_ok=True)
        self.timeout=timeout; self.lock=threading.RLock(); self.jobs={}; self.events=deque(maxlen=100); self.sequence=0
        self.queue=queue.Queue(maxsize=20); self.process=None; self.stopping=False
        for path in sorted(self.directory.glob('*.json')):
            if not re.fullmatch(r'[A-Z0-9]{1,20}\.json',path.name): continue
            try:
                job=json.loads(path.read_text(encoding='utf-8'))
                if job['state'] in ('queued','running'): job.update(state='error', message='Задание прервано перезапуском сервиса', progress=0, updatedAt=now())
                self.jobs[job['asset']]=job
            except (ValueError,KeyError,OSError): pass
        self.event('INFO', f'Фоновый сервис запущен; {AUTH_REVISION}; Chromium headless')
        if start_worker: threading.Thread(target=self.loop, daemon=True).start()

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
            self.jobs[asset]=job; self.save(job); self.queue.put_nowait(job)
            self.event('INFO',f'{asset}: задание добавлено в очередь')
            return job,True

    def update(self,job,**changes):
        with self.lock:
            job.update(**changes,updatedAt=now()); self.save(job)

    def loop(self):
        while not self.stopping:
            try: job=self.queue.get(timeout=.5)
            except queue.Empty: continue
            try: self.execute(job)
            except Exception:
                self.update(job,state='error',message='Не удалось запустить обработчик. Проверьте Python и зависимости.')
                self.event('ERROR',job['asset']+': ошибка запуска обработчика')
            finally: self.queue.task_done()

    def execute(self,job):
        self.update(job,state='running',progress=1,message='Запуск фонового браузера')
        self.event('INFO',job['asset']+': запуск парсинга 90-дневной карты')
        options={'creationflags':subprocess.CREATE_NO_WINDOW | subprocess.CREATE_NEW_PROCESS_GROUP} if os.name=='nt' else {'start_new_session':True}
        process=subprocess.Popen([sys.executable,'-u',str(Path(__file__).with_name('worker.py'))],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,text=True,encoding='utf-8',env={**os.environ,'PWDEBUG':'0','COINGLASS_DATA_DIR':str(self.directory.resolve())},**options)
        self.process=process
        process.stdin.write(json.dumps({k:job[k] for k in ('id','asset','params')})+'\n'); process.stdin.close()
        output=queue.Queue()
        def consume():
            for line in process.stdout:
                try: output.put(json.loads(line))
                except ValueError: pass
        reader=threading.Thread(target=consume,daemon=True); reader.start()
        deadline=time.monotonic()+self.timeout; result=None; failure=None
        try:
            while process.poll() is None or reader.is_alive() or not output.empty():
                if self.stopping or time.monotonic()>deadline:
                    failure='Задание остановлено' if self.stopping else 'Превышено время парсинга (20 минут)'
                    self.kill(process); break
                try: item=output.get(timeout=.2)
                except queue.Empty: continue
                if item.get('kind')=='result': result=item['result']
                elif item.get('kind')=='error': failure=item['message']; self.event('ERROR',job['asset']+': '+failure)
                elif item.get('kind') in ('log','progress'):
                    message=item.get('message','')
                    self.update(job,progress=max(job['progress'],min(99,int(item.get('progress',job['progress'])))),message=message)
                    self.event('INFO',job['asset']+': '+message)
            code=process.wait(timeout=10)
            if code==0 and result and not failure:
                self.update(job,state='done',progress=100,message='Уровни обновлены',result=result)
                self.event('INFO',f"{job['asset']}: готово, значимых уровней: {len(result['levels'])}")
            else:
                self.update(job,state='error',message=failure or 'Обработчик завершился без результата')
                self.event('ERROR',job['asset']+': '+job['message'])
        finally:
            if process.poll() is None: self.kill(process)
            process.stdout.close(); self.process=None
            # Keep at most 20 diagnostic runs; credentials and latest snapshots are outside this directory.
            runs=self.directory/"runs"
            if runs.exists():
                folders=sorted((p for p in runs.iterdir() if p.is_dir()),key=lambda p:p.stat().st_mtime,reverse=True)
                for folder in folders[20:]: shutil.rmtree(folder)

    @staticmethod
    def kill(process):
        if process.poll() is not None: return
        if os.name=='nt': subprocess.run(['taskkill','/PID',str(process.pid),'/T','/F'],capture_output=True,creationflags=subprocess.CREATE_NO_WINDOW,timeout=10)
        else:
            try: os.killpg(process.pid,signal.SIGKILL)
            except ProcessLookupError: pass
        process.wait(timeout=10)

    def close(self):
        self.stopping=True
        if self.process: self.kill(self.process)


class Handler(BaseHTTPRequestHandler):
    manager=None
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
        url=urlsplit(self.path)
        with self.manager.lock:
            if url.path=='/status':
                asset=parse_qs(url.query).get('asset',[''])[0]
                if asset: body={'job':self.manager.jobs.get(asset)}
                else: body={'jobs':[{k:v for k,v in j.items() if k!='result'} for j in sorted(self.manager.jobs.values(),key=lambda j:j['updatedAt'],reverse=True)[:30]],'headless':True}
                self.respond(200,body)
            elif url.path=='/events': self.respond(200,{'data':list(self.manager.events)})
            else: self.respond(404,{'error':'Not found'})
    def do_POST(self):
        if not self.authorized(): return
        if self.path!='/jobs': self.respond(404,{'error':'Not found'}); return
        try:
            size=int(self.headers.get('Content-Length','0'))
            if not 0<size<=8192: raise ValueError('Неверный размер запроса')
            data=json.loads(self.rfile.read(size))
            if not isinstance(data,dict): raise ValueError('Неверный запрос')
            job,created=self.manager.submit(data.get('asset'),data.get('params',{}))
            self.respond(202 if created else 409,{'job':job,'error':None if created else 'Для актива уже выполняется задание'})
        except (ValueError,TypeError): self.respond(400,{'error':'Некорректные параметры или очередь заполнена'})


if __name__=='__main__':
    os.umask(0o077)
    Handler.manager=Manager(os.environ.get('COINGLASS_DATA_DIR','./coinglass-data'))
    Handler.token=os.environ.get('COINGLASS_TOKEN','')
    server=ThreadingHTTPServer((os.environ.get('COINGLASS_HOST','127.0.0.1'),int(os.environ.get('COINGLASS_PORT','8090'))),Handler)
    def stop(*_):
        Handler.manager.close(); threading.Thread(target=server.shutdown,daemon=True).start()
    signal.signal(signal.SIGTERM,stop); signal.signal(signal.SIGINT,stop)
    try: server.serve_forever()
    finally: server.server_close(); Handler.manager.close()
