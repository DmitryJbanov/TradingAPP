# DiVMoney · Market Terminal

**Версия 0.2.0.** DiVMoney — веб-терминал для наблюдения за рынками и технического анализа. Проект показывает котировки, свечные графики и аналитические инструменты в едином интерфейсе на русском языке.

## Быстрый запуск

### Node.js

Нужен Node.js 22.13 или новее. В корне проекта выполните:

```bash
npm ci
npm run build:standalone
npm run start:standalone
```

Откройте <http://localhost:3000>. Для запуска готовой сборки без npm-зависимостей используйте `node release/server.mjs`.

### Docker

Нужны Docker Engine и Docker Compose v2. Из корня проекта:

```bash
docker compose up -d --build
```

Откройте <http://localhost:3000>. Вместе с терминалом запустится сервис CoinGlass с браузерным сборщиком данных.

## Возможности

- Каталог криптовалют, акций, индексов и валютных пар; поиск, избранное, фильтры и сортировка.
- Свечной график с выбором таймфрейма, истории, масштаба и темы.
- Индикаторы и разметка графика: VMC, DRZ, SMC, Sonarlab Order Blocks, Stoch RSI, MTM и Fixed Range Volume Profile.
- Данные CoinGlass: Heatmap Model 3, уровни ликвидаций и их визуализация на графике.
- Отдельные страницы Fear & Greed Index и RSI Heatmap по top 50.
- Источники котировок: Binance; Twelve Data для акций, индексов и валютных пар подключается серверным API-ключом.

Если источник недоступен или не настроен, приложение может показать синтетические данные с отметкой DEMO. Для настройки Twelve Data задайте `TWELVE_DATA_API_KEY`; остальные параметры приведены в [`.env.example`](.env.example).

## Документация

- [Полный индекс документации](docs/README.md).
- [Карта проекта](docs/PROJECT_MAP.md) и [архитектура](docs/ARCHITECTURE.md).
- [HTTP API](docs/API.md), [интеграции и источники данных](docs/INTEGRATIONS.md).
- [Развёртывание и эксплуатация](docs/OPERATIONS.md), [проверки и ограничения](docs/VALIDATION.md).
- [Как расширять терминал](docs/EXTENDING.md).
- Индикаторы: [VMC](docs/INDICATOR_VMC.md), [DRZ и SMC](docs/INDICATORS_DRZ_SMC.md), [Sonarlab Order Blocks](docs/INDICATOR_ORDER_BLOCKS.md).
- CoinGlass: [фоновый сбор данных](docs/COINGLASS.md), [Heatmap Model 3](docs/COINGLASS_HEATMAP.md), [визуальные настройки](docs/COINGLASS_VISUAL_SETTINGS.md).

Исторические отчёты и инструкции по применению старых патчей помечены как архивные; текущие команды запуска и обновления приведены в README и [руководстве эксплуатации](docs/OPERATIONS.md).
