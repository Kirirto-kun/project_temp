# Call-module implementation ledger

Plan: `docs/superpowers/plans/2026-11-15-connector-call-implementation.md`.

- Baseline: `4b7c3bd`, documentation only; no existing application or tests.
- Scope: user requested video avatar and call control. Follow the existing D architecture; do not treat this as authorization to invent the other product subsystems.
- Accounts: none existed at the start of implementation. User has now begun LiveAvatar setup; ElevenLabs configuration and live provider acceptance remain pending.
- Workspace: current checkout reused on feature branch in accordance with desktop workspace instructions.
- Stack changed by user: official LiveAvatar/ElevenLabs managed connector, TypeScript only, PostgreSQL. Removed Python manifests, own LiveKit provider and worker authorization code. Earlier 17-test prototype was not pushed with the documentation change.
- User authorized microservice implementation and its database integration. Use an additive holdline_intake schema in the existing PostgreSQL connection, without changing other applications' tables.
- Pre-flight: browser and API share Zod DTOs and common QuizAnswers draft; call lifecycle/budget use injectable ports. Paid account tests remain pending. No runtime in-memory fallback.

## Implementation and verification

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
- Latest verified suite: 53 unit/SQL/setup tests and 5 Chromium E2E tests passed. Screenshots inspected in desktop/mobile and light/dark conditions. Production dependency audit: 0 reported vulnerabilities.
- Fixed setup/template drift: fresh local files now use .env.example; reruns append missing fields (including ELEVENLABS_API_KEY) without replacing credentials or custom settings. Two real-script regression tests failed before the fix and pass after it; local backfill preserved every existing value. No provider API was called.
- Final lint, TypeScript and optimized build passed. Node 24.22.3 Docker image built and reported healthy; production HTTP smoke verified owner cookie, PostgreSQL save/read/confirm/handoff/delete and disabled provider gate. Chromium verified hydration, bundled assets and form navigation with no browser errors. The cleanup child independently published a fresh PostgreSQL heartbeat. Smoke drafts were deleted and the temporary smoke container stopped.
- Real provider call/billing/retention, approved custom avatar, Safari/TURN and measured interruption/latency remain account-dependent acceptance, explicitly documented in acceptance.md and setup-ru.md. This does not claim the other product subsystems are implemented.
