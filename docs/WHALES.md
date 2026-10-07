# Киты Hyperliquid

Раздел «Киты» использует общий SiteHeader и тему сайта:

- `/whales` — обзор CoinGlass: показатели крупных позиций, Long/Short по монетам, готовая история трейдеров и таблица позиций. Ниже расположен отдельный публичный рейтинг top 50 Hyperliquid.
- `/whales/watchlist` — сохранённые адреса, имена и последние исполнения.
- `/whales/0x…` — профиль адреса: капитал perpetual, PnL, позиции, сделки, открытые ордера и движения средств за 30 дней.

Адрес добавляется формой на странице отслеживания или звездой рядом с кошельком. Список общий для установки сервера, максимум 20 адресов. Повторное добавление с именем обновляет подпись; удаление останавливает фоновое наблюдение.

## Обзор CoinGlass

`services/coinglass/whale_market_worker.py` использует публичный клиент CoinGlass в той же очереди браузерного сборщика, что и карты:

- `/api/hyperliquid/topPosition` — полный возвращённый CoinGlass список крупных позиций. Показатели позиций, маржи, PnL и Funding суммируются по этому списку и разделяются по знаку размера позиции. Funding отображается с обратным знаком `fundingFee`, как на исходной странице.
- `/api/hyperliquid/position/symbol/shortAndLong` — опубликованные количества трейдеров и проценты Long/Short по монетам.
- `/api/hyperliquid/position/user/count` — опубликованная история. Параметры: `coin=all|BTC|…`, `interval=minute|hour|day`.

«1 день» означает интервал точек, а не окно последних суток. График показывает весь возвращённый исторический ряд с двумя шкалами и подсказками. Линия «Трейдеры» равна сумме счётчиков Long и Short; отношение — Long / Short. При нулевом Short значение не определено.

Общие показатели не рассчитываются по рейтингу top 50. Рейтинг из `stats-data.hyperliquid.xyz/Mainnet/leaderboard` — отдельная таблица. Состав, охват, глубина истории и задержка общих показателей определяются CoinGlass. При сбое показывается ошибка и последний успешный снимок CoinGlass; данные маленькой выборки не подставляются вместо общих.

`WhaleMarketManager` разделяет очередь и браузер с существующим Manager. Запросы одинаковой монеты/интервала объединяются, успешные снимки хранятся в `/data/whale-market/snapshots/`. Обновление запрашивается при открытой странице с серверным TTL 60 секунд. Старый `ratio-history.json` из предыдущей реализации не используется для общего графика.

## Профили и фоновое наблюдение

Профили и сделки поступают непосредственно из публичного [Hyperliquid Info API](https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api/info-endpoint), без API-ключа и подключения кошелька.

Позиции и ордера профиля охватывают основной perpetual DEX; HIP-3 позиции других DEX и spot-баланс не включены. Spot-исполнения исключены; доступные perpetual исполнения сохраняются, включая HIP-3. PnL берётся из perpetual portfolio. Отсутствующие значения отображаются как «—».

`services/coinglass/whales.py` проверяет отслеживаемые адреса примерно раз в минуту, даже при закрытой странице. Максимум четыре потока. Список, профили и архив сделок сохраняются в `/data/whales/` на volume `coinglass-data`.

Архив ограничен 5000 исполнениями на адрес, в профиль передаются последние 200. Обновления используют `userFillsByTime`, перекрытие границы времени и максимум пять страниц за проход; доступная глубина и полнота при высокой активности ограничены API. Исполнения объединяются по строковому ID без дублей. Отслеживание не является потоком каждого тика.

## API и исходники

- `GET /api/coinglass/whales-market?coin=all&interval=day` — `{snapshot, loading, error}` с данными CoinGlass.
- `GET /api/coinglass/whales-overview` — отдельная выборка top 50 публичного рейтинга Hyperliquid.
- `GET /api/coinglass/whales-profile?address=0x…` — профиль.
- `GET /api/coinglass/whales-watchlist` — сохранённые адреса и краткие профили.
- `POST /api/coinglass/whales-watch` — JSON `{ "action": "add|remove|rename", "address": "0x…", "label": "имя" }`.
- `refresh=1` запрашивает обновление; параллельные задания объединяются.

`collectedAt`/`addedAt` — ISO 8601 UTC; времена сделок, ордеров, переводов и графика — UNIX milliseconds. Node/Vinext проксирует запросы через `src/server/coinglass-service.ts`; сервис защищается `COINGLASS_TOKEN`. Проверяются адреса, действия, интервалы, размер тела и origin POST.

UI: `src/components/whales-page.tsx`, `src/components/whale-analytics.tsx`; типы: `src/domain/whales.ts`; сервер: `services/coinglass/whales.py`, `services/coinglass/whale_market_worker.py`, `services/coinglass/service.py`.