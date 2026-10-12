# Карта проекта DiVMoney · 0.7 BETA

Карта актуальна для версии из корневого `package.json`. React 19 / TypeScript; интерфейс собирается как hosted-приложение через Vite/Vinext или как автономный Node.js runtime. Основной стек разработки и запуска — Node.js 22.13+.

| Задача                                                                   | Основные файлы                                                                                                                                                                                                                   |
| ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Главная, каталог рынков, тема, общая навигация                           | `src/components/terminal.tsx`, `src/components/site-header.tsx`, `app/globals.css`                                                                                                                                               |
| Поиск инструментов и каталог                                             | `src/components/symbol-search.tsx`, `src/server/symbol-service.ts`, `src/domain/catalog.ts`                                                                                                                                      |
| Рабочая область пары, список индикаторов                                 | `src/components/terminal.tsx`, `src/domain/workspace.ts`                                                                                                                                                                         |
| Свечной график и overlays                                                | `src/components/chart.tsx`, `src/components/drawing-tools.tsx`, `src/components/drawings-renderer.ts`                                                                                                                            |
| Fixed Range Volume Profile                                               | drawing tools и renderer в `src/components/`; типы разметки в `src/domain/workspace.ts`                                                                                                                                          |
| Индикаторы                                                               | `src/indicators/`, `src/hooks/use-*.ts`, `src/components/*settings-dialog.tsx`                                                                                                                                                   |
| Pine Script, редактор, MTF-запросы и графические объекты                 | `src/domain/pine-scripts.ts`, `src/indicators/pine-runtime.ts`, `src/indicators/pine-drawings-renderer.ts`, `src/indicators/pine.worker.ts`, `src/hooks/use-pine-scripts.ts`, `src/components/pine-*.tsx`, `docs/PINE_SCRIPT.md` |
| MTM и Stoch RSI                                                          | `src/indicators/`, `src/hooks/use-mtm.ts`, `src/hooks/use-stoch-rsi.ts`                                                                                                                                                          |
| DRZ, SMC, VMC, Sonarlab                                                  | `src/indicators/`, `src/hooks/`, `docs/INDICATORS_DRZ_SMC.md`, `docs/INDICATOR_VMC.md`, `docs/INDICATOR_ORDER_BLOCKS.md`                                                                                                         |
| CoinGlass: уровни ликвидаций и Model 3                                   | `src/components/coinglass*.tsx`, `src/domain/coinglass.ts`, `src/domain/heatmap.ts`, `src/server/coinglass-service.ts`                                                                                                           |
| CoinGlass: сборщик и workers                                             | `services/coinglass/`, `coinglass_heatmap/`                                                                                                                                                                                      |
| Fear & Greed, RSI Heatmap                                                | `src/components/fear-greed-page.tsx`, `src/components/rsi-heatmap-page.tsx`, `src/domain/rsi-heatmap.ts`, `services/coinglass/rsi_heatmap_worker.py`, `services/coinglass/`                                                      |
| Киты Hyperliquid, визуализация Long/Short, список отслеживания и профили | `src/components/whales-page.tsx`, `src/components/whale-analytics.tsx`, `src/domain/whales.ts`, `services/coinglass/whales.py`, `services/coinglass/whale_market_worker.py`, `docs/WHALES.md`                                    |
| Котировки, история свечей, кеш                                           | `src/server/market-service.ts`, `src/domain/market.ts`                                                                                                                                                                           |
| Hosted API-адаптер                                                       | `app/api/*/route.ts`                                                                                                                                                                                                             |
| Автономный Node server/build                                             | `standalone/server.ts`, `standalone/build.mjs`, `standalone/main.tsx`                                                                                                                                                            |
| Саморегистрация, сессии, общий и личные профили (standalone)             | `standalone/profiles.ts`, `src/components/profile-provider.tsx`, `src/hooks/use-resource.ts`, `compose.yaml`, `docs/OPERATIONS.md`                                                                                               |
| Тесты                                                                    | `tests/`, `services/coinglass/test_*.py`                                                                                                                                                                                         |

