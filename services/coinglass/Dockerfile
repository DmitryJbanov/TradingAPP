FROM python:3.12-slim-bookworm
ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1 PLAYWRIGHT_BROWSERS_PATH=/opt/browsers COINGLASS_HOST=0.0.0.0 COINGLASS_PORT=8090 COINGLASS_DATA_DIR=/data
ENV XDG_CONFIG_HOME=/tmp/coinglass-config XDG_CACHE_HOME=/tmp/coinglass-cache CHROME_CONFIG_HOME=/tmp/coinglass-config
WORKDIR /app
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt && python -m playwright install --with-deps chromium && apt-get update && apt-get install -y --no-install-recommends tesseract-ocr && rm -rf /var/lib/apt/lists/* && useradd --uid 10001 --create-home collector && mkdir /data && chown collector:collector /data && chmod -R a+rX /opt/browsers
COPY collector.py auth.py login_flow.py browser_runtime.py map_navigation.py diagnose.py markets.py worker.py service.py selection.py ./
RUN python -c "import service, worker, collector, selection"
USER collector
EXPOSE 8090
CMD ["python", "service.py"]
