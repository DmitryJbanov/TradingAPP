# CoinGlass service

Интеграция пользовательских скриптов coinglass_btc90 (3).zip. Инструкция установки, запуска и мониторинга: [docs/COINGLASS.md](../../docs/COINGLASS.md).

Сервис: `python services/coinglass/service.py` из корня проекта. Worker запускается сервисом самостоятельно, всегда headless. Учётные данные в репозиторий не входят.

Тесты: `python -m unittest discover -s services/coinglass -p "test_*.py"`.

examples/observations-20260905.json — исторический снимок из пользовательского архива только для регрессионного теста алгоритма. Он не загружается в рабочую систему как актуальные данные.
