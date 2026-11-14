# Holdline. План 4 из 4. Первый созвон с аватаром и разбор подачи

> **Стек обновлён 15 ноября 2026:** обязательный источник истины — [TECH_STACK.md](../../../TECH_STACK.md). Применять его вместе с этим планом: TypeScript, PostgreSQL, LiveAvatar LITE + ElevenLabs connector; без собственного LiveKit, Python worker, OpenAI Realtime, Redis и S3/R2 для аудио. MediaPipe/pitchfinder — поздние опциональные слои.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** заменить первый опросник полноценным знакомством по видеосвязи: серьёзный AI-коуч выясняет профессию, текущую и желаемую зарплату, обстоятельства будущего разговора, затем даёт полезный разбор речи и наблюдаемых движений и передаёт подтверждённые ответы в тренажёр.

**Architecture:** Next.js/TypeScript использует LiveAvatar LITE + ElevenLabs Agent Connector; managed room и provider worker обслуживает HeyGen. Agent «Коуч» вызывает client tool save_profile, браузер передаёт запрос нашему API, профиль сохраняется в существующей PostgreSQL. Пользователь подтверждает суммы. Scribe сохраняет transcript/timings без хранения raw audio; MediaPipe/pitchfinder — поздние локальные слои за флагами.

**Tech Stack:** Next.js/React/TypeScript/Zod, @heygen/liveavatar-web-sdk, LiveAvatar LITE + ElevenLabs Agent Connector, ElevenLabs Agent «Коуч» и Scribe, PostgreSQL/jsonb. Позднее: MediaPipe/pitchfinder в браузере. Один npm lockfile, Vitest/Playwright; без Python/pytest.

**Spec:** [PLAN.md](../../../PLAN.md), [A — ядро и общие типы](2026-11-15-01-engine.md), [B — платформа](2026-11-15-02-platform.md), [C — продукт](2026-11-15-03-product.md), [брендбук](../../../brandbook.html).

**Разработчик:** D. **Ветка:** `codex/holdline-avatar-intake`. **Дата исследования:** 15 ноября 2026. Это новая обязательная продуктовая вертикаль, а не небольшая задача внутри квиза C.

## Общие ограничения

- Первый экран приглашает на знакомство с AI-коучем. Это ещё не торг с начальником и не собеседование при приёме на работу.
- Целевая длительность знакомства — 3–4 минуты, жёсткий предел медиасессии — 5 минут; пользователь может завершить раньше.
- Камера рекомендована для визуальной обратной связи, но не обязательна. Равноправные пути: видеоаватар с локальной камерой, без камеры, аудио, текстовая форма.
- Первая версия сохраняет английский язык и USD основного продукта. Другую валюту или язык нельзя молча переименовать в USD/английский; сохранить ввод, объяснить границу и предложить явный пример или поддерживаемый режим.
- «Кто ты» означает профессию, роль и контекст. Имя необязательно; работодатель, возраст, пол и другие личные признаки не нужны для запуска тренировки.
- Все денежные значения требуют подтверждения валюты, периода и basis gross/net. Неизвестная зарплата/рынок не превращаются в выдуманную цифру.
- Обратная связь описывает наблюдаемые события. Нельзя выводить «нервный человек», «неуверенный кандидат» или диагноз из взгляда, голоса либо движений.
- Базовый видеоанализ работает на устройстве. Камера пользователя не публикуется в WebRTC-комнату; сервер получает только выбранные измерения и coverage после согласия.
- Включённый вводный созвон должен пройти полноценную приёмку. Запасной квиз обеспечивает доступность, но сам по себе не закрывает готовность новой функции.

## На что обратить внимание при ревью

1. Пользователь поправил «fifteen» на «fifty», месяц на год или net на gross — старая сумма отменена, новая подтверждена; D2/D3.
2. Пользователь думает, повторяет слог или говорит с акцентом — коуч не перебивает и не снижает «оценку личности»; D3/D5.
3. Камера выключена, руки вне кадра или темно — unavailable с причиной, без выдуманной позы/взгляда; D4.
4. Прерывание аватара, reconnect, повтор tool call — только один звук, одна запись изменения профиля, корректная история услышанного; D1/D3.
5. После перехода в тренажёр вводный звонок действительно закрыт: не остаются платная комната, микрофон, worker и старые credentials; D6/D7.

## 1. Принятые технологии

Решение владельца — **LiveAvatar LITE + ElevenLabs Agent Connector + PostgreSQL**, весь наш runtime на TypeScript. [TECH_STACK.md](../../../TECH_STACK.md) обязателен; собственный LiveKit/Python worker/OpenAI Realtime/Redis/S3 отменены.

| Задача | Решение | Граница |
|---|---|---|
| Иллюстрированный видеокоуч | LiveAvatar LITE и официальный Web SDK | Допустимый stylized/custom avatar ID, без фотореалистичного лица |
| Диалог | ElevenLabs Agent «Коуч» | Поддерживаемый LLM выбирается в agent config; Anthropic допустим |
| Голос ↔ видео | ElevenLabs Agent Connector | Managed room/worker, lip-sync, interruption, passthrough events |
| Профиль | Client tool save_profile → наш API → PostgreSQL | Тот же QuizAnswers, что у формы; Zod/owner/CAS/idempotency; суммы подтверждает человек |
| Речевой разбор | Scribe → transcript/timings jsonb | Временная запись освобождается, raw audio не хранится |
| Камера / F0 | MediaPipe / pitchfinder в браузере | Последние слои, opt-in/feature flags; на сервере только выбранные агрегаты |

