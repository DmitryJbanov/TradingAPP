# Ориентир по коду

Актуальное дерево DiVMoney 0.2.0. Подробная таблица модулей и страниц — в [PROJECT_MAP.md](PROJECT_MAP.md).

| Область | Основные файлы |
| --- | --- |
| Доменные типы и каталог | `src/domain/market.ts`, `src/domain/catalog.ts`, `src/domain/workspace.ts` |
| Цены, свечи, провайдеры, HTTP | `src/server/market-service.ts`, `src/server/symbol-service.ts` |
| CoinGlass HTTP proxy | `src/server/coinglass-service.ts` |
| Главный UI и страница пары | `src/components/terminal.tsx`, `src/components/site-header.tsx` |
| Chart lifecycle/series | `src/components/chart.tsx`, `src/components/drawings-renderer.ts` |
| Инструменты рисования | `src/components/drawing-tools.tsx` |
| Вычислители индикаторов | `src/indicators/` |
| Запросы/клиентские адаптеры | `src/hooks/` |
| Темы и общие стили | `app/globals.css` |
| Hosted маршруты/API | `app/` |
| Node standalone runtime | `standalone/` |
| CoinGlass browser worker | `services/coinglass/`, `coinglass_heatmap/` |
| JS/TS tests | `tests/` |

## Важные контракты

- График принимает нормализованные свечи из `src/domain/market.ts`, не vendor JSON.
- Индикатор хранит `definitionId`, параметры, стиль и enabled state; его UI-регистрация находится в `src/domain/workspace.ts` и `src/components/terminal.tsx`.
- Drawing anchors задаются временем/ценой, чтобы оставаться привязанными к рынку при изменении масштаба.
- Клиент не должен хранить серверные секреты. Ключ Twelve Data и CoinGlass service settings — только в backend environment.
- Hosted и standalone должны использовать одинаковые доменные обработчики.

Техническое расширение: [EXTENDING.md](EXTENDING.md). API: [API.md](API.md).
