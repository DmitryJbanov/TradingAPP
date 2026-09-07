# Интеграции

## Binance Market Data

Основа: публичный HTTPS market-data host `https://data-api.binance.vision`. Только чтение котировок; торговые endpoints не используются, Binance API key не нужен.

| Запрос                                             | Использование                              |
| -------------------------------------------------- | ------------------------------------------ |
| `/api/v3/ticker/24hr?symbols=[...]`                | Пакетный ответ для криптовалют из каталога |
| `/api/v3/klines?symbol=...&interval=...&limit=400` | Свечи конкретной пары                      |

Преобразования тикера: lastPrice → price, priceChangePercent → change, quoteVolume → volume, highPrice/lowPrice → high/low, closeTime → asOf. Binance OHLC массив: индексы 0=open time, 1=open, 2=high, 3=low, 4=close, 5=volume; время /1000.

Один пакетный ticker-запрос на кеш/30 секунд в процессе. Свечи — не чаще одного запроса на symbol+interval/15 секунд без ручного refresh. Пакетный ticker-запрос имеет больший weight, чем запрос одного символа; при массовом использовании нужно ввести общий limiter и распределённый кеш. HTTP 429/451/5xx и таймауты не обходятся: создаётся WARN, UI показывает DEMO.

Документация: [Binance Spot Market Data](https://developers.binance.com/en/docs/catalog/core-trading-spot-trading/api/rest-api/market).

## Twelve Data

Серверный адаптер использует `https://api.twelvedata.com/quote` и `/time_series`. Установите `TWELVE_DATA_API_KEY` в окружении, перезапустите backend. Ключ в браузере вводить не требуется.

В quote отправляется список не-криптовалютных инструментов. Успешные записи заменяют соответствующие demo-строки; ошибки отдельных символов оставляют их demo. В candles запрашивается только открытый инструмент. Forex преобразуется из EURUSD в EUR/USD. Интервалы: 15m → 15min, 1h → 1h, 4h → 4h, 1d → 1day. Для time_series передаётся timezone=UTC, значения сортируются по времени.

Доступ к индексам, биржам и частоте обновления зависит от аккаунта. Пакетный запрос учитывает стоимость отдельных символов: стандартный каталог и polling могут превышать лимит базового тарифа. При необходимости увеличьте серверный TTL/период polling или подключите только нужные рынки. Список индексов SPX/IXIC/DJI необходимо сверить с каталогом и правами конкретного провайдера; отсутствие доступа честно оставляет DEMO.

Адаптер реализован, но реальный аккаунт Twelve Data и ключ в текущей поставке отсутствуют. Live-интеграция требует проверки с вашим ключом и доступными символами. Не выдавайте метку API за гарантию realtime: поставщик может возвращать задержанные данные.

[Официальная документация Twelve Data](https://twelvedata.com/docs).

## Lightweight Charts

Используется npm `lightweight-charts` 5.0.9, библиотека хранится в локальной frontend-сборке, CDN не требуется. Это самостоятельный графический движок с нашими данными; не iframe, не TradingView widget и не полный продукт TradingView.

Создаются CandlestickSeries и HistogramSeries с отдельным priceScaleId для объёма. `CrosshairMode.Normal` обеспечивает свободное следование координате мыши. Обе линии имеют LineStyle.Dashed. `handleScale.axisPressedMouseMove` разрешает раздельное растягивание time/price scale. Встроенная атрибуция и ссылка TradingView оставлены.

Документация: [HandleScaleOptions](https://tradingview.github.io/lightweight-charts/docs/api/interfaces/HandleScaleOptions), [репозиторий и лицензия](https://github.com/tradingview/lightweight-charts).

## Режим автономности

Само приложение, сервер и график работают без внешних аккаунтов; реальные биржевые данные требуют сетевой доступности поставщика. Demo-режим полностью локальный и воспроизводимый. Это две независимые вещи: автономный запуск не означает автономное получение актуальных цен без внешнего источника.

## Pine Script

`references/nadaraya-watson-original.pine` — исходная стратегия пользователя. Реестр индикаторов содержит её название, но не исполняет код. Для переноса потребуется причинное гауссово сглаживание, MAE envelope, прогрев окна, сигнал crossover/crossunder и отдельная модель strategy orders/SL/TP. Подробный план в EXTENDING.md. Pine runtime не встроен.