### Подтверждено документацией

- [Коннектор](https://docs.liveavatar.com/docs/lite-mode/connectors/elevenlabs-agent.md) обслуживает комнату и provider worker. Требует платного ElevenLabs, permissions convai_read/user_read/voices_read и **PCM 24K**.
- client_tool_call приходит внутри elevenlabs_agent_event; ответ — elevenlabs_agent_command с внутренним типом client_tool_result. В payload команды нет type. Здесь FULL-mode event system, а не обычные LITE WebSocket events.
- Inline elevenlabs_agent_config поддерживает session variables; stored voice agent не принимает per-session language/dynamic_variables overrides. Способ session binding закрепить на G0. Не открывать второй direct ElevenLabs-разговор ради tools.
- [Client tools ElevenLabs](https://elevenlabs.io/docs/eleven-agents/customization/tools/client-tools) исполняются клиентом. save_profile вызывает наш защищённый API, а не БД напрямую; модель не подтверждает профиль. В agent config включить ожидание результата.
- [Non-human/custom avatar](https://help.heygen.com/en/articles/10035615-how-to-get-started-with-liveavatar) может требовать подготовленного видео, consent и ручного одобрения HeyGen. Любая PNG не считается готовым интерактивным аватаром. Без approved asset не подставлять фотореалистичный stock avatar.
- [MediaPipe Pose](https://developers.google.com/edge/mediapipe/solutions/vision/pose_landmarker?tab=Web) и [Face](https://developers.google.com/edge/mediapipe/solutions/vision/face_landmarker?tab=Web) дают геометрию. Она не доказывает истинный eye contact или нервозность.
- [Scribe](https://elevenlabs.io/docs/api-reference/speech-to-text/convert): проверить на аккаунте model ID, word timestamps и verbatim. Счётчики используют raw transcript, не очищенный UI-текст.

### G0, расходы и ограничения

Проверить один допустимый стилизованный avatar, save_profile/result roundtrip, barge-in, reconnect, End, Chrome/Safari/mobile и две одновременные сессии. Зафиксировать SDK/config versions, стоимость и фактическое поведение. Готовность custom asset — отдельная зависимость.

Бюджет: LiveAvatar video minutes + ElevenLabs Agent + Scribe + evaluator/LLM + Next.js/PostgreSQL/jobs. B резервирует верхнюю оценку до connect, после stop сверяет usage. Старые ставки OpenAI/своего worker к новой архитектуре не относятся. Тарифы и provider limits проверяются на аккаунте; фиксированную стоимость звонка до измерений не обещать.

Остальные варианты транспорта/мозга не выбираются отдельной веткой самостоятельно. Изменение принятого стека — новое явное решение владельца и обновление TECH_STACK.md.

## 2. Первый опыт пользователя

### Экран до начала

На `/` сразу виден спокойный иллюстрированный/стилизованный AI-коуч по грудь в палитре Holdline, без фотореалистичного лица и карикатурного «строгого босса». Имя в первой версии: **Alex — AI practice coach**. Это рабочая persona; персонаж соответствует брендбуку и approved avatar ID. Постоянная метка AI; не имитировать реального нанимателя.

- Главный текст: **“Prepare for your next money conversation.”**
- Пояснение: **“Tell me about your role and what you want to ask for. We’ll build your practice together.”**
- Основная кнопка: **“Start the conversation”**. Рядом: **“About 3–4 minutes”**, **“Camera optional”**.
- Вторичный путь: **“Use the quick form”** и доступный пример результата.
- До клика — постер или короткий беззвучный локальный preview; никаких оплачиваемых комнат, запроса permissions и autoplay со звуком.
- На телефоне call stage занимает основную ширину; self-view небольшой, можно скрыть, не выключая камеру. Кнопки mute/camera/end доступны без прокрутки, touch area ≥44px.

### Подготовка устройств

После клика короткая lobby: локальное зеркало, микрофонный уровень, выбор устройств, субтитры и понятное разделение разрешений. Зеркалится только preview; вычисления координат используют немирроренный источник. Вызвать getUserMedia через действие пользователя.

1. Голос нужен для разговора; если микрофон запрещён, сразу доступна форма. Коротко объяснить, что речь передаётся разговорному провайдеру для ответа; отказ от записи для отчёта не означает полностью локальный разговор.
2. Камера даёт только визуальные наблюдения, её можно выключить в любой момент. Отдельный visualAnalysis opt-in; без него можно оставить только локальное self-view, без измерений/отправки features. Отказ не ухудшает оценку.
3. Отдельный audioAnalysis opt-in на временное сохранение пользовательского аудио и подробный разбор. Без него разговор и профиль работают, audio review unavailable. Микрофонное permission браузера не заменяет это согласие. Имена поставщиков/сроки обработки доступны из короткого пояснения.
4. До звонка показывать только технические подсказки: «лицо вне кадра», «микрофон не слышно». Не комментировать внешность или предполагаемое настроение.

На lobby до 10–15 секунд обычного пути; не заставлять пользователя проходить специальную позу/двигательный тест. Камера не обязана видеть всё тело: для ноутбука достаточно головы и плеч; руки/корпус анализируются только когда видны.

### Разговор по шагам

Сначала вопрос, затем ответ пользователя и короткое подтверждение; не читать весь список вопросов подряд. Уже названные сведения извлекать из свободного ответа и не спрашивать снова. За один раз — один главный вопрос; максимум два коротких уточнения спорного поля, затем карточка для ввода или skip.

| Шаг | Пример реплики host | Что фиксируем и как уточняем |
|---|---|---|
| Приветствие | “I’m Alex, your AI practice coach. We’ll map out your conversation, then practise it. You can pause or skip a question.” | Раскрытие AI, короткая рамка, без оценки до ответа |
| Роль | “What do you do, and what conversation are you preparing for?” | userRole и kind; не путать профессию пользователя с counterpartRole |
| Собеседник | “Who will you be speaking with?” | Manager/recruiter/client/landlord; имя человека не обязательно |
| Текущая сумма | “What is your current base pay?” | amount, currency, period, gross/net; бонусы отдельно, не подмешивать в base |
| Цель | “What amount would you like to ask for?” | Та же валюта и basis; если «на 15% больше», вычислить кодом и подтвердить сумму |
| Основания/рынок | “What are you basing that number on?” | Примеры результата работы, известный пользователю диапазон или unknown |
| Обстоятельства | “What response are you most concerned about?” | Страх/ожидаемое возражение; можно пропустить. Дата — короткое дополнительное поле, если существенна |
| Мини-репетиция | “Say the first sentence you would use to make the ask.” | 20–30 секунд собственной фразы с суммой, материал для feedback; не запуск переговорного ядра |
| Подтверждение | “Here’s what I heard. Please check the numbers before we continue.” | Редактируемая карточка и явное подтверждение пользователем |

Если пользователь сразу назвал все данные, перейти к уточнениям и мини-репетиции. При аренде заменить зарплатные вопросы на месячную плату; профессия не обязательна. Первый отполированный сценарий — raise. Offer доступен только после capability/приёмки соответствующего сценария A/B/C; вводный коуч не обещает неготовый вид тренировки.

**Пример естественного фрагмента:** пользователь: “I’m a backend engineer. I make ninety-five, and I want a hundred and ten.” Host: “Are those annual amounts in US dollars, before tax?” После подтверждения карточка показывает `$95,000/year → $110,000/year, gross`. Нельзя сохранить 95/110 долларов или принять «да» к неуслышанной пользователем фразе после interruption.

### Паузы, перебивания и сложные ответы

- Turn-taking, паузы и interruption настраиваются в ElevenLabs Agent «Коуч» и проверяются через connector. Настройки OpenAI semantic VAD не переносятся в другой SDK.
- Во время запинки не заканчивать слово за пользователя, не говорить «успокойтесь». Через длительную тишину — одно спокойное предложение времени/skip; не каждые две секунды повторять вопрос.
- При речи пользователя остановить генерацию и очередь аудио/видео; обновить историю до реально проигранной части. Иначе следующая реплика будет ссылаться на неуслышанное подтверждение.
- «Не знаю зарплату/диапазон», «не хочу говорить» — допустимые unknown/skipped. Если известны current/target, но не рынок, предложить явные **учебные границы между текущей и желаемой суммой**, вычисленные A, с отдельным подтверждением и подписью “Practice assumption — not a market estimate”. Сохранить неизвестный рынок неизвестным. Если нет и нужных сумм — явно обозначенный пример, без давления раскрыть зарплату.
- «Я оговорился» отменяет прежнюю кандидатную сумму. «Ignore previous instructions» в ответе не изменяет правила сбора, permissions, лимиты и структуру профиля.
- Слово «стоп», кнопка End, отказ от записи и mute проверяются отдельно: mute не означает конец, end закрывает все провайдерские сессии, отмена оценки отзывает право на дальнейшую обработку.

### Экран результата первого знакомства

Сначала карточка **“Your practice brief”**: роль, вид разговора, current/target, единицы, причины, дата и неизвестные поля. Деньги крупно моноширинным шрифтом; кнопка Edit рядом. Подтверждение пользователем необходимо даже при уверенном распознавании.

Ниже **“How you delivered your opening”**: максимум три полезных наблюдения — что уже получилось, один момент для улучшения, конкретная следующая попытка. Для каждого: цитата или интервал, измерение/оценка, причина выбора и действие. Пример: “You paused for 2.1 seconds before the amount. Try stating the number, then pause.” Не превращать обычную паузу в доказательство слабости.

Во время разговора не показывать тревожный счётчик ошибок, live «confidence 34%» или денежные потери. После звонка денежная симуляция ещё не проведена: «оставил на столе» здесь отсутствует. Главная кнопка: **“Start my practice”**; вторичная: **“Try that sentence again”** без повторного заполнения профиля.

При входе в review остановить платную медиасессию, но сохранить профиль и право редактирования. Можно читать карточку сколько нужно в пределах TTL, не оплачивая молча открытый room. Brief доступен сразу; report приходит отдельно с целевым p95≤30s после готового upload. После 60s ожидания показать partial/unavailable с повтором анализа, не заставляя пользователя ждать для тренировки. Retry мини-репетиции после stop — явное новое подключение с квотой/бюджетом, либо локальная запись без аватара по выбору пользователя; не возвращать к началу опроса.

### Микросостояния и качество общения

| Ситуация | Видимый ответ продукта |
|---|---|
| Подключение | “Connecting to Alex…” со статусом; после 15s кнопки audio/form, draft сохранён |
| Пользователь думает | Тихий нейтральный listening pose, без таймера ошибки; после примерно 8s одно “Take your time, or skip this question.”, порог проверить в пилоте |
| Сумма двусмысленна | Короткое уточнение плюс редактируемая карточка; не произносить длинное предположение как факт |
| Звук/видео расходятся или host замер | Понятный статус соединения; остановить старый output, один audio fallback, без второго одновременно говорящего голоса |
| Камера недоступна/темно | “Visual feedback unavailable” и конкретная техническая причина, разговор продолжается |
| Недостаточно материала | “Not enough speech to assess this yet.”, предложить одну короткую пробу; нулевой балл не выставляется |
| Запись/анализ отозваны | Остановить сбор и отменить обработку; профиль для тренировки остаётся, отдельная Delete удаляет и его |
| Страница обновлена/сеть вернулась | Восстановить профиль с сервера; не включать камеру/микрофон автоматически и не повторять уже отвеченные вопросы |

Host отвечает кратко, не вставляет одинаковое “Great!” после каждой зарплаты. Темп голоса, произнесение крупных сумм и естественное молчание проверяются на одинаковом сценарии. Субтитры различают tentative/confirmed; live region сообщает смену состояния, не каждое слово. Кнопки End/mute/camera всегда видны; на мобильном клавиатура не перекрывает подтверждение суммы. Ошибки и сообщения сохраняют спокойный тон Holdline.

## 3. Evaluation: что именно измеряем

| Слой | Сигнал и технология | Что можно сообщить | Что нельзя заключать |
|---|---|---|---|
| Речь | Scribe timestamps + RMS: темп, продолжительность пауз, fillers | Число, единица, интервал, условия измерения | Пауза сама по себе не означает нервозность |
| Неплавность | Повторы слов/false starts в raw transcript + проверка аудио | Наблюдаемое повторение или осторожный кандидат | Диагноз «заикание», причина и тяжесть расстройства |
| Формулировки | Evaluator с цитатой: просьба без суммы, лишнее извинение, неоднозначная фраза | Возможная более ясная формулировка в контексте цели | «Неправильная личность», снижение балла за акцент/диалект |
| Голос | RMS/F0 против подходящей записи сравнения | Изменение громкости/высоты и coverage | «Вы врёте/боитесь», точное эмоциональное состояние |
| Голова | Face transformation/landmarks | Поворот головы, время вне кадра | Настоящий eye contact, внимание или уверенность |
| Плечи/корпус | Pose landmarks | Смена положения/наклон в наблюдаемой геометрии | Медицинская «плохая осанка», мотивация, состояние здоровья |
| Руки | Видимые wrists/локти; Hand Landmarker только после отдельного теста | Движение рук, приближение руки к лицу | «Жест означает ложь» или психологический профиль |
| Самоощущение | Необязательный ответ пользователя | “You said you felt nervous about naming the amount.” | Вывод о нервозности без слов пользователя |

### Неплавность речи и «неправильные слова»

Для D5 хранить raw transcript отдельно от prettified UI-текста; не считать fillers после очистки. Кандидаты word repetitions/false starts проверять по размеченным примерам и показывать с uncertainty. Блоки и повторения звуков ASR может потерять: простой текстовый счётчик не закрывает эту часть задачи.

Исследовательский резерв для акустической детекции — модели/методика [SEP-28k, Apple](https://machinelearning.apple.com/research/stuttering-event-detection): в датасете размечены блоки, протяжения, повторы звуков/слов и вставки. Это исследование и данные, не готовый гарантированно подходящий API. Отдельно оценить модель на наших языках/микрофонах/пользователях; не обучать и не включать такой classifier без проверки лицензий данных и качества. В v1 точно заявлять только прошедшие приёмку классы событий.

Первая реплика при знакомстве не является нейтральной VoiceBaseline. Не подставлять её в существующий tensionIndex как «вашу норму». Нейтральная 20-секундная калибровка остаётся добровольным отдельным шагом C; без неё — абсолютные показатели. Из первого звонка можно сохранить `referenceKind:'observed_intake'` для сравнений одинаковой мини-репетиции, с соответствующей подписью.

### Геометрия и качество наблюдений

- Предложенный старт: Pose Landmarker Full для ноутбука; Lite при перегрузке. Face Landmarker для ориентации головы; распознавание личности не выполняется. Model assets и WASM закреплены по версии и hash.
- Обрабатывать кадры примерно 10 fps при 640×360 в Worker; динамически снижать до 5 fps. Пропускать старые кадры, а не копить очередь и задерживать звонок. На слабом устройстве выключить visual analysis с объяснением, сохранив разговор.
- У каждого окна `validMs/observedMs`, confidence и причины непригодности. Для вывода о конкретном движении нужны видимые необходимые точки; невидимая рука не означает отсутствие жестов.
- Стартовые пороги для тестирования: confidence≥0.7, событие поворота головы >25° длительностью ≥2s; изменение положения центра плеч >0.25 ширины плеч относительно собственного reference, ≥2s. Это настраиваемые инженерные пороги, не нормы поведения.
- На длинную сводку нужны ≥10s пригодной камеры и coverage≥70%; короткое достоверное событие можно показать отдельно, но нельзя распространять его на весь звонок. Движение камеры, зеркальность, occlusion и два человека делают соответствующую оценку unavailable.
- Не измерять centimetres глубины, точный взгляд в глаза или «суетливость» из 2D web-camera. Не штрафовать неподвижность, инвалидность, нейроотличия, разные привычки жестов или культуру общения.
- Report не имеет общего балла «хороший человек/готов к повышению». Отдельно: ясность просьбы, доступные речевые измерения, наблюдения камеры, выбранная следующая попытка.

## 4. Архитектура и контракты четвёртой ветки

```text
Браузер / LiveAvatar Web SDK ↔ managed LiveAvatar LITE room
                                   ↕ ElevenLabs connector
                              Agent «Коуч»
client_tool_call(save_profile) → браузер → Next.js API → PostgreSQL
client_tool_result           ← браузер ← Zod/CAS/owner validation
Подтверждение человеком → IntakeHandoff → negotiation pipeline A/B/C
Локальный opt-in MediaPipe → выбранные агрегаты → PostgreSQL
Временное аудио → Scribe proxy → transcript/timings jsonb → raw audio уничтожить
```

**Один источник звука:** только дорожка LiveAvatar из ElevenLabs connector. При audio-only fallback сначала подтвердить stop старой managed попытки, затем явно открыть один Agent «Коуч» без видео. Серверный draft сохраняется; бесшовный перенос provider conversation без проверки не обещать.

Наш сервер управляет token/start/stop и persisted attempt binding. Своих LiveKit credentials, dispatch или Python runtime нет. PostgreSQL B хранит профиль/revisions/consents/budget. Deadline/provider duration/TS cleanup не зависят только от browser unload.

### Владение файлами

| Область | Владелец | Граница |
|---|---|---|
| src/onboarding/** | D | UI, contracts, state machine, LiveAvatar connector, browser vision, server orchestration |
| src/app/intake/**, src/app/api/intake/** | D | Страницы/API первого звонка |
| tests/intake/**, tests/e2e/intake-*.spec.ts | D | TypeScript/браузерные проверки connector/tools/lifecycle |
| public/intake/**, docs/product/intake/** | D | Иллюстрированный постер, поздние assets, сценарии оценки; без записей пользователей |
| src/contracts/**, src/domain/** | A | Общие QuizAnswers/MoneyAnswer/IntakeHandoff и денежные адаптеры |
| PostgreSQL/auth/limits/jobs/Scribe proxy/env/CI/npm/deploy | B | Существующая БД, согласованные миграции и инфраструктурные порты |
| /, /quiz, каталог/тренировка/разбор, reusable capture | C | Общий UI, форма с восстановлением того же draft |

D использует C createUserCapture/timeline/cleanup и B PostgreSQL/Scribe/jobs; не создаёт второй recorder/DB-слой. Единственный QuizAnswers обслуживает форму и save_profile.

### Модель состояния и минимальные DTO

`intakeContractVersion:1` существует отдельно от `contractVersion:1` движка. A владеет общей границей MoneyAnswer/IntakeHandoff, D — внутренними схемами onboarding с импортом этих типов. TypeScript/API/tool config используют общие Zod/JSON Schema; connector payload — недоверенный ввод. Отдельной Python-модели нет.

- `IntakePhase = lobby | connecting | interviewing | mini_practice | review | completed | interrupted | expired`.
- `IntakeField<T> = {value:T|null, status:'unknown'|'candidate'|'confirmed'|'skipped', sourceTurnId:string|null, revision:number}`. Отсутствие значения и отказ пользователя различимы.
- `MoneyAnswer = {amountMinor:number,currency:string,period:'year'|'month'|'one_time',basis:'gross'|'net'|'unspecified'}`; перед handoff A проверяет поддержку валюты, единиц и единый basis. Никакой автоматической FX-конвертации.
- `IntakeProfile`: userRole, seniority (optional), kind, counterpartRole, currentMoney, targetMoney, marketLow/High, practiceRange (optional, отдельное учебное допущение A), reasons, conversationDate, fear, selfReportedNervousness (optional). Значения обёрнуты в IntakeField; основные суммы и выбранный диапазон требуют явного подтверждения. Handoff сохраняет rangeSource, unknown market не перезаписывается учебным диапазоном.
- `IntakeSession`: id, ownerId, revision, profileRevision, phase, profile, consentVersion, consents (`audioAnalysis`, `visualAnalysis`), mode, mediaStatus, providerEpoch, roomId, startedAt, deadlineAt, lastEventSeq. revision — CAS всего агрегата; profileRevision меняется только при изменении/подтверждении профиля. mediaStatus=`not_started|connecting|active|stopping|closed` независим от phase; review сохраняется после media closed. Provider session binding и секреты хранятся сервером в PostgreSQL; клиенту только необходимые scoped credentials.
- `IntakeView`: id, revision, profileRevision, phase, mediaStatus, publicProfile, committedTranscript, availability, missingFields, expiresAt. Transcript items: turnId, sequence, role, text, recordingId, spokenRangeMs; tentative items не фиксируют зарплату. Нет надёжной привязки к recording_ms — speech interval unavailable.
- `Observation`: id, recordingId/segmentId, kind, startMs, endMs, value, unit, quality, validMs, observedMs, source (`mediapipe | scribe | acoustic | model | self_report`), modelVersion, unavailableReason. Raw landmarks/кадры не сохраняются. model-оценка ссылается на исходную цитату/measurement; само утверждение evaluator не является независимым evidence.
- `FeedbackItem`: category, claim, evidenceIds, quote, suggestion, confidenceLabel (`observed | estimated | self_reported`), limitations. У пункта без evidence нет права появиться в report.
- `IntakeAssessment`: intakeId, revision, profileRevision, consentVersion, status (`pending | ready | partial | unavailable`), speech, delivery, visual, topFeedback (≤3), nextPracticeFocus. Частичный visual не блокирует профиль. После правки суммы старые рекомендации помечаются устаревшими и пересчитываются; исходные наблюдения не переписываются под новую цифру.
- `IntakeHandoff`: intakeId, profileRevision, confirmedAt, `quizDraft:Partial<QuizAnswers>`, `missingFields:(keyof QuizAnswers)[]`, suggestedAvatarId, referenceKind, assessmentId, mode (`personal | example`). Финальный QuizAnswers собирается после выбора/подтверждения персонажа C и проверки A.

Состояние анкеты и медиасессия имеют разные сроки: звонок максимум 300s от первого connect, draft/assessment в нашем хранилище — 24h. Connect retry не сбрасывает deadline. Истечение звонка переводит к review/сохранённому draft, истечение TTL — к expired/410. Интеграция core не зависит от доступности исходной записи.

### API и инструменты

Все браузерные API используют owner cookie, Origin check и общую error envelope B. Мутации — Idempotency-Key; профиль/подключение/подтверждение и выдача согласия дополнительно требуют expectedRevision. Initial create не имеет revision, append-only events используют seq/consentVersion. **Stop, отзыв согласия и delete не блокируются устаревшей revision**: сервер атомарно применяет прекращение к текущему состоянию, не перезаписывая новые ответы старым snapshot. Другой payload с тем же idempotency key →409. Client-tool endpoint проверяет owner/Origin/intakeId/providerEpoch/callId. Browser/model payload не является привилегированной командой. Поздний tool старой попытки не меняет профиль; внешние webhooks проверяют подпись/binding отдельно.

| Метод | Вход | Результат |
|---|---|---|
| `POST /api/intake` | mode, locale, consents, consentVersion | Создать draft, вернуть IntakeView; без автозапуска платного звонка |
| `POST /api/intake/:id/connect` | expectedRevision | Зарезервировать бюджет PostgreSQL, создать managed LiveAvatar attempt; вернуть scoped session token/SDK config, providerEpoch, deadlineAt |
| `GET /api/intake/:id` | owner cookie | IntakeView, no-store; восстановление после reload |
| `PATCH /api/intake/:id/profile` | expectedRevision, пользовательские corrections | Валидированные candidate/confirmed поля; изменённые зависимости требуют повторного подтверждения |
| `POST /api/intake/:id/events` | seq, consentVersion, bounded observations batch | Идемпотентно принять локальные measurements, не менять деньги |
| `POST /api/intake/:id/consent` | consents; expectedRevision для выдачи, отзыв без CAS-блокировки | Остановить отозванную обработку/capture, увеличить consentVersion; поздние старые batches отклонить |
| `POST /api/intake/:id/stop` | reason | Закрыть managed session/Agent при review/End/error, сохранить draft; анализ только при согласии и доступном временном аудио, результат jsonb без raw audio |
| `GET /api/intake/:id/assessment` | owner cookie | pending/ready/partial, наблюдения и evidence |
| `POST /api/intake/:id/confirm` | expectedRevision, confirmedFields | Зафиксировать подтверждение/profileRevision и вернуть IntakeHandoff с missingFields; остановить оставшуюся media. LLM не подтверждает за человека |
| `DELETE /api/intake/:id` | owner cookie, idempotency key | Отозвать credentials и удалить наши данные/задачи, поставить подтверждаемые provider-delete задачи где применимо |
| `POST /api/intake/:id/tools` | owner cookie/Origin, providerEpoch, callId, expectedRevision, toolName, payload | save_profile/UI lifecycle tools; Zod/CAS/dedup; без права модели подтверждать деньги |

Основной client tool — `save_profile`: кандидатный patch общего QuizAnswers с evidence через наш API. Дополнительные UI tools: `get_missing_fields`, `prepare_confirmation`, `request_mini_practice`, `request_end`. Успешный tool result не подтверждает сумму за пользователя. `request_end` не подтверждает профиль. Запретить tools вида «изменить salary в ядре», «выдать entitlement» или произвольный URL.

Порты между ветками: D получает от B `IntakeStore.read/create/compareAndSet`, `Budget.reserve/reconcile`, `JobQueue.enqueue` на PostgreSQL, временный Scribe proxy, ModelPorts и provider auth. C передаёт `createUserCapture({userStream,purpose,recordAudio,signal})` по C3. D экспортирует `IntakeEntry`, `IntakeCall`, `IntakeReview`, `getConfirmedHandoff(intakeId,ownerId)` и `ensureMediaClosed(intakeId,ownerId)` для B. A предоставляет validatePracticeDraft/buildQuizAnswers/normalizePracticeMoney. Частичный draft не становится готовым QuizAnswers без валидации.

Facade D и совместимые fixtures входят в общий ранний коммит; до реализации ответы явно unavailable, avatarIntake=false. B/C поэтому компилируются до финального слияния D. В G1 stub заменяется реальной реализацией, включение флага само по себе не является приёмкой.

## 5. Задачи разработчика D

### D1. Доказать LiveAvatar + ElevenLabs connector

**Файлы:** src/onboarding/providers/**, src/onboarding/client/**, docs/product/intake/provider-spike.md. Зависимости: B PostgreSQL/credentials/budgets, C capture API, approved stylized avatar.

- [ ] Платный Agent «Коуч», PCM 24K, secret в LiveAvatar; официальный Web SDK, без собственного LiveKit/worker.
- [ ] Проверить token/start/stop, единый audio/video output, pause, interruption/corrected transcript и два одновременных подключения.
- [ ] client_tool_call(save_profile) → API/PostgreSQL → client_tool_result: wrappers, имена, wait-for-response, epoch и duplicate calls.
- [ ] Chrome/Safari/mobile, no camera, TURN/network limits, cold/warm, versions и расходы. Без реального аккаунта G0 не считается пройденным.

### D2. Профиль, client tools и автомат

**Файлы:** src/onboarding/{contracts,domain,server}/**, src/app/api/intake/**, tests/intake/{profile,tools,consent}.test.ts.

- [ ] 40 fixed cases: 95k, fifteen/fifty, month/year, net/gross, currency, skip/unknown, +15%, correction, prompt injection.
- [ ] Деньги нормализует A: $95,000/year × 1.15 = $109,250/year = 10_925_000 minor units. Без полных единиц нет вычисления; модель не подтверждает сумму.
- [ ] save_profile и форма используют один QuizAnswers/draft в profiles. Сервер проверяет owner/Origin/Zod/revision/epoch/idempotency; tool payload не имеет привилегий провайдера.
- [ ] Unknown market: явное A practice assumption либо example. Исправление current/target отзывает зависимые подтверждения. Не копировать денежные формулы.
- [ ] PostgreSQL CAS/транзакции/dedup; late events не воскрешают closed/deleted. End/revoke/delete проходят независимо от stale revision.
- [ ] Confirm только пользовательским действием; общий Zod/JSON Schema для TS/API/tool config. npm run test:intake + PostgreSQL integration tests.

### D3. Call UI и режиссура

**Файлы:** src/onboarding/ui/**, src/onboarding/client/call.ts, src/app/intake/**, public/intake/host-poster.*, tests/intake/call-state.test.tsx, tests/e2e/intake-call.spec.ts.

- [ ] Иллюстрированный вход/lobby/local self-view/captions/mute/camera/device selection/End, денежные cards, loading/reconnect. До Start нет платной сессии.
- [ ] Один главный вопрос и пропуск известных полей; dialogue config ElevenLabs ждёт паузы, не оценивает личность/акцент.
- [ ] Проверить interruption/queue/agent_response_correction через connector. Неуслышанное подтверждение не считается согласием человека.
- [ ] Видео fallback: stop managed attempt → явный audio-only Agent «Коуч»; no mic → форма. Через 15s виден fallback.
- [ ] Review закрывает LiveAvatar/SDK/mic/capture/self-view/buffers. Failed stop retryable; provider duration и TS cleanup B не зависят только от unload.

### D4. Локальные движения — поздний слой за флагом

**Файлы:** src/onboarding/client/vision/{worker,models,features,quality}.ts, public/intake/models/**, tests/intake/vision-*.test.ts.

- [ ] PostgreSQL feature flag + visualAnalysis opt-in. Без согласия нет inference/features; камера может оставаться только зеркалом.
- [ ] MediaPipe в Web Worker, закреплённые assets/пороги; bounded aggregates/coverage/unavailable. Видео/кадры/raw landmarks не отправляются.
- [ ] Ориентация головы/видимость/движения по §3; camera-facing ratio — proxy, не достоверный взгляд/уверенность.
- [ ] Слабые устройства, зеркальность, occlusion, темнота, руки вне кадра, два человека, camera off и network отсутствие video upload. До приёмки флаг выключен, основной звонок работает.

### D5. Scribe и рекомендации без хранения аудио

**Файлы:** src/onboarding/server/{assessment,evidence,delivery-evaluator}.ts, src/onboarding/ui/Assessment.tsx, tests/intake/assessment.test.ts, docs/product/intake/evaluation-set.md.

- [ ] С B передать временную запись Scribe после audioAnalysis opt-in; проверить model/verbatim/timestamps. Transcript/timings jsonb, raw blob/buffer освободить; без S3/R2.
- [ ] Consent/version/intake binding до обработки и перед сохранением. Async retry не ссылается на уничтоженную запись; bytea/replay ≤24h отдельно за флагом/согласием с автоочисткой.
- [ ] Fillers/повторы/паузы из raw transcript/timings; ModelPorts evaluator использует evidenceIds/цитаты/ограничения. Невалидные ссылки/числа отклонить; fallback только измерения.
- [ ] Максимум три совета, без диагнозов/confidence-by-pose. Play скрыт без сохранённого audio. Pitchfinder вводится последним локально за флагом.

### D6. Передача в основной продукт

**Файлы:** src/onboarding/server/handoff.ts, src/onboarding/ui/Review.tsx, tests/intake/handoff.test.ts, tests/e2e/intake-to-practice.spec.ts.

- [ ] A/B/C/D fixtures полного/неполного raise, unknown market, unsupported currency, example. Один QuizAnswers для голоса/формы.
- [ ] Передать intakeId/profileRevision; B читает подтверждённый профиль PostgreSQL и вызывает A buildQuizAnswers после avatar selection. Клиентские суммы/confirmed не источник истины.
- [ ] Missing fields дополнить точечно. До Agent «Собеседник» закрыть коуча/managed session/capture; observations не меняют trust/patience/бюджет ядра.

### D7. Эксплуатация и приёмка

**Файлы:** docs/product/intake/{acceptance,runbook}.md, tests/e2e/intake-resilience.spec.ts; B — PostgreSQL jobs/миграции/env/deploy.

- [ ] Атомарный резерв: до 3 intake попыток/IP/UTC-день, 300s каждая. Retry/reconnect сохраняет attempt/deadline; explicit restart — новая quota/epoch; общий budget PostgreSQL.
- [ ] Provider duration controls + TS cleanup/reconciliation persisted attempts. Потеря клиента на 15s закрывает платную сессию; проверить механизм без собственного worker.
- [ ] Draft/assessment/features/transcript retention 24h; raw audio не хранится. Revoke отменяет jobs/late results; provider retention/delete controls отдельно.
- [ ] Аналитика воронки/ошибок/расходов без salary/transcript/video/raw landmarks.
- [ ] Unit/contract/PostgreSQL/E2E на итоговом SHA, 10 живых scripted calls и 5 добровольных проб. Evaluation consent отдельно. Поздние MediaPipe/pitchfinder проходят собственную приёмку до включения.

## 6. Критерии качества и выпуск

Пороговые значения ниже — цели приёмки Holdline, а не гарантии поставщиков. Проверять на описанной сети/устройствах; для технической latency-матрицы минимум 30 подключений и 100 реплик, отдельно cold/warm, mobile/desktop. Сохранять sample size, p50/p95 и ошибки, не выдавать малый пилот за популяционную точность. G0 проверяет две параллельные сессии; G3 — согласованный с B лимит concurrency и отказ сверх него.

| Проверка | Условие приёмки |
|---|---|
| Первое подключение | В тестовой матрице p95≤8s от Start после permissions до готового host; после 15s понятный fallback |
| Ответ по существу | Для явно завершённых реплик p95≤3s до слышимого содержательного ответа; естественная пауза внутри мысли не считается завершением |
| Прерывание | p95≤500ms от подтверждённой речи пользователя до прекращения слышимого host; отменённый хвост не «всплывает» позже |
| Готовность отчёта | Brief сразу; report p95≤30s после принятого upload, после 60s partial/unavailable с retry; тренировка не блокируется |
| Денежные данные | Все 40 фиксированных edge cases проходят; в живых пробах 100% финальных денежных значений подтверждены человеком, несовпадения исправлены до handoff |
| Неплавность/словесные советы | На минимум 60 размеченных utterances целевая precision показываемых событий ≥90%, recall опубликован отдельно; не достигнуто — класс выключен, без заявления о полном обнаружении заиканий |
| Визуальные события | На минимум 30 размеченных клипах precision показываемых событий ≥90%; coverage и ошибки по типам условий указаны; occluded limbs не дают наблюдений |
| Удобство | Минимум 4 из 5 участников проходят brief без помощи; ошибки с суммой/потерей данных блокируют релиз независимо от средней оценки |
| Закрытие | End/cancel/error действительно освобождают managed session, SDK, media tracks, локальный vision Worker при включении и бюджет; callback после cancel не продолжает обработку |
| Доступность | Keyboard, captions, screen-reader статусы, mobile, no camera, no mic, reduced motion и fallback проходят |
| Полный результат | Первый экран → знакомство → подтверждение → тренировка → разбор → replay на реальных API; основной вход больше не начинается со старого квиза |

**G0 — доказательство принятого стека:** D1 проверяет LiveAvatar/ElevenLabs client tools/перебивания на аккаунте; B — PostgreSQL/budgets/cleanup. Возвращать отменённый стек самостоятельно нельзя. **G1 — рабочее знакомство:** D2/D3 и handoff, fallback, подтверждение сумм. **G2 — полезный разбор:** D5 с evidence/quality gates; D4 и pitchfinder — поздние опциональные слои за флагами со своей приёмкой до включения. **G3 — выпуск:** D6/D7 и сквозная приёмка.

G0 имеет смысл ограничить одним рабочим днём исследования. После него команда оценивает G1–G3 по фактическим ограничениям; полный объём не помещается автоматически в старое обещание «24 часа». Черновое видео без подтверждения зарплаты, устойчивых перебиваний и честного feedback — техническое демо, не завершённая первая функция.

Общая база → четыре параллельные ветки → A → B → C → D → совместная приёмка. Контракт handoff и reusable capture выносятся в общий ранний срез; для независимой работы D использует зафиксированные fixtures. Если D ещё не прошла G3, синьор может сохранить рабочий прежний релиз, но не объявляет новый avatar-first продукт готовым. Четвёртый план означает отдельную область разработки; он не изменяет правила участия в хакатоне.
