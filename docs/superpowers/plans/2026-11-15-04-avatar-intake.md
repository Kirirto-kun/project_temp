# Holdline. План D: универсальное знакомство с видеокоучем

> **Авторитетная редакция 15 ноября 2026 — universal API coach / intake API v2.** [TECH_STACK.md](../../../TECH_STACK.md), [spec](../specs/2026-11-15-universal-api-coach-design.md) и [план реализации](2026-11-15-universal-api-coach.md) заменяют прежний salary-only/LITE/ElevenLabs Agent Connector план. Готовим ЛЮБОЙ разговор; деньги optional. ElevenLabs conversational Agent, Agent ID и dashboard client tools не нужны.

**Цель:** помочь человеку описать ситуацию, собеседника/аудиторию и желаемый результат, попробовать короткое вступление и проверить brief. Интервью, feedback, конфликт, отношения, презентация, деньги и произвольный custom — равноправные темы. Полный roleplay/debrief, финансовая симуляция и speech/visual assessment — отдельные последующие слои.

**Архитектура:** Next.js/TypeScript/PostgreSQL, LiveAvatar FULL и официальный Web SDK. LiveAvatar управляет ASR/turn-taking/комнатой/media/lip sync; owner API /respond загружает server transcript и вызывает существующий signed callback внутри процесса, затем прямой OpenAI Chat Completions или Anthropic Messages. Ответ произносится через SDK.repeat. ElevenLabs — импортированный TTS voice. Сервер валидирует model changes и сохраняет через существующий ProfileControl. Только человек подтверждает brief.

**Владелец:** D, ветка codex/holdline-avatar-intake. Соседи: [A — общие схемы и будущее финансовое ядро](2026-11-15-01-engine.md), [B — PostgreSQL/auth/limits/env/deploy](2026-11-15-02-platform.md), [C — оболочка/форма/бренд](2026-11-15-03-product.md).

## Ограничения

- Один говорящий managed FULL канал; второй ElevenLabs Agent/widget не открывать. Своего LiveKit-проекта/server/credentials/dispatch/worker нет.
- Наш runtime только TS/JS; один npm lockfile. Python/uv/pytest, GPT Realtime, Redis/Upstash и S3/R2 для аудио не добавлять.
- До действия пользователя нет device request или оплачиваемого вызова. Создать draft можно без провайдера. Камера optional, local self-view, в комнату не публикуется.
- Deadline задаёт INTAKE_SESSION_LIMIT_SECONDS ≤300s. Проверенный Free-аккаунт: одна сессия и ≤120s; локально 120. Sandbox ≤60s. Reconnect не продлевает попытку; restart после закрытия — новая квота/epoch.
- До платного Connect атомарно зарезервировать квоту/бюджет в PostgreSQL. Calls требуют env+DB-флаг и свежий heartbeat независимого cleanup.
- Review/End/delete/ошибка закрывают provider session/SDK/local devices. Browser unload — не единственный cleanup. Failed stop остаётся pending и повторяется.
- Raw audio/video не сохраняются. Draft/transcript TTL 24h; retention provider отдельно. Поздние Scribe/MediaPipe/pitchfinder выключены до отдельной приёмки/opt-in.
- Продуктовый коуч — approved illustrated/stylized asset с AI label. Постер не считается live avatar. Designated Wayne sandbox — только технический тест, не продуктовый брендовый персонаж.
- Нельзя выводить диагноз, честность, уверенность, эмоцию или личность по голосу/камере. Не обещать исход реального разговора.

## 1. Границы файлов

