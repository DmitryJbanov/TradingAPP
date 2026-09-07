# Документация по коду

## Карта файлов

| Файл                           | Что менять здесь                                                             |
| ------------------------------ | ---------------------------------------------------------------------------- |
| `src/domain/market.ts`         | Общие DTO, допустимые таймфреймы, форматирование, формула процента           |
| `src/domain/catalog.ts`        | Каталог и метаданные инструментов                                            |
| `src/domain/demo.ts`           | Генерация маркированных синтетических OHLC, согласованных между таймфреймами |
| `src/domain/workspace.ts`      | Контракты panes, drawings, индикаторов и реестр будущих расчётов             |
| `src/server/market-service.ts` | Получение котировок/свечей, кеш, журнал, HTTP handler                        |
| `src/hooks/use-resource.ts`    | Polling, отмена устаревших запросов, localStorage                            |
| `src/components/terminal.tsx`  | Главная страница, Backend, PairWorkspace, настройки и менеджер               |
| `src/components/chart.tsx`     | Chart API lifecycle, series, crosshair, scale options, цвета                 |
| `src/components/sessions.tsx`  | IANA timezone → UTC интервалы, активность сессий, часы                       |
| `src/components/controls.tsx`  | Общий доступный селект на Radix/Shadcn                                       |
| `app/globals.css`              | Theme tokens, terminal layout, мобильные breakpoints                         |
| `app/page.tsx`                 | Hosted главная                                                               |
| `app/pair/[symbol]/page.tsx`   | Hosted маршрут инструмента                                                   |
| `app/api/*/route.ts`           | Тонкие HTTP wrappers для общего handler                                      |
| `standalone/server.ts`         | Node server, типы MIME, static serving, shutdown                             |
| `standalone/main.tsx`          | SPA entrypoint для автономной поставки                                       |
| `standalone/build.mjs`         | Vite frontend + esbuild backend bundle                                       |
| `tests/core.test.ts`           | Проверки домена и API без сетевой зависимости                                |
| `components/ui`                | Предустановленные базовые UI primitives; стили композиции в app/globals.css  |

`db/`, `examples/`, `build/`, `worker/` и часть scripts — инфраструктура hosted-starter. D1/R2 выключены, приложение не использует демонстрационную БД. Они не требуются в готовом standalone release.

## Ключевые функции

### `markets(config, force)`

Возвращает MarketResponse. Начинает с demo-каталога, заменяет успешно полученные инструменты настоящими данными. Отсутствие одной пары не блокирует остальные. Биржевые поля приводятся к number, price проверяется на finite/positive. Внешние запросы Binance и Twelve Data независимы и выполняются параллельно. Приватный ключ никогда не возвращается клиенту.

### `candles(symbol, timeframe, config, force)`

Возвращает CandleResponse с 400 свечами или доступным количеством от провайдера. При ошибке провайдера возвращает DEMO и warning. Только известные инструменты и четыре перечисленных interval допускаются обработчиком API.

### `cached(key, ttl, force, fn)`

Ограниченный Map с TTL и отдельный Map текущих Promise. Вызов fn исполняется один раз для конкурентных одинаковых запросов в одном процессе. Ошибка не оставляет вечную pending-запись: очистка в finally.

### `useResource<T>(url, period)`

Возвращает `{data,error,loading,refresh}`. На смене URL очищает прежние данные. На сетевой ошибке при polling оставляет последние успешно полученные данные и показывает error; в интерфейсе они явно названы устаревшими. При размонтировании очищает интервал и отменяет fetch. Во вкладке в фоне новых периодических запросов нет.

### `MarketChart`

Создаёт один chart instance в effect и удаляет в cleanup. Отдельные effects обновляют series data и палитру. `current` ref держит последний close, чтобы callback crosshair использовал актуальную цену. API chart instance не сохраняется в serializable workspace.

OHLC tooltip — данные выбранной свечи. Процент — математическое сравнение цены на координате курсора и текущего close. При выходе за рабочую область подпись исчезает. Знак и формула одинаковы на нижней оси и рядом с горизонтальной линией.

### `sessionInfo`

Использует `Intl.DateTimeFormat` с явным timeZone. Переводит локальное начало сессии в UTC-положение; сессию через границу суток UI разбивает на два сегмента. Проверяет локальный weekday. Календаря биржевых праздников нет.

## UI-композиция и доступность

Tabs/Select/Dialog/Switch/Table используют штатные Radix/Shadcn primitives с управлением фокусом и клавиатурой. Кнопки без текста имеют aria-label, ссылки позволяют открыть график в новой вкладке. Смысл данных не передаётся только цветом: проценты имеют знак, источник — текстовую метку. Таблица прокручивается по горизонтали в собственном контейнере, боковая колонка на узких экранах переносится вниз.

Canvas-график не предоставляет полного screen-reader доступа ко всем историческим свечам: доступен заголовок, текущее OHLC и controls. Полноценная доступная таблица истории — возможное последующее расширение.

## Правила изменения

- Добавляйте новый interval одновременно в тип Timeframe, intervals, controls и adapter mapping Twelve Data.
- Не передавайте vendor JSON напрямую графику.
- Не убирайте метки demo/failure для визуальной привлекательности.
- Новые секреты только через серверный Config/env; не используйте клиентские VITE*/NEXT_PUBLIC* для ключей.
- Сохраняйте cleanup для timers, subscriptions, observers и chart instances.
- При изменении localStorage schema повышайте версию ключа или добавляйте миграцию.
