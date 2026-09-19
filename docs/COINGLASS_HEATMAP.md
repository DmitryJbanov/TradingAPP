# CoinGlass Heatmap · Model 3

Добавьте индикатор через «Индикаторы → CoinGlass Heatmap · Model 3» на странице пары.
Нажмите «Загрузить карту CoinGlass». Сбор идёт в headless Chromium в сервисе
CoinGlass; снимки сохраняются в подкаталоге `heatmap` существующего Docker-тома.
Статус опрашивается каждые пять секунд. Повторный сбор не удаляет предыдущий снимок
при ошибке. Старый 90-дневный индикатор работает независимо.

Поддержан исходный режим прототипа: Model 3, объединённая карта по базовому активу,
365 дней. Он подходит для криптопар в USD/USDT/USDC. Данные извлекаются через тот же
frontend-вызов `89390.Yxh`, который используется в `coinglass_heatmap`.
Сохранённая сессия из `COINGLASS_SESSION_FILE` применяется при наличии. Новый вход
и прохождение проверки сайта автоматически не выполняются. При изменении модуля
CoinGlass сбор покажет ошибку; исходный JSON можно импортировать вручную.

Настройки: порог 0–100%, логарифмическая/линейная/перцентильная шкала,
цвета CoinGlass/Огонь/Лёд/Монохром, показ и число уровней на основном графике.
Настройки сохраняются вместе с индикатором. Скрытие и удаление убирают его уровни.
Ценовые метки HM копируются нажатием, как метки существующего CoinGlass.

Тепловая карта показывает все исходные ячейки по индексам времени CoinGlass.
Даты не выдумываются: исходный формат не задаёт однозначного соответствия X-индекса
свечам. На основной график проецируются сильнейшие ячейки последнего X-среза,
прошедшие текущий порог; это снимок, а не исторические сигналы.

Импорт: JSON из `get_coinglass_liquidations.py`, `export_complete_coinglass_map.js`
или конвертера с `symbol`, `range: "365d"`, возрастающим массивом `y` и
`liquidation_levels` либо `price_levels`. Лимит 50 МБ / 1 млн ячеек. Карта должна
соответствовать активу открытой пары. Импорт живёт до перезагрузки страницы;
серверные снимки сохраняются в Docker-томе. `repair_coinglass_map.py` с фиксированной
осью старого BTC-снимка не используется в интеграции.

Файлы: `coinglass_heatmap/collector.py` — проверка ответа и сбор;
`services/coinglass/heatmap_worker.py` — протокол фонового задания;
`src/domain/heatmap.ts` — формат, пороги, цвета, последний срез;
`src/hooks/use-heatmap.ts` — загрузка/импорт;
`src/components/heatmap.tsx` — Canvas и настройки.

API (оба варианта сервера): GET `/api/coinglass/heatmap-status?symbol=BTCUSDT`,
GET `/api/coinglass/heatmap-snapshot?symbol=BTCUSDT&snapshotId=…`,
POST `/api/coinglass/heatmap-run` с JSON `{ "symbol": "BTCUSDT" }`.

Docker: `docker compose -f compose.yaml -f compose.coinglass.yaml up -d --build`.
Контекст сборки CoinGlass теперь корень проекта, чтобы включить модуль из новой папки.
Проверки: `npm.cmd test`; Python —
`docker compose -f compose.yaml -f compose.coinglass.yaml run --rm --no-deps coinglass python -m unittest test_heatmap test_service`.
