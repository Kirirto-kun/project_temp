# Universal API coach — implementation ledger

Current spec: [universal API coach](../../superpowers/specs/2026-11-15-universal-api-coach-design.md). Current plan: [implementation](../../superpowers/plans/2026-11-15-universal-api-coach.md). Snapshot: 15 November 2026. Historical connector records below are retained as evidence of earlier work; they are superseded architecture, not current live acceptance.

## Current scope and decision

- User explicitly requested ANY conversation: interviews, feedback, conflict, relationships, presentations and arbitrary custom topics; money is optional.
- Direct APIs only: LiveAvatar FULL for managed ASR/turn-taking/media/lip sync, direct OpenAI Chat API or Anthropic model requests, imported ElevenLabs TTS voice. No ElevenLabs conversational Agent or browser client-tool configuration.
- Existing Next.js/TypeScript/PostgreSQL/owner/cleanup/budget lifecycle remains. No own LiveKit, Python, Redis or raw media persistence.
- Current deliverable is preparation, an optional short opening rehearsal and a human-confirmed brief. Full roleplay/debrief and specialized financial engine are separate future layers.

## Current implementation evidence

- Common profile/API v2 and universal form are implemented: kind/description/goal/counterpartRole, optional desiredTone, optional money/range/date/avatar. Custom topics do not require salary or paid financial-scenario generation.
- Profile TDD: 18 new cases, 16 expected RED failures before implementation. Focused universal/profile/money suite then passed 37/37. Goal changes revoke confirmation; changing a set kind clears money/units/rangeSource; legacy kindless money survives first type assignment.
- Final integrated Vitest run passed 114/114 tests across 17 files, including PostgreSQL/setup, universal profile, callback/model and SDK/controller cases. ESLint and the optimized production build with TypeScript checks passed. Chromium E2E passed 8/8; desktop/mobile screenshots inspected.
- One fresh whole-change reviewer found two Important races: a superseded user turn could claim a receipt after a newer transcript/speech start, and cancellation during post-model reads could still save a proposal/action. Six regressions failed first and passed after fixing both. Receipt CAS now checks monotonic input generation/latest turn; cancellation reaches profile mutations and receipt/action/return boundaries. Whole suite 114/114 green after the fix; no Critical or deferred Minor findings.
- Runtime model output uses compact structured JSON {reply,changes:[{field,value}],action}, decoded/validated into {reply,patch,action}. Forced tool_choice was rejected by the real Anthropic model (HTTP 400) and is not the adopted contract.
- Owner-authenticated /respond loads server transcript/latest turn and invokes the existing callback in-process using Bearer + HMAC intake/epoch/deadline. Owner/revision/epoch/idempotency, PostgreSQL receipts and bounded calls remain. End/delete/expired epochs and cancelled turns prevent late writes; the model cannot confirm.
- Final media mode is no-context LiveAvatar FULL: managed ASR → committed owner transcript → /respond → internal signed model/ProfileControl → reply/view → SDK.repeat. Speech start interrupts SDK and cancels/invalidates the previous turn. No external LLM ingress or tunnel is needed.

## Real provider evidence — text only

- Read-only probes returned HTTP 200; checked account had 10 LiveAvatar credits, ACTIVE avatar and active paid ElevenLabs subscription.
- Real generation passed on fictional nonfinancial input for claude-sonnet-5-5 and gpt-5.4-mini, including schema-valid changes/action output.
- Observed single sample durations were about 3.8s for Claude and 2.5s for OpenAI. These are one-off text generation observations, not latency targets, media latency or production guarantees.
- Free account limits: one concurrent session, maximum 120s. Normal FULL is 2 credits/min, so 10 credits is approximately 5 aggregate minutes; not a permitted five-minute attempt. Local session limit is 120s, sandbox is ≤60s. External TTS/model charges are independent. No purchase/overage authorized.
- The earlier external vendor-LLM callback setup was superseded by server-owned respond/repeat orchestration. Normal provider:configure only registers/imports ElevenLabs TTS. Its --test-default-voice option is sandbox-only, uses a built-in voice and does not accept ElevenLabs TTS.

## Live sandbox evidence — product acceptance remains partial

