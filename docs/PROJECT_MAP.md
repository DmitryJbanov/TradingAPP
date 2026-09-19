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

Оставшиеся задачи: периоды CoinGlass, Fixed Range Volume Profile, Stochastic RSI,
реальные логотипы активов. Они не входят в выполненные 15 пунктов версии 0.1.3.
