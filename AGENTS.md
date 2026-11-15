# Holdline: обязательные правила разработки

Перед любой задачей прочитать [TECH_STACK.md](TECH_STACK.md), [PLAN.md](PLAN.md), свой план A/B/C/D в docs/superpowers/plans/ и применимые правила brandbook.html. Новое решение: [universal API coach](docs/superpowers/specs/2026-11-15-universal-api-coach-design.md).

## Единый стек и объём

TECH_STACK.md — архитектурное решение владельца от 15 ноября 2026 и источник истины для всех веток. Текущая редакция заменяет зарплатный-only вход и LITE/ElevenLabs Agent Connector. Старые коммиты/планы не разрешают возвращать отменённый стек.

- Подготовка к ЛЮБОМУ разговору: интервью, отношения, конфликт, feedback, презентация, деньги или custom-тема. Зарплата и рынок необязательны. Полный roleplay/debrief и финансовое ядро остаются отдельным будущим специализированным слоем.
- Runtime: Next.js App Router + React + TypeScript/Node.js. Один npm lockfile; версии/корневые зависимости ведёт B.
- База: существующая PostgreSQL и единый согласованный DB-слой для profiles/QuizAnswers, sessions, turns, quotas, flags, receipts и jobs. Новую независимую БД или ORM без согласования не добавлять.
- Видео: LiveAvatar FULL и официальный Web SDK; ASR, turn-taking, комнату и lip sync обслуживает LiveAvatar. Свой LiveKit-проект, сервер, dispatch, credentials или Agents worker не создавать.
- Модель: прямой OpenAI Chat Completions API или Anthropic Messages API; голос — импортированный ElevenLabs TTS. ElevenLabs Agent, Agent ID, connector и параллельное говорящее соединение не нужны. GPT Realtime не используется.
- API v2: общий QuizAnswers требует kind/description/goal/counterpartRole; desiredTone необязателен. QuizDraft partial и читает старые зарплатные drafts. Все денежные поля, дата, avatar и market необязательны. missingFields — общая подготовка, не financial-engine readiness.
- Подписанный provider callback → наш model adapter → Zod ProfilePatch → существующий ProfileControl → PostgreSQL. Bearer + HMAC intake/epoch/deadline; owner/revision/epoch/idempotency сохраняются. Browser client tools не нужны. Модель предлагает кандидата и никогда не подтверждает brief за человека.
- В текущем FULL-режиме финальный ASR event фиксируется через owner API, затем /respond загружает server transcript и вызывает этот подписанный callback внутри серверного процесса. Bearer/HMAC сохраняются; браузер получает reply/view и вызывает SDK.repeat. Speech start прерывает SDK и отменяет/инвалидирует предыдущий turn. Provider context/LLM configuration, внешний callback URL и tunnel не требуются; protected route может оставаться для будущей интеграции.
- При смене уже заданного kind, включая очистку, сначала очищать предыдущие суммы и monetary units/rangeSource; сохранять лишь явно переданные заново. Не выдумывать деньги/диапазоны и не переносить скрытую зарплату в другую тему.
- Денежные переходы будущего финансового ядра остаются чистым TS. OpenAI-compatible callback — формат API; обычный OpenAI или Anthropic выбирается серверной конфигурацией.
- Не добавлять Python/uv/pytest, OpenAI Realtime, Redis/Upstash или S3/R2 для аудио.
- Raw audio/video по умолчанию не хранить. Поздний Scribe: processing → transcript/timings/метрики jsonb → уничтожение временной записи. Replay через bytea ≤24h требует отдельного флага, согласия и автоочистки.
- MediaPipe/pitchfinder — поздние браузерные слои за флагами. Камера optional и local-only; opt-in обязателен для анализа, видео/кадры/raw landmarks на сервер не отправлять.
- Продуктовые коуч/собеседники — иллюстрации/стилизованные персонажи брендбука. Фотореалистичные сгенерированные лица не использовать. Wayne sandbox — только технический тест, не продуктовый asset.

## Сохранить инварианты

- Гостевой доступ не отменяет owner isolation, HttpOnly cookies, Origin checks и серверную авторизацию. Public views не содержат ключей/bindings.
- Повторы/конкуренция защищены PostgreSQL CAS, транзакциями и уникальными ключами, не Map в production. Callback replay не запускает вторую платную генерацию; отменённый/истёкший callback не пишет поздний результат.
- До Start нет платного звонка. Configured deadline ≤300s; Free локально 120s/одна сессия, sandbox ≤60s. Отдельная intake-квота и глобальный резерв расходов. Reconnect не сбрасывает лимит.
- End/review/delete/отзыв согласия не блокировать устаревшей revision. Late events не воскрешают закрытый звонок. Нужны provider stop и независимый серверный cleanup.
- Calls требуют env-флаг, PostgreSQL calls:enable, рабочую конфигурацию и cleanup heartbeat. Покупка/overage не подразумеваются настройкой API.
- Общие схемы/деньги — A; DB/auth/лимиты/env/CI — B; общая оболочка/будущая тренировка/capture — C; onboarding/LiveAvatar FULL/callback — D. Сохранять границы файлов с поправками к v2.
- Проверки: TypeScript, ESLint, Vitest, Playwright; платные live tests отдельно. Не выдавать отключённые функции, HTTP 200, текстовую генерацию или offline mock за принятый живой avatar call. Не выдумывать цену, latency или точность.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
