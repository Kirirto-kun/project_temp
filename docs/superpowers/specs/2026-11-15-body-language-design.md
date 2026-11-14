# Holdline body language: on-device measurement, report and events upload

**Status:** design approved 2026-11-15. **Owner:** D (body-language slice). **Branch:** `feature/body-language`.
**Parent plan:** [Plan 4 §3 and D4](../plans/2026-11-15-04-avatar-intake.md); speech review (D5), avatar call (D1–D3) and core (A) are other people's work.

## Goal

Give the user the richest body-language feedback we can back with evidence, without the camera ever leaving the device. Output is a list of factual, time-stamped `Observation`s plus a short report section. No emotion, confidence or honesty labels, ever.

## Decisions

- **Models (all local, MediaPipe Tasks Vision `@mediapipe/tasks-vision@1.1.1`, pinned; re-evaluate newer releases once they are 2+ weeks old):**
  - Pose Landmarker **Heavy** → Full → Lite, chosen by a device benchmark (see Performance).
  - Face Landmarker with **blendshapes** and the facial transformation matrix (head pose); iris landmarks for approximate gaze.
  - Hand Landmarker (21 points per hand). Plan 4 requires a separate test before hands ship; the eval harness below is that test, and hand-derived kinds stay behind `enableHands` until they pass.
- **Not used:** Tavus Raven-2 or any cloud perception. The `Observation` format has a `source` field, so a Raven adapter can be added later as an opt-in comparison without changing consumers.
- **Runtime:** a module Web Worker behind a `LandmarkSource` interface. If MediaPipe's loader fails inside a worker on some browser, a main-thread source (`requestVideoFrameCallback`) plugs into the same interface.
- **Tooling:** self-contained. A minimal root `package.json` (TypeScript, Vite, Vitest, React, Zod, tasks-vision) that B folds into the Next.js scaffold later. No Next.js here.

## Signals and observation kinds

All thresholds live in one versioned `thresholds.ts` (`thresholdsVersion`). They are engineering starting points to tune on labelled clips, not behavioural norms. References are the user's own rolling baseline (first 5 s of valid frames per segment, refreshed on camera reposition), never a population norm.

| Kind | Source | Rule (start values) | Report wording example |
|---|---|---|---|
| `head_turn_away` | face matrix yaw | \|yaw\| > 25° for ≥ 2 s | "Head turned away for ~3 s at 0:42" |
| `head_down` | face matrix pitch | pitch < −20° for ≥ 2 s | "Looked down for ~2 s at 1:05" |
| `gaze_on_screen_share` | iris + head pose | share of valid time with estimated gaze inside the screen cone | "Gaze toward the screen ~78% of visible time (approximate)" |
| `out_of_frame` | face presence | no face ≥ 1 s | "Out of frame for ~4 s at 2:10" |
| `posture_shift` | pose shoulders | shoulder-centre moves > 0.25 shoulder widths vs reference for ≥ 2 s | "Shifted position at 0:55" |
| `lean_change` | shoulder width / face size | apparent scale changes ≥ 15% vs reference for ≥ 2 s | "Moved closer to the camera at 1:30" |
| `shoulder_raise` | shoulders vs face/nose | shoulder line rises > 0.15 shoulder widths for ≥ 1.5 s | "Shoulders raised for ~2 s at 1:12" |
| `hand_to_face` | hands (pose wrists if hands off) + face box | hand landmark inside expanded face box ≥ 0.7 s | "Hand near face at 0:38" |
| `gesture_activity` | hands/wrists | movement bursts per minute of hands-visible time | "~6 hand gestures per visible minute" |
| `hands_visible_share` | hands/wrists | share of valid time with ≥ 1 hand visible | "Hands visible 40% of the time" |
| `open_palm_share` | hand landmarks | share of hand-visible time with palm facing camera | "Open palms in ~30% of gestures" |
| `smile_share` | blendshapes `mouthSmile*` | mean > 0.4 counted as smiling | "Smiling ~20% of visible time" |
| `brow_raise` | `browInnerUp`/`browOuterUp*` | > 0.5 for ≥ 0.5 s | "Raised eyebrows at 0:47" |
| `lip_press` | `mouthPress*` | > 0.5 for ≥ 1 s | "Pressed lips for ~1 s at 1:20" |
| `blink_rate` | `eyeBlink*` | blinks per minute of face-visible time | "~18 blinks per minute" |

Every Observation is a fact with a value and unit. The report never adds a meaning ("nervous", "confident", "closed off"), never scores stillness, disability, gesture habits or culture, and never claims true eye contact.

## Quality gates

Per sample, `quality.ts` returns `valid` or one reason: `no_face`, `multiple_people`, `low_confidence` (< 0.7), `too_dark` (mean luma < 40/255), `camera_moved` (background-free proxy: simultaneous jump of all keypoints > 0.3 frame width), `limbs_not_visible` (only gates the kinds that need them).

- Each window/aggregate carries `validMs`, `observedMs` and the dominant unavailable reason.
- A kind is evaluated only where its required points are visible. An unseen hand is "unknown", not "no gestures".
- **Session summary** requires ≥ 10 s of valid camera and coverage ≥ 70%; otherwise the visual section is `unavailable` with a reason. Short, high-confidence events can still be listed, never extrapolated to the whole call.
- Mirroring: inference uses the unmirrored source; only the preview is mirrored with CSS.

## Speech-aligned moments