| Область | Владелец | Смысл |
|---|---|---|
| src/onboarding/** | D | UI, FULL SDK/provider, model callback, orchestration |
| src/app/intake/**, src/app/api/intake/**, src/app/api/avatar-llm/** | D | Страницы и browser/service API |
| tests/intake/**, tests/e2e/intake-*.spec.ts | D | Unit/SQL/boundary/browser/lifecycle tests |
| public/intake/**, docs/product/intake/** | D | Постер/документация, без пользовательских записей |
| src/contracts/**, src/domain/** | A | Общий QuizAnswers/QuizDraft, будущие финансовые адаптеры |
| PostgreSQL/auth/budgets/flags/jobs/env/npm/CI/deploy | B | Единая инфраструктура и согласованные миграции |
| Общая оболочка/бренд/reusable capture/будущая тренировка | C | Не дублировать коуча или DB-слой |

## 2. Профиль v2

Использовать src/contracts/domain.ts как единственный source of truth. QuizDraft — partial общего QuizAnswers, без server-only sourceIntakeId. Старые зарплатные drafts остаются читаемыми.

| Поле | Общий смысл |
|---|---|
| kind | raise / offer / rent / bill / interview / feedback / conflict / relationship / presentation / custom |
| description | Ситуация, trim/max4000; legacy empty читается, но missingFields считает отсутствующим |
| counterpartRole | Человек, роль или аудитория; trim/1…200 |
| goal | Желаемый результат; trim/1…2000 |
| desiredTone | Optional, trim/1…300 |
| userRole / fear | Optional роль в ситуации и опасения; профессия не обязательна |
| Денежные поля | Optional currentMinor/targetMinor/marketLowMinor/marketHighMinor, currency/period/moneyBasis/rangeSource |
| Прочее | Optional conversationDate, inputMode, avatarId; server-only sourceIntakeId при handoff |

При любой сумме сервер проверяет integer USD cents, 1…10_000_000_000, currency=USD, period=year/month/one_time, moneyBasis=gross/net/unspecified и low≤high. Другую валюту оставить словами в description, не подменять USD. Модель не выдумывает target/market и не делает скрытую нормализацию.

Явная смена уже заданного kind, включая null/очистку, сначала очищает старые суммы/currency/period/moneyBasis/rangeSource, затем применяет patch. Только явно переданные заново значения переживают смену. Первое присвоение kind legacy kindless draft сохраняет его суммы. Остальной контекст не теряется. Любое изменение, включая goal, отзывает confirmation.

missingFields — только kind/description/goal/counterpartRole, включая blank description. Money/market/avatar не обязательны для обычной темы. Подтверждённый common brief не доказывает financial-engine readiness; будущий финансовый адаптер проверяет свои полные суммы/единицы/диапазон/config отдельно. custom preparation не равен платному генератору финансового сценария.

## 3. Managed ASR → owner /respond → signed boundary → SDK.repeat

~~~text
Connect/reserve → LiveAvatar FULL token без provider context/LLM config
SDK ↔ managed FULL: ASR / media / lip sync
USER_TRANSCRIPTION → /events → server transcript
POST /api/intake/:id/respond: owner / Origin / clientId / epoch / latest turn
  → server transcript + server-built binding
  → in-process callback Request: Bearer + HMAC intake / epoch / deadline
  → COACH_SYSTEM_PROMPT + candidate → OpenAI Chat API / Anthropic
  → reply / changes / action → Zod ProfilePatch → ProfileControl / PostgreSQL
  → reply + view / turnId / epoch → controller generation check → SDK.repeat
USER_SPEAK_STARTED → SDK.interrupt + cancel/invalidate previous turn
Review / End → stop / cleanup → human review / Confirm / handoff
~~~

Подписанный provider-callback контракт остаётся обязательным внутренним server-to-server boundary. /respond сам создаёт authenticated Request в процессе, не обращаясь к внешнему ingress. Bearer и HMAC intake/epoch/deadline проверяет прежний callback handler. CUSTOM_LLM_API_KEY — optional override; иначе bearer выводится из OWNER_SECRET. Protected routes /api/avatar-llm/v1/chat/completions и alias без /v1 остаются для будущего использования, не являются зависимостью текущего звонка. Context/LLM configuration, внешний callback URL/proxy/tunnel не нужны.

Клиент сначала фиксирует final ASR transcript, затем отправляет только clientId/providerEpoch/turnId. Сервер берёт собственную историю и требует последний committed user turn; произвольную model history от браузера не принимает. После model call/reply клиент проверяет generation/turn/epoch до playback.

Модель получает server COACH_SYSTEM_PROMPT, ограниченную историю и owner-bound кандидат. Wire JSON {reply,changes:[{field,value}],action} переводится в {reply,patch,action}; field unique, ProfilePatch валиден. Модель не подтверждает brief, не меняет owner/permissions/limits/payment/financial state. Actions: continue, mini_practice, review, end. Review/end прекращают медиа без автоподтверждения.

Bearer/HMAC/body bounds/активная epoch/deadline/turn budget проверяются до генерации. PostgreSQL receipts защищают replay/concurrent duplicates. Завершённый идентичный retry переиспользует результат; in-flight не генерирует второй раз. После async model work проверить cancellation/epoch/deadline/latest-turn state перед записью. Speech start прерывает звук, отменяет fetch и инвалидирует прошлый turn серверным событием. End/delete/expired/restart не допускают late write или playback.

## 4. Browser API и handoff

intakeContractVersion:2 публикуется GET /api/intake/config. Все browser мутации same-origin с HttpOnly owner cookie, Origin и Idempotency-Key где применимо. Patch/Connect/Confirm требуют expectedRevision. Stop/delete независимы от устаревшего profile revision и могут быть bound к epoch.

| Endpoint | Смысл |
|---|---|
| GET /api/intake/config | v2, available, фактический sessionLimitSeconds и выключенные analysis/audio-only capabilities |
| POST /api/intake | Draft без provider call |
| GET /api/intake/:id | Owner-bound view/reload, no-store |
| POST /api/intake/:id/connect | CAS/idempotency/client lease, scoped FULL token |
| POST /api/intake/:id/events | Ready/heartbeat/transcript/speech_started с epoch/client binding |
| POST /api/intake/:id/respond | Owner/latest committed turn → internal signed orchestration → reply/view |
| PATCH /api/intake/:id/profile | Кандидат/исправление, null удаляет поле |
| POST /api/intake/:id/confirm | Человеческое подтверждение и закрытие медиа |
| GET /api/intake/:id/handoff | Confirmed draft/profileRevision/common missingFields; media closed |
| POST /api/intake/:id/stop | Retryable epoch-aware provider cleanup |
| DELETE /api/intake/:id | Отмена, удаление наших данных, tombstone от поздних событий |
| POST /api/intake/maintenance | Авторизованный независимый cleanup |
| POST /api/intake/:id/tools | Совместимость старых клиентов, не требование текущего callback |

Handoff загружается сервером по owner cookie, не по присланному браузером confirmed. Он возвращает draft, а не выдаёт финансовый сценарий. Дальнейший roleplay/debrief пока отдельный слой; пустой common missingFields не означает готовность любого будущего движка.

## 5. Задачи и проверка D

### D1. Provider setup и bounded live probe

- [ ] npm run provider:configure: ElevenLabs TTS secret и imported voice; только voice references, без Agent/context/vendor LLM configuration.
- [ ] APP_ORIGIN — UI origin; owner /respond вызывает внутренний signed boundary. Внешний callback URL, proxy/tunnel не требуются.
- [ ] Sandbox --test-default-voice использует built-in voice/source=liveavatar-test, запрещён вне sandbox и не принимает ElevenLabs TTS. Normal helper возвращает imported voice/source=elevenlabs.
- [ ] Проверить FULL token/start/stop, один audio output, lip sync, interruption и ASR/respond/repeat roundtrip; записать фактический исход, не подменять mock.
- [ ] Sandbox Wayne ≤60s без LiveAvatar credits, нормальный Free ≤120s/одна сессия; TTS/model billing отдельно. Покупка/overage не требуется.

### D2. Universal profile и human confirmation

- [ ] Нефинансовые custom/interview save/tool/missing/handoff без salary/market/avatar.
- [ ] Goal correction отзывает confirmation; owner/revision/epoch/idempotency не ослаблены.
- [ ] Salary→relationship/clear kind удаляет monetary assumptions; явно resend деньги сохраняет только новый набор.
- [ ] Legacy kindless money survives; invalid units/range/minor/USD отклоняются.
- [ ] Только человек подтверждает brief; модель не меняет права/лимиты/денежный engine.

### D3. Call UI и форма

- [ ] Hero “Prepare for your next conversation.” Generic situation/counterpart/goal/tone/concerns, custom любая тема.
- [ ] Optional Money details: labels по виду, default open financial/existing amounts, keyed reset при смене kind, blank units/amounts → null.
- [ ] Перед Confirm видны kind/description/goal/counterpart, range provenance и one_time при наличии денег. Нефинансовый summary без сумм не содержит monetary block.
- [ ] Lobby/local camera/captions/mute/End/devices доступны; no mic → форма, без второго Agent.
- [ ] Reload не активирует устройства/платный вызов. Mobile/reduced motion/dark mode проверяются в браузере.

### D4. Callback и lifecycle

- [ ] Wrong bearer/binding, malformed/oversized input и stale/deleted/expired attempts отклоняются до model call.
- [ ] Replay/concurrency не дублируют платную генерацию; незавершённые duplicates явно отклоняются.
- [ ] End/delete/restart во время модели запрещают late patch/старый stop новой epoch.
- [ ] Cleanup/provider duration не зависят от unload; failed close остаётся pending. Calls:disable закрывает попытки.
- [ ] Нет API keys, binding, raw media или private profile/transcript в логах.

### D5. Поздний анализ — отдельная выключенная вертикаль

Scribe timestamps/слова и акустические измерения требуют отдельного consent, bounded processing и удаления временного blob. MediaPipe/pitchfinder — локальный opt-in. Полезные observations содержат временной интервал, quality/coverage, source и unavailable reason. Не выдавать оценки модели/голоса/камеры за диагноз или общую личностную готовность. Без отдельной приёмки capabilities false.

### D6. Будущая тренировка и financial-engine readiness

Сохранять общий handoff и запрет второго говоряшего соединения до подтверждённого закрытия intake. Полная тренировка/разбор не реализуется незаметно внутри коуча. Финансовый validator A отдельно проверяет поддерживаемый kind, суммы, period/basis/range и config; unknown остаётся unknown. Нефинансовый common brief не требует выдуманного financial input.

### D7. Интеграционная приёмка и документация

- [ ] TypeScript, ESLint, Vitest/SQL, Playwright, optimized build; конкретные команды/итоги в progress.
- [ ] Реальный bounded sandbox/full callback/media, затем отдельный approved product asset и нужная browser/device matrix.
- [ ] Stop/expiry/cleanup/usage/provider retention доказаны фактом, не mock/HTTP 200.
- [ ] Результаты ограниченного теста и ограничения указаны без ключей/частных реплик. Перед production свежий whole-change review.

## 6. Этапы и честный статус

| Этап | Критерий |
|---|---|
| G0 | Реальные FULL ASR/respond/repeat/SDK media, голос/lip sync/interruption/stop и бюджет |
| G1 | Любая тема → profile/review/confirm/handoff, исправления и fallback без потери данных |
| G2 | Отдельная evidence-based speech/visual вертикаль с precision/coverage, пока выключена |
| G3 | Цельный desktop/mobile production путь, независимый cleanup/retention/budget, реальный product asset |

На текущем checkpoint ключи/HTTP 200, account limits и прямые текстовые генерации Claude Sonnet 5.5/GPT 5.4 mini прошли; живое медиа пока не принято. Список проверок и фактические результаты — [acceptance](../../product/intake/acceptance.md), [progress](../../product/intake/progress.md), [setup](../../product/intake/setup-ru.md), [runbook](../../product/intake/runbook.md). Старые сроки хакатона не являются доказательством готовности.
