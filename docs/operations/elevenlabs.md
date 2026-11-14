# ElevenLabs agent (voice practice)

1. Create an agent in the ElevenLabs dashboard.
2. LLM: **Custom LLM**, URL `https://<APP_URL>/api/llm/v1/chat/completions`, API key = the value of
   `ELEVENLABS_CUSTOM_LLM_SECRET`. The endpoint answers OpenAI-compatible SSE.
3. Allow overrides for the first message and the TTS voice. Map persona voice keys to voice IDs in
   `ELEVENLABS_VOICE_MAP`, e.g. `{"steady_low":"…","warm_mid":"…","bright_mid":"…","calm_high":"…"}`.
4. The browser starts the session with a one-time conversation token from `/api/elevenlabs/token`
   and passes `customLlmExtraBody: { binding }`. The binding is HMAC-signed and tied to the session's
   transport epoch; only one binding is active per session.
5. Turn identity: `<bindingId>:<ordinal of the user message>`. A retried callback with the same
   message list returns the stored reply; repeating the same words later is a new turn. Greetings
   and requests without a user message never move the engine.
6. The first SSE chunk is a short buffer word ("Hm…"), then the checked reply in sentence chunks,
   then `[DONE]`.

Verify on a real account before enabling: final vs tentative transcript events, overrides, the
extra-body field name in the callback, latency to first audio and to the reply (target 3–5 s).
Scribe: model from `ELEVENLABS_STT_MODEL` (default `scribe_v3`), `no_verbatim=false`, word
timestamps. Check on a known recording that "um/uh" survive; otherwise the filler metric must be
treated as unavailable.
