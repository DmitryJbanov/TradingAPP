# Карта проекта DiVMoney · 0.5 ALFA

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
| Fear & Greed, RSI Heatmap                                                | `src/components/fear-greed-page.tsx`, `src/components/rsi-heatmap-page.tsx`, `services/coinglass/`                                                                                                                               |
| Киты Hyperliquid, визуализация Long/Short, список отслеживания и профили | `src/components/whales-page.tsx`, `src/components/whale-analytics.tsx`, `src/domain/whales.ts`, `services/coinglass/whales.py`, `services/coinglass/whale_market_worker.py`, `docs/WHALES.md`                                    |
| Котировки, история свечей, кеш                                           | `src/server/market-service.ts`, `src/domain/market.ts`                                                                                                                                                                           |
| Hosted API-адаптер                                                       | `app/api/*/route.ts`                                                                                                                                                                                                             |
| Автономный Node server/build                                             | `standalone/server.ts`, `standalone/build.mjs`, `standalone/main.tsx`                                                                                                                                                            |
| Тесты                                                                    | `tests/`, `services/coinglass/test_*.py`                                                                                                                                                                                         |

## Основные страницы

- `/` — каталог рынков.
- `/pair/[symbol]` — рабочая область инструмента.
- `/fear-greed` — индекс Fear & Greed.
- `/rsi-heatmap` — карта RSI top 50 с периодами 4 часа, 24 часа и неделя.
- `/whales`, `/whales/watchlist`, `/whales/[address]` — обзор, отслеживаемые киты и профили Hyperliquid.
- `/backlog` — внутренний список задач/беклог.

Общие тема и расположение навигации задаются общими компонентами, а не отдельными темами страниц.

На главной отображаются UTC и московское время, а также актуальное значение Fear & Greed из последнего снимка CMC. Для избранных пар вне основного каталога котировки и суточные изменения загружаются отдельным пакетным запросом Binance Futures. Заголовки столбцов публичного рейтинга китов сортируют таблицу по соответствующим полям.

## Индикаторы и графические инструменты

Реестр в `src/domain/workspace.ts` включает MTM, Stochastic RSI, CoinGlass Heatmap Model 3, CoinGlass liquidation levels, DRZ, SMC, VMC и Sonarlab Order Blocks. Иконка и цвет хранятся в экземпляре и настраиваются через UI. Нажатие на плашку Pine-индикатора открывает его настройки и оформление элементов. Список активных индикаторов отображается над графиком; кружок состояния переключает видимость.

Fixed Range Volume Profile является инструментом разметки: пользователь задаёт два края диапазона, по умолчанию 150 строк и Value Area 70%. MTM показывает импульс `close − close[N]` и SMA этого ряда; значения N и N1 по умолчанию — 60.

## CoinGlass

Сбор данных выполняет отдельный Python-сервис с Playwright/Chromium; Node backend проксирует маршруты `/api/coinglass/*`. Heatmap Model 3 хранит временные ячейки и накладывает их на свечной график; отображение ограничивается загруженными свечами и учитывает выбранный timeframe. Liquidation levels отображаются независимо по уровням объёма. Настройки, палитры/прозрачность и блок кумулятивного объёма документированы в [COINGLASS.md](COINGLASS.md), [COINGLASS_HEATMAP.md](COINGLASS_HEATMAP.md), [COINGLASS_VISUAL_SETTINGS.md](COINGLASS_VISUAL_SETTINGS.md).

## Поддержка карты

Сначала смотрите документ конкретной подсистемы из [индекса документации](../README.md#документация). `docs/APPLY_*_PATCH.md` и `docs/RELEASE_0.1.3.md` сохранены только как исторические записи и не описывают текущую установку.
