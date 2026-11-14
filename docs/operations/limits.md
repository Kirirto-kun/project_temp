# Limits, budget and retention

| Limit | Value | Where |
|---|---|---|
| Practice round | 5 minutes from start, 20 turns | Server deadline + engine `maxTurns` |
| New rounds and replays | `SESSIONS_PER_IP_PER_DAY` (default 3) per IP per UTC day | `Quota('session')` |
| Coach audio calls | `INTAKE_ATTEMPTS_PER_IP_PER_DAY` (default 3), 5 minutes each | `Quota('intake')` |
| Coach text messages | 80 per IP per day | `Quota('intake_message')` |
| Calibrations / uploads / analyses / voice tokens | 6 / 20 / 6 / 12 per IP per day | `DEFAULT_LIMITS` |
| Jury pool | `DEMO_POOL_SESSIONS` extra rounds per day after `POST /api/demo/claim` with `DEMO_POOL_TOKEN` | Share the token privately; no public query parameter |

Spend: every paid call reserves an upper-bound cost from the daily ceiling before it runs and is
reconciled with measured token usage (LLM) or duration (Scribe, Realtime). Estimates live in
`src/server/limits/budget.ts` and are conservative placeholders until measured on the real
accounts.

Retention: sessions, intake drafts and assessments 24 h (Redis TTL); raw audio is deleted right
after analysis and the bucket lifecycle removes leftovers within 24 h. Logs carry request ids,
routes, status codes and latencies, never text, transcripts, amounts or keys.