## Основные страницы

- `/` — каталог рынков.
- `/pair/[symbol]` — рабочая область инструмента.
- `/fear-greed` — индекс Fear & Greed.
- `/rsi-heatmap` — карта RSI top 50 с периодами 4 часа, 24 часа и неделя.
- `/whales`, `/whales/watchlist`, `/whales/[address]` — обзор, отслеживаемые киты и профили Hyperliquid.
- `/notes` — заметки общей рабочей области; старый `/backlog` ведёт на ту же страницу.

Общие тема и расположение навигации задаются общими компонентами, а не отдельными темами страниц.

Standalone требует входа; регистрация открытая. SQLite в постоянном volume хранит учетные записи, сессии и значения `vector.*` выбранного профиля. Общий профиль редактируется всеми вошедшими пользователями; личные профили — только владельцем. Список отслеживаемых китов хранится сервисом CoinGlass и общий для экземпляра. Hosted-сборка не включает этот SQLite API.

В общей верхней панели на всех страницах отображаются часы UTC/МСК и раскрываемый список торговых сессий. На главной также показано актуальное значение Fear & Greed из последнего снимка CMC. Для избранных пар вне основного каталога котировки и суточные изменения загружаются отдельным пакетным запросом Binance Futures. Заголовки столбцов публичного рейтинга китов сортируют таблицу по соответствующим полям.

## Индикаторы и графические инструменты

Реестр в `src/domain/workspace.ts` включает MTM, Stochastic RSI, CoinGlass Heatmap Model 3, CoinGlass liquidation levels, DRZ, SMC, VMC и Sonarlab Order Blocks. Иконка и цвет хранятся в экземпляре и настраиваются через UI. Нажатие на плашку Pine-индикатора открывает его настройки и оформление элементов. Список активных индикаторов отображается над графиком; кружок состояния переключает видимость.

Fixed Range Volume Profile является инструментом разметки: пользователь задаёт два края диапазона, по умолчанию 150 строк и Value Area 70%. MTM показывает импульс `close − close[N]` и SMA этого ряда; значения N и N1 по умолчанию — 60.

## CoinGlass

Сбор данных выполняет отдельный Python-сервис с Playwright/Chromium; Node backend проксирует маршруты `/api/coinglass/*`. Heatmap Model 3 хранит временные ячейки и накладывает их на свечной график; отображение ограничивается загруженными свечами и учитывает выбранный timeframe. Liquidation levels отображаются независимо по уровням объёма. Настройки, палитры/прозрачность и блок кумулятивного объёма документированы в [COINGLASS.md](COINGLASS.md), [COINGLASS_HEATMAP.md](COINGLASS_HEATMAP.md), [COINGLASS_VISUAL_SETTINGS.md](COINGLASS_VISUAL_SETTINGS.md).

В настройках индикатора Model 3 доступны выбор периода и запуск загрузки. Наведение на историческую ячейку Model 3 у свечного графика показывает её цену и объём ликвидности у курсора, включая режим без отдельных линий уровней. Определение ячейки использует те же координаты, что и отрисовка. Кумулятивный профиль строится выше и ниже текущей цены; дельта равна разнице сумм ликвидности в границах отклонения курсора.

Fear & Greed и RSI Heatmap запускают обновление каждые 15 минут, пока страница открыта. На графике Fear & Greed курсор показывает значение и дату. Подсказка точки RSI показывает значения периодов 4ч, 24ч и неделя. Позиции и сделки отслеживаемых китов фильтруются по стороне позиции, тексту монеты и введённому порогу объёма; линии PnL окрашены по знаку.

Заметки используют сохранение `vector.*` активного профиля; при общем профиле все пользователи могут их создавать и редактировать.

## Поддержка карты

