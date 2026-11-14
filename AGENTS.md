# Holdline: обязательные правила разработки

Перед любой задачей прочитать [TECH_STACK.md](TECH_STACK.md), [PLAN.md](PLAN.md), свой план A/B/C/D в `docs/superpowers/plans/` и применимые правила `brandbook.html`.

## Единый стек

`TECH_STACK.md` — действующее архитектурное решение владельца от 15 ноября 2026 и источник истины для всех веток. Старые коммиты/черновики не разрешают другой стек. При конфликте плана с этим документом исправить план и реализовать принятое решение.

- Наш runtime: Next.js App Router + React + TypeScript/Node.js. Общий npm lockfile; версии/корневые зависимости ведёт B.
- База: существующая PostgreSQL. Профили/QuizAnswers, sessions, turns, квоты, feature flags и задания используют единый DB-слой и согласованные миграции B. Новую независимую БД или ORM без согласования не добавлять.
- Видео: LiveAvatar LITE с ElevenLabs Agent Connector и официальным Web SDK. Комнату и provider worker держит LiveAvatar. Не создавать свой LiveKit-проект, сервер, dispatch, credentials или LiveKit Agents worker.
- Два последовательных ElevenLabs Agent: «Коуч» для intake; «Собеседник» с нашим custom LLM для переговоров. Не запускать два говорящих соединения одновременно.
- `save_profile`: client tool → наш API → Zod/owner/Origin/revision/idempotency → PostgreSQL. Никакой БД в браузере и никакого подтверждения зарплаты моделью за человека.
- Денежные переходы остаются в чистом TS-ядре. OpenAI-compatible формат custom LLM не требует OpenAI как провайдера.
- Не добавлять Python/uv/pytest, OpenAI Realtime, Redis/Upstash или S3/R2 для аудио. Это отменённые варианты архитектуры.
- Аудио по умолчанию не сохранять: Scribe processing → transcript/timings/метрики в jsonb → уничтожение временной записи. Опциональный replay через bytea ≤24h требует отдельного флага, согласия и автоочистки.
- MediaPipe и pitchfinder — поздние браузерные слои за feature flags. Камера optional, анализ после opt-in, видео/кадры/raw landmarks на сервер не отправлять.
- Коуч и собеседники — иллюстрации/стилизованные персонажи брендбука. Сгенерированных фотореалистичных лиц, включая коуча, не использовать.

## Сохранить инварианты

- Гостевой доступ без регистрации не отменяет owner isolation, HttpOnly cookies, Origin checks и серверную авторизацию.
- Повторы/конкуренция защищены транзакциями, версиями и уникальными ключами в PostgreSQL, не Map в production.
- До Start нет платного звонка. Лимит 300s на попытку, отдельная intake-квота, глобальный резерв расходов. Reconnect не сбрасывает лимит.
- End/review/delete/отзыв согласия не блокировать устаревшей revision. Late events не воскрешают закрытый звонок. Cleanup не сводить к browser unload: нужен provider stop и серверная проверка просроченных попыток.
- Общие схемы и деньги — A; DB/auth/лимиты/env/CI — B; общая оболочка/переговоры/capture — C; onboarding и connector — D. Сохранять границы файлов из планов с учётом обновлённого стека.
- Проверки: TypeScript, ESLint, Vitest и Playwright. Платные live tests отдельно. Не заявлять готовыми отключённые функции, не выдумывать стоимость/latency и не считать offline mock доказательством живого avatar call.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
