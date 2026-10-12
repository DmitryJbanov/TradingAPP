# Сервер: Docker + существующий Caddy/NaiveProxy

Приложение и CoinGlass запускаются через Compose. Caddy с вашим модулем `forward_proxy` обслуживает HTTPS на 80/443, приложение доступно только на `127.0.0.1:3000`, CoinGlass — внутри сети Compose. Второй Caddy и новые публикации 80/443 не нужны. Основной сценарий ниже: Caddy работает непосредственно на том же Linux-сервере.

## Установка приложения

Установите Docker Engine с Compose plugin и Git. Склонируйте репозиторий в постоянный каталог, например `/opt/divmoney`, и перейдите в него.

```bash
cp .env.example .env
chmod 600 .env
mkdir -p coinglass-secrets
chmod 700 coinglass-secrets
```

В `.env` замените `PUBLIC_ORIGIN` на точный адрес приложения, например `https://terminal.example.com`. Без пути и завершающего `/`. Серверный Compose требует этот параметр, включает Secure cookies и доверие специальному заголовку Caddy. `DATABASE_PATH` внутри контейнера всегда `/data/divmoney.sqlite`; значение из примера используется только для ручного Node-запуска.

При необходимости перенесите `credentials.txt` и/или `session.json` CoinGlass в `coinglass-secrets/`. Не добавляйте их и `.env` в Git. Контейнер читает файлы от UID 10001: обеспечьте ему доступ, например на Linux `sudo chown -R 10001:10001 coinglass-secrets`, затем права 700 на каталог и 600 на файлы. Авторизованная браузерная сессия и снимки сохраняются в отдельном Docker volume.

```bash
docker compose -f compose.yaml -f compose.server.yaml up -d --build
```

## Отдельный домен приложения

Укажите DNS A/AAAA приложения на сервер. Добавьте [deploy/caddy-terminal.caddy](../deploy/caddy-terminal.caddy) в существующий Caddyfile как отдельный site block или через `import /etc/caddy/divmoney.caddy`. Замените `terminal.example.com` своим доменом. Этот пример не является полной заменой вашего Caddyfile.

Сохраните установленный Caddy с NaiveProxy-модулем, текущие `forward_proxy`, `probe_resistance`, учётные данные и TLS-настройки. Не заменяйте его стандартным образом `caddy`, который не включает этот модуль.

## Приложение на том же домене, что и NaiveProxy

В существующем блоке сайта замените статическую раздачу страницы на:

```caddyfile
reverse_proxy 127.0.0.1:3000 {
    header_up X-Divmoney-Client-IP {remote_host}
    header_up -Proxy-Authorization
}
```

Готовый фрагмент: [deploy/caddy-app-upstream.caddy](../deploy/caddy-app-upstream.caddy). Если сайт уже использует внешний `reverse_proxy`, замените весь его блок этим фрагментом. Удалите прежнее `header_up Host {upstream_hostport}`: приложение должно получать исходный Host своего публичного домена. Блок `forward_proxy` и его параметры остаются на месте. Если текущий маршрут уже явно ставит `forward_proxy` перед `reverse_proxy`, менять порядок директив в нём не требуется.

В глобальном блоке настройте `order forward_proxy before reverse_proxy` вместо прежнего `order forward_proxy before file_server`. Таким образом, NaiveProxy обрабатывает свои запросы первым, а обычные запросы сайта поступают приложению. Если используется `route`, его содержимое выполняется буквально: поставьте существующий `forward_proxy` перед `reverse_proxy` внутри маршрута. Сохраните остальные параметры сайта, в том числе адреса слушателя. В стандартном примере NaiveProxy используется `:443, example.com`; не переставляйте их произвольно.

Пример рассчитан на Caddy, непосредственно принимающий клиентские соединения. Если перед ним CDN или другой прокси, `{remote_host}` будет его адресом: настройте доверенные адреса на Caddy и передачу проверенного client IP отдельно. Не доверяйте произвольному браузерному `X-Forwarded-For`.

