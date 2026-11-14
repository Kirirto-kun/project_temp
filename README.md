# Holdline

Веб-тренажёр разговоров о деньгах: знакомство с AI-коучем, подтверждённый профиль, голосовая репетиция переговоров и разбор.

## Перед началом разработки

1. Прочитать [TECH_STACK.md](TECH_STACK.md) — единое принятое решение для всех разработчиков.
2. Прочитать [AGENTS.md](AGENTS.md) — обязательные правила для агентов и веток.
3. Изучить [PLAN.md](PLAN.md) и свой план: [A — ядро](docs/superpowers/plans/2026-11-15-01-engine.md), [B — платформа](docs/superpowers/plans/2026-11-15-02-platform.md), [C — продукт](docs/superpowers/plans/2026-11-15-03-product.md), [D — первый звонок](docs/superpowers/plans/2026-11-15-04-avatar-intake.md).
4. Использовать [brandbook.html](brandbook.html): иллюстрированные/стилизованные персонажи, включая коуча.

Стек: **Next.js / React / TypeScript / PostgreSQL / LiveAvatar LITE + ElevenLabs Agent Connector / ElevenLabs Agents и Scribe**. Собственный LiveKit, Python worker, OpenAI Realtime, Redis/Upstash и S3/R2 для аудио отменены. MediaPipe и pitchfinder — поздние локальные слои за флагами.

Перед продолжением уже начатой ветки обновиться от `origin/main` и сверить её зависимости с `TECH_STACK.md`. Этот документ фиксирует архитектуру; готовность кода и внешних интеграций подтверждается отдельно тестами и приёмкой.

## Сервис первого звонка

В этой ветке реализован отдельный модуль Next.js/TypeScript с PostgreSQL schema `holdline_intake`: интерфейс звонка, managed LiveAvatar/ElevenLabs connector, client tools, сохранение/подтверждение brief, лимиты и cleanup. Полный движок переговоров и дополнительные анализаторы остаются следующими слоями.

```powershell
npm ci
npm run setup:local
npm run db:up
npm run db:migrate
npm run dev
```

Откройте [localhost:3000](http://localhost:3000). Форма работает без provider keys. Реальные звонки по умолчанию выключены; нужны аккаунты, approved avatar и приёмка.

- [Настройка LiveAvatar и ElevenLabs шаг за шагом](docs/product/intake/setup-ru.md)
- [Запуск, Docker, API и эксплуатация](docs/product/intake/runbook.md)
- [Критерии и незавершённая живая приёмка](docs/product/intake/acceptance.md)

Проверки: `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, `npm run test:e2e`. Unit/SQL tests используют отдельную test database; E2E принудительно отключают платные вызовы. Production dependencies: `npm audit --omit=dev`.
