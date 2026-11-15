# Universal avatar preparation acceptance — API v2

Scope: any conversation, including interviews, feedback, conflict, relationships, presentations and arbitrary custom topics. Money is optional. Current acceptance concerns preparation, a short opening rehearsal and a human-confirmed brief; it does not certify a full roleplay/debrief or financial simulation engine.

## Verified before live media acceptance

- The shared v2 profile has common kind/description/goal/counterpartRole, optional desiredTone and optional money/date/range/avatar fields. Unit tests cover nonfinancial custom/interview tool proposals, common missingFields, confirmation/handoff, goal correction, kind-switch monetary reset, explicit resent amounts, invalid units/ranges and legacy kindless money.
- Universal profile TDD observed 16 expected failures before implementation. Latest Vitest/SQL/setup suite passed 122/122, including provider failure/configuration regressions. ESLint and optimized production build/TypeScript passed. Six additional regressions reproduced and fixed two earlier review findings involving pre-claim supersession and post-model cancellation.
- Existing local/SQL tests cover owner isolation, idempotency/CAS, budgets, single client lease, absolute deadline, End/token races, retryable close, encrypted credentials, stale epochs, cleanup and cancellation. Direct callback/model/provider tests additionally cover bearer/HMAC binding, bounded inputs, replay/concurrency and late-write cancellation.
- Twelve Chromium browser regressions passed, including universal custom save/reload/confirm, salary→relationship switching/mobile, legacy monetary drafts, full-window controls, fullscreen rejection and sound recovery after muted playback. Desktop/mobile screenshots were inspected. A small panel keyboard-focus restoration issue remains deferred.
- Read-only account probes returned HTTP 200, with 10 LiveAvatar credits, an ACTIVE avatar and an active paid ElevenLabs account on 15 November 2026.
- Real direct generation passed for claude-sonnet-5-5 and gpt-5.4-mini using a fictional nonfinancial prompt and valid compact reply/changes/action output. This verifies text generation and server decoding, not media.
- The replacement ElevenLabs key was accepted, its secret/voice imported into LiveAvatar, a direct TTS probe generated audio and a later real full-window sandbox avatar call with that voice configuration passed. This accepts that bounded transport round trip, not normal-credit billing or subjective quality across devices.
- Our raw audio/video is not persisted; camera publication and speech/visual analysis remain disabled in this module.

## Live media — sandbox passed, product acceptance partial

**The initial sandbox FULL round trip passed** with built-in test voice: video/audio, managed ASR, direct model replies, PostgreSQL candidate, human confirmation/reload and manual End with provider history/track closure. Credits stayed 10 → 10. No timer overrides or provider mocks were used; microphone input was synthetic fictional audio. That initial test alone did not accept imported ElevenLabs TTS. Exact evidence and post-review verification limits are in [progress.md](progress.md).

A later sandbox call with imported ElevenLabs voice configuration also passed in the full-window UI: real human video/audio, ASR/model/candidate and verified manual closure. See [call-room evidence](call-room-evidence-2026-11-15.json). That test allowed audio autoplay; the blocked/muted recovery path is covered by a separate RED→GREEN browser regression. Product asset, subjective lip sync/interruption quality, normal-credit billing and other browser/device conditions remain open.

- [x] No-context FULL emits managed ASR; final transcript is committed before owner /respond. Server history/latest turn/client/epoch are checked, and the in-process callback still enforces Bearer + HMAC intake/epoch/deadline. No external callback ingress/tunnel is required.
- [x] Sandbox FULL token starts the SDK, visible real video and one SDK.repeat output voice. Built-in test voice only; no ElevenLabs Agent/widget/second speaking session.
- [ ] Nonfinancial conversation collects situation/counterpart/goal/tone, without demanding salary or market. An arbitrary custom topic saves/reloads and reaches human confirmation.
- [x] Server callback applies the candidate through validated ProfileControl; owner/revision/epoch/idempotency and receipts remain intact. The model cannot confirm.
- [ ] USER_SPEAK_STARTED calls SDK.interrupt, cancels/invalidates the previous server turn and prevents stale reply playback/patch. Correcting a goal updates context and invalidates human confirmation.
- [ ] Optional money has explicit USD/period/gross-net, visible range provenance/one_time and no fabricated amount. Changing a set kind clears previous financial assumptions.
- [ ] Connect without mic, no camera, denied permissions, network loss/reconnect, End during startup, refresh and two tabs close all devices/provider attempts correctly.
- [ ] Configured deadline is observed at provider and server: local Free ≤120s with one concurrent session; sandbox ≤60s; production hard ceiling ≤300s. Retry/reconnect never resets it.
- [ ] Review/End/delete and abandoned-call cleanup stop the managed session. Failed stop stays pending and retries, without late profile writes or resurrection.
- [ ] Measured credits/usage and external ElevenLabs/model costs fit conservative admission. No purchase/overage is required for setup. The account's 10 credits do not authorize a five-minute Free attempt.
- [ ] Product avatar is an approved illustration/stylized character. Technical Wayne sandbox/default-voice results do not accept a product asset, ElevenLabs TTS or normal-credit calls. Repeat normal helper/imported-voice tests separately.
- [ ] Desktop Chrome, real Safari/iPhone, mobile permissions/autoplay and constrained networks are tested with actual devices.
- [ ] Provider retention/delete controls are reviewed separately from our 24h draft/transcript TTL and no-raw-media policy.

Record exact test mode, model/voice/config references, duration/stop result, measured usage and limitations in progress.md without secrets or private transcript. Do not claim latency/accuracy/stability from one sample. A persistent quick form remains useful while any live criterion is unresolved.

Financial-engine readiness is separate: common missingFields only lists kind/description/goal/counterpartRole. Market/avatar/money are not universal entry requirements; finance-specific validation belongs to the optional future financial layer.
