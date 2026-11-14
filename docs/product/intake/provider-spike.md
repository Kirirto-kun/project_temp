# First call with the AI coach: what was built and why

Scope decision for this build: **no HeyGen/LiveAvatar video avatar and no body-language model
(MediaPipe Pose/Face or Tavus Raven)**. Everything else in plan D is implemented around that.

## What changed against plan D

| Plan D | This build | Reason |
|---|---|---|
| LiveAvatar LITE video host | Flat illustrated mark "Alex — AI practice coach", always labelled AI | Avatars are out of scope; brandbook v2 also drops the photoreal-host exception |
| LiveKit room + Python Agents worker | Browser WebRTC straight to the OpenAI Realtime API with a 120-second client secret minted by `/api/intake/:id/connect` | The Python worker existed to host the Python-only LiveAvatar plugin. Without the avatar, a second always-on runtime only adds deployment and cost |
| Worker-owned tool calls | Browser relays Realtime function calls to `POST /api/intake/:id/tool`, bound to `providerEpoch` | See safety argument below |
| MediaPipe visual observations | Not built. `visualIntake=false`, `visualAnalysis` consent is the literal `false` | Out of scope |
| Scribe v3 speech review | Built: the mini-practice can be recorded (separate consent) and is transcribed with word timestamps | — |

## Safety of browser-relayed tools

A relayed tool call is no more powerful than the user editing their own profile, because:

- Amounts are never taken from the model. `propose_profile_patch` carries a field and a **quote**;
  the server checks that the quote appears in a committed user transcript item and parses the
  amount from it with the same deterministic parser as typed answers.
- Every value lands as a **candidate**. Only the explicit `POST /confirm` from the review card
  marks values confirmed, and only a confirmed profile revision becomes an `IntakeHandoff`.
- Tool calls are deduplicated by `callId`; a call from an older `providerEpoch` (after stop,
  reconnect or handoff) is ignored, and late transcripts are dropped.
- Tools cannot touch the engine, entitlements, quotas or URLs.

## Known limitation

With a direct browser connection the server cannot forcibly hang up an open Realtime session.
Mitigations: a 120-second secret, a 5-minute call deadline enforced in the UI, three paid
attempts per IP per UTC day, an upfront 5-minute budget reservation, and server-side epoch
invalidation on stop. For a public launch at scale, move the call behind a server relay
(LiveKit or a Realtime WebSocket relay) so the server owns the media lifecycle.

## Without any provider keys

The coach still works as a scripted text conversation (`coachIntake=true`): the same extraction,
clarification questions ("Just to check: $95,000/year, in US dollars, before tax?"), review,
practice-range assumption, typed mini-practice with wording feedback and handoff.