Сначала смотрите документ конкретной подсистемы из [индекса документации](../README.md#документация). Серверный запуск за существующим Caddy/NaiveProxy: `compose.server.yaml`, `deploy/caddy-terminal.caddy`, [DEPLOY_CADDY.md](DEPLOY_CADDY.md). Старые патчи, инструкции их применения и пример D1 удалены.

## Рабочая область графика · 11 октября 2026

- `drawing-tools.tsx`: навигация и выбор фигур в одном режиме, отмена до 50 действий через Ctrl+Z; перенос фиксируется одной операцией. История отмены сбрасывается при смене профиля.
- Fixed Range Volume Profile создаётся двумя кликами по началу и концу диапазона свечей, высота рассчитывается по high/low выбранных свечей; четыре угла доступны для изменения диапазона при наведении. Правый клик открывает настройки профиля, количество строк — 10–500.
- `chart.tsx`: таймер закрытия свечи рядом с ценой, одинаковая подпись процентного отклонения на обеих осях, выходные ряды активных индикаторов у курсора. Размер графика подстраивается под оставшуюся высоту окна.
- Инструменты рисования находятся слева; оформление новых фигур раскрывается. Настройки и удаление каждой фигуры доступны по правому клику на ней; отдельного списка объектов нет. Таймфреймы, количество свечей, индикаторы и Pine Editor расположены рядом с названием монеты на широком экране. Каталог индикаторов — две колонки компактных строк (доступные / активные), единая вкладка стратегий.
- `pine-editor.tsx`: правая немодальная панель на всю высоту под общей верхней панелью. На широком экране график занимает оставшуюся ширину.

## Интерфейс графика · 11 октября 2026

Цена текущей свечи и таймер до её закрытия занимают одну метку на правой шкале. Подсказка процентного отклонения на вертикальной шкале скрывается, когда активна кумулятивная визуализация CoinGlass. Строки активных индикаторов показываются, только если в позиции курсора есть хотя бы одно числовое значение. Поиск инструмента расположен в постоянном списке справа, путь-крошки удалён. Верхняя панель стала компактнее при сохранённом размере логотипа.

Pine Editor вынесен в правую панель с ручным изменением ширины. Его краткий заголовок отделён от строки выбора названия, типа и создания скрипта; нижние кнопки компактнее.

## Выбор биржи

`src/server/exchange-service.ts` нормализует каталоги бессрочных USDT/USDC-контрактов, котировки и свечи Binance, OKX, Bybit и MEXC. `src/domain/exchanges.ts` содержит разрешённые источники. Выбор в заголовке графика сохраняется ключом `vector.exchange.v1` в текущем профиле. MTF и Pine-запросы используют тот же источник. См. [MARKET_EXCHANGES.md](MARKET_EXCHANGES.md).

## Отметки сделок китов

`src/domain/whale-chart.ts` проверяет параметры перехода, строит отметки и находит свечу исполнения. `src/indicators/whale-trades-renderer.ts` рисует метки нативным примитивом свечного ряда, добавляет подпись времени на ось и обрабатывает попадание курсора. `src/components/whale-chart-overlay.tsx` загружает профиль, подключает примитив и показывает HTML-подсказку по событиям графика. PairWorkspace подбирает глубину истории для выбранного исполнения; MarketChart центрирует его свечу. См. [WHALES.md](WHALES.md).

Пресеты индикаторов: `src/domain/indicator-presets.ts`, `src/components/indicator-presets.tsx`, `src/hooks/use-shared-indicators.ts`. Серверная проверка: `standalone/profiles.ts`. Пользовательская инструкция: [пресеты](INDICATOR_PRESETS.md).

Общее отображение Pine: `src/indicators/pine-visuals.ts` переносит выходные данные runtime, `pine-visual-renderer.ts` рисует ряды, заливки и сигналы в правильной панели; `pine-drawings-renderer.ts` — объекты и таблицы.

Клиентский LRU-кеш свечей и расчётов последних 10 пар: `src/hooks/pair-cache.ts`. Управление фигурами, настройки FRVP и часового пояса описаны в [CHART_TOOLS.md](CHART_TOOLS.md).
