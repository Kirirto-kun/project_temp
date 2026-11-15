# Universal intake service operations — API v2

Runtime: Next.js/TypeScript, PostgreSQL holdline_intake, LiveAvatar FULL, direct OpenAI Chat Completions or Anthropic Messages API, imported ElevenLabs TTS voice. Read [TECH_STACK.md](../../../TECH_STACK.md) and [setup-ru.md](setup-ru.md). No ElevenLabs conversational Agent is required.

## Local development

~~~powershell
npm ci
npm run setup:local
npm run db:up
npm run db:migrate
npm run dev
~~~

setup:local uses .env.example, generates ignored local secrets only for a new .env.local and appends missing fields without replacing values/comments/custom settings. db:up starts the project's PostgreSQL container at 127.0.0.1:54329; the test database is holdline_test. dev supervises Next.js and the independent cleanup process. The universal form needs no provider account; the illustrated poster is a preview.

## Voice configuration and local operation

Required runtime inputs: LIVEAVATAR_API_KEY, LIVEAVATAR_AVATAR_ID, LIVEAVATAR_VOICE_ID and at least one OPENAI_API_KEY/ANTHROPIC_API_KEY, plus existing DB/auth/encryption/budget settings. APP_ORIGIN is the canonical UI origin. INTAKE_MODEL_PROVIDER selects anthropic/openai; model defaults are claude-sonnet-5-5 and gpt-5.4-mini. A configured secondary model can be used on failure; billing is provider-specific.

npm run provider:configure registers ElevenLabs TTS secret/imports voice only. ELEVENLABS_API_KEY is required for this normal helper path; ELEVENLABS_VOICE_ID is optional and a premade voice is selected if blank. The key needs voices_read when listing voices. Results: LIVEAVATAR_ELEVENLABS_SECRET_ID, LIVEAVATAR_VOICE_ID and LIVEAVATAR_VOICE_SOURCE=elevenlabs. References/secrets stay in ignored local env/provider storage.

For a transport-only sandbox test with LIVEAVATAR_SANDBOX=true, npm run provider:configure -- --test-default-voice selects a built-in LiveAvatar voice and marks source=liveavatar-test. It skips ElevenLabs TTS and cannot accept that integration. The helper and runtime prohibit that test source outside sandbox. Rerun the normal helper to switch back to imported TTS before normal/production use.

There is no provider context, vendor LLM configuration, external callback origin, proxy or tunnel setup in this mode. The current flow needs ordinary same-origin browser access. CUSTOM_LLM_API_KEY is an optional internal bearer override; otherwise the server derives the internal bearer from OWNER_SECRET. It never goes to the browser.

## Production deployment

