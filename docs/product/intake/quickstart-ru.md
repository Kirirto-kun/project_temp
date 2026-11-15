# Запуск проверенного видеозвонка

Ветка: `codex/holdline-avatar-intake`. Проверено 15 ноября 2026: полноэкранный звонок LiveAvatar FULL с человеком Wayne в sandbox, импортированный ElevenLabs TTS, ASR, ответ модели, сохранение brief и закрытие звонка. Нужны Node.js ≥22.19.0, npm и запущенный Docker Desktop для локальной PostgreSQL.

## 1. Если запускаешь на этой машине снова

Из папки проекта, после остановки предыдущего процесса через Ctrl+C:

```powershell
npm run db:up
npm start
```

Это использует уже готовую production-сборку. Терминал оставь открытым: `npm start` запускает и сайт, и независимый cleanup. Второй экземпляр на том же порту не запускай.

Открой **http://localhost:3000**, обнови страницу и нажми **Start → Check microphone → Connect to Alex**. В старом brief последняя кнопка — **Start another call**. Разреши микрофон; камера необязательна и остаётся локальной. До Connect платный звонок не начинается.

Превью человека явно помечено. Живой статус появляется после playback. Динамик справа вверху — **Enable sound**, нижняя кнопка **Full screen** разворачивает экран. **Brief & settings** открывает боковую панель. **End** завершает звонок.

## 2. После обновления кода

Заверши звонок кнопкой End, затем останови свой сервер через Ctrl+C. В чистом checkout нужной ветки:

```powershell
git pull --ff-only
npm ci
npm run db:up
npm run db:migrate
npm run build
npm run calls:enable
npm start
```

`npm ci` использует единственный `package-lock.json`. Миграция аддитивная; её повторный запуск предусмотрен. Если любая команда завершилась ошибкой, сначала устрани её, затем продолжай. Браузер после обновления перезагрузи.

Для разработки вместо build/start можно использовать `npm run dev`: он тоже запускает cleanup. Запускай один режим за раз. Текущий проверенный локальный запуск использует build/start.

## 3. На новом checkout или компьютере

```powershell
git switch codex/holdline-avatar-intake
npm ci
npm run setup:local
npm run db:up
npm run db:migrate
```

Заполни созданный `.env.local`: он не приходит из Git. На уже настроенной машине сохраняй существующий файл: `setup:local` добавляет недостающие поля, не заменяет значения.

| Что нужно | Где настраивается |
|---|---|
| `LIVEAVATAR_API_KEY`, `LIVEAVATAR_AVATAR_ID` | LiveAvatar Developers и выбранный активный avatar |
| `ELEVENLABS_API_KEY` | ElevenLabs API key с **Voices: Read** и **Text to Speech: Access** |
| `ANTHROPIC_API_KEY` или `OPENAI_API_KEY` | Достаточно одной модели; текущий основной provider — Anthropic |
| `DATABASE_URL`, `OWNER_SECRET`, `TOKEN_ENCRYPTION_KEY`, `MAINTENANCE_SECRET` | Для локальной установки генерирует setup; сохраняй их между перезапусками |

Параметры проверенного тестового режима:

```dotenv
APP_ORIGIN=http://localhost:3000
AVATAR_INTAKE_ENABLED=true
LIVEAVATAR_SANDBOX=true
INTAKE_SESSION_LIMIT_SECONDS=120
INTAKE_MAX_CONCURRENCY=1
INTAKE_MODEL_PROVIDER=anthropic
ANTHROPIC_COACH_MODEL=claude-sonnet-5-5
OPENAI_COACH_MODEL=gpt-5.4-mini
```

Sandbox дополнительно ограничивает звонок **60 секундами**, использует designated Wayne и не расходует LiveAvatar credits. Модели/TTS учитываются отдельно. Free допускает одну одновременную сессию; обычный режим без sandbox на проверенном аккаунте — до 120 секунд, не пять минут.

После заполнения ключей:

```powershell
npm run provider:configure
npm run calls:enable
npm run build
npm start
```

Helper регистрирует ElevenLabs secret и импортирует голос. Он сохраняет `LIVEAVATAR_ELEVENLABS_SECRET_ID`, `LIVEAVATAR_VOICE_ID`, `LIVEAVATAR_VOICE_SOURCE=elevenlabs`. Исходный ElevenLabs voice ID и импортированный LiveAvatar voice ID — разные ссылки. Самостоятельно подменять их друг другом не нужно. При пустом `ELEVENLABS_VOICE_ID` выбирается premade voice.

