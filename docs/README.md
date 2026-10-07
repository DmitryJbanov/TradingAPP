# Действующие документы DiVMoney 0.2.0

Карта исходников и краткий актуальный статус находятся в [PROJECT_MAP.md](PROJECT_MAP.md). Для архитектуры, расширения и API используйте [ARCHITECTURE.md](ARCHITECTURE.md), [EXTENDING.md](EXTENDING.md) и [API.md](API.md).

## Разработка и эксплуатация

- [Запуск, обновление и диагностика](OPERATIONS.md)
- [Интеграции и источники данных](INTEGRATIONS.md)
- [Известные ограничения и журнал проверок](VALIDATION.md)
- [Сторонние лицензии и уведомления](../THIRD_PARTY_NOTICES.md)

## Индикаторы и график

- [Pine Editor, мои индикаторы и стратегии](PINE_SCRIPT.md)
- [VMC Cipher B](INDICATOR_VMC.md)
- [DRZ и SMC](INDICATORS_DRZ_SMC.md)
- [Sonarlab Order Blocks](INDICATOR_ORDER_BLOCKS.md)
- [Fair Value Gap · LuxAlgo](INDICATOR_FVG.md)
- Fixed Range Volume Profile доступен в инструментах разметки графика; MTM — в списке индикаторов. Текущие параметры см. в их настройках приложения и исходниках `src/components/drawing-tools.tsx`, `src/components/terminal.tsx`.

## CoinGlass

- [Киты Hyperliquid: обзор, профили и отслеживание](WHALES.md)
- [Фоновый сервис и диагностика](COINGLASS.md)
- [Heatmap Model 3 и историческое отображение](COINGLASS_HEATMAP.md)
- [Визуальные настройки, палитра и кумулятивный объём](COINGLASS_VISUAL_SETTINGS.md)

## Исторические материалы

Файлы `APPLY_*.md` описывают разовое применение старых патчей и не являются инструкциями обновления текущего проекта. [RELEASE_0.1.3.md](RELEASE_0.1.3.md) и ранние разделы [VALIDATION.md](VALIDATION.md) — архивные записи соответствующих версий.
