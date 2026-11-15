# Universal conversation coach with direct APIs

User direction: any conversation, including interviews, feedback, conflict, relationships and presentations. Money is one optional case. User also authorized direct OpenAI/Anthropic/ElevenLabs APIs and LiveAvatar, without an ElevenLabs Agent, and supplied local credentials for bounded integration tests. Earlier delegation of implementation choices still applies; proceed inline without another approval round.

## Approach and scope

Keep the existing Next.js/TypeScript/PostgreSQL call lifecycle and illustrated UI. Use LiveAvatar FULL without vendor context/LLM configuration, with managed ASR and manual SDK.repeat driven by our owner-authenticated /respond endpoint. Normal voice is imported ElevenLabs TTS. The service invokes OpenAI or Anthropic directly. This delegates ASR, turn-taking, media and lip sync to LiveAvatar and eliminates the ElevenLabs Agent/configuration dependency. LITE with a self-hosted audio pipeline adds infrastructure; the previous managed ElevenLabs connector requires the agent the user has rejected.

The coach maps context, counterpart/audience, goal, desired tone and concerns, then offers a short opening rehearsal. This change does not claim to implement the separate full roleplay/debrief engine. Common `QuizAnswers` remains the sole draft structure. Add `goal` and optional `desiredTone`; make money, date, market and avatar fields optional. Kinds: raise, offer, rent, bill, interview, feedback, conflict, relationship, presentation, custom. Custom accepts any other topic. Unknown data stays absent. Changing kind clears prior monetary assumptions unless explicitly supplied again. Existing salary drafts remain readable.

## API-only connection

The official SDK receives managed ASR events. The controller commits final user transcription through the owner API, then POSTs /api/intake/:id/respond with clientId/providerEpoch/turnId. The server checks owner/Origin/client/epoch/deadline/latest committed user turn and loads its stored transcript; browser-supplied arbitrary history is not accepted.

The signed provider-callback invariant stays intact as an internal server boundary. /respond creates an in-process Request to the existing callback handler with Bearer plus HMAC intake/epoch/deadline. The internal bearer is derived from OWNER_SECRET unless an optional valid CUSTOM_LLM_API_KEY override is configured. No public callback URL, tunnel or provider LLM configuration is required. Protected callback routes may remain for future server integrations.

The model receives our server prompt/candidate and bounded server history. Structured wire output {reply,changes:[{field,value}],action} is decoded/validated to {reply,patch,action}, saved through the existing owner/revision/epoch/idempotency ProfileControl checks. Allowed actions are continue/mini_practice/review/end. Models cannot confirm.

The owner endpoint returns reply/view/turnId/providerEpoch. The current controller generation verifies them before SDK.repeat. USER_SPEAK_STARTED interrupts SDK output and cancels/invalidates the previous turn, including a server speech_started event. End/delete/restart/expiry cannot apply a late model patch or restart old playback.

The shared model orchestration retains PostgreSQL receipts, input/turn budgets and cancellation checks. Completed identical replay reuses the stored result; ambiguous in-flight duplicates cannot launch another paid generation. Public views contain no keys/bindings. One LiveAvatar media connection remains the only speaking channel.

## Operations and acceptance

Retain 300s absolute ceiling, independent cleanup, budget admission and local-only camera. Make the configured session limit <=300s; Free testing uses 120s and sandbox uses <=60s. No provider purchase/overage enablement is authorized. Initial probes confirmed keys authenticate, 10 LiveAvatar credits, an active avatar and a paid ElevenLabs account. This does not prove generation quotas or live media.

Configure normal ElevenLabs TTS secret/imported voice through a repeatable helper, saving only voice references locally. No context or vendor LLM configuration is created. A sandbox-only --test-default-voice helper mode selects a built-in LiveAvatar voice and does not accept ElevenLabs TTS. The current flow needs ordinary same-origin UI access, not a public model callback/tunnel. Credentials remain in ignored env files. User's unrelated edits in setup-ru.md must be retained.

Validate unit/SQL tests, API boundary tests, desktop/mobile browser flows, build and a bounded real sandbox call. Record actual live acceptance and remaining account/network/device limitations. No claim of production stability without measured live evidence.