- A bounded real Chromium call against the optimized build passed without provider mocks or timer overrides. Only microphone input was a generated fictional fixture, not a user's recording. Normal imported ElevenLabs voice was not used.
- No device/provider session before action; managed FULL connected and received 565 decoded video frames, 61,138 inbound audio bytes with nonzero decoded audio energy, and 136,160 outbound microphone bytes. This establishes real media transport, not a perceptual lip-sync or latency score.
- Managed ASR committed 3 user turns. Two owner /respond requests returned 200 through direct model/internal signed orchestration. The stored nonfinancial candidate contained kind/description/goal/counterpartRole and no invented amount. It remained unconfirmed until the explicit human action; confirmation/reload without devices passed.
- Manual End closed all microphone tracks and provider history reported end_at. Total observed test duration was about 36 seconds. LiveAvatar credits stayed 10.0 → 10.0. Browser error list was empty. Test draft deleted afterward.
- A previous cold-start probe exposed a healthy connection exceeding the old 15s startup timeout. A 20s regression failed first; product startup allowance is now 30s inside the unchanged overall attempt deadline. The later successful probe used that actual source, without timer replacement.
- The fresh review's later concurrency fixes were verified by six RED→GREEN regressions and the 114-test suite; the live call was not repeated after those fixes, to leave one manual sandbox attempt for the owner. Local per-IP attempts were set to 4 for today; the existing daily reserve, 60s sandbox deadline and one concurrent session were retained.
- ElevenLabs secret registration still requires voices_read. Imported TTS, approved illustrated live asset, real Safari/iPhone, interruption quality, constrained networks and normal-credit calls remain unaccepted. Follow [acceptance.md](acceptance.md).
- Final Linux Node 24.22.3 Docker image built and reported healthy. A smoke test against the existing test PostgreSQL verified API v2, disabled-call admission, nonfinancial save/confirm/handoff/delete, rendered page and bundled JavaScript. No provider call was made. The temporary container was stopped; the owner's local port 3000 service remains running.

## Historical connector implementation ledger

Historical plan: `docs/superpowers/plans/2026-11-15-connector-call-implementation.md`.

- Baseline: `4b7c3bd`, documentation only; no existing application or tests.
- Scope: user requested video avatar and call control. Follow the existing D architecture; do not treat this as authorization to invent the other product subsystems.
- Accounts: none existed at the start of implementation. User has now begun LiveAvatar setup; ElevenLabs configuration and live provider acceptance remain pending.
- Workspace: current checkout reused on feature branch in accordance with desktop workspace instructions.
- Stack changed by user: official LiveAvatar/ElevenLabs managed connector, TypeScript only, PostgreSQL. Removed Python manifests, own LiveKit provider and worker authorization code. Earlier 17-test prototype was not pushed with the documentation change.
- User authorized microservice implementation and its database integration. Use an additive holdline_intake schema in the existing PostgreSQL connection, without changing other applications' tables.
- Pre-flight: browser and API share Zod DTOs and common QuizAnswers draft; call lifecycle/budget use injectable ports. Paid account tests remain pending. No runtime in-memory fallback.

### Historical implementation and verification

- PostgreSQL container and separate test database initialized locally. Additive schema migration passed; existing unrelated tables/services were untouched.
- Call lifecycle, conservative daily budget, provider duration, encrypted credentials, owner/Origin API, tools, confirmation, form and mobile UI implemented.
- Final whole-change review used a fresh read-only reviewer. Seven Important findings were reproduced and fixed; no Critical or deferred Minor findings.
- Fixed old client tools rebinding to a new epoch: delayed-read/End/restart test RED → GREEN; checks now follow every async boundary and deferred End uses the captured generation.
- Fixed quick-form fallback during pending Connect: browser regression RED → GREEN; local intent cancels the controller before a delayed token response.
- Fixed hidden monetary ranges/one_time: browser regression RED → GREEN; ranges/provenance are visible and editable before confirmation, accepted periods render accurately.
- Fixed SDK late audio publication: SDK starts muted; guarded startup unmutes only for the current generation. Cancelled-start and guarded-unmute tests pass.
- Fixed SDK silent microphone failure: adapter checks public ACTIVE voice state and closes/falls back otherwise; adapter tests RED → GREEN.
- Fixed stale server-side End: bound provider epoch is passed through tool/disabled-event/confirmation safety paths; gated restart test RED → GREEN.
- Fixed cleanup health spoofing by Connect traffic: only the independent process/authenticated scheduler attests liveness; test RED → GREEN.
- Prior connector snapshot: 53 unit/SQL/setup tests and 5 Chromium E2E tests passed. Screenshots inspected in desktop/mobile and light/dark conditions. Production dependency audit: 0 reported vulnerabilities.
- Fixed setup/template drift: fresh local files now use .env.example; reruns append missing fields (including ELEVENLABS_API_KEY) without replacing credentials or custom settings. Two real-script regression tests failed before the fix and pass after it; local backfill preserved every existing value. No provider API was called.
- Final lint, TypeScript and optimized build passed. Node 24.22.3 Docker image built and reported healthy; production HTTP smoke verified owner cookie, PostgreSQL save/read/confirm/handoff/delete and disabled provider gate. Chromium verified hydration, bundled assets and form navigation with no browser errors. The cleanup child independently published a fresh PostgreSQL heartbeat. Smoke drafts were deleted and the temporary smoke container stopped.
- Real provider call/billing/retention, approved custom avatar, Safari/TURN and measured interruption/latency remain account-dependent acceptance, explicitly documented in acceptance.md and setup-ru.md. This does not claim the other product subsystems are implemented.
