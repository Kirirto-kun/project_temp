# Universal API coach Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans with independent UI/SDK work delegated under superpowers:dispatching-parallel-agents. One fresh whole-change review follows integration.

**Goal:** A universal introductory video coach using direct model/TTS APIs and LiveAvatar FULL, with no ElevenLabs Agent.

**Architecture:** Reuse call lifecycle and PostgreSQL. Extend the common draft and form for arbitrary topics. No-context LiveAvatar FULL emits managed ASR; the owner /respond endpoint loads server transcript and invokes the existing callback in-process with Bearer + HMAC intake/epoch/deadline. Validated model patches use ProfileControl; reply is spoken with SDK.repeat. Speech start interrupts/cancels/invalidates the prior turn. No public model callback/tunnel is needed.

**Tech Stack:** Existing TypeScript/Next.js/React/Zod/pg/LiveAvatar SDK; no Python runtime, own LiveKit, Redis or stored audio.

**Spec:** ../specs/2026-11-15-universal-api-coach-design.md

## Global Constraints

- Any conversation; money is optional. Keep shared QuizAnswers, old drafts and explicit human confirmation.
- Direct API keys only. No ElevenLabs Agent ID or connector dependency in the final runtime.
- No devices/paid session before Start. Fixed configured deadline <=300s, independent cleanup and conservative budget.
- No raw audio/video persistence. Never print provider keys, transcripts or private profile data in logs.
- Preserve the user's existing setup-ru.md heading indentation edit.

## Review Focus

- A nonfinancial custom topic must save/reload/confirm without asking for salary, range or tax basis.
- Switching a salary draft to another kind must not silently carry its amounts into the new conversation.
- A provider callback replay or concurrent duplicate must not generate a second paid model turn.
- End/delete/restart during model generation must prevent late profile writes or resurrected media.
- Wrong bearer/binding, oversized requests and unknown epochs must fail before invoking any model.

### Task 1: Universal profile and interface

**Files:** src/contracts/domain.ts; src/onboarding/server/profile-control.ts; src/onboarding/scenarios.ts; src/onboarding/ui/{BriefForm,IntakeEntry,IntakeCall}.tsx; tests/intake/universal-profile.test.ts; tests/e2e/intake-call.spec.ts.

**Interfaces:** `QuizDraft` adds `goal?:string`, `desiredTone?:string`, extended kind enum; money fields remain the same optional flat fields. ProfileControl public signatures stay unchanged. `missing()` describes common preparation fields, not financial-engine readiness.

- [x] Write tests for nonfinancial save/tool/missing/confirmation, arbitrary custom topics, scenario switch and legacy money drafts. Run RED.
- [x] Implement common goal/context/counterpart fields, optional money and generic form/entry. Keep money units/range guards. Run GREEN unit tests.
- [x] Add E2E for nonfinancial save/reload/confirm, kind switch and mobile form; retain salary/range and device regressions.

### Task 2: Direct model callback and FULL media

**Files:** src/onboarding/providers/liveavatar.ts; src/onboarding/client/{liveavatar-session,call,api}.ts; src/onboarding/server/{coach-model,coach-callback,coach-response,session-binding,dependencies,http}.ts; src/app/api/avatar-llm/v1/chat/completions/route.ts; scripts/configure-liveavatar.ts; tests/intake/{provider,coach-callback,session-binding,sdk-adapter}.test.ts.

**Interfaces:** CallProvider mints FULL with voice/media/duration only, no provider context/vendor LLM configuration. CallSession exposes speak via SDK.repeat and interrupt. Final ASR commits before owner CallApi.respond(clientId/providerEpoch/turnId). The server builds a signed internal callback Request from stored transcript, retaining Bearer/HMAC intake/epoch/deadline and shared receipts. Model wire `{reply,changes,action}` decodes to `{reply,patch,action}`; action is continue/mini_practice/review/end. No model confirmation.

- [x] Write RED tests for token settings, signed binding/auth/body limits, active epoch/deadline, idempotency/concurrency and late result cancellation.
- [x] Implement no-context FULL, managed-ASR/respond/repeat/interrupt SDK flow and bounded structured model calls. Reuse profile.tool for validated writes/actions; keep late-write and stale-playback cancellation.
- [x] Persist callback processing/result receipts and per-attempt turn budget; reject ambiguous in-flight duplicates rather than generating twice.
- [x] Add repeatable TTS secret/voice setup, sandbox-only --test-default-voice, env names and safe duration. No context/vendor LLM config/public origin/proxy command is required. Existing End/cleanup invariants remain unchanged.

### Task 3: Integrate, verify and document

**Files:** TECH_STACK.md; AGENTS.md; PLAN.md; README.md; docs/product/intake/**; applicable A/B/C/D plan amendments; .env.example; package scripts.

- [x] Update prompt/setup/tool reference and source-of-truth docs for universal API-only mode, retaining the user edit.
- [x] Run lint, typecheck, whole unit/SQL suite, E2E and production build. Inspect desktop/mobile screenshots.
- [x] Configure local voice references; run a bounded sandbox session, recording whether built-in or imported TTS was used. No external callback/tunnel setup. Record exact ASR/respond/repeat/media/stop outcomes before normal-credit/product acceptance.
- [x] Request one fresh review, fix material findings with RED→GREEN, commit and update the existing feature branch without merging main.
