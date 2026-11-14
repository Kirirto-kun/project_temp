# Coach intake operations

- Text coach: always on (`coachIntake`), no provider needed.
- Audio call: needs `OPENAI_API_KEY` and `OPENAI_REALTIME_MODEL` (plan candidate:
  `gpt-realtime-2.1`; verify access), voice `OPENAI_REALTIME_VOICE`, transcription
  `OPENAI_TRANSCRIBE_MODEL`. The server mints a 120-second client secret per connect.
- Each connect reserves 5 minutes of Realtime budget and counts as one of three daily attempts;
  stop reconciles by elapsed minutes. A reconnect within the deadline reuses the attempt.
- Mini-practice recording needs audio-analysis consent and voice analysis (ElevenLabs + bucket).
- Stop, consent revocation and delete are never blocked by a stale revision; late transcripts and
  tool calls from an older provider epoch are ignored.

See `docs/product/intake/provider-spike.md` for why there is no Python worker in this build and the
known limitation of direct browser connections.
