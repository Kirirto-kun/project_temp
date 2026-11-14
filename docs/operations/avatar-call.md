# Avatar video call (LiveAvatar LITE + ElevenLabs agent)

Off unless `AVATAR_CALL` is `dev` or `on`. Keys live only in `.env.local` / the host's secrets.

1. **Keys** in `.env.local`: `LIVEAVATAR_API_KEY`, `ELEVENLABS_API_KEY` (paid ElevenLabs plan; permissions `convai_read`, `user_read`, `voices_read`, plus write access for the sync script).
2. **Register the ElevenLabs key in LiveAvatar** (once): `npm run avatar:register-secret` → copy `LIVEAVATAR_ELEVENLABS_SECRET_ID=…` into `.env.local`.
3. **Agent**: set `ELEVENLABS_COACH_AGENT_ID` (run `npm run avatar:sync-agent` without it to list matching agents). Then `npm run avatar:sync-agent` (dry run, prints the changes) and `npm run avatar:sync-agent -- --apply`.
4. **Development**: `AVATAR_CALL=dev`. The free sandbox accepts only the Wayne avatar (`dd73ea75-1218-4ef3-92ce-606d5f7fbc0a`) and ends sessions after about a minute. For a full-length test call set `LIVEAVATAR_SANDBOX=false` and any stock avatar id (uses credits).
5. **Production**: `AVATAR_CALL=on` requires `LIVEAVATAR_AVATAR_APPROVED=true` and the approved custom stylised avatar in `LIVEAVATAR_AVATAR_ID`. Stock photorealistic avatars are not used in production (plan 4).
6. **Failure behaviour**: if a token cannot be minted, the budget hold and quota unit are released and the screen falls back to the audio call, then text. A missed provider stop is bounded by `max_session_duration` (remaining intake time, ≤ 300 s).
