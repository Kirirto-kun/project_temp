# Avatar call acceptance

## Verified locally

- Unit and PostgreSQL tests cover guest ownership, idempotency/CAS, concurrent budget admission, UTC rollover, single attempt/client lease, fixed deadline, End vs token provisioning, retryable close, encrypted credentials, stale epochs, candidate vs confirmed profile, correction clearing, cleanup and cancelled device acquisition.
- Browser tests cover no media/provider calls before action, denied microphone with form fallback, real API → PostgreSQL → rendered brief/reload/confirmation/correction, and mobile layout/reduced motion. Screenshots are local test artifacts, not user recordings.
- Production Docker smoke covers page/asset hydration, form navigation, real PostgreSQL save/read/confirm/handoff/delete, container health and the independent cleanup heartbeat. Provider calls remain disabled in these checks.
- TypeScript/lint/build and dependency checks are run before delivery. Exact final counts and any reviewer findings are recorded in progress.md.

## Account-dependent checks — pending

LiveAvatar account setup has begun; the full LiveAvatar/ElevenLabs connector is not configured yet. Therefore **no live avatar call, provider billing, latency, barge-in quality, actual managed-session expiry or provider retention/deletion has been accepted yet**. Follow [setup-ru.md](setup-ru.md).

- [ ] Approved illustrated/stylized avatar ID and lip-sync from the selected voice.
- [ ] Paid ElevenLabs key permissions, PCM 24K, exact model/voice/config IDs and client tools with wait-for-response.
- [ ] One audio output; browser never publishes camera; no parallel agent widget.
- [ ] save_profile roundtrip, candidate shown, visible money and units corrected/confirmed by human.
- [ ] User interrupts a money statement; playback stops promptly, corrected text/history is consistent and no unspoken confirmation is accepted.
- [ ] Connect/no mic/no camera/SDK permission failure, network loss/reconnect, End during startup, refresh and two tabs; all resources and paid sessions close.
- [ ] Measured 300s limit and abandoned-call cleanup verified in the provider dashboard; no extra paid session after retry/restart.
- [ ] Desktop Chrome, real Safari/iPhone, mobile permissions, constrained networks/TURN and autoplay.
- [ ] Provider cost/credits/quota limits measured; conservative reservation adjusted before enabling public traffic.
- [ ] Provider retention controls reviewed separately from our no-raw-audio policy.

The module includes a working persistent quick form and preview before providers are configured. That does not count as successful live-call acceptance. No latency or accuracy targets are claimed as achieved without measurements.