1. Use the runtime pinned by Docker/CI (currently Node 24.22.3) and the single npm lockfile. Node 22.19+ is the local compatibility floor.
2. Use the existing PostgreSQL connection and apply additive/idempotent db/001_intake.sql before traffic. It only adds holdline_intake and leaves unrelated tables unchanged.
3. Store host secrets in ignored .env.production.local. Set canonical HTTPS APP_ORIGIN, reachable DATABASE_URL, OWNER_SECRET, TOKEN_ENCRYPTION_KEY, MAINTENANCE_SECRET, provider references/model keys and conservative budgets.
4. Run docker compose -f compose.production.yaml up -d --build. The supervisor keeps web and TypeScript cleanup alive. Non-Docker: npm run build then npm start provides the same two processes.
5. Configure HTTPS ingress. Browser UI and /api/intake/** share APP_ORIGIN and owner cookies. Owner /respond is same-origin. Its internal callback has Bearer/HMAC service auth; no external model callback ingress is required. Configure normal request limits/timeouts and do not expose server secrets.
6. Verify /api/health, owner isolation, database reads, cleanup liveness and /api/intake/config. Health is database readiness; call admission also checks flags/config/cleanup.
7. Set AVATAR_INTAKE_ENABLED=true and npm run calls:enable only for bounded accepted use. The flag is not a claim of live acceptance.

TOKEN_ENCRYPTION_KEY is 32 bytes encoded as 64 hex characters. Credentials at rest use AES-256-GCM with session ID as authenticated data. Public views contain no owner/provider binding. Drain attempts before rotating owner/encryption secrets unless a keyring migration exists.

Only set TRUSTED_IP_HEADER=x-real-ip or cf-connecting-ip when ingress strips incoming values and sets the trusted value. Otherwise unknown IPs share the conservative quota.

## Call lifecycle and limits

- Create stores a draft only. Explicit Connect reserves quota/budget and mints one FULL token. SDK starts media after user action.
- INTAKE_SESSION_LIMIT_SECONDS determines the fixed attempt deadline, ≤300s. The checked Free account permits one concurrent session and ≤120s; local testing uses 120. LIVEAVATAR_SANDBOX=true caps at 60s with designated Wayne, for technical testing only.
- An active attempt has one client ID/epoch/deadline; network retry reuses it. Explicit restart after close increments epoch and consumes new admission. Reconnect never extends the deadline.
- Browser heartbeat and cleanup run every 5s. Cleanup handles stale active attempts after 15s (30s startup grace), absolute deadline, failed stop and TTL purge. Admission needs a cleanup heartbeat within 15s. Ordinary Connect reconciliation cannot attest independent cleanup liveness.
- End stops local microphone/output before awaiting server cleanup. Delayed credentials cannot restart cancelled media. Epoch-scoped, revision-independent End cannot stop a later attempt.
- Ambiguous stop remains pending and retries; provider history can confirm already-ended sessions. Browser disconnect alone does not imply closed.
- Reservations are conservative until measured usage reconciliation exists; unmeasured failures are not refunded automatically. Counters use UTC. Review/form time has no paid session.
- Checked account: 10 LiveAvatar credits; normal FULL costs 2 credits/min, roughly 5 aggregate minutes rather than a five-minute Free attempt. Sandbox consumes no LiveAvatar credits, while external TTS/model billing is separate. No plan purchase/overage is part of setup.

## Owner /respond and the internal signed model boundary

A managed FULL session without provider context emits final user transcription and speech-start events. The controller commits the ASR transcript through /events, waits for that commit, then POSTs /api/intake/:id/respond with clientId/providerEpoch/turnId. It does not send an arbitrary replacement model history.

The owner/Origin-authenticated endpoint loads the server transcript and attempt, checks client/epoch/deadline and requires the latest committed user turn. It creates an in-process Request to the existing callback handler with server-derived Bearer authorization and an HMAC binding of intake/epoch/deadline. The signed provider-callback invariant remains intact without network ingress.

The model gets COACH_SYSTEM_PROMPT, bounded server history and candidate profile. JSON wire reply/changes/action is decoded to validated ProfilePatch and applied through ProfileControl. /respond returns reply/view/turnId/providerEpoch; the controller verifies current generation and uses SDK.repeat(reply). A greeting also uses repeat; no provider LLM context is installed.

On USER_SPEAK_STARTED the controller cancels its pending response, calls SDK.interrupt and sends speech_started to invalidate the previous turn on the server. New user turns, End/delete/restart/expiry must prevent stale model writes and stale playback.

The shared callback retains bearer/HMAC/body/turn limits and PostgreSQL receipts. Completed identical replay reuses the result; concurrent in-flight duplicates cannot generate twice. Recheck cancellation/epoch/deadline after model work and before ProfileControl. Models cannot confirm or change access/budget/financial-engine state. Keys/bindings never enter public views.

Protected POST /api/avatar-llm/v1/chat/completions and its alias without /v1 can remain for future server integrations. The current LiveAvatar flow does not require a public URL or external SSE tunnel.

## Browser API v2

Responses carrying draft/session data use Cache-Control: private, no-store. Browser mutations use same-origin JSON, owner cookie and Idempotency-Key where applicable. IDs are not authorization. Conflicts are 409; tombstoned/expired records return 410 until purge, then 404. Stop/delete safety actions do not require current profile revision.

| Endpoint | Purpose |
|---|---|
| GET /api/intake/config | intakeContractVersion:2, actual available/sessionLimitSeconds, disabled analysis/audio-only capabilities |
| POST /api/intake | Create draft and HttpOnly guest cookie; no provider call |
| GET /api/intake/:id | Owner-bound public view |
| POST /api/intake/:id/connect | Revision/idempotency/client lease; scoped FULL credential |
| POST /api/intake/:id/events | Ready/heartbeat/transcript/speech_started with epoch and client binding |
| POST /api/intake/:id/respond | Latest committed turn → internal signed model call → reply/view; owner/Origin/client/epoch bound |
| PATCH /api/intake/:id/profile | User correction; null explicitly removes a field |
| POST /api/intake/:id/confirm | Human confirmation and media close |
| GET /api/intake/:id/handoff | Confirmed draft/profileRevision/common missingFields; media must be closed |
| POST /api/intake/:id/stop | Retryable epoch-scoped cleanup |
| DELETE /api/intake/:id | Cancel processing/remove our data; tombstone blocks late resurrection |
| POST /api/intake/maintenance | Bearer MAINTENANCE_SECRET; independent cleanup reconciliation |
| POST /api/intake/:id/tools | Compatibility surface; not required by the ASR/respond/repeat flow |

Full common QuizAnswers requires kind/description/goal/counterpartRole, with optional desiredTone. QuizDraft is partial; old salary drafts remain readable. Money/date/range/avatar are optional. missingFields concerns only common preparation, including blank description; it does not demand salary, market or avatar. Changing a set kind first clears money/units/rangeSource, then applies explicitly resent values. Goal/context corrections revoke confirmation.

Handoff remains owner-bound. A future financial engine must separately validate supported kind, complete amounts, units, range and configuration; a common confirmed brief does not certify financial readiness. Custom preparation is ordinary arbitrary-topic input, not an entitlement-gated financial-scenario generator.

## Incident and rollback

1. npm run calls:disable blocks admission and closes active attempts via cleanup. Keep cleanup alive until pending count is zero; inspect provider sessions/usage separately.
2. Failed stop: retry End/maintenance and retain the provider duration cap. Do not silently mark closed or refund unknown spend.
3. Roll back compatible UI/API/respond/internal callback/model schema and voice references together. Preserve database schema/secrets; dropping schema is not a rollback.
4. Budget/model failure keeps the form available. Logs omit profile text, transcripts, provider keys, signed bindings and raw media. Do not raise spend limits to conceal an unexplained failure.
5. Verify /respond and managed media connectivity after rollback. There is no separate callback proxy/tunnel to keep alive.

Our raw audio/video is not persisted. Draft/transcript TTL is 24h with physical cleanup; provider retention/delete policies are separate. Scribe/MediaPipe/pitchfinder, full roleplay/debrief and financial simulation remain separate layers.