`align.ts` joins Observations with speech turn intervals (`AudioManifest.turns` from A, recording-relative ms) and an optional list of key turns supplied by the caller (for example the mini-practice ask). It outputs `Moment`s: "while you named the amount (0:41–0:47): looked down ~2 s, hand near face". The report shows at most three moments, key turns first. Without turns, the report shows plain events. All timestamps share the recording clock passed into the session (`clock()` from C's capture); no wall-clock joins.

## Architecture

```
<video> (local camera, never published)
  → source.ts: frame grabber (createImageBitmap, ~10 fps, drop while busy)
  → worker.ts: MediaPipe pose/face/hands → LandmarkSample (compact, no images)
  → quality.ts → features/*.ts (one detector per kind group) → Observation[]
  → summary.ts (gates, aggregates) → VisualReport.tsx
  → align.ts (with speech turns) → Moments
  → upload.ts → POST /api/intake/:id/events (batched, consent-checked)
```

Files (under `src/onboarding/client/vision/` unless noted):

| File | Responsibility |
|---|---|
| `types.ts` | Zod schemas: `LandmarkSample`, `Observation`, `VisualSummary`, `Moment`, `EventsBatch` |
| `models.ts` | Asset manifest: tasks-vision version, model file names, SHA-256, served from `public/intake/models/` |
| `thresholds.ts` | All numeric rules, `thresholdsVersion` |
| `quality.ts` | Sample validity and coverage |
| `features/head.ts`, `features/body.ts`, `features/hands.ts`, `features/face.ts` | Pure detectors → `Observation[]` |
| `summary.ts` | Gates, aggregates, top events |
| `align.ts` | Moments from observations + speech turns |
| `worker.ts`, `worker-protocol.ts` | Inference in the worker; typed messages |
| `source.ts` | `LandmarkSource` interface, worker source, main-thread fallback, frame pacing, tier selection |
| `session.ts` | `createVisionSession({ video, clock, consent, signal, enableHands })`: start/stop/setConsent/onUpdate/getSummary |
| `upload.ts` | Event batching client + mock handler |
| `src/onboarding/ui/VisualReport.tsx` | Camera section of the review |
| `dev/vision-demo/` | Vite page running the real pipeline on your webcam with live events |
| `tests/intake/vision-*.test.ts` | Vitest |
| `scripts/vision-eval.ts` | Runs detectors over labelled local sample timelines; prints precision/recall per kind |

## Performance

- Lobby benchmark: 20 frames per tier. Choose Heavy if p95 per-frame < 40 ms, Full if < 60 ms, else Lite.
- Hands run every second frame. Budget overrun backoff: 10 fps → 5 fps → hands off → visual analysis off with reason `device_too_slow`. The conversation is never affected.
- React receives updates at most 1 Hz. Samples live in a bounded ring buffer (≤ 10 minutes, twice the 5-minute call limit, so a normal call is never trimmed); no raw landmarks are stored or uploaded.

## Events upload

- `EventsBatch = { seq, consentVersion, observations: Observation[] }`, sent every 5 s or 20 observations, and once on stop.
- Idempotency-Key = `${intakeId}:${consentVersion}:${instanceId}:${seq}` (instanceId is a random UUID per uploader, so a page reload never reuses a key with a different body); retries reuse it (backoff 1 s, 2 s, 4 s, then hold and send with the next flush). 5xx, 408, 429 and network errors retry; 409/410 stop the uploader; other 4xx drop that batch and continue.
- On consent revoke: stop capture, drop queued batches, never send again for that `consentVersion`. The session exposes this as `session.revoke()`: it disposes the source, calls `uploader.revoke()`, pushes and flushes nothing, and is one-way like `stop()` (whichever comes first wins). Aborting the signal means `stop()` (final observations are uploaded); consent withdrawal must call `revoke()`. A 409/410 from the server stops the uploader.
- The schema is strict: a batch containing landmark arrays or image data fails validation before sending.
- Until B ships the endpoint, `mockEventsHandler` (an injectable `fetch`) validates and records batches for tests and the demo.

## Lifecycle and privacy

- Camera off/stop: stop frame grabbing, close pending ImageBitmaps, `close()` the landmarkers, terminate the worker, release the ring buffer. The camera stream itself belongs to the caller (D3) and is not stopped by this module.
- No `visualAnalysis` consent → no session is created; self-view only.
- A test asserts that worker → main messages contain only `LandmarkSample`, and a demo-page network check confirms that no image or video payloads leave the browser.

## Testing

- Unit (Vitest): synthetic landmark timelines per kind, including boundaries (24° vs 26°, 1.9 s vs 2.1 s), occluded wrist, two people, darkness, camera move, mirroring, reference refresh, coverage gate (9 s / 69%), alignment, upload retry/idempotency/revoke, schema rejection of landmark arrays.
- Copy test: report strings never contain banned terms (`nervous`, `confident`, `confidence` as a trait, `anxious`, `lying`, `honest`, `diagnos*`, `posture is bad`, `eye contact`).
- Manual: demo page on Chrome and Safari (macOS), glasses, dim room, hands out of frame, second person entering.
- Acceptance (later, with real clips): precision ≥ 90% per displayed kind on ≥ 30 labelled clips via `scripts/vision-eval.ts`; kinds that miss are disabled, not shipped with a disclaimer. Labelled clips stay outside git.

## Out of scope

Speech review (D5), the call UI and lobby (D3), the avatar (D1), server storage for events (B), any semantic or emotion model.
