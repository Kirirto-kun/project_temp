# Intake microservice operations

Runtime: Next.js/TypeScript + the `holdline_intake` schema in PostgreSQL + LiveAvatar's managed ElevenLabs connector. Read [TECH_STACK.md](../../../TECH_STACK.md) first. Account setup in Russian: [setup-ru.md](setup-ru.md).

## Local development

```powershell
npm ci
npm run setup:local
npm run db:up
npm run db:migrate
npm run dev
```

`setup:local` uses `.env.example`, generates ignored local secrets only when `.env.local` is absent, and appends missing template fields when it exists. It preserves existing values, comments and custom settings; rerun after updating the code to receive new blank provider fields. `db:up` starts only the project's PostgreSQL container at 127.0.0.1:54329; other machine databases are untouched. The test database is `holdline_test`. `dev` supervises Next.js and the independent cleanup process. Production-default call flags are off. The quick form works without provider accounts; the illustrated poster is a preview, not a connected avatar.

## Production deployment

1. Use Node 24.22.3 (Docker and CI pin this version); npm lockfile pins dependencies. Node 22.19+ is the tested compatibility floor for local tools.
2. Provision a PostgreSQL connection and an account with permission to create/use `holdline_intake`. Run `db/001_intake.sql` before serving traffic; the migration is additive and idempotent, never changes other applications' tables, and is not automatically applied at every web request.
3. Create ignored `.env.production.local` on the deployment host. Set canonical HTTPS `APP_ORIGIN`, reachable `DATABASE_URL`, random `OWNER_SECRET`/`TOKEN_ENCRYPTION_KEY`/`MAINTENANCE_SECRET`, provider values and budget caps. An in-container database URL cannot use host 127.0.0.1; use your network's reachable database address.
4. Build/run `docker compose -f compose.production.yaml up -d --build`. Its Node supervisor starts the standalone web server and TypeScript cleanup child in the same service. Keep both alive. For non-Docker hosting, `npm run build` then `npm start` supervises the two processes too.
5. Put an HTTPS reverse proxy in front of port 3000. The browser UI and `/api/intake/**` must share the canonical origin; integrate with the main app by same-origin reverse proxy or link to the service. This service intentionally does not expose permissive credentialed CORS.
6. Verify `/api/health`, PostgreSQL reads, cleanup liveness, guest-cookie persistence, owner isolation and the call-flag state. `/api/health` is a database readiness probe; call admission separately checks cleanup liveness, provider configuration and flags.
7. Enable calls only after account configuration and live checks. Environment `AVATAR_INTAKE_ENABLED=true` and PostgreSQL flag `avatar_intake=true` are both required. `npm run calls:enable` sets the database flag, not provider keys or acceptance status.

`TOKEN_ENCRYPTION_KEY` is 32 bytes encoded as 64 hex characters. Session credentials at rest use AES-256-GCM with session ID as authenticated data; the public view contains no owner or provider binding. Do not rotate encryption/owner secrets while active attempts need their old credentials/drafts; drain calls first or implement a keyring migration.

Only set `TRUSTED_IP_HEADER=x-real-ip` (or `cf-connecting-ip`) when the ingress strips incoming values and overwrites the header from its trusted connection. Without that setting all unknown IPs share a conservative quota; spoofed X-Forwarded-For is not trusted automatically.

## Call lifecycle

- A create request stores only a draft. Connect reserves quota/budget once and mints one LITE token with `max_session_duration <=300`. The official SDK starts the managed media session after the user's action.
- PostgreSQL CAS serializes aggregate writes and admission. An active attempt is tied to one browser client ID; network retries reuse it. Starting after a closed attempt is explicit and increments the provider epoch.
- The browser sends heartbeat every 5s. Cleanup runs every 5s, stops stale active attempts after 15s (30s startup grace), enforces the absolute deadline, reconciles failed stops and purges expired rows. Call admission requires cleanup liveness within 15s. Provider duration is an additional independent bound, not an extension of the server deadline.
- Only the cleanup process or authenticated scheduled-maintenance endpoint publishes cleanup liveness. Reconciliation triggered by a normal Connect request cannot attest that the independent process is alive.
- End stops local microphone/output before awaiting server cleanup. A late token result is closed and never reopens a cancelled attempt. End is revision-independent and can target its epoch, so a stale hangup cannot stop a later attempt.
- Failed/ambiguous stop remains pending; already-ended sessions are checked through provider history. No state is declared closed merely because a browser disconnected.
- Budget reservations remain conservative until usage reconciliation is implemented: we do not refund unmeasured spend after a failed attempt. Daily/IP counters use UTC. Review/form time has no paid media session.

## API integration

All session responses: `Cache-Control: private, no-store`. Mutations use same-origin JSON, owner cookie and `Idempotency-Key` where applicable. IDs in URLs are not authorization. Version conflicts are 409; expired/deleted records are 410 while the tombstone exists, and 404 after TTL purge. Stop/maintenance safety actions do not require a current profile revision.

| Endpoint | Purpose |
|---|---|
| GET /api/intake/config | Actual call availability and disabled analysis capabilities |
| POST /api/intake | Create draft, set HttpOnly guest cookie, no provider call |
| GET /api/intake/:id | Owner-bound public view |
| POST /api/intake/:id/connect | Revision/idempotency/client lease, limited managed-session credential |
| POST /api/intake/:id/events | Heartbeat/ready/final transcript/correction, epoch and client binding |
| POST /api/intake/:id/tools | save_profile and allowlisted UI tools, model changes remain unconfirmed |
| PATCH /api/intake/:id/profile | User corrections; null explicitly clears a field |
| POST /api/intake/:id/confirm | Human confirmation, closes media |
| GET /api/intake/:id/handoff | Confirmed version and QuizAnswers draft/missing fields; requires closed media |
| POST /api/intake/:id/stop | Retryable cleanup; optional epoch protects newer attempts |
| DELETE /api/intake/:id | Cancels processing and clears our profile/transcript; tombstone prevents resurrection |
| POST /api/intake/maintenance | Bearer MAINTENANCE_SECRET only; same reconciliation as the cleanup process |

The handoff is owner-bound. A main app using the same origin can request it with that guest cookie, then validate missing fields through engine A; it must not trust browser-provided monetary values instead. A separate-origin server integration needs an explicit authenticated handoff adapter; an arbitrary intake ID is insufficient.

## Incident / rollback

1. `npm run calls:disable`: blocks new connections and tells cleanup to close active calls. Keep cleanup running until pending count is zero; check LiveAvatar sessions and provider credits independently.
2. For failed stop, retry End or maintenance. A provider outage is reported as cleanup pending, never silently refunded/marked closed. Keep the provider duration cap enabled.
3. Roll back frontend/API and agent/tool configuration as a compatible set. Preserve database schema and secrets; do not drop the schema as a rollback procedure.
4. Daily budget exhaustion keeps form access available. Do not raise limits without checking provider pricing and worst-case attempt cost. API logs omit salary, transcript, keys and raw audio.

There is no audio/video object store and no raw recording in this module. Retention: our draft/transcript expires after 24h, with periodic physical cleanup; tombstones/receipts contain only what is necessary to prevent duplicate or late writes. Provider retention/delete settings are independent. Scribe/MediaPipe/pitchfinder and full negotiation are separate layers, not hidden mocks in this service.
