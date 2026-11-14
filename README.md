# Holdline

Rehearse a money conversation before it costs you. Holdline is a web simulator for a raise, a job
offer, rent or a bill: a short conversation with an AI practice coach collects your situation, you
confirm every number, then you play the conversation against a counterpart who does not give in for
free and see, move by move, how much was left on the table against your own range.

No sign-up, no login. Everything works by typing; voice is optional.

> Business Cup 2.0 project. Plans: [PLAN.md](PLAN.md) and [docs/superpowers/plans](docs/superpowers/plans).
> Design source of truth: [brandbook.html](brandbook.html) (v2).
> This build deliberately excludes the HeyGen/LiveAvatar video avatar and any body-language model.

## How it works

```
Browser (Next.js)
 ├─ Landing · quick form · counterpart catalog · calibration · session · debrief · plan · pricing
 ├─ AI coach intake: scripted text coach, optional audio call (OpenAI Realtime over WebRTC)
 ├─ Voice practice: @elevenlabs/react agent, user-only recording, 50 ms RMS / YIN pitch samples
 └─ sessionStorage draft, localStorage plan (never a payment or profile authority)

Server (Next.js route handlers)
 ├─ /api/intake/**            coach profile, confirmation, handoff, tools relay, practice analysis
 ├─ /api/session, /api/turn   one transactional pipeline: classify → engine → actor → commit
 ├─ /api/llm/v1/chat/completions  OpenAI-compatible SSE endpoint for the ElevenLabs custom LLM
 ├─ /api/audio, /api/voice    presigned private uploads, Scribe baseline and analysis jobs
 ├─ /api/debrief              money computed by code, comments and score labelled as model output
 ├─ /api/polar/**, /api/entitlement, /api/scenarios/custom, /api/offers/analyze
 └─ quotas per IP per UTC day, global daily spend ceiling, guest owner cookie, same-origin checks

Storage: Upstash Redis (atomic compare-and-set, TTL) · S3-compatible private bucket for ≤24 h audio
```

The negotiation is decided by a **deterministic TypeScript engine** (`src/engine`). Language models
only label the user's reply (choosing among amounts the parser found), phrase the counterpart's line
(amounts are inserted by code), reword objections and write debrief comments. Every number on screen
is computed by code from the user's own range. Without any API key the product still runs end to end
with a rule-based classifier and templates.

| Path | What lives there |
|---|---|
| `src/contracts` | Zod contracts (contractVersion 1, intakeContractVersion 1) |
| `src/domain` | Money in integer cents, amount parser, debrief math, tension index, handoff validation |
| `src/engine` | `createInitialState`, `applyMove`, `finishSession` |
| `src/scenarios` | Raise/offer/rent/bill objections, four archetypes, eight fictional counterparts |
| `src/intelligence` | Classifier, actor + money guard, scenario writer, debrief, paid generators, model port |
| `src/server` | Platform: storage, access, limits, session pipeline, ElevenLabs, audio, payments |
| `src/onboarding` | AI coach intake: contracts, extraction, interviewer, assessment, API services, UI |
| `src/app`, `src/features`, `src/components`, `src/client` | Pages, screens, brand components, browser capture |

## Run locally

Requires Node 22.

```bash
npm ci
```

```bash
cp .env.example .env.local
```

```bash
npm run dev
```

With an empty `.env.local` the app uses in-memory storage, the deterministic classifier and the
text coach. Add keys to turn on optional capabilities; `GET /api/config` shows what is enabled.

| Capability | Needs |
|---|---|
| Model-assisted classifier, actor, debrief | `ANTHROPIC_API_KEY` (Claude Haiku 5.5 fast, Claude Opus 5.5 main) |
| Voice practice | `ELEVENLABS_API_KEY`, `ELEVENLABS_AGENT_ID`, `ELEVENLABS_CUSTOM_LLM_SECRET` |
| Voice calibration and analysis | `ELEVENLABS_API_KEY` + S3 bucket (or `STORAGE_DRIVER=memory` locally) |
| Coach audio call | `OPENAI_API_KEY`, `OPENAI_REALTIME_MODEL` |
| Payments, custom scenario, offer analysis | Polar variables, Redis, `APP_URL` |

In production every paid provider stays off until `DAILY_BUDGET_USD` is set. See
[docs/operations/setup.md](docs/operations/setup.md).

## Tests

```bash
npm run lint
```

```bash
npm run typecheck
```

```bash
npm run test:engine
```

```bash
npm run test:server
```

```bash
npm run test:ui
```

```bash
npm run test:intake
```

```bash
npm run build
```

```bash
npm run test:e2e
```

- `test:engine`: contracts, money, every engine transition and invariants, 30 labelled classifier
  replies (rule-based path), actor money guard, debrief.
- `test:server`: transactions, idempotency, concurrency, access, voice callback dedup, SSE, audio,
  SigV4 test vector, metrics, quotas, budget, payments.
- `test:intake`: 40 extraction scenarios, coach flow, tool safety, consent and stop races, handoff.
- `test:e2e`: quick form → round → debrief → replay, coach → practice, text fallback, paid API protection.
- `npm run test:classifier:live` runs the 30 replies against the real model (paid) and writes
  `docs/operations/reports/classifier-live.json`.

## Honest limits

- The counterpart's limit is a scenario setting from your range, not knowledge of a real budget.
- Voice metrics are measurements (pace, pauses, fillers, pitch, loudness dip), one index with a
  published formula, and a persuasion score labelled as a model assessment. No emotion, nerves or
  stutter diagnosis. Jitter, shimmer and timbre are not measured.
- Raw audio is deleted after analysis and never kept longer than 24 hours in our bucket; provider
  retention is governed by each provider's own settings.
- The guest identity is a browser cookie: a purchase lives in that browser.
