# Применение патча и запуск

База: последний архив `vector-market-terminal(4).zip` с Sonarlab. Старый `vmc-cipher-b.patch` повторно не применяется. Новый патч содержит исходники, тесты и документацию; сборка release требует пересоздания.

В PowerShell откройте папку с `package.json`. Сохраните туда `market-terminal-history-drz-smc.patch`. Остановите запущенный сервер Ctrl+C и сначала проверьте:

```powershell
git apply --check --whitespace=nowarn .\market-terminal-history-drz-smc.patch
```

Если ошибок нет:

```powershell
git apply --whitespace=nowarn .\market-terminal-history-drz-smc.patch
npm run typecheck
npm run test:core
npm run build:standalone
npm run start:standalone
```

Откройте http://localhost:3000 и обновите страницу Ctrl+F5. Нужен Node.js 22.13+. Если зависимости отсутствуют, перед сборкой выполните `npm ci`. Новых обязательных переменных окружения нет, существующий `.env` подходит.

`--whitespace=nowarn` убирает предупреждения о сохранённых окончаниях строк Windows и пробелах исходного Pine. Проверка контекста и конфликтов остаётся включённой.

При ошибках применения не удаляйте файлы и не применяйте с `--reject`: база отличается или патч уже применён. Проверка повторного применения:

```powershell
git apply --reverse --check --whitespace=nowarn .\market-terminal-history-drz-smc.patch
```

Успешная обратная проверка означает совпадение с результатом патча. Если обе проверки не проходят, нужно подготовить патч относительно вашей новой версии. Команды с `--check` ничего не изменяют.

На графике выберите число свечей и нажмите Enter/галочку. DRZ и SMC добавляются кнопкой «+» в менеджере индикаторов. Для старого VMC нажмите «По умолчанию → Применить». Статистика DRZ расположена справа от последних свечей: сдвиньте график влево для просмотра.
