# HTTP API

Одинаковый API доступен в hosted и standalone сборке. Формат JSON, методы GET, `Cache-Control: no-store`. Кеш приложения живёт на сервере независимо от HTTP-заголовка. Все даты ISO 8601 UTC; время свечей UNIX seconds.

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

Категории: crypto/stocks/indices/forex. Поиск, сортировка и фильтрация выполняются клиентом по полному каталогу. Отдельных серверных search/pagination endpoints нет.

Volume: Binance quoteVolume в USDT; Twelve Data volume × close — оценка денежного объёма, не точный оборот. Для forex/index без volume возвращается 0, UI показывает прочерк.

## `GET /api/candles?symbol=BTCUSDT&interval=1h`

| Поле     | Значения                            |
| -------- | ----------------------------------- |
| symbol   | Символ из каталога; default BTCUSDT |
| interval | 15m, 1h, 4h, 1d; default 1h         |
| refresh  | 1 для обхода TTL                    |

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

Успешный fallback возвращает HTTP 200 и `source=demo`, а не маскирует его под `live`. Историческая пагинация и параметр arbitrary limit не реализованы; размер запроса фиксирован 400.

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
