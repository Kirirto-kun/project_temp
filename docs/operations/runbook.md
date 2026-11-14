# Runbook

| Symptom | Check | Action |
|---|---|---|
| Every API call returns 503 "Storage is not configured" | Redis variables | Set Upstash variables or `STORAGE_DRIVER=memory` for a single-process demo |
| "Today’s spending limit… is reached" | `budget:<day>` in Redis | Raise `DAILY_BUDGET_USD` or wait for the UTC day; text path still works |
| Jury shares one NAT and hits the daily limit | `quota:session:<day>:*` | Give the jury the demo-pool token (`POST /api/demo/claim`) |
| Voice turns do not move the round | Agent custom LLM URL and secret; `voiceBindingId` on the session | Re-issue the token; check the extra-body binding reaches the callback |
| Voice analysis stays pending | `ana:<id>` job status and attempts | Polling `GET /api/voice/analyses/:id` re-drives a stalled job (3 attempts) |
| Model errors | Server logs `request` entries with 5xx | The product falls back to rules and templates automatically |
