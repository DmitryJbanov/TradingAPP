# Расширение терминала

Ниже — документированный план реализации следующих возможностей; они не заявлены как доступные в текущем UI.

## 1. Новые рынки и поставщики

Добавьте Instrument в catalog.ts: symbol, base, name, category, sector, quote, seed. symbol является внутренним ID, seed используется только для demo. В server/service добавьте преобразование ID в symbol поставщика и преобразование ответа в Quote/Candle. Не принимайте произвольный URL от клиента: endpoint должен оставаться серверным.

При росте числа провайдеров выделите `MarketProvider` с методами `quotes(instruments)` и `candles(instrument, interval)`. Текущий сервис содержит два адаптера inline; это осознанно небольшой слой, который можно извлечь без изменения клиента.

## 2. Индикаторы

Контракт `IndicatorDefinition` содержит definition id, имя, описание, implemented и будущую функцию compute. `IndicatorInstance` — сериализуемые параметры конкретного экземпляра; chart API object здесь не хранится.

Порядок реализации:

1. Написать чистый вычислитель Candle[] → series data. Явно определить warm-up, NaN/пропуски и поведение текущей свечи.
2. Добавить compute в registry и поставить implemented=true только после проверок на известных данных.
3. Вынести chart rendering адаптер: создаёт series/primitive для instance, обновляет её при изменении свечей и удаляет при отключении/удалении.
4. Состояние enabled управляет series visibility; period/color обновляют вычисление/отрисовку.
5. Для тяжёлых расчётов использовать Web Worker, token версии запроса и отмену результата при смене symbol/interval.

### Nadaraya–Watson из приложенного файла

Сохранить именно causal/non-repaint вариант. На баре t основа использует текущий и предыдущие window−1 значений source с весами exp(−i²/(2h²)); нормализовать на сумму весов. Envelope использует SMA абсолютного отклонения source−basis за window, умноженную на mult. У basis и envelope разные периоды прогрева; не заменять их нулями.

Первая доступная basis появляется после window баров, envelope — после накопления window доступных deviations. Параметры bandwidth/mult/source/window добавлять в manager отдельно: общий period сейчас лишь заготовка window. Entry/exit logic из strategy не относится к отрисовке индикатора; торговлю и симуляцию ордеров выделить в отдельный сервис/модуль. Проверять совпадение чисел с экспортом Pine на одном наборе свечей до использования сигналов.

## 3. Несколько рабочих областей

`WorkspaceDocument` уже описывает version/layout/panes. `PaneState` содержит symbol/timeframe/indicators/drawings. Сейчас PairWorkspace создаёт один MarketChart; layout manager ещё не написан.

Рекомендуемый путь:

- Поднять состояние в WorkspaceProvider и присвоить устойчивый paneId каждой панели.
- Использовать CSS grid или установленный react-resizable-panels для размеров.
- У каждой панели собственный MarketChart, resource и controller. Не делить один chart instance между DOM containers.
- Разрешить опциональную синхронизацию time range и crosshair через event bus. Добавить originPaneId, чтобы не получить цикл обратных событий.
- Хранить schemaVersion и сериализованные layouts; мигрировать состояния между версиями.
- Сохранять документы на backend/в БД, если нужна синхронизация между устройствами. Пока настройки локальные.

## 4. Рисование

Определён Drawing: id/tool/anchors/style. Anchors хранят рыночные координаты time/price, а не экранные пиксели. Это сохраняет смысл фигур после масштабирования.

Реализовать tool state machine: idle → placing → editing → committed/cancelled. Визуальный слой — Lightweight Charts series primitives или отдельный canvas overlay. Перевод coordinates через timeScale.coordinateToTime и series.coordinateToPrice. На время рисования согласовать захват pointer с chart pan; на завершении восстановить навигацию.

Для trendline достаточно двух anchors, brush хранит последовательность точек с упрощением, Fibonacci хранит две точки и настраиваемые уровни. Использовать undo/redo command stack. В UI не показывать рабочие кнопки инструментов до реальной реализации.

## 5. Данные и производительность

Для истории за пределами 400 свечей добавить pagination до oldest timestamp и загрузку при приближении visible logical range к левому краю. Удалять дубликаты timestamps и сохранять старую область просмотра при prepend.

Для потокового обновления добавить WebSocket adapter с reconnect/backoff, heartbeats и snapshot reconciliation. Тикеры и candles должны сохранять provenance. На несколько пользователей необходимы серверная подписка с fan-out, общий кеш и rate limiting.

## 6. Новые разделы

Новые страницы добавляются в app/ и в standalone route resolution, а навигация — в Terminal shell. По мере роста вынести shell и dashboard из terminal.tsx в отдельные компоненты. Не связывать меню с вычислительным слоем индикаторов или конкретным поставщиком данных.
