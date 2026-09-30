# CoinGlass service

Python worker для сбора и хранения данных CoinGlass, используемый терминалом 0.2.0. Docker Compose запускает его вместе с Node/React приложением. Настройка переменных и сервисов описана в [руководстве эксплуатации](../../docs/OPERATIONS.md), API — в [документации API](../../docs/API.md), поведение карт — в [документации CoinGlass](../../docs/COINGLASS.md).

Локальный запуск из корня проекта: `python services/coinglass/service.py`. Сервис запускает worker самостоятельно и работает в headless режиме. Учётные данные и сессии не включаются в репозиторий; передавайте их через `coinglass-secrets/` или конфигурацию окружения.

Тесты: `python -m unittest discover -s services/coinglass -p "test_*.py"`.

`examples/observations-20260905.json` — зафиксированный регрессионный пример, не актуальные котировки.
