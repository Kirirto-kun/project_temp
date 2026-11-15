# Holdline

Подготовка к любому разговору: интервью, обратной связи, конфликту, разговору с близким, презентации, деньгам или собственной теме. AI-коуч уточняет ситуацию и цель, предлагает короткую пробу вступления и помогает составить brief, который подтверждает сам человек.

Текущий модуль реализует подготовку и управление звонком. Полноценные roleplay/debrief, финансовая симуляция и дополнительные анализаторы — отдельные последующие слои.

## Перед разработкой

1. Прочитать [TECH_STACK.md](TECH_STACK.md) и [AGENTS.md](AGENTS.md).
2. Изучить [актуальный spec](docs/superpowers/specs/2026-11-15-universal-api-coach-design.md), [план реализации](docs/superpowers/plans/2026-11-15-universal-api-coach.md), [PLAN.md](PLAN.md) и поправки своего плана A/B/C/D.
3. Использовать [brandbook.html](brandbook.html): иллюстрированные/стилизованные продуктовые персонажи, включая коуча.

Стек: **Next.js / React / TypeScript / PostgreSQL / LiveAvatar FULL / прямой OpenAI Chat API или Anthropic / ElevenLabs TTS**. ElevenLabs Agent не нужен. Свой LiveKit, Python worker, GPT Realtime, Redis/Upstash и S3/R2 для аудио не используются.

## Локальный запуск

**[Короткая инструкция запуска и восстановления](docs/product/intake/quickstart-ru.md)** — повторный запуск, обновление, ключи/голос, проверка готовности и типовые ошибки.

~~~powershell
npm ci
npm run setup:local
npm run db:up
npm run db:migrate
npm run dev
~~~

Откройте [localhost:3000](http://localhost:3000). dev запускает Next.js и независимый cleanup. Повтор setup:local добавляет отсутствующие поля шаблона и сохраняет существующие значения/комментарии в игнорируемом .env.local.

Универсальная форма работает без provider keys. Общий контракт v2: kind/description/goal/counterpartRole, optional desiredTone; деньги, диапазон, дата и avatar необязательны. Unknown остаётся unknown. Изменение профиля отзывает подтверждение; смена заданного типа разговора очищает прежние денежные предположения. Пустой общий missingFields не означает готовность финансового движка.

## Подключение реального звонка

Нужны LiveAvatar API key/avatar ID, model key OPENAI_API_KEY или ANTHROPIC_API_KEY и настроенный voice. Обычный путь использует ELEVENLABS_API_KEY и optional ELEVENLABS_VOICE_ID; helper выберет premade voice при пустом поле. Модели выбираются INTAKE_MODEL_PROVIDER и IDs claude-sonnet-5-5 / gpt-5.4-mini. Ключи только на сервере/в игнорируемом env.

~~~powershell
npm run provider:configure
~~~

Helper регистрирует ElevenLabs TTS secret, импортирует voice и сохраняет LIVEAVATAR_ELEVENLABS_SECRET_ID, LIVEAVATAR_VOICE_ID и LIVEAVATAR_VOICE_SOURCE. Ни Agent, ни provider context/LLM configuration не нужны. Для отдельного transport-only sandbox-теста с LIVEAVATAR_SANDBOX=true:

~~~powershell
npm run provider:configure -- --test-default-voice
~~~

Этот вариант берёт built-in LiveAvatar voice и не проверяет ElevenLabs TTS. Он запрещён вне sandbox. Перед обычным ElevenLabs прогоном повторите helper без флага; тестовый voice не должен попасть в normal/production.

LiveAvatar FULL выдаёт managed ASR events. Клиент сохраняет финальную реплику через owner API и запрашивает POST /api/intake/:id/respond. Сервер загружает собственный transcript и вызывает существующий callback внутри процесса с Bearer + HMAC intake/epoch/deadline; затем валидирует model patch через ProfileControl. Клиент получает reply/view и произносит ответ через SDK.repeat. Speech start вызывает SDK.interrupt и отменяет/инвалидирует прошлый turn. Внешний callback URL, отдельный ingress и tunnel для этого режима не нужны.

Включение — AVATAR_INTAKE_ENABLED=true + npm run calls:enable + свежий cleanup heartbeat. APP_ORIGIN — канонический origin UI; локально подходит localhost. CUSTOM_LLM_API_KEY необязателен: внутренний bearer по умолчанию выводится из OWNER_SECRET. Настройте бюджет/конкуренцию до теста. Session limit ≤300s, проверенный Free ≤120s/одна сессия, sandbox ≤60s.

Sandbox Wayne — только технический test asset. Продукту нужен approved стилизованный персонаж. Покупка/overage для настройки не требуются. **Ограниченный живой sandbox-звонок с импортированным ElevenLabs TTS прошёл:** человеческое видео, звук, ASR, ответ модели, brief и проверенное закрытие сессии. Это не приёмка других браузеров, качества lip sync или обычного биллинга; [фактический результат](docs/product/intake/call-room-evidence-2026-11-15.json).

- [Пошаговая настройка](docs/product/intake/setup-ru.md)
- [Эксплуатация, Docker, API v2 и rollback](docs/product/intake/runbook.md)
- [Критерии приёмки](docs/product/intake/acceptance.md)
- [Журнал проверки](docs/product/intake/progress.md)
- [Серверный prompt и формат ответа](docs/product/intake/coach-prompt.md)

## Проверки

npm run lint, npm run typecheck, npm test, npm run build, npm run test:e2e. SQL tests используют отдельную test database; E2E принудительно отключают платные вызовы. Ограниченные live tests запускаются отдельно, не в бесплатном CI. Production dependencies: npm audit --omit=dev.

Наш сервис не сохраняет raw audio/video. Draft/transcript удаляются по TTL 24h; камера остаётся локальной. Provider retention проверяется отдельно. Без готового approved live asset нарисованный Alex остаётся честно обозначенным постером.