ElevenLabs Agent, GPT Realtime, собственный LiveKit, callback tunnel и отдельный Python worker не нужны. Диалог ведёт наш сервер через обычный OpenAI/Anthropic API, речь произносится через SDK.repeat.

## 4. Как проверить готовность без расходования попытки

В отдельном PowerShell:

```powershell
Invoke-RestMethod http://localhost:3000/api/health
Invoke-RestMethod http://localhost:3000/api/intake/config
```

Ожидается `status: ok`, затем `available: true`, `intakeContractVersion: 2`, `sessionLimitSeconds: 60`. В sandbox `avatarPreviewUrl` указывает на локальное превью Wayne. После запуска cleanup может понадобиться несколько секунд для heartbeat.

Готовность API ещё не доказывает живой звонок: отдельно проверь движущееся видео, слышимый голос, распознавание своей реплики и ответ, затем End и выключение индикатора микрофона.

## 5. Если что-то не работает

| Симптом | Что сделать |
|---|---|
| `available: false` | Проверить env-флаг, голос/model key, `npm run calls:enable`, работающий cleanup и PostgreSQL. После изменения env перезапустить сервер |
| `PROVIDER_ACCESS` / `PROVIDER_CONFIGURATION` | Проверить доступ LiveAvatar и зарегистрированный voice; ключи и voice references должны относиться к рабочей конфигурации |
| `PROVIDER_TIMEOUT` / `PROVIDER_NETWORK` | Проверить доступ сервера к LiveAvatar/интернету, дождаться закрытия попытки и повторить Connect явно |
| `PROVIDER_BUSY` / `CONCURRENCY_LIMIT` | Завершить предыдущий звонок и дождаться cleanup; у Free одна сессия |
| `INTAKE_QUOTA` / `DAILY_BUDGET` | Исчерпана дневная квота/резерв в PostgreSQL. Перезапуск их не сбрасывает. Счётчик по UTC; изменение локального тестового лимита должно быть осознанным |
| Видео есть, звука нет | Нажать динамик **Enable sound**; проверить громкость браузера/ОС |
| Нет разрешения на микрофон | Разрешить микрофон для localhost, снова Check microphone; выбранное устройство должно существовать |
| Старый интерфейс после pull | Остановить свой сервер, выполнить build/start и обновить страницу |
| Порт 3000 занят | Использовать уже работающий сервер либо остановить его в его терминале; не завершать все процессы Node подряд |

Текущие квоты задают `INTAKE_ATTEMPTS_PER_IP`, `INTAKE_DAILY_BUDGET_CENTS`, `INTAKE_ATTEMPT_RESERVE_CENTS`. В этом checkout для ограниченных автопроверок выставлялись 7 попыток / 1750 cents общего резерва / 250 cents на попытку. Это внутренние консервативные резервы, не цена провайдеров; стандарт шаблона — 3 / 1000 / 250. Существующие записи расходов не удалялись и неизвестные расходы не возвращались. Новая попытка может быть недоступна даже при `available: true`.

## 6. Смена ключа и остановка

После замены `ELEVENLABS_API_KEY` в `.env.local`:

```powershell
npm run provider:configure -- --refresh-secrets
```

Затем останови свой сервер через Ctrl+C и запусти `npm start`. Это обновляет ссылки на secret/voice; новый ключ сам по себе не меняет уже зарегистрированный в LiveAvatar secret. Повседневному запуску refresh не нужен.

Плановая остановка: **End**, затем Ctrl+C. Аварийно отключить новые звонки и дать cleanup закрыть старые — `npm run calls:disable`; держи процесс работающим до завершения cleanup. Снова включить — `npm run calls:enable`.

PostgreSQL хранит данные в Docker volume. Для остановки базы без удаления данных: `docker compose --env-file .env.local stop postgres`. Не удаляй volume и не пересоздавай env/secrets ради обычного перезапуска.

После изменений кода: `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, `npm run test:e2e`. E2E используют отдельную `TEST_DATABASE_URL`, не рабочую БД; живые звонки в этих тестах выключены. Последняя проверка кода: 122 unit/SQL и 12 браузерных тестов; [реальный sandbox-звонок](call-room-evidence-2026-11-15.json) проверен отдельно. Матрица Safari/устройств, качество lip sync и обычный биллинг ещё не приняты.

Подробности: [настройка провайдеров](setup-ru.md), [эксплуатация и rollback](runbook.md), [приёмка](acceptance.md).
