# Avatar video call (LiveAvatar FULL)

Off unless `AVATAR_CALL` is `dev` or `on`. Keys live only in `.env.local` / the host's secrets; the browser only ever gets a short-lived LiveAvatar session token.

## How it works

- LiveAvatar FULL runs the room, speech recognition, lip sync and Alex's voice.
- Each final user transcript goes to `POST /api/intake/:id/turn`. The server runs the same deterministic coach as the typed chat (extraction, profile, next question) and returns Alex's next line; the browser has the avatar say it with `repeat`. No model invents amounts and nothing is confirmed for the user.
- The first connect starts with the greeting. When the coach moves to review, Alex finishes the line and the review opens.
- Same limits as the voice call: one paid attempt per explicit Start, intake quota, avatar budget hold, 5 minutes per intake, reconnects keep the deadline. Turns from an old attempt or a closed call change nothing.
- The screen uses the same layout as the voice call; the avatar video replaces the coach mark. If the video call cannot start or drops, the screen falls back to the voice call, then to typing, with the answers kept.

## Setup

1. `.env.local`: `LIVEAVATAR_API_KEY` (and `ELEVENLABS_API_KEY` for a custom voice).
2. Voice:
   - Sandbox test: `npm run avatar:setup-voice -- --sandbox` (uses the sandbox avatar's own voice; reads only).
   - ElevenLabs voice: `npm run avatar:setup-voice` (registers the ElevenLabs key as a LiveAvatar secret and imports a voice; writes to the LiveAvatar account). The ElevenLabs key needs "Voices: Read".
   Both save `LIVEAVATAR_VOICE_ID` in `.env.local`.
3. Development: `AVATAR_CALL=dev`. The free sandbox accepts only the Wayne avatar (`dd73ea75-1218-4ef3-92ce-606d5f7fbc0a`) and ends sessions after about a minute. For a full-length call set `LIVEAVATAR_SANDBOX=false` (uses credits).
4. Production: `AVATAR_CALL=on` requires `LIVEAVATAR_AVATAR_APPROVED=true` and an approved stylised avatar in `LIVEAVATAR_AVATAR_ID` (no photorealistic stock faces in the product).

Ported from the `codex/holdline-avatar-intake` branch (LiveAvatar FULL provider, SDK start check, voice import script) onto main's intake.
