# Setup and deployment

## Environment

All variables are listed, without values, in `.env.example`. The essentials for a public deployment:

| Variable | Notes |
|---|---|
| `APP_URL` | Public HTTPS origin, used for Origin checks and checkout return URLs |
| `HOLDLINE_SIGNING_SECRET` | ≥ 32 random characters; signs owner cookies and voice bindings |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | Required in production (no in-memory state across instances) |
| `DAILY_BUDGET_USD` | Global ceiling across Agents, Scribe, LLM and Realtime. Without it, paid providers stay off |

`STORAGE_DRIVER=memory` is accepted only when set explicitly and is for a single process (local
development, E2E, a one-instance demo). Fixtures never run in the production request path.

## Deploy (Vercel or any Node host)

1. Create an Upstash Redis database and a private S3-compatible bucket (Cloudflare R2 works) with a
   lifecycle rule deleting objects after 1 day. Allow `PUT` from the app origin in the bucket CORS.
2. Set the environment variables; leave a provider's keys empty to keep that capability off.
3. Build with `npm run build`, start with `npm run start` (Node 22).
4. Check `GET /api/config`: only fully configured capabilities are `true`.
5. Make sure no hosting-level password protection blocks `/api/llm/v1/chat/completions` (the
   ElevenLabs agent calls it) or `/api/polar/webhook`.

## Rollback

Keep the previous deployment. Roll back the frontend and API together; the intake runs in the same
Next.js app (there is no separate worker in this build).
