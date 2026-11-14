# Holdline avatar call: LiveAvatar video coach in main's intake

**Status:** design approved 2026-11-15. **Branch:** `feature/avatar-call` (from `main`).
**Parent plan:** [Plan 4, D1–D3](../plans/2026-11-15-04-avatar-intake.md), [TECH_STACK.md](../../../TECH_STACK.md).
**Prior work:** `origin/codex/holdline-avatar-intake` (separate intake on an older main). That branch stays untouched; this design ports its LiveAvatar client, SDK start-up and lifecycle code onto main's intake.

## Goal

When the avatar is enabled, the intake's primary Start opens a video call with Alex (LiveAvatar LITE + ElevenLabs Agent Connector). The call uses main's existing intake record, tools, transcript, confirmation and review, so the profile has one source of truth. Video failure falls back to main's audio call, then text.

## Decisions

- **Placement:** video replaces audio as the primary path when enabled; audio (OpenAI Realtime) and text remain fallbacks. No third choice in the UI.
- **Avatar look:** production requires an approved custom stylised avatar (plan 4: no photorealistic stock face). The account has none yet and all 293 public avatars are photorealistic, so development uses a stock avatar in sandbox mode behind a flag. Swapping in the custom avatar changes `LIVEAVATAR_AVATAR_ID` only.
- **Agent config as code:** a script writes the coach prompt, the five client tools, PCM 24K output and a chat LLM to the ElevenLabs agent "Holdline Coach", from the same constants the audio coach uses. It prints a diff and writes only with `--apply`.
- **Keys:** server only. The browser receives a short-lived LiveAvatar session token and nothing else. The ElevenLabs key is registered once in LiveAvatar's secret store; the app sends only its `secret_id`.

## Flag

`AVATAR_CALL = off | dev | on` (default `off`).

| Value | Behaviour |
|---|---|
| `off` | Video is never offered; intake behaves exactly as main today. |
| `dev` | Allowed only when `NODE_ENV !== 'production'`. Sessions use `is_sandbox: true`; any avatar ID is accepted. |
| `on` | Requires `LIVEAVATAR_AVATAR_APPROVED=true` (set by a person once the custom avatar is approved). Otherwise the server treats the flag as `off` and logs a configuration error. |

Required when not `off`: `LIVEAVATAR_API_KEY`, `LIVEAVATAR_AVATAR_ID`, `LIVEAVATAR_ELEVENLABS_SECRET_ID`, `ELEVENLABS_COACH_AGENT_ID`. Missing values mean `off`. `/api/config` and the intake view's `availability` report `coachVideo: boolean`, next to the existing `coachVoice`.

## Architecture

```
Browser  AvatarCoach.tsx
           └ avatar-call.ts (lifecycle)  ─ avatar-session.ts (@heygen/liveavatar-web-sdk, ElevenLabsAgentSession)
               ├ client_tool_call  → POST /api/intake/:id/tool        (existing handleTool)
               ├ final captions    → POST /api/intake/:id/transcript  (existing recordTranscript)
               └ End / timeout     → POST /api/intake/:id/stop        (existing stopMedia)
Server   POST /api/intake/:id/connect { expectedRevision, mode: 'video' }
           → connectVideo(): quota + budget reserve → LiveAvatar POST /v1/sessions/token
             { mode: 'LITE', avatar_id, is_sandbox, max_session_duration,
               elevenlabs_agent_config: { secret_id, agent_id,
                 dynamic_variables: { intake_id, provider_epoch } } }
           → stores providerSessionId on the intake; returns { intake, sessionToken, providerEpoch, deadlineAt }
         stopMedia(): additionally calls LiveAvatar POST /v1/sessions/stop when a providerSessionId is set
```

### Units

| File | Responsibility |
|---|---|
| `src/onboarding/server/liveavatar.ts` | `createLiveAvatar({ apiKey, fetchImpl })`: `mintToken`, `stopSession`, `getSession`. Typed Zod responses; 15 s / 5 s timeouts. |
| `src/onboarding/server/service.ts` | `connectVideo`; `stopMedia` stops the provider session; video budget estimate. |
| `src/onboarding/contracts.ts` | `mode: 'text' \| 'audio' \| 'video'`; `providerSessionId` on the stored session (never in the view). |
| `src/server/env.ts`, `src/server/capabilities.ts`, `src/contracts/api.ts` | `serverEnv().liveAvatar` parses the flag and the four values; capabilities add `coachVideo` (spend ceiling OK and `liveAvatar` configured); the config contract and intake `availability` expose it. |
| `src/app/api/intake/[id]/connect/route.ts` | Accepts `mode` (`audio` default) and dispatches. |
| `src/onboarding/client/avatar-session.ts` | SDK wrapper: muted start, microphone-state check, captions, tool calls, response corrections, disconnects, keep-alive. |
| `src/onboarding/client/avatar-call.ts` | Lifecycle controller: generation guard against stale attempts, 15 s connect timeout, heartbeat/keep-alive, serial tool queue with revision retry, End that releases the mic locally and stops on the server independently. |
| `src/onboarding/ui/AvatarCoach.tsx` | Video, captions, mute, End, errors, fallback to audio/text. Brandbook tokens. |
| `src/onboarding/ui/IntakeEntry.tsx`, `IntakeScreen.tsx` | Start picks video when `coachVideo`; render `AvatarCoach` for `mode: 'video'`. |
| `scripts/avatar-register-secret.ts` | One-time: registers `ELEVENLABS_API_KEY` in LiveAvatar, prints `LIVEAVATAR_ELEVENLABS_SECRET_ID`. Never prints the key. |
| `scripts/avatar-sync-agent.ts` | Diffs and (with `--apply`) writes prompt, first message, client tools, PCM 24K, chat LLM to the agent. |

## Tools and prompt

The ElevenLabs agent uses `COACH_INSTRUCTIONS` and `COACH_TOOLS` from `src/onboarding/server/realtime.ts`, moved to a shared module so both coaches read the same source. Tools are client tools; the browser relays each call to the existing `/tool` route and returns the server's result to the agent. The agent never computes or states amounts on its own (existing prompt rules).

## Lifecycle and errors

- Connect: quota and budget are consumed before minting; a failed mint refunds both and returns `UPSTREAM_UNAVAILABLE`, and the client falls back to the audio call (then text).
- The SDK starts muted; the client unmutes only after the session is started, the microphone reports `ACTIVE`, and the attempt is still current.
- 15 s without a connected session ends the attempt with a message and fallback; answers stay saved.
- Disconnect, End, deadline and review all release the microphone immediately and call `/stop`. If the server cannot stop the provider session, the intake stays `stopping` and main's existing cleanup retries it.
- Stale events (old `providerEpoch` or an earlier client generation) are ignored on both sides.

## Testing

- Unit: provider client with injected `fetch` (token body, sandbox flag, errors, stop); flag parsing (`dev` refused in production, `on` without approval → off); `connectVideo` (quota, budget, refund on failure, epoch, stored session id, view never contains the token or session id); `stopMedia` stops the provider; call controller with a fake session (stale generation, tool queue and revision retry, connect timeout, End releases mic, mic check failure).
- E2E: with `AVATAR_CALL=off`, intake behaves as today; with video unavailable, Start falls back.
- Manual (with the owner, sandbox): Alex speaks, a tool saves a value, captions appear, End closes the session, network shows no key in the browser.

## Out of scope

The approved custom avatar asset (owner action in LiveAvatar/HeyGen); removing the audio call; body-language integration into the call; FULL mode or LiveAvatar-hosted agents.
