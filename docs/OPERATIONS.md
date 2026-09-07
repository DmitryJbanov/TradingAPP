# Эксплуатация

## Самостоятельный runtime

Рекомендуемый старт для личной установки: `docker compose up -d --build`. В образе multi-stage build, непривилегированный user node, read-only root filesystem, tmpfs /tmp, drop capabilities, restart policy и healthcheck. Данные на диске не записываются, persistent volume не нужен.

Готовый `release/` работает обычным Node.js. Всё frontend содержимое в release/public, сервер — один ESM bundle без npm runtime-зависимостей. Системному времени сервера и браузера нужно быть корректным; UTC-ось не зависит от locale устройства.

## Health и журналы

```bash
curl -fsS http://127.0.0.1:3000/api/health
docker compose logs -f --tail=100 terminal
```

Health проверяет жизнеспособность приложения, а не доступность Binance. Последние состояния поставщиков отдельно в providers. Логи также пишутся JSON-строками в stdout; Docker ограничивает файлы 10 MB × 3. UI-журнал ограничен 100 записями памяти и сбрасывается при рестарте. На Cloudflare журнал и uptime относятся к worker isolate; это не глобальная телеметрия всех запросов.

## Сетевой доступ

Для auto-режима сервер должен выполнять HTTPS GET к data-api.binance.vision и при подключении ключа api.twelvedata.com. Без доступа графики останутся в DEMO. Клиент обращается только к тому же origin /api, поэтому API-ключей/CORS к бирже в браузере нет.

Для публикации вне локальной машины поставьте TLS reverse proxy, настроенный для вашей инфраструктуры. Встроенной авторизации в standalone нет; compose публикует только 127.0.0.1. Если открываете приложение в сеть, ограничьте доступ VPN/SSO/basic auth на proxy по вашей схеме. Hosted-версия опубликована с доступом владельца.

Пример минимального Nginx location за уже настроенным HTTPS server:

```nginx
location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 20s;
}
```

Собственные внешние proxy-заголовки приложением для авторизации не используются. Не размещайте `.env` или исходный каталог как static root; сервер обслуживает только release/public.

## Обновление

Сохраните .env и браузерные настройки, замените source и пересоберите образ:

```bash
docker compose up -d --build
```

Для ручного Node запуска остановите предыдущий процесс через SIGTERM, замените release, запустите снова под systemd/вашим process manager. SIGTERM/SIGINT вызывают server.close; request timeout ограничивает длительность запросов. Для отката храните предыдущий image tag или release-directory.

## Hosted-сборка

Публикация использует Cloudflare-compatible Worker из `dist/server/index.js` и assets из dist/client. Конфигурация `.openai/hosting.json` содержит identity и выключенные D1/R2 bindings. Runtime-секреты задаются окружением размещения. Готовый standalone release не читает этот файл и не зависит от Site identity.

## Диагностика

| Симптом                          | Проверка/действие                                                |
| -------------------------------- | ---------------------------------------------------------------- |
| Все криптовалюты DEMO            | DATA_MODE, доступ data-api.binance.vision, WARN в журнале        |
| Акции DEMO                       | Наличие ключа Twelve Data, права на биржу/символ, лимиты тарифа  |
| API зелёный, provider недоступен | Это разные проверки: приложение работает, котировки fallback     |
| Пустой список                    | Сбросьте поиск, избранное и фильтры; проверьте /api/markets      |
| Индикатор добавлен, линий нет    | В этой версии compute не реализован, доступны только параметры   |
| График слишком растянут          | Кнопка сброса масштаба или двойной клик по шкале                 |
| Настройки потерялись             | Другой браузер/origin, private mode или очищенный localStorage   |
| Логи на hosted неполные          | Они scoped к текущему isolate; используйте серверные stdout logs |

## Практические лимиты

Нет распределённого rate limiter, общей БД, дедупликации между процессами или больших исторических архивов. Ручное обновление может часто обращаться к поставщику. Для публичного многопользовательского сервиса потребуются auth, throttling, общий cache и наблюдаемость. Текущая поставка — персональный терминал с реальным backend и задокументированными границами.
