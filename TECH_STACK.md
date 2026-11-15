# Holdline — единый технический стек

**Статус: решение владельца от 15 ноября 2026, редакция universal API coach / контракт v2.** Продукт помогает готовиться к любым разговорам: интервью, обратной связи, конфликтам, отношениям, презентациям и собственным темам. Деньги — необязательный частный случай. Текущий объём — знакомство с коучем, короткая проба вступления и подтверждённый brief; отдельные полноценные roleplay/debrief и финансовый движок этим изменением не объявляются реализованными.

Это решение заменяет прежние LITE + ElevenLabs Agent Connector и обязательную зарплатную анкету. Также отменены собственный LiveKit, Python worker, OpenAI Realtime, Redis и объектное хранилище аудио. При конфликте старого плана с этим документом применить новую редакцию. Детали: [spec](docs/superpowers/specs/2026-11-15-universal-api-coach-design.md), [план реализации](docs/superpowers/plans/2026-11-15-universal-api-coach.md).

Сначала читать этот файл, [AGENTS.md](AGENTS.md), [PLAN.md](PLAN.md), свой план A/B/C/D и [brandbook.html](brandbook.html). Общие версии Node/пакетов и единственный npm lockfile ведёт B.

## 1. Принятые технологии

| Область | Решение | Граница |
|---|---|---|
| Приложение | Next.js App Router, React, TypeScript strict, Node.js | Весь наш runtime — TS/JS |
| UI | Tailwind CSS, shadcn/ui, Lucide, токены Holdline | Брендбук задаёт цвета, шрифты и иллюстрации |
| Контракты | Zod, общие QuizAnswers / QuizDraft в src/contracts/domain.ts | Форма и коуч сохраняют один draft, intake API v2 |
| Видеокоуч | LiveAvatar FULL и официальный @heygen/liveavatar-web-sdk | LiveAvatar обслуживает ASR, turn-taking, комнату, медиа и lip sync |
| Модель коуча | Прямой серверный OpenAI Chat Completions API или Anthropic Messages API | Не GPT Realtime; ElevenLabs Agent не нужен |
| Голос | ElevenLabs TTS voice, импортированный в LiveAvatar | API key находится в provider secret store; отдельного разговорного Agent нет |
| Подписанная модельная граница | Owner-authenticated /respond → внутренний callback в том же серверном процессе | Bearer + HMAC intake/epoch/deadline, server transcript/prompt и кандидат профиля; внешний ingress не нужен |
| База | Существующая PostgreSQL, согласованный DB-слой и миграции B | Профили, sessions, turns, receipts, budgets, flags и задания; без runtime Map fallback |
| Финансовое ядро | Чистый TypeScript, отдельный будущий специализированный слой | Денежные переходы считает код; готовность оценивается отдельно от обычного brief |
| Речевые измерения | Поздний Scribe proxy → transcript/timings/метрики в jsonb | В текущем модуле analysis capabilities выключены |
| Локальный анализ | Поздние Web Audio / MediaRecorder / pitchfinder / MediaPipe | Только после отдельной приёмки, флагов и opt-in; камера локальна |
| Оплата | Polar, будущая отдельная интеграция | Серверные webhooks и права; не условие подготовки произвольной темы |
| Проверки | TypeScript, ESLint, Vitest, Playwright | Бесплатные unit/SQL/E2E отдельно от ограниченных живых вызовов |

LiveKit может быть внутренним транспортом официального Web SDK. Собственный проект, сервер, credentials, dispatch и LiveKit Agents worker не создаём. Запускается одно говорящее медиа-соединение LiveAvatar; дополнительный ElevenLabs widget/Agent не подключаем.

## 2. Поток первого звонка

~~~text
Браузер → same-origin Next.js API → PostgreSQL: owner/draft/revision/квота
Явный Connect → резерв бюджета → LiveAvatar FULL token без context/LLM config
Браузер ↔ официальный SDK ↔ LiveAvatar: managed ASR / медиа / lip sync
                ↓ финальный USER_TRANSCRIPTION
        /api/intake/:id/events → server transcript
                ↓ после фиксации
        owner-authenticated POST /api/intake/:id/respond
                ↓ сервер загружает свой transcript/attempt
        внутренний callback Request: Bearer + HMAC intake/epoch/deadline
                ↓
        OpenAI Chat API или Anthropic → reply / changes / action
                ↓
        Zod ProfilePatch → ProfileControl → PostgreSQL → reply + view
                ↓
        браузер → SDK.repeat(reply) → один голос LiveAvatar / ElevenLabs TTS

