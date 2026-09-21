# Карта DiVMoney

Приложение React 19 / TypeScript. Два способа запуска используют один UI:
Next/Vinext (`app/`) и переносимый Vite + Node (`standalone/`). Версия 0.1.3.

| Задача | Начать здесь | Следующий файл при необходимости |
| --- | --- | --- |
| Главная, таблица, избранное, настройки тем | `src/components/terminal.tsx`: Terminal | `app/globals.css` |
| Страница пары, менеджер индикаторов | тот же файл: PairWorkspace | `src/domain/workspace.ts` |
| Поиск всех пар Binance | `src/components/symbol-search.tsx` | `src/server/symbol-service.ts` |
| Темы, отступы, адаптивность | `app/globals.css` | выбор темы в Terminal |
| График, метка дельты, уровни | `src/components/chart.tsx` | `coinglass-price-copy.ts`, `drawing-tools.tsx` |
| Иконки индикаторов | `src/components/indicator-icon.tsx` | `IndicatorInstance.icon`, менеджер в PairWorkspace |
| Общие сохранённые индикаторы | `src/hooks/use-shared-indicators.ts` | `src/domain/shared-indicators.ts` |
| CoinGlass: UI | `src/components/coinglass-settings-dialog.tsx` | `coinglass-map.tsx`, `coinglass-candles.tsx` |
| CoinGlass: данные | `src/hooks/use-coinglass.ts` | `src/server/coinglass-service.ts`, `src/domain/coinglass.ts` |
| CoinGlass Heatmap Model 3 | `docs/COINGLASS_HEATMAP.md`, `src/components/heatmap.tsx` | `src/domain/heatmap.ts`, `src/hooks/use-heatmap.ts`, `coinglass_heatmap/collector.py` |
| Расчёты индикаторов | `src/indicators/` (имя индикатора) | соответствующий хук в `src/hooks/` |
| Свечи и котировки | `src/server/market-service.ts` | `binance-history.ts`, `src/domain/market.ts` |
| Торговые сессии обеих страниц | `src/components/sessions.tsx` | тесты сессий в `tests/core.test.ts` |
| Беклог главной и /backlog | `src/domain/backlog.ts` | `src/components/backlog-page.tsx` |
| Сборка и HTTP smoke | `standalone/build.mjs`, `tests/smoke.mjs` | `standalone/server.ts` |

Особенности: один поисковый запрос фильтрует локальный список и вызывает поиск
Binance; настройки хранятся под прежними ключами `vector.*`; палитра свечного
графика независима от темы сайта. CoinGlassMap держит состояние выбора пика и
получает свечной предпросмотр через `beforeTable`.

Проверки: `tests/run.mjs` собирает `tests/core.test.ts`, который импортирует
тесты подсистем. `tests/interface.test.ts` проверяет попадание в ценовые метки
и сохранение иконок. Для конкретной интеграции читайте соответствующий документ
в `docs/`, а не все документы сразу.

Stochastic RSI: `src/indicators/stoch-rsi.ts`, `stoch-rsi-renderer.ts`,
`src/hooks/use-stoch-rsi.ts`, `src/components/stoch-rsi-settings-dialog.tsx`.
Отдельная панель с K/D и уровнями 20/50/80; параметры по умолчанию 3/3/14/14.
Открытый график запрашивает две последние свечи каждые 2 секунды; их серверный
кеш — 2 секунды. Полная история загружается отдельно.

Оставшиеся задачи: Fixed Range Volume Profile,
реальные логотипы активов. Они не входят в выполненные 15 пунктов версии 0.1.3.

CoinGlass Liquidation Map: `services/coinglass/frontend_api.py` вызывает функцию
клиента CoinGlass `bvP` в браузерной сессии; `collector.py` проверяет ответ и
суммирует уровни. Периоды: 1, 7, 30, 90, 180, 365 дней; выбор рядом с кнопкой
парсинга. Лимит запроса 1–1440 — в визуальных настройках. Новый период требует
нового сбора; предпросмотр сохранённого снимка сохраняет его исходный период.
Сервис сохраняет отдельные обработчики Liquidation Map и Heatmap Model 3.

Жизненный цикл CoinGlass: `services/coinglass/persistent_worker.py` держит
процесс `worker.py --persistent`; `Manager` в `service.py` запускает его лениво,
повторно использует между заданиями и восстанавливает после сбоя.
`HeatmapManager` хранит отдельные результаты Model 3, но использует очередь,
блокировку и `PersistentWorker` основного `Manager`. Только основной менеджер
владеет потоком очереди и завершает браузер. `worker.py` выбирает сборщик по типу
задания; `heatmap_worker.py` получает существующий `BrowserRuntime`.
`compose.yaml` устанавливает оба сервиса сразу; `compose.coinglass.yaml`
оставлен для совместимости команд. Контекст сборки CoinGlass — корень проекта,
чтобы включить пакет `coinglass_heatmap`.
