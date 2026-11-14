# Managed avatar call Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans; implement inline and request one fresh whole-change review.

**Goal:** A standalone TypeScript service providing a stable web call with LiveAvatar + ElevenLabs, persistent draft, explicit confirmation and verifiable teardown.

**Architecture:** Next.js serves the call UI and same-origin API. PostgreSQL schema `holdline_intake` isolates the microservice in the existing database. LiveAvatar owns the managed media room and ElevenLabs connector. The official SDK owns only the microphone; camera preview remains local. Server deadlines, persisted browser heartbeats, provider duration limits and a TypeScript cleanup process close abandoned attempts.

**Tech Stack:** TECH_STACK.md: Next.js/React/TypeScript/Zod, PostgreSQL/pg, @heygen/liveavatar-web-sdk, Vitest/Playwright. No Python, own LiveKit, Redis, OpenAI Realtime or stored audio.

**Spec:** TECH_STACK.md, AGENTS.md, PLAN.md, plan D. User additionally authorized a separate microservice and implementation of its database integration without waiting for another developer.

## Constraints and review focus

- No provider session or device access before a user action; no fabricated successful call without credentials.
- One attempt, one SDK session and one voice; retries keep epoch/deadline. Another tab cannot take over an active attempt implicitly.
- Stop racing token provisioning, stale revisions, late tool calls and cancelled device prompts must not resurrect media or data.
- Provider max duration <=300s; server/browser deadlines and cleanup add independent bounds. End releases local devices even if API stop fails.
- Profile/form/save_profile use the common QuizAnswers draft. Model proposals never confirm money. Public DTOs exclude owner/provider bindings/secrets.
- PostgreSQL only at runtime. Additive schema migrations, no modification of unrelated existing tables. Test adapters are test-only.
- Local camera optional, no video publication/inference/recording. Advanced analysis is a later feature flag.

## Task 1: Persistence and lifecycle

- [x] Test create ownership/idempotency, concurrent connect, unchanged deadline, stop/provision race, retryable cleanup, per-IP/global budget and UTC rollover.
- [x] Implement PostgreSQL profiles/control records, CAS, conservative atomic budget and opaque provider binding. Verify real PostgreSQL SQL plus unit tests.

## Task 2: Provider and HTTP boundaries

- [x] Test official API token config, max_session_duration, encrypted credentials, stop verification and malformed responses. No billable retries after ambiguous start.
- [x] Implement API/SDK contracts, guest cookie/Origin/body limits/error envelope, explicit restart, heartbeat/transcript, save_profile, profile edit/confirmation/delete and maintenance.
- [x] Verify stale epochs, client lease, duplicate tool IDs, cross-origin/foreign owner, unsupported input, no automatic money confirmation, cleanup and no secrets in public views.

## Task 3: Browser call and review

- [x] Test late getUserMedia cancellation, connection failure/end/unmount, only local camera, duplicate client tools and cleanup on API failure.
- [x] Build branded entry/lobby, device choice, call stage, captions, mute/camera/End, connecting/poor network/reconnect/autoplay states and saved editable brief.
- [x] Real SDK only for video; no parallel ElevenLabs conversation. Form fallback works with the same persistent draft. Refresh never automatically opens devices or buys a session.
- [x] Run browser E2E on desktop/mobile, verify network/device behavior and visually inspect screenshots.

## Task 4: Operations and acceptance

- [x] Add migration/cleanup scripts, Docker/Compose, env template, agent tool configuration and practical setup/runbook.
- [x] Run lint/typecheck/unit/SQL/browser/build checks, fresh code review, fix material findings and record remaining real-account acceptance.
- [ ] Accounts/approved illustrated avatar and real provider barge-in/billing/retention/Safari/TURN acceptance remain external dependencies until credentials exist.