USER_SPEAK_STARTED → SDK.interrupt + отмена/инвалидация предыдущего turn
Review / End → provider stop + SDK/local-device cleanup → human Confirm
~~~

FULL token задаёт voice_id, язык, media settings и duration; provider context и vendor LLM configuration не создаются. Провайдер не вызывает нашу модельную HTTP-точку для текущего разговора. Обычного same-origin подключения UI достаточно; отдельный публичный callback URL, proxy или tunnel не нужны.

Подписанный provider-callback контракт сохраняется как внутренний серверный boundary. /respond проверяет owner/Origin/client/epoch/latest committed turn и сам строит authenticated Request к существующему callback handler в процессе: Bearer + HMAC intake/epoch/deadline. Он использует сохранённый server transcript, серверный COACH_SYSTEM_PROMPT и owner-bound кандидат. CUSTOM_LLM_API_KEY — необязательный внутренний override; без него bearer выводится из OWNER_SECRET. Secrets/binding браузер не получает.

Валидированный результат проходит через тот же ProfileControl с owner/revision/providerEpoch/idempotency; модель не подтверждает brief/согласие/права/оплату. PostgreSQL receipts, body/turn limits, повторная проверка epoch/deadline и cancellation сохраняются. Завершённый повтор переиспользует результат; in-flight duplicate не запускает вторую платную генерацию. Speech start отменяет/инвалидирует предыдущий ответ; End/delete/истёкшая epoch запрещают late write и playback.

Защищённые маршруты /api/avatar-llm/v1/chat/completions и alias без /v1 могут оставаться для будущей server-to-server интеграции. Их публикация не является условием текущего режима. Browser client tools и ElevenLabs Agent не нужны.

## 3. Общий профиль v2 и граница денег

Обязательные поля полного общего QuizAnswers: kind, description, goal, counterpartRole. Для совместимости description допускает пустую строку в схеме, но missingFields считает её отсутствующей. QuizDraft — partial той же схемы; старые зарплатные drafts остаются читаемыми.

- kind: raise, offer, rent, bill, interview, feedback, conflict, relationship, presentation, custom. custom принимает любую другую тему.
- description: ситуация, до 4000 символов; goal: желаемый результат, 1–2000; counterpartRole: человек/роль/аудитория, 1–200. Поля обрезаются по краям.
- desiredTone необязателен, 1–300 символов. userRole и fear необязательны; роль не обязана быть профессией.
- Все monetary fields, conversationDate, inputMode, rangeSource и avatarId необязательны. Суммы currentMinor/targetMinor/marketLowMinor/marketHighMinor — целые USD cents, 1…10_000_000_000. При наличии суммы сервер требует currency=USD, period=year/month/one_time и moneyBasis=gross/net/unspecified; low не превышает high.
- Другую валюту сохраняем словами в description, без молчаливого переименования в USD. Неизвестные суммы, диапазоны и единицы остаются отсутствующими.
- Явная смена уже заданного kind, включая его очистку, сначала удаляет прежние суммы, currency/period/moneyBasis/rangeSource, затем применяет новый patch. Остаются только явно переданные заново деньги. Первое присвоение kind старому kindless draft само по себе его суммы не стирает.
- Любое изменение профиля, включая goal, отзывает человеческое подтверждение. Контекст и цель видны до Confirm.
- missingFields описывает только общую подготовку: kind, description, goal, counterpartRole. Отсутствие денег, market или avatar не блокирует обычную тему.
- Подтверждённый brief и пустой missingFields не доказывают готовность финансовой симуляции. Будущий financial-engine validator отдельно проверяет поддерживаемый вид, суммы, диапазон, единицы и конфигурацию.

## 4. PostgreSQL и доступ

Используем существующий DATABASE_URL и единый DB-слой; модуль добавляет только согласованную схему holdline_intake. Новый ORM или независимую БД на ветку не добавлять. CAS, транзакции и уникальные ключи защищают повтор/конкуренцию между экземплярами; Map допустим только в unit fixtures.

Гостевой доступ использует HttpOnly owner cookie, серверную принадлежность ресурса и Origin checks для браузерных мутаций. ID из URL не даёт права доступа. Внутренний callback сохраняет отдельную сервисную авторизацию и HMAC-привязку к owner-bound попытке; оставшийся внешний route тоже не принимает неподписанный запрос. Provider bindings и API keys не попадают в public view.

