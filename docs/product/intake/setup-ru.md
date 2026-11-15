# Настройка универсального видеокоуча

Для уже настроенной машины начни с [короткой инструкции запуска](quickstart-ru.md). Здесь — подробная первоначальная настройка провайдеров.

Схема: **LiveAvatar FULL ASR event → owner API /respond → внутренний подписанный callback → OpenAI Chat API или Anthropic → reply → SDK.repeat; голос — ElevenLabs TTS через LiveAvatar**. LiveAvatar обслуживает ASR, turn-taking, комнату, медиа и lip sync. ElevenLabs Agent и dashboard tools не нужны. GPT Realtime, свой LiveKit/Python/Redis не используются.

Коуч готовит любой разговор: интервью, feedback, конфликт, отношения, презентацию или собственную тему. Зарплата/рынок не нужны для обычного brief. Это знакомство и короткая проба вступления; отдельные полноценные roleplay/debrief ещё не объявлены реализованными.

## 1. Проверить локальную установку

~~~powershell
npm ci
npm run setup:local
npm run db:up
npm run db:migrate
npm run dev
~~~

setup:local создаёт игнорируемый .env.local по .env.example с локальными DB/auth/encryption secrets, если файла нет. При повторе добавляет отсутствующие поля, сохраняя существующие значения, комментарии и custom settings. Не заменяйте настроенный файл пустым шаблоном. Каждая переменная — отдельная строка; сохраните файл в редакторе перед запуском команды.

