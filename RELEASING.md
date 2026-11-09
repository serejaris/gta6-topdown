# Релизная политика

- Версии по SemVer: `0.MINOR.PATCH` до выхода из беты. MINOR — новая механика или заметное изменение игры, PATCH — исправления и баланс.
- Ветка `main` всегда играбельна и совпадает с тем, что выложено на Railway.
- Каждый релиз: запись в `CHANGELOG.md` → версия в `package.json` → коммит `chore(release): vX.Y.Z` → тег `vX.Y.Z` → `gh release create` с текстом из changelog → `railway up`.
- Перед релизом обязателен прогон в headless-браузере: два клиента видят друг друга, в консоли нет ошибок, `/health` отвечает `ok`.
- Находки ревьюеров и игроков — issues в этом репозитории; релиз закрывает issues ссылкой в changelog.
- Коммиты conventional: `feat:`, `fix:`, `refactor:`, `docs:`, `chore:`.
