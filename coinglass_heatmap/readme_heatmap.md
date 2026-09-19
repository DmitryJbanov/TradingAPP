# CoinGlass BTC liquidation heatmap без API-ключа

Наработка получает данные карты ликвидаций CoinGlass через обычный браузер и
внутренний frontend-запрос страницы. API-ключ CoinGlass не используется.

## Как это работает

`get_coinglass_liquidations.py` запускает Chrome через Playwright, открывает
страницу Model 3 для `BTC`, `symbol`, `365d`, получает webpack-модуль страницы
и вызывает ту же функцию, которую использует сама карта:

```js
req(89390).Yxh({ merge: true, symbol: "BTC", range: "365d", cp: false })
```

Ответ содержит массивы `liq` и `y`. Каждая ячейка `liq` имеет вид
`[x_index, y_index, liquidation_value]`; `y[y_index]` — фактическая цена.
Скрипт сохраняет исходный ответ в
`coinglass_btc_liquidation_levels_365d.json`.

## Запуск получения данных

```powershell
cd coinglass_heatmap
pip install playwright
python -m playwright install chromium
python get_coinglass_liquidations.py
```

Нужен установленный Google Chrome. Скрипт использует видимый браузер, поэтому
при необходимости можно пройти проверку сайта вручную.

## Подготовка карты и изображения

```powershell
cd coinglass_heatmap
# export_complete_coinglass_map.js выполняется в DevTools Console на странице CoinGlass
python convert_coinglass_map_to_price_levels.py
python render_coinglass_map.py
```

Результат — JSON с ценами `coinglass_btc_liquidation_price_levels_365d.json`
и PNG `coinglass_btc_liquidation_map_365d.png`.

## Локальное приложение

`liquidation_map_app.html` — автономный Canvas-просмотрщик. Он позволяет менять:

- порог отображения ликвидаций;
- шкалу легенды: логарифмическую, линейную или перцентили;
- цветовую схему: CoinGlass, огонь, лёд или монохром.

Запустить локально:

```powershell
cd coinglass_heatmap
python -m http.server 8765
```

Затем открыть `http://127.0.0.1:8765/liquidation_map_app.html` и выбрать JSON
кнопкой `JSON`. Для встроенного демо можно использовать подготовленный файл
`map_data.js`.

## Ограничения

Это не официальный публичный API. CoinGlass может изменить webpack-модули,
имя функции, формат ответа или потребовать вход/проверку; в таком случае
нужно обновить селектор модуля в `get_coinglass_liquidations.py`.