Наши draft/transcript/наблюдения имеют TTL 24h, проверяются на чтении и периодически удаляются. Платёжные записи не наследуют этот TTL. Изменение длительности истории — отдельное продуктовое решение. Delete и tombstone предотвращают позднее воскрешение.

## 5. Lifecycle и расходы

- До явного действия пользователя нет платного звонка и запроса устройств. Создание draft не обращается к провайдеру.
- INTAKE_SESSION_LIMIT_SECONDS задаёт deadline, максимум 300s. У проверенного Free-аккаунта максимум 120s и одна одновременная сессия; локальная настройка — 120. Sandbox ограничен 60s. Reconnect не продлевает попытку.
- Intake имеет отдельную квоту до 3 попыток/IP/UTC-день, атомарный резерв и глобальный бюджет. Reserve — консервативный предел, не заявленная цена звонка. Явный restart после stop расходует новую квоту.
- Нужны AVATAR_INTAKE_ENABLED=true, PostgreSQL calls:enable, полный provider config и свежий heartbeat независимого cleanup. Browser unload не заменяет provider stop и серверное reconciliation.
- Review/End/error освобождают LiveAvatar, SDK, микрофон и локальную камеру. Failed/ambiguous stop остаётся pending и повторяется; closed не объявляется по одному disconnect.
- Проверенные 10 LiveAvatar credits при FULL 2 credits/min соответствуют примерно 5 минутам суммарного LiveAvatar usage, а не разрешению на пятиминутную Free-попытку. ElevenLabs TTS и модели оплачиваются отдельно. Покупка планов или включение overage не требуется и не авторизовано.
- LIVEAVATAR_SANDBOX=true использует designated Wayne для технической проверки до 60s без LiveAvatar credits. Это тестовый режим; он не заменяет одобренного стилизованного продуктового коуча и не делает сторонние API бесплатными.

## 6. Аудио, камера и бренд

Raw audio/video по умолчанию не сохраняем. Поздний анализ: явное согласие → временная запись → ограниченный Scribe proxy → transcript/timings в PostgreSQL jsonb → уничтожение blob/buffer. Job не ссылается на уже уничтоженную запись. Опциональный replay через bytea ≤24h требует отдельного флага, согласия, лимитов размера и автоочистки; S3/R2 не добавляем.

MediaPipe/pitchfinder выключены до отдельной приёмки. Камера optional, только local self-view; видео, кадры и raw landmarks не отправляются на наш сервер. Нельзя выводить эмоции, диагноз, честность или личностные качества из голоса/камеры. Provider retention проверяется отдельно.

Продуктовый коуч и каталог — иллюстрации/стилизованные персонажи брендбука с постоянной меткой AI. Сгенерированные фотореалистичные лица запрещены. PNG-постер не доказывает наличие approved live asset; custom/non-human avatar может требовать подготовки и проверки провайдера. Wayne sandbox — только технический тест, без продуктового исключения.

## 7. Владельцы и эксплуатация

| Ветка | Ответственность |
|---|---|
| A | Общие схемы и деньги; будущие финансовые адаптеры/ядро и их отдельный readiness |
| B | PostgreSQL/auth, budgets/flags/jobs, env/npm/CI/deploy, секреты и модельные API |
| C | Общая оболочка, универсальная форма/маршруты, бренд и reusable capture; будущая тренировка отдельно |
| D | LiveAvatar FULL/SDK, signed callback и модельный intake, brief/review/handoff, stop/recovery |

Общие пакеты/миграции/схемы согласуются с владельцами. Не добавлять Python/uv/pytest, свой LiveKit, OpenAI Realtime, Redis/Upstash или S3/R2 для аудио. Сохранять границы планов с поправкой на контракт v2.

Настройка: npm run provider:configure регистрирует ElevenLabs TTS secret и импортирует voice; context/LLM configuration/Agent ID не создаются. Для sandbox transport-only прогона доступен npm run provider:configure -- --test-default-voice: built-in LiveAvatar voice, без приёмки ElevenLabs TTS. APP_ORIGIN остаётся каноническим UI origin; отдельного внешнего callback/tunnel нет. Production UI требует обычного защищённого HTTPS размещения. Подробности: [setup](docs/product/intake/setup-ru.md), [runbook](docs/product/intake/runbook.md), [приёмка](docs/product/intake/acceptance.md).

Проверенные ключи, HTTP 200 и успешная текстовая генерация на обеих моделях не доказывают работу медиа. Полный звонок, lip sync, перебивания, реальное завершение и расходы принимаются отдельно и фиксируются в progress.md.