dev запускает Next.js и независимый cleanup. Для локальной PostgreSQL нужен Docker; по умолчанию откройте [localhost:3000](http://localhost:3000). Форма работает без provider keys. Если используете существующую PostgreSQL вместо контейнера, задайте серверный DATABASE_URL и примените аддитивную миграцию holdline_intake. Другие таблицы приложения не меняются.

## 2. Проверить LiveAvatar и персонажа

Откройте [LiveAvatar](https://app.liveavatar.com/) и его [Developers](https://app.liveavatar.com/developers). Для проверенного 15 ноября аккаунта подтверждены API-доступ, 10 credits, ACTIVE avatar, одна одновременная сессия и предел Free 120s. Это снимок аккаунта, не обещание будущих тарифов. Для настройки не требуется покупать план или включать overage.

В .env.local нужны LIVEAVATAR_API_KEY и LIVEAVATAR_AVATAR_ID. Не отправляйте ключи в чат, не выводите их в логи и не коммитьте файл.

Продуктовый коуч должен быть разрешённым иллюстрированным/стилизованным персонажем брендбука. Custom/non-human asset может требовать [подготовленного видео и проверки HeyGen](https://help.heygen.com/en/articles/10035615-how-to-get-started-with-liveavatar). ACTIVE у API-asset не доказывает соответствие нашему бренду. Нарисованный Alex в интерфейсе — локальный постер, не загруженный автоматически live avatar.

LIVEAVATAR_SANDBOX=true использует designated Wayne только для технического sandbox-теста до 60s без LiveAvatar credits. Это не разрешение показывать Wayne как продуктового коуча. ElevenLabs/model API могут тарифицироваться отдельно.

## 3. Подготовить API keys моделей и голоса

На этом аккаунте ключи уже подтвердили HTTP 200; ElevenLabs paid subscription действительна. Это не означает, что живой звонок принят. При самостоятельной настройке нужны:

| Переменная | Назначение |
|---|---|
| ELEVENLABS_API_KEY | Доступ к TTS-голосу и регистрация secret в LiveAvatar |
| ELEVENLABS_VOICE_ID | Необязательный исходный voice ID; helper выберет premade voice, если поле пустое |
| OPENAI_API_KEY | Обычный OpenAI Chat Completions API |
| ANTHROPIC_API_KEY | Прямой Anthropic Messages API |

Достаточно одного model API key. Если настроены оба, INTAKE_MODEL_PROVIDER задаёт основной; сервер может использовать второй настроенный provider при ошибке. Ограничения и счета OpenAI/Anthropic/ElevenLabs независимы от LiveAvatar.

Не создавайте ElevenLabs conversational Agent, не добавляйте Agent ID, client tools, widget или второе голосовое соединение.

## 4. Выбрать модель

~~~dotenv
INTAKE_MODEL_PROVIDER=anthropic
ANTHROPIC_COACH_MODEL=claude-sonnet-5-5
OPENAI_COACH_MODEL=gpt-5.4-mini
~~~

Допустимы anthropic и openai. На вымышленном нефинансовом запросе реальные генерации обеих указанных моделей прошли. Это подтверждает текстовый model adapter; голос/липсинк/перебивания проверяются отдельно.

Каноническая логика — COACH_SYSTEM_PROMPT в src/onboarding/server/coach-model.ts; описание и wire format в [coach-prompt.md](coach-prompt.md). Копировать prompt в ElevenLabs dashboard не требуется.

## 5. Проверить серверный режим без внешнего callback

Текущий LiveAvatar FULL token не содержит provider context или vendor LLM configuration. LiveAvatar даёт managed ASR и медиа; наш браузерный controller сохраняет финальную реплику через owner-authenticated API, затем вызывает POST /api/intake/:id/respond.

Сервер проверяет owner/Origin/client/epoch/latest turn, загружает свой transcript и вызывает существующий callback handler внутри процесса. Bearer + HMAC intake/epoch/deadline остаются обязательными, как и PostgreSQL receipts, bounded model calls и защита от late writes. Клиент получает только reply/view и вызывает SDK.repeat. Speech start прерывает SDK и отменяет/инвалидирует предыдущий ответ.

APP_ORIGIN — точный канонический UI origin, локально обычно http://localhost:3000. Внешний callback URL, tunnel, отдельный proxy и ручная provider LLM configuration не нужны. Protected callback route может оставаться для будущего server-to-server использования, но LiveAvatar не обязан его вызывать в текущем режиме.

CUSTOM_LLM_API_KEY — optional внутренний bearer override; если подходящего override нет, ключ выводится сервером из OWNER_SECRET. Не нужно создавать публичный секрет или передавать binding браузеру.

## 6. Настроить TTS voice

Обычный путь после заполнения LIVEAVATAR_API_KEY и ELEVENLABS_API_KEY:

~~~powershell
npm run provider:configure
~~~

scripts/configure-liveavatar.ts регистрирует ElevenLabs TTS secret, выбирает/импортирует voice и сохраняет только voice references. Если ELEVENLABS_VOICE_ID пуст, helper выбирает premade voice. Для списка голосов ElevenLabs key должен иметь voices_read; при отказе разрешений helper даст понятную ошибку. Conversational Agent/Agent ID/dashboard tools/context/LLM configuration не создаются.

Helper заполняет в игнорируемом .env.local:

~~~dotenv
LIVEAVATAR_ELEVENLABS_SECRET_ID=
LIVEAVATAR_VOICE_ID=
LIVEAVATAR_VOICE_SOURCE=elevenlabs
~~~

Пустые строки здесь показывают имена, не команды для очистки готовых значений. Secrets браузер не получает. Повтор helper переиспользует references; после смены конфигурации перезапустите приложение.

Для отдельного технического sandbox-теста можно выбрать built-in LiveAvatar voice:

~~~powershell
npm run provider:configure -- --test-default-voice
~~~

Сначала задайте LIVEAVATAR_SANDBOX=true. Этот флаг helper запрещён вне sandbox; он пишет LIVEAVATAR_VOICE_SOURCE=liveavatar-test и тестовый voice ID, не регистрирует ElevenLabs TTS. Такой тест не принимает качество/права/биллинг ElevenLabs. Для обычного прогона повторите provider:configure без test-флага: helper заменит тестовый voice импортированным ElevenLabs. Тестовый source нельзя использовать при sandbox=false.

## 7. Ограничить тестовую попытку

Для проверенного Free-аккаунта:

~~~dotenv
INTAKE_SESSION_LIMIT_SECONDS=120
INTAKE_MAX_CONCURRENCY=1
LIVEAVATAR_SANDBOX=true
~~~

Sandbox дополнительно ограничивает попытку 60s. Обычный FULL использует настроенные 120s; абсолютный продуктовый потолок — 300s, но он не отменяет меньшие account limits. Reconnect не продлевает попытку.

FULL 2 credits/min и 10 доступных credits дают примерно 5 минут суммарного LiveAvatar usage, а не одну разрешённую пятиминутную Free-сессию. ElevenLabs TTS/модели считаются отдельно. Задайте INTAKE_DAILY_BUDGET_CENTS и INTAKE_ATTEMPT_RESERVE_CENTS консервативно для всего теста; это наши лимиты в USD cents, не заявленная цена поставщиков. Новые покупки/overage не нужны.

## 8. Разрешить ограниченный локальный тест

1. Проверьте LIVEAVATAR_API_KEY/AVATAR_ID/VOICE_ID, корректный voice source, хотя бы один model key, APP_ORIGIN и серверные auth/encryption secrets. Внешнего callback URL не требуется.
2. Установите AVATAR_INTAKE_ENABLED=true в .env.local.
3. Выполните npm run calls:enable и перезапустите npm run dev после сохранения env.
4. Дождитесь независимого cleanup heartbeat. Call admission требует env-флаг, PostgreSQL avatar_intake=true, конфигурацию и свежий heartbeat одновременно.
5. Обновите страницу. GET /api/intake/config показывает intakeContractVersion:2, availability и фактический sessionLimitSeconds. До готовой конфигурации доступна форма.

Квота по умолчанию — 3 intake-попытки/IP/UTC-день отдельно от будущих тренировок; серверная INTAKE_ATTEMPTS_PER_IP допускает 1–10. Общий денежный резерв и concurrency проверяются отдельно и не увеличиваются вместе с этой настройкой. Повтор активного запроса не создаёт вторую платную попытку. Не повышайте бюджеты, чтобы обходить невыясненную ошибку.

  ## 9. Пройти первый живой тест

**Sandbox-проверка пройдена:** настоящее видео и звук, ASR, ответы модели, сохранение кандидата и End с закрытием provider session/микрофона. Первоначальный прогон использовал built-in voice и проверил ручное подтверждение/reload. После обновления ключа ElevenLabs voice импортирован и полный sandbox-звонок с этой конфигурацией также прошёл. Экран звонка занимает всё окно: видео, локальная камера поверх, управление внизу, brief/settings сбоку. Полная продуктовая приёмка, Safari, обычный биллинг и качество перебиваний остаются отдельно в [acceptance.md](acceptance.md); детали — в [progress.md](progress.md).

1. До Start нет звука, запроса устройств и provider session. Start → Check microphone; камеру сначала оставить выключенной.
2. Connect to Alex. Проверить один слышимый голос, lip sync, субтитры и живое видео отдельно от постера. Записать voice source: built-in transport-only или импортированный ElevenLabs.
   В sandbox до подключения показано явно помеченное превью человека Wayne; живой статус появляется после playback. Если браузер заблокировал звук, нажмите кнопку с динамиком Enable sound вверху справа. Full screen разворачивает экран по вашему нажатию; Brief & settings открывает/закрывает боковую панель. Камера остаётся локальной.
3. Проверить ASR event → сохранённый transcript → owner /respond → signed internal boundary → model/ProfileControl → SDK.repeat. Нефинансовый пример: “I want to talk to my partner about how we divide household tasks. I want us to agree on a fair plan. I want to sound calm and considerate.” Коуч не спрашивает обязательную зарплату/рынок.
4. Проверить kind/ситуацию/собеседника/goal и optional desiredTone. Они кандидатные; только человек нажимает Confirm.
5. Перебить ответ и исправить цель. Старый хвост не должен возобновиться; новое предложение отображается без автоматического подтверждения.
6. End/review закрывают медиа, микрофон и provider session. Reload восстанавливает brief, не включает устройства и не начинает новую платную попытку.
7. Отдельно проверить custom-тему: бытовая договорённость, выступление или любой другой контекст. Money details остаются пустыми.
8. Если денег касается именно эта задача, проверить явные USD/period/gross-net и исправления. Смена salary → relationship очищает старые суммы; другая валюта остаётся словами без подмены на USD.
9. Проверить deny mic, camera on/off, обрыв сети, End во время startup, две вкладки, deadline и abandoned-call cleanup. Free не допускает две одновременные provider sessions: отказ должен быть понятным.
10. Записать фактические model/voice/config versions, deadline, stop, credits/usage и ограничения браузера. Затем отдельно desktop Chrome, реальный Safari/iPhone и нужную сеть. Offline E2E не доказывают реальный звонок.

Для аварийного выключения — npm run calls:disable. Cleanup должен закрыть оставшиеся попытки; при ошибке stop повторяется. Проверьте provider sessions отдельно.

## 10. Перед публикацией

- Обычное постоянное HTTPS размещение UI и точный APP_ORIGIN. Модельный boundary остаётся подписанным внутри сервера; отдельный внешний callback/tunnel не нужен.
- Approved стилизованный product avatar вместо sandbox Wayne; честная метка AI coach.
- Рабочая PostgreSQL, миграция, защищённые серверные secrets, бюджет и постоянно работающий cleanup. Подробности в [runbook](runbook.md).
- Проверенные provider retention/delete controls. У нас raw audio/video не сохраняются; это не определяет retention у LiveAvatar/ElevenLabs/модельного provider.
- Trusted IP header только если ingress удаляет входящее значение и выставляет своё. Иначе действует консервативная общая квота.
- Фактическая [приёмка](acceptance.md) живого медиа; никакого обещания production readiness по одному HTTP 200.

Scribe/MediaPipe/pitchfinder, полный roleplay/debrief и финансовое ядро — отдельные последующие слои, не требование для подготовки обычной темы.
