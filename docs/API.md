# HTTP API

Документ обновлён для DiVMoney 0.5 ALFA. API выдаёт JSON и используется обоими runtime. Маршруты, связанные с CoinGlass, приведены ниже; детали форматов снимков см. в документах [CoinGlass](COINGLASS.md) и [Model 3](COINGLASS_HEATMAP.md).

Одинаковый API доступен в hosted и standalone сборке. Формат JSON, методы GET, `Cache-Control: no-store`. Кеш приложения живёт на сервере независимо от HTTP-заголовка. Все даты ISO 8601 UTC; время свечей UNIX seconds.

## Киты Hyperliquid

API отслеживания китов: `GET /api/coinglass/whales-market?coin=all&interval=day` (общие данные CoinGlass), `GET /api/coinglass/whales-overview` (отдельный top 50 leaderboard), `GET /api/coinglass/whales-profile?address=0x…`, `GET /api/coinglass/whales-watchlist`, `POST /api/coinglass/whales-watch`. Форматы, сохранение списка и ограничения источника описаны в [Китах Hyperliquid](WHALES.md#api-и-исходники).

## `GET /api/markets`

Необязательный параметр `refresh=1` обходит TTL кеша.

```json
{
  "asOf": "2026-09-06T10:00:00.000Z",
  "warning": "При наличии проблем: пояснение источников",
  "data": [
    {
      "symbol": "BTCUSDT",
      "base": "BTC",
      "name": "Bitcoin",
      "category": "crypto",
      "sector": "Layer 1",
      "quote": "USDT",
      "seed": 97432,
      "price": 100000,
      "change": 2.1,
      "volume": 1200000000,
      "high": 101000,
      "low": 97500,
      "source": "live",
      "provider": "Binance",
      "asOf": "2026-09-06T09:59:59.000Z"
    }
  ]
}
```

Пример схематический, числа не являются рыночным снимком. seed — базовое значение генератора demo, не финансовая метрика. Source сейчас `live` или `demo`; тип `stale` зарезервирован. При потере своего backend UI показывает ошибку и сохраняет последнюю выборку с предупреждением об устаревании.

Категории: crypto/stocks/indices/forex. Сортировка и фильтрация основного каталога выполняются клиентом. Для поиска биржевых инструментов вне него используется `GET /api/symbols`; цены неизвестных избранных фьючерсов загружаются через `/api/markets/favorites`.

Volume: Binance quoteVolume в USDT; Twelve Data volume × close — оценка денежного объёма, не точный оборот. Для forex/index без volume возвращается 0, UI показывает прочерк.

## `GET /api/markets/favorites?symbols=FUTURES:ABCUSDT,...`

Возвращает `MarketResponse` для избранных фьючерсных пар, которых нет в основном каталоге. `symbols` — список через запятую, максимум 100 позиций; можно передать префикс `FUTURES:` или `SPOT:`, а проверка котировки выполняется на Binance Futures. Ответ содержит цену, изменение за 24 часа, оборот, high/low и время тикера. Индивидуальные наборы кешируются 10 секунд; общий тикер Binance Futures также кешируется на 10 секунд.

## `GET /api/candles?symbol=BTCUSDT&interval=1h`

| Поле     | Значения                                      |
| -------- | --------------------------------------------- |
| symbol   | Символ из каталога; default BTCUSDT           |
| interval | 15m, 30m, 1h, 2h, 4h, 8h, 12h, 1d; default 1h |
| refresh  | 1 для обхода TTL                              |
| demo     | 1 для явного запроса DEMO                     |

```json
{
  "source": "demo",
  "provider": "Demo",
  "asOf": "2026-09-06T10:00:00.000Z",
  "warning": "Источник недоступен: показаны демонстрационные свечи",
  "data": [
    {
      "time": 1788688800,
      "open": 100,
      "high": 105,
      "low": 98,
      "close": 103,
      "volume": 1200
    }
  ]
}
```

Fallback возвращает HTTP 200 и `source=demo`. `count` принимает целое число 300–4000, default=1000; неправильное значение возвращает 400. Binance использует обратную пагинацию; частичная пригодная история остаётся live с warning. Необязательный tickSize содержит размер тика биржи. Подробнее: [история и индикаторы](INDICATORS_DRZ_SMC.md).

## `GET /api/candles/latest?symbol=BTCUSDT&interval=1h`

Возвращает тот же `CandleResponse`, но `data` содержит только две последние свечи. Параметры `symbol`, `interval`, `refresh=1` и `demo=1` работают так же, как у полной истории; параметр `count` не используется. При опросе раз в 30 секунд клиент сверяет источник и время, обновляет текущую свечу или добавляет новую. При разрыве истории либо смене источника перезагружает полный диапазон. Опрос происходит только при видимой вкладке, поэтому после длительной паузы перед сравнением данных возможна задержка до следующего опроса.

## `GET /api/health`

```json
{
  "status": "ok",
  "uptime": 125,
  "time": "2026-09-06T10:00:00.000Z",
  "providers": {
    "Binance": { "status": "connected", "time": "2026-09-06T09:59:50.000Z" }
  },
  "cacheEntries": 2,
  "mode": "auto",
  "logScope": "current process / worker isolate"
}
```

Это liveness собственного backend. `status=ok` не означает доступность поставщиков. Их последнее известное состояние вынесено в providers. `connected` означает, что предыдущий запрос удался, а не постоянное соединение WebSocket.

## `GET /api/logs`

`{data: LogEntry[], scope: "current process / worker isolate"}`. LogEntry: id/time/level/message. Последние 60 событий, в порядке от старых к новым; UI разворачивает порядок и показывает последние восемь подходящего уровня. Журнал не включает API-ключи, внешние URL с query string или HTTP request headers.

## Ошибки

| HTTP | Причина                                                                       |
| ---- | ----------------------------------------------------------------------------- |
| 400  | Неизвестный symbol или interval                                               |
| 404  | Неизвестный API маршрут                                                       |
| 405  | Метод кроме GET; hosted router также может обрабатывать метод на своём уровне |
| 500  | Ошибка собственного обработчика                                               |

Тело: `{ "error": "Описание" }`. Ошибки провайдера в этом релизе переводятся в маркированный demo-response; клиент обязан проверять source.

## Ручная проверка

```bash
curl -fsS http://localhost:3000/api/health
curl -fsS 'http://localhost:3000/api/candles?symbol=BTCUSDT&interval=4h'
curl -fsS 'http://localhost:3000/api/markets?refresh=1'
curl -fsS http://localhost:3000/api/logs
```

## Дополнительные маршруты 0.5 ALFA

### Поиск и страницы

- `GET /api/symbols?q=BTC` — поиск/подсказки инструментов Binance.
- `GET /fear-greed` и `GET /rsi-heatmap` — страницы интерфейса; это не API-маршруты.
- `GET /backlog` — страница внутреннего беклога.

### CoinGlass

Общие маршруты: `GET /api/coinglass/status`, `GET /api/coinglass/snapshot?symbol=BTCUSDT[&snapshotId=…]`, `POST /api/coinglass/run` и `POST /api/coinglass/preview`. POST принимает JSON с `symbol` и `params`; запросы проверяют Origin, content-type, размер и допустимость параметров.

Специализированные маршруты используют тот же backend:

| Функция            | Статус                                         | Снимок                                                          | Запуск                                |
| ------------------ | ---------------------------------------------- | --------------------------------------------------------------- | ------------------------------------- |
| Heatmap Model 3    | `/api/coinglass/heatmap-status?symbol=BTCUSDT` | `/api/coinglass/heatmap-snapshot?symbol=BTCUSDT[&snapshotId=…]` | `POST /api/coinglass/heatmap-run`     |
| Fear & Greed       | `/api/coinglass/fear-greed-status`             | `/api/coinglass/fear-greed-snapshot`                            | `POST /api/coinglass/fear-greed-run`  |
| RSI Heatmap top 50 | `/api/coinglass/rsi-heatmap-status`            | `/api/coinglass/rsi-heatmap-snapshot`                           | `POST /api/coinglass/rsi-heatmap-run` |

Fear & Greed запускается JSON `{ "symbol": "CMC" }`. Снимок включает историю и поле `current`, получаемое из latest endpoint CoinMarketCap; обновление источника происходит примерно раз в 15 минут. RSI Heatmap принимает `{ "symbol": "TOP50", "params": { "period": "4h" } }`; допустимые `period`: `4h`, `24h`, `1w`. Heatmap Model 3 принимает symbol пары и период карты в `params.range`. Ответы снимков содержат формат, зависящий от подсистемы. Endpoint CoinGlass требует настроенный фоновый Python-сервис; иначе backend возвращает ошибку конфигурации/связи.

## Дополнение VMC

`GET /api/candles` принимает `interval=15m|30m|1h|2h|4h|8h|12h|1d`. `demo=1` явно запрашивает согласованные синтетические данные; `refresh=1` обходит TTL. Размер ответа задаётся count. Неизвестные интервалы отклоняются с 400. VMC/DRZ/SMC рассчитываются в клиенте, отдельного endpoint для индикаторов нет.