Подробности: [настройка NaiveProxy](https://github.com/klzgrad/naiveproxy#server-setup), [Caddy reverse_proxy](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy).

## Применение конфигурации Caddy

Сначала сохраните копию существующего Caddyfile. Выполняйте команды установленным бинарником Caddy с вашим модулем:

```bash
sudo caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
sudo systemctl reload caddy
```

Перезагрузка допустима только после успешной валидации. Если Caddy запущен иначе, используйте его существующий способ reload. После применения проверьте HTTPS приложения, регистрацию/вход, сохранение профиля и подключение вашим NaiveProxy-клиентом.

Перед заменой действующей конфигурации создайте отдельный файл-кандидат рядом с Caddyfile, сохраните резервную копию с правами 600 и выполните `caddy validate --config /etc/caddy/Caddyfile.divmoney --adapter caddyfile`. Сначала запустите приложение и убедитесь, что его локальный `/api/health` отвечает. Затем замените Caddyfile кандидатом и выполните reload. Если reload или проверки неуспешны, восстановите исходный файл из копии и повторите reload. Остановку и переустановку Caddy этот сценарий не требует.

## Доступ только через NaiveProxy

Для закрытой установки используйте [caddy-naive-only.caddy](../deploy/caddy-naive-only.caddy) как фрагмент внутри существующего `route`, после неизменённого `forward_proxy`. Замените пример `192.0.2.10` на реальный публичный IPv4 сервера. Сохраните исходный веб-upstream в fallback `handle`.

Авторизованный NaiveProxy CONNECT к собственному публичному домену создаёт новое TCP-соединение от адреса самого сервера. Matcher `remote_ip` направляет его в приложение. Прямые внешние запросы продолжают получать маскирующий сайт. Это доверяет самому серверу и его локальным процессам, но не присланным клиентом `X-Forwarded-For` или другим IP-заголовкам. Если изменяется IP, DNS, появляется IPv6 или внешний upstream-прокси, маршрут нужно пересмотреть и повторно проверить. Loopback/private ACL NaiveProxy не ослабляется.

Домен приложения должен идти через NaiveProxy в правилах клиента, а не `DIRECT`. Внутри приложения дополнительно требуется вход в перенесённый пользовательский профиль. Через один туннельный сервер у пользователей общий видимый egress IP, поэтому лимит попыток входа для них общий.

## Если Caddy работает в Docker

`127.0.0.1` в контейнере Caddy — сам контейнер. Пример выше работает только с Caddy на хосте или в Linux host-network. Для Caddy в bridge-network подключите `terminal` к существующей внешней сети Caddy через локальный Compose override и используйте `reverse_proxy terminal:3000`. Сам CoinGlass оставьте в сети приложения. Сеть приложения не публикует его порт 8090; порт 3000 на хосте сохраняйте привязанным к loopback. Имя внешней сети определяется вашей установкой. Не подключайте контейнер Caddy к сети приложения без понимания её состава.

## Обновление и резервные копии

```bash
git pull --ff-only
docker compose -f compose.yaml -f compose.server.yaml up -d --build
docker compose -f compose.yaml -f compose.server.yaml logs --tail=100 terminal
```

При всех обновлениях используйте оба Compose-файла. Сохраняйте `.env`, `coinglass-secrets/` и volumes `divmoney-data`, `coinglass-data`. `down -v` удалит профили и собранные данные. Для согласованной резервной копии остановите оба сервиса, скопируйте оба volumes и секреты в защищённое хранилище, затем запустите сервисы. Снимок только `.sqlite` без WAL у работающего приложения может быть неполным.

Один экземпляр приложения использует SQLite. Не масштабируйте несколько реплик с общим файлом базы. Лимит входа действует на IP клиента в памяти процесса; Caddy перезаписывает `X-Divmoney-Client-IP`. `TRUST_PROXY=true` допустим лишь при недоступности upstream для прямых внешних запросов. HTTPS и секреты NaiveProxy управляются существующим Caddy.
