# Body Language Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On-device body-language measurement for the Holdline intake call: MediaPipe pose/face/hands in a Web Worker → quality-gated, factual `Observation`s → a report section, speech-aligned moments and a batched events upload.

**Architecture:** Inference (MediaPipe Tasks Vision) runs in a module Web Worker behind a `LandmarkSource` interface and returns compact `LandmarkSample`s. Everything after that is pure TypeScript: quality gates, detectors, summary, alignment and copy, all unit-tested with synthetic timelines. A session object paces frames, selects a model tier, backs off on slow devices and feeds an idempotent uploader.

**Tech Stack:** TypeScript 7, Zod 4, `@mediapipe/tasks-vision@1.1.1`, React 19, Tailwind 4 (demo only), Vite 8 (demo only), Vitest 4, tsx.

**Spec:** [2026-11-15-body-language-design.md](../specs/2026-11-15-body-language-design.md). Parent: [plan 4 §3, D4](2026-11-15-04-avatar-intake.md).

## Global Constraints

- All inference runs on the device. No frame, image, video or landmark array ever leaves the browser; only `Observation`s are uploaded, and only with `visualAnalysis` consent.
- Observations are facts with value and unit. Never output or display: nervous, confident/confidence (as a trait), anxious, lying, honest, diagnosis, bad posture, eye contact, insecure, fidget.
- Coordinates in `LandmarkSample` are in frame-width units: `x ∈ [0,1]`, `y ∈ [0, H/W]`, taken from the **unmirrored** frame. Only the preview is mirrored, with CSS.
- Detection confidence ≥ 0.7 is enforced through the MediaPipe `min*Confidence` options; landmark `visibility` < 0.7 counts as "not visible".
- Session summary needs ≥ 10 s valid camera and coverage ≥ 70%; otherwise `partial` (events only) or `unavailable` with a reason.
- Thresholds are engineering start values in `thresholds.ts` (`version: 1`); they are tuned only through `scripts/vision-eval.ts`.
- Pin exact dependency versions (`--save-exact`). Model files are fetched by script, verified by SHA-256 at runtime, and not committed.
- File ownership: D owns `src/onboarding/**`, `public/intake/**`, `tests/intake/**`. The root `package.json`, `tsconfig.json`, `vitest.config.ts` are a temporary self-contained setup that B folds into the Next.js scaffold.

## File map

```
package.json, tsconfig.json, vitest.config.ts, .gitignore
src/onboarding/client/vision/
  types.ts            Zod schemas + types (samples, observations, batches, summary, moments)
  thresholds.ts       versioned numeric rules
  stats.ts            avg / median / p95
  geometry.ts         vectors, head angles, iris gaze, boxes
  quality.ts          per-sample validity, segments, coverage
  runs.ts             sustained-condition intervals, shares
  observation.ts      Observation builders
  features/head.ts    head_turn_away, head_down, out_of_frame, gaze_on_screen_share
  features/body.ts    posture_shift, lean_change, shoulder_raise
  features/hands.ts   hand_to_face, hands_visible_share, gesture_activity, open_palm_share
  features/face.ts    brow_raise, lip_press, smile_share, blink_rate
  detect.ts           detectAll
  summary.ts          gates → VisualSummary
  align.ts            Moments from speech turns
  copy.ts             all user-facing strings
  upload.ts           events uploader
  mock-events.ts      mock POST /api/intake/:id/events
  models.ts           asset manifest, tiers, modelVersion
  extract.ts          MediaPipe results → LandmarkSample
  inference.ts        MediaPipe landmarkers (worker or main thread)
  worker-protocol.ts  typed worker messages
  worker.ts           worker entry
  source.ts           LandmarkSource: worker + main-thread fallback
  pacing.ts           fps / hands / off backoff
  session.ts          createVisionSession
  eval.ts             precision/recall over labelled clips
src/onboarding/ui/VisualReport.tsx
scripts/fetch-vision-assets.ts, scripts/vision-eval.ts
dev/vision-demo/{index.html,main.tsx,theme.css,vite.config.ts}
public/intake/models/manifest.json   (committed; .task files and wasm are gitignored)
tests/intake/vision-*.test.ts(x), tests/intake/vision-fixtures.ts
```

---

### Task 1: Tooling and shared types

**Files:**
- Create: `package.json`, `tsconfig.json`, `vitest.config.ts`, `.gitignore`, `src/onboarding/client/vision/types.ts`
- Test: `tests/intake/vision-types.test.ts`

**Interfaces:**
- Produces: `PointSchema, FaceSchema, PoseSchema, HandSchema, LandmarkSampleSchema, ObservationSchema, EventsBatchSchema`, types `Point, Face, Blend, Pose, Hand, LandmarkSample, Observation, EventsBatch, EventKind, MetricKind, ObservationKind, UnavailableReason, Direction, VisualSummary, SpeechTurn, Moment`, consts `EVENT_KINDS, METRIC_KINDS, UNAVAILABLE_REASONS`, `isEventKind(kind)`.

- [ ] **Step 1: Create package.json and install pinned deps**

```json
{
  "name": "holdline",
  "private": true,
  "type": "module",
  "scripts": {
    "test:intake": "vitest run tests/intake",
    "typecheck": "tsc --noEmit -p tsconfig.json",
    "vision:assets": "tsx scripts/fetch-vision-assets.ts",
    "vision:demo": "vite --config dev/vision-demo/vite.config.ts",
    "vision:eval": "tsx scripts/vision-eval.ts"
  }
}
```

Run:
```bash
npm install --save-exact zod@4.6.7 @mediapipe/tasks-vision@1.1.1 react@19.1.10 react-dom@19.1.10
npm install --save-exact -D typescript@7.0.2 vitest@4.1.12 vite@8.3.5 @vitejs/plugin-react@6.1.2 tailwindcss@4.3.3 @tailwindcss/vite@4.3.3 tsx@4.23.15 @types/react@19.3.0 @types/react-dom@19.3.0 @types/node@22
```
Expected: install succeeds with no peer-dependency errors. If a peer conflict appears, pick the newest version of the conflicting package published before 2026-11-01 and record it here.

- [ ] **Step 2: tsconfig, vitest config, gitignore**

`tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "jsx": "react-jsx",
    "strict": true,
    "noEmit": true,
    "isolatedModules": true,
    "skipLibCheck": true,
    "types": ["vite/client", "node"],
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["src", "tests", "dev", "scripts"]
}
```

`vitest.config.ts`:
```ts
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: { environment: 'node', include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'] },
})
```

`.gitignore`:
```
node_modules/
dist/
public/intake/models/*.task
public/intake/wasm/
```

- [ ] **Step 3: Write the failing test**

`tests/intake/vision-types.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { EventsBatchSchema, LandmarkSampleSchema, ObservationSchema, isEventKind } from '@/onboarding/client/vision/types'
import { baseSample } from './vision-fixtures'

const observation = {
  id: 'head_turn_away:5000', recordingId: 'rec-1', kind: 'head_turn_away', startMs: 5000, endMs: 8000,
  value: 3000, unit: 'ms', direction: null, quality: 1, validMs: 3000, observedMs: 3000,
  source: 'mediapipe', modelVersion: 'tv1.1.1/pose-full/t1', unavailableReason: null,
}

describe('vision schemas', () => {
  it('accepts a well-formed sample and observation', () => {
    expect(LandmarkSampleSchema.parse(baseSample(0))).toEqual(baseSample(0))
    expect(ObservationSchema.parse(observation)).toEqual(observation)
  })

  it('rejects raw landmark arrays or image data smuggled into an upload', () => {
    const batch = { seq: 0, consentVersion: 1, observations: [{ ...observation, landmarks: [[0.1, 0.2]] }] }
    expect(EventsBatchSchema.safeParse(batch).success).toBe(false)
    expect(EventsBatchSchema.safeParse({ seq: 0, consentVersion: 1, observations: [], frame: 'data:image/png' }).success).toBe(false)
  })

  it('rejects extra fields on samples', () => {
    expect(LandmarkSampleSchema.safeParse({ ...baseSample(0), image: 'x' }).success).toBe(false)
  })

  it('separates event kinds from metric kinds', () => {
    expect(isEventKind('hand_to_face')).toBe(true)
    expect(isEventKind('smile_share')).toBe(false)
  })
})
```

`tests/intake/vision-fixtures.ts` (shared by all later tests):
```ts
import type { Face, Hand, LandmarkSample, Point, Pose } from '@/onboarding/client/vision/types'

export const pt = (x: number, y: number, v = 1): Point => ({ x, y, v })

/** A centred laptop framing: face and shoulders visible, wrists below the frame edge. Frame-width units, H/W = 0.5625. */
export function baseSample(tMs: number): LandmarkSample {
  return {
    tMs,
    luma: 120,
    faces: 1,
    poses: 1,
    face: {
      yawDeg: 0, pitchDeg: 0, rollDeg: 0,
      box: { x0: 0.42, y0: 0.08, x1: 0.58, y1: 0.26 },
      gaze: { h: 0, v: 0 },
      blend: { smile: 0, browUp: 0, press: 0, blinkL: 0, blinkR: 0 },
    },
    pose: {
      nose: pt(0.5, 0.18), lShoulder: pt(0.62, 0.36), rShoulder: pt(0.38, 0.36),
      lElbow: pt(0.66, 0.5), rElbow: pt(0.34, 0.5), lWrist: pt(0.64, 0.6, 0.2), rWrist: pt(0.36, 0.6, 0.2),
    },
    hands: [],
  }
}

export const withFace = (s: LandmarkSample, f: Partial<Face>): LandmarkSample => ({ ...s, face: s.face ? { ...s.face, ...f } : null })
export const withBlend = (s: LandmarkSample, b: Partial<Face['blend']>): LandmarkSample =>
  s.face ? withFace(s, { blend: { ...s.face.blend, ...b } }) : s
export const withPose = (s: LandmarkSample, p: Partial<Pose>): LandmarkSample => ({ ...s, pose: s.pose ? { ...s.pose, ...p } : null })
export const withHands = (s: LandmarkSample, hands: Hand[] | null): LandmarkSample => ({ ...s, hands })

/** Samples every `stepMs` in [fromMs, toMs). */
export function timeline(fromMs: number, toMs: number, stepMs: number, patch: (s: LandmarkSample) => LandmarkSample = (s) => s): LandmarkSample[] {
  const out: LandmarkSample[] = []
  for (let t = fromMs; t < toMs; t += stepMs) out.push(patch(baseSample(t)))
  return out
}

/** Shift every pose point and the face box by (dx, dy). */
export function shifted(s: LandmarkSample, dx: number, dy: number): LandmarkSample {
  const mv = (p: Point): Point => ({ ...p, x: p.x + dx, y: p.y + dy })
  const pose = s.pose && (Object.fromEntries(Object.entries(s.pose).map(([k, p]) => [k, mv(p)])) as Pose)
  const face = s.face && { ...s.face, box: { x0: s.face.box.x0 + dx, y0: s.face.box.y0 + dy, x1: s.face.box.x1 + dx, y1: s.face.box.y1 + dy } }
  return { ...s, pose, face }
}
```

- [ ] **Step 4: Run test to verify it fails**

Run: `npx vitest run tests/intake/vision-types.test.ts`
Expected: FAIL, cannot resolve `@/onboarding/client/vision/types`.

- [ ] **Step 5: Implement types.ts**

`src/onboarding/client/vision/types.ts`:
```ts
import { z } from 'zod'

export const PointSchema = z.strictObject({ x: z.number(), y: z.number(), v: z.number().min(0).max(1) })
const VecSchema = z.strictObject({ x: z.number(), y: z.number() })

export const BlendSchema = z.strictObject({
  smile: z.number(), browUp: z.number(), press: z.number(), blinkL: z.number(), blinkR: z.number(),
})

export const FaceSchema = z.strictObject({
  yawDeg: z.number(),
  pitchDeg: z.number(),
  rollDeg: z.number(),
  box: z.strictObject({ x0: z.number(), y0: z.number(), x1: z.number(), y1: z.number() }),
  gaze: z.strictObject({ h: z.number(), v: z.number() }).nullable(),
  blend: BlendSchema,
})

export const PoseSchema = z.strictObject({
  nose: PointSchema, lShoulder: PointSchema, rShoulder: PointSchema,
  lElbow: PointSchema, rElbow: PointSchema, lWrist: PointSchema, rWrist: PointSchema,
})

export const HandSchema = z.strictObject({ center: VecSchema, openPalm: z.boolean() })

/** One analysed frame. `hands` is null when hand tracking did not run for this frame. */
export const LandmarkSampleSchema = z.strictObject({
  tMs: z.number().nonnegative(),
  luma: z.number().min(0).max(255),
  faces: z.number().int().nonnegative(),
  poses: z.number().int().nonnegative(),
  face: FaceSchema.nullable(),
  pose: PoseSchema.nullable(),
  hands: z.array(HandSchema).max(2).nullable(),
})

export const EVENT_KINDS = [
  'head_turn_away', 'head_down', 'out_of_frame', 'posture_shift', 'lean_change',
  'shoulder_raise', 'hand_to_face', 'brow_raise', 'lip_press',
] as const
export const METRIC_KINDS = [
  'gaze_on_screen_share', 'gesture_activity', 'hands_visible_share', 'open_palm_share', 'smile_share', 'blink_rate',
] as const
export const UNAVAILABLE_REASONS = [
  'no_face', 'multiple_people', 'too_dark', 'camera_moved', 'limbs_not_visible', 'hands_disabled',
  'not_enough_valid_time', 'frame_rate_too_low', 'device_too_slow', 'camera_off', 'model_failed',
] as const

export const ObservationKindSchema = z.enum([...EVENT_KINDS, ...METRIC_KINDS])
export const UnavailableReasonSchema = z.enum(UNAVAILABLE_REASONS)
export const DirectionSchema = z.enum(['closer', 'farther'])

export const ObservationSchema = z.strictObject({
  id: z.string().min(1).max(80),
  recordingId: z.string().min(1).max(80),
  kind: ObservationKindSchema,
  startMs: z.number().nonnegative(),
  endMs: z.number().nonnegative(),
  value: z.number().nullable(),
  unit: z.enum(['ms', 'ratio', 'per_min']),
  direction: DirectionSchema.nullable(),
  quality: z.number().min(0).max(1),
  validMs: z.number().nonnegative(),
  observedMs: z.number().nonnegative(),
  source: z.literal('mediapipe'),
  modelVersion: z.string().min(1).max(80),
  unavailableReason: UnavailableReasonSchema.nullable(),
})

export const EventsBatchSchema = z.strictObject({
  seq: z.number().int().nonnegative(),
  consentVersion: z.number().int().nonnegative(),
  observations: z.array(ObservationSchema).max(200),
})

export type Point = z.infer<typeof PointSchema>
export type Blend = z.infer<typeof BlendSchema>
export type Face = z.infer<typeof FaceSchema>
export type Pose = z.infer<typeof PoseSchema>
export type Hand = z.infer<typeof HandSchema>
export type LandmarkSample = z.infer<typeof LandmarkSampleSchema>
export type Observation = z.infer<typeof ObservationSchema>
export type EventsBatch = z.infer<typeof EventsBatchSchema>
export type EventKind = (typeof EVENT_KINDS)[number]
export type MetricKind = (typeof METRIC_KINDS)[number]
export type ObservationKind = z.infer<typeof ObservationKindSchema>
export type UnavailableReason = z.infer<typeof UnavailableReasonSchema>
export type Direction = z.infer<typeof DirectionSchema>

export const isEventKind = (kind: ObservationKind): kind is EventKind => (EVENT_KINDS as readonly string[]).includes(kind)

export type VisualSummary = {
  status: 'ready' | 'partial' | 'unavailable'
  validMs: number
  observedMs: number
  coverage: number
  unavailableReason: UnavailableReason | null
  events: Observation[]
  metrics: Observation[]
}

/** A user speech turn on the recording clock (AudioManifest.turns from A). */
export type SpeechTurn = { turnId: string; t0Ms: number; t1Ms: number }
export type Moment = SpeechTurn & { isKey: boolean; observations: Observation[] }
```

- [ ] **Step 6: Run tests and typecheck**

Run: `npx vitest run tests/intake/vision-types.test.ts && npm run typecheck`
Expected: 4 tests PASS; typecheck exit 0.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json tsconfig.json vitest.config.ts .gitignore src/onboarding/client/vision/types.ts tests/intake/vision-types.test.ts tests/intake/vision-fixtures.ts
git commit -m "feat(vision): add tooling and observation schemas"
```

---

### Task 2: Thresholds, stats and geometry

**Files:**
- Create: `src/onboarding/client/vision/{thresholds,stats,geometry}.ts`
- Test: `tests/intake/vision-geometry.test.ts`

**Interfaces:**
- Produces: `THRESHOLDS`, `type Thresholds`; `avg(xs)`, `median(xs)`, `p95(xs)`; `type Vec`, `clamp, dist, mid, headAngles(m) → {yawDeg,pitchDeg,rollDeg}`, `irisOffset(lm) → {h,v}|null`, `gazeOnScreen(face, t) → boolean|null`, `inBox(p, box, expand)`, `boxCenter(box)`, constants `PITCH_SIGN`, `GAZE_H_SIGN`.

- [ ] **Step 1: Write the failing test**

`tests/intake/vision-geometry.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { gazeOnScreen, headAngles, inBox, irisOffset } from '@/onboarding/client/vision/geometry'
import { median, p95 } from '@/onboarding/client/vision/stats'
import { THRESHOLDS } from '@/onboarding/client/vision/thresholds'
import { baseSample } from './vision-fixtures'

const colMajor = (r: number[][]) =>
  [0, 1, 2, 3].flatMap((c) => [0, 1, 2, 3].map((row) => (row < 3 && c < 3 ? r[row]![c]! : row === c ? 1 : 0)))
const rad = (d: number) => (d * Math.PI) / 180

describe('headAngles', () => {
  it('reads yaw from a rotation about Y', () => {
    const c = Math.cos(rad(30)), s = Math.sin(rad(30))
    const a = headAngles(colMajor([[c, 0, s], [0, 1, 0], [-s, 0, c]]))
    expect(a.yawDeg).toBeCloseTo(30, 5)
    expect(a.pitchDeg).toBeCloseTo(0, 5)
  })
  it('reads pitch from a rotation about X', () => {
    const c = Math.cos(rad(-20)), s = Math.sin(rad(-20))
    const a = headAngles(colMajor([[1, 0, 0], [0, c, -s], [0, s, c]]))
    expect(a.pitchDeg).toBeCloseTo(-20, 5)
    expect(a.yawDeg).toBeCloseTo(0, 5)
  })
})

describe('irisOffset', () => {
  const eyes = () => {
    const lm = Array.from({ length: 478 }, () => ({ x: 0.5, y: 0.5 }))
    Object.assign(lm, {
      33: { x: 0.40, y: 0.30 }, 133: { x: 0.46, y: 0.30 }, 159: { x: 0.43, y: 0.29 }, 145: { x: 0.43, y: 0.31 },
      263: { x: 0.60, y: 0.30 }, 362: { x: 0.54, y: 0.30 }, 386: { x: 0.57, y: 0.29 }, 374: { x: 0.57, y: 0.31 },
      468: { x: 0.43, y: 0.30 }, 473: { x: 0.57, y: 0.30 },
    })
    return lm
  }
  it('is centred when irises are centred', () => {
    const g = irisOffset(eyes())!
    expect(g.h).toBeCloseTo(0, 5)
    expect(g.v).toBeCloseTo(0, 5)
  })
  it('moves with the irises', () => {
    const lm = eyes()
    lm[468] = { x: 0.445, y: 0.30 }
    lm[473] = { x: 0.585, y: 0.30 }
    expect(irisOffset(lm)!.h).toBeCloseTo(0.5, 5)
  })
  it('returns null without iris landmarks', () => {
    expect(irisOffset(eyes().slice(0, 468))).toBeNull()
  })
})

describe('gazeOnScreen', () => {
  it('is true when facing the camera and false when turned away', () => {
    const face = baseSample(0).face!
    expect(gazeOnScreen(face, THRESHOLDS)).toBe(true)
    expect(gazeOnScreen({ ...face, yawDeg: 30 }, THRESHOLDS)).toBe(false)
    expect(gazeOnScreen({ ...face, gaze: null }, THRESHOLDS)).toBeNull()
  })
})

describe('inBox', () => {
  it('expands the box by a fraction of its size', () => {
    const box = { x0: 0.4, y0: 0.1, x1: 0.6, y1: 0.3 }
    expect(inBox({ x: 0.62, y: 0.2 }, box, 0)).toBe(false)
    expect(inBox({ x: 0.62, y: 0.2 }, box, 0.25)).toBe(true)
  })
})

describe('stats', () => {
  it('computes median and nearest-rank p95', () => {
    expect(median([5, 1, 3])).toBe(3)
    expect(p95(Array.from({ length: 20 }, (_, i) => i + 1))).toBe(19)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/intake/vision-geometry.test.ts`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement**

`src/onboarding/client/vision/thresholds.ts`:
```ts
/** Engineering start values, tuned only via scripts/vision-eval.ts. Not behavioural norms. */
export const THRESHOLDS = {
  version: 1,
  minConfidence: 0.7,
  minLuma: 40,
  maxSampleGapMs: 300,
  cameraJumpFrac: 0.3,
  cameraJumpWindowMs: 200,
  cameraMovedInvalidMs: 1000,
  referenceMs: 5000,
  referenceMinSamples: 10,
  minShoulderWidth: 0.05,
  headTurnYawDeg: 25,
  headTurnMinMs: 2000,
  headDownPitchDeg: -20,
  headDownMinMs: 2000,
  gazeConeDeg: 20,
  gazeIrisYawGainDeg: 35,
  gazeIrisPitchGainDeg: 25,
  outOfFrameMinMs: 1000,
  postureShiftWidths: 0.25,
  postureShiftMinMs: 2000,
  leanScaleChange: 0.15,
  leanMinMs: 2000,
  shoulderRaiseWidths: 0.15,
  shoulderRaiseMinMs: 1500,
  handToFaceBoxExpand: 0.25,
  handToFaceMinMs: 700,
  gestureSpeed: 0.25,
  gestureMinMs: 200,
  gestureGapMs: 400,
  smileThreshold: 0.4,
  browRaiseThreshold: 0.5,
  browRaiseMinMs: 500,
  lipPressThreshold: 0.5,
  lipPressMinMs: 1000,
  blinkThreshold: 0.5,
  blinkMaxIntervalMs: 120,
  summaryMinValidMs: 10000,
  summaryMinCoverage: 0.7,
  maxSamples: 3000,
}

export type Thresholds = typeof THRESHOLDS
```

`src/onboarding/client/vision/stats.ts`:
```ts
export const avg = (xs: readonly number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0)

export function median(xs: readonly number[]): number {
  if (!xs.length) return 0
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2
}

/** Nearest-rank 95th percentile. */
export function p95(xs: readonly number[]): number {
  if (!xs.length) return 0
  const s = [...xs].sort((a, b) => a - b)
  return s[Math.max(0, Math.ceil(0.95 * s.length) - 1)]!
}
```

`src/onboarding/client/vision/geometry.ts`:
```ts
import type { Thresholds } from './thresholds'
import type { Face } from './types'

export type Vec = { x: number; y: number }
export type Box = { x0: number; y0: number; x1: number; y1: number }

/** Flip to -1 if the Task 14 calibration shows that looking down gives a positive pitch. */
export const PITCH_SIGN = 1
/** Flip to -1 if the Task 14 calibration shows iris offset and head yaw disagree in sign. */
export const GAZE_H_SIGN = 1

const DEG = 180 / Math.PI

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
export const dist = (a: Vec, b: Vec) => Math.hypot(a.x - b.x, a.y - b.y)
export const mid = (a: Vec, b: Vec): Vec => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })
export const boxCenter = (b: Box): Vec => ({ x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2 })

export function inBox(p: Vec, b: Box, expand: number): boolean {
  const dx = (b.x1 - b.x0) * expand
  const dy = (b.y1 - b.y0) * expand
  return p.x >= b.x0 - dx && p.x <= b.x1 + dx && p.y >= b.y0 - dy && p.y <= b.y1 + dy
}

/** Euler angles from MediaPipe's 4x4 facial transformation matrix (column-major data). */
export function headAngles(m: readonly number[]): { yawDeg: number; pitchDeg: number; rollDeg: number } {
  const r = (row: number, col: number) => m[col * 4 + row] ?? 0
  return {
    yawDeg: Math.atan2(r(0, 2), r(2, 2)) * DEG,
    pitchDeg: Math.asin(clamp(-r(1, 2), -1, 1)) * DEG * PITCH_SIGN,
    rollDeg: Math.atan2(r(1, 0), r(1, 1)) * DEG,
  }
}

const EYES = [
  { iris: 468, outer: 33, inner: 133, top: 159, bottom: 145 },
  { iris: 473, outer: 263, inner: 362, top: 386, bottom: 374 },
] as const

/** Iris position inside the eye opening, each axis in [-1, 1]; null without refined iris landmarks. */
export function irisOffset(lm: readonly Vec[]): { h: number; v: number } | null {
  if (lm.length < 478) return null
  let h = 0
  let v = 0
  for (const e of EYES) {
    const [iris, outer, inner, top, bottom] = [lm[e.iris]!, lm[e.outer]!, lm[e.inner]!, lm[e.top]!, lm[e.bottom]!]
    const halfW = Math.abs(inner.x - outer.x) / 2
    const halfH = Math.abs(bottom.y - top.y) / 2
    if (halfW < 1e-6 || halfH < 1e-6) return null
    h += (iris.x - (outer.x + inner.x) / 2) / halfW
    v += (iris.y - (top.y + bottom.y) / 2) / halfH
  }
  return { h: clamp((h / 2) * GAZE_H_SIGN, -1, 1), v: clamp(v / 2, -1, 1) }
}

/** Approximate: head pose plus iris offset inside a cone around the camera. Not eye contact. */
export function gazeOnScreen(face: Face, t: Thresholds): boolean | null {
  if (!face.gaze) return null
  const yaw = face.yawDeg + face.gaze.h * t.gazeIrisYawGainDeg
  const pitch = face.pitchDeg - face.gaze.v * t.gazeIrisPitchGainDeg
  return Math.abs(yaw) < t.gazeConeDeg && Math.abs(pitch) < t.gazeConeDeg
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/intake/vision-geometry.test.ts`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/onboarding/client/vision/{thresholds,stats,geometry}.ts tests/intake/vision-geometry.test.ts
git commit -m "feat(vision): add thresholds and face geometry"
```

---

### Task 3: Quality gates, runs and observation builders

**Files:**
- Create: `src/onboarding/client/vision/{quality,runs,observation}.ts`
- Test: `tests/intake/vision-quality.test.ts`

**Interfaces:**
- Consumes: `LandmarkSample`, `Thresholds`, `dist`, `boxCenter`, `mid`.
- Produces:
  - `type Qualified = { s: LandmarkSample; durMs: number; valid: boolean; reason: UnavailableReason | null; segment: number }`
  - `qualify(samples, t): Qualified[]`, `coverage(q): { validMs; observedMs; dominantReason: UnavailableReason | null }`
  - `type Run = { startMs: number; endMs: number }`, `type Test = (x: Qualified) => boolean | null`, `sustainedRuns(q, test, minMs): Run[]`, `whenValid(fn): Test`, `share(q, test): { onMs; knownMs }`
  - `type Ctx = { recordingId: string; modelVersion: string }`, `eventObservation(ctx, kind, run, direction?)`, `metricObservation(ctx, kind, window, value, unit, knownMs, observedMs, reason)`, `windowOf(q): Run`, `shareMetric(ctx, kind, q, test, t, reasonIfShort)`

- [ ] **Step 1: Write the failing test**

`tests/intake/vision-quality.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { coverage, qualify } from '@/onboarding/client/vision/quality'
import { share, sustainedRuns, whenValid } from '@/onboarding/client/vision/runs'
import { THRESHOLDS as T } from '@/onboarding/client/vision/thresholds'
import { baseSample, shifted, timeline } from './vision-fixtures'

describe('qualify', () => {
  it('marks clear samples valid with durations to the next sample', () => {
    const q = qualify(timeline(0, 1000, 100), T)
    expect(q.every((x) => x.valid)).toBe(true)
    expect(q[0]!.durMs).toBe(100)
    expect(q.at(-1)!.durMs).toBe(0)
  })

  it('caps durations across gaps', () => {
    const q = qualify([baseSample(0), baseSample(5000)], T)
    expect(q[0]!.durMs).toBe(T.maxSampleGapMs)
  })

  it.each([
    ['too_dark', { luma: 10 }],
    ['no_face', { faces: 0, face: null }],
    ['multiple_people', { faces: 2 }],
    ['multiple_people', { poses: 2 }],
  ] as const)('flags %s', (reason, patch) => {
    const [x] = qualify([{ ...baseSample(0), ...patch }], T)
    expect(x!.valid).toBe(false)
    expect(x!.reason).toBe(reason)
  })

  it('treats a sudden jump of face and shoulders as a camera move and starts a new segment', () => {
    const samples = [...timeline(0, 1000, 100), ...timeline(1000, 3000, 100, (s) => shifted(s, 0.35, 0))]
    const q = qualify(samples, T)
    const moved = q.filter((x) => x.reason === 'camera_moved')
    expect(moved.length).toBe(10)
    expect(q.at(-1)!.segment).toBe(1)
    expect(q.at(-1)!.valid).toBe(true)
  })

  it('does not treat a slow shift as a camera move', () => {
    const q = qualify(timeline(0, 3000, 100, (s) => shifted(s, s.tMs * 0.0001, 0)), T)
    expect(q.every((x) => x.valid)).toBe(true)
  })
})

describe('coverage', () => {
  it('sums valid and observed time and reports the dominant reason', () => {
    const samples = [...timeline(0, 1000, 100), ...timeline(1000, 3000, 100, (s) => ({ ...s, luma: 5 }))]
    const c = coverage(qualify(samples, T))
    expect(c.validMs).toBe(1000)
    expect(c.observedMs).toBe(2900)
    expect(c.dominantReason).toBe('too_dark')
  })
})

describe('sustainedRuns', () => {
  const q = (onUntil: number) => qualify(timeline(0, 5000, 100, (s) => ({ ...s, luma: s.tMs < onUntil ? 200 : 120 })), T)
  const bright = whenValid((x) => x.s.luma > 150)

  it('needs the condition for at least minMs', () => {
    expect(sustainedRuns(q(1900), bright, 2000)).toEqual([])
    expect(sustainedRuns(q(2000), bright, 2000)).toEqual([{ startMs: 0, endMs: 2000 }])
  })

  it('breaks runs at unknown samples and at gaps', () => {
    const samples = timeline(0, 4000, 100, (s) => ({ ...s, luma: 200 }))
    samples[15] = { ...samples[15]!, luma: 10 }
    expect(sustainedRuns(qualify(samples, T), bright, 1000)).toEqual([{ startMs: 0, endMs: 1500 }, { startMs: 1600, endMs: 3900 }])
    const gapped = [...timeline(0, 1500, 100, (s) => ({ ...s, luma: 200 })), ...timeline(3000, 4500, 100, (s) => ({ ...s, luma: 200 }))]
    expect(sustainedRuns(qualify(gapped, T), bright, 2000)).toEqual([])
  })

  it('computes share over known time', () => {
    expect(share(q(1000), bright)).toEqual({ onMs: 1000, knownMs: 4900 })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/intake/vision-quality.test.ts`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement**

`src/onboarding/client/vision/quality.ts`:
```ts
import { boxCenter, dist, mid } from './geometry'
import type { Thresholds } from './thresholds'
import type { LandmarkSample, UnavailableReason } from './types'

export type Qualified = { s: LandmarkSample; durMs: number; valid: boolean; reason: UnavailableReason | null; segment: number }

/**
 * Per-sample validity. Samples must be sorted by tMs. A camera move starts a new
 * segment so that body references are rebuilt for the new framing.
 */
export function qualify(samples: readonly LandmarkSample[], t: Thresholds): Qualified[] {
  const out: Qualified[] = []
  let segment = 0
  let movedUntil = -Infinity
  samples.forEach((s, i) => {
    const prev = samples[i - 1]
    const next = samples[i + 1]
    if (prev && cameraJumped(prev, s, t)) {
      movedUntil = s.tMs + t.cameraMovedInvalidMs
      segment++
    }
    const reason: UnavailableReason | null =
      s.luma < t.minLuma ? 'too_dark'
      : s.faces === 0 || !s.face ? 'no_face'
      : s.faces > 1 || s.poses > 1 ? 'multiple_people'
      : s.tMs < movedUntil ? 'camera_moved'
      : null
    const durMs = next ? Math.min(next.tMs - s.tMs, t.maxSampleGapMs) : 0
    out.push({ s, durMs, valid: reason === null, reason, segment })
  })
  return out
}

function cameraJumped(a: LandmarkSample, b: LandmarkSample, t: Thresholds): boolean {
  if (b.tMs - a.tMs > t.cameraJumpWindowMs || !a.face || !b.face) return false
  if (dist(boxCenter(a.face.box), boxCenter(b.face.box)) <= t.cameraJumpFrac) return false
  if (!a.pose || !b.pose) return true
  return dist(mid(a.pose.lShoulder, a.pose.rShoulder), mid(b.pose.lShoulder, b.pose.rShoulder)) > t.cameraJumpFrac
}

export type Coverage = { validMs: number; observedMs: number; dominantReason: UnavailableReason | null }

export function coverage(q: readonly Qualified[]): Coverage {
  let validMs = 0
  let observedMs = 0
  const byReason = new Map<UnavailableReason, number>()
  for (const x of q) {
    observedMs += x.durMs
    if (x.valid) validMs += x.durMs
    else if (x.reason) byReason.set(x.reason, (byReason.get(x.reason) ?? 0) + x.durMs)
  }
  let dominantReason: UnavailableReason | null = null
  let best = 0
  for (const [reason, ms] of byReason) if (ms > best) [best, dominantReason] = [ms, reason]
  return { validMs, observedMs, dominantReason }
}
```

`src/onboarding/client/vision/runs.ts`:
```ts
import type { Qualified } from './quality'

export type Run = { startMs: number; endMs: number }
/** true/false when the condition can be judged for this sample, null when it cannot. */
export type Test = (x: Qualified) => boolean | null

export const whenValid = (fn: (x: Qualified) => boolean | null): Test => (x) => (x.valid ? fn(x) : null)

/** Intervals where `test` stays true for at least minMs. Unknown samples and gaps break a run. */
export function sustainedRuns(q: readonly Qualified[], test: Test, minMs: number): Run[] {
  const runs: Run[] = []
  let cur: Run | null = null
  const close = () => {
    if (cur && cur.endMs - cur.startMs >= minMs) runs.push(cur)
    cur = null
  }
  for (const x of q) {
    if (cur && x.s.tMs > cur.endMs) close()
    if (test(x) === true) {
      if (!cur) cur = { startMs: x.s.tMs, endMs: x.s.tMs }
      cur.endMs = x.s.tMs + x.durMs
    } else close()
  }
  close()
  return runs
}

export function share(q: readonly Qualified[], test: Test): { onMs: number; knownMs: number } {
  let onMs = 0
  let knownMs = 0
  for (const x of q) {
    const r = test(x)
    if (r === null) continue
    knownMs += x.durMs
    if (r) onMs += x.durMs
  }
  return { onMs, knownMs }
}
```

Note on the gap rule: `endMs` of a run is the last true sample's `tMs + durMs`; a following sample later than that (a gap longer than `maxSampleGapMs`) closes the run. The final sample has `durMs` 0, so a run ending there ends at its `tMs` (3900 in the test).

`src/onboarding/client/vision/observation.ts`:
```ts
import { clamp } from './geometry'
import { coverage, type Qualified } from './quality'
import { share, type Run, type Test } from './runs'
import type { Thresholds } from './thresholds'
import type { Direction, EventKind, MetricKind, Observation, UnavailableReason } from './types'

export type Ctx = { recordingId: string; modelVersion: string }

export function eventObservation(ctx: Ctx, kind: EventKind, run: Run, direction: Direction | null = null): Observation {
  const ms = run.endMs - run.startMs
  return {
    id: `${kind}:${run.startMs}`, recordingId: ctx.recordingId, kind, startMs: run.startMs, endMs: run.endMs,
    value: ms, unit: 'ms', direction, quality: 1, validMs: ms, observedMs: ms,
    source: 'mediapipe', modelVersion: ctx.modelVersion, unavailableReason: null,
  }
}

export function metricObservation(
  ctx: Ctx, kind: MetricKind, window: Run, value: number | null, unit: 'ratio' | 'per_min',
  knownMs: number, observedMs: number, reason: UnavailableReason | null,
): Observation {
  return {
    id: `${kind}:${window.startMs}-${window.endMs}`, recordingId: ctx.recordingId, kind,
    startMs: window.startMs, endMs: window.endMs, value, unit, direction: null,
    quality: observedMs > 0 ? clamp(knownMs / observedMs, 0, 1) : 0,
    validMs: knownMs, observedMs, source: 'mediapipe', modelVersion: ctx.modelVersion,
    unavailableReason: value === null ? reason : null,
  }
}

export function windowOf(q: readonly Qualified[]): Run {
  const first = q[0]
  const last = q.at(-1)
  return { startMs: first?.s.tMs ?? 0, endMs: last ? last.s.tMs + last.durMs : 0 }
}

/** Ratio metric; unavailable until the condition has been judgeable for summaryMinValidMs. */
export function shareMetric(ctx: Ctx, kind: MetricKind, q: readonly Qualified[], test: Test, t: Thresholds, reasonIfShort: UnavailableReason): Observation {
  const { onMs, knownMs } = share(q, test)
  const enough = knownMs >= t.summaryMinValidMs
  return metricObservation(ctx, kind, windowOf(q), enough ? onMs / knownMs : null, 'ratio', knownMs, coverage(q).observedMs, reasonIfShort)
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/intake/vision-quality.test.ts`
Expected: all PASS. If the gap test's expected end differs, re-derive from the rule in the note above before changing code; the rule is the spec.

- [ ] **Step 5: Commit**

```bash
git add src/onboarding/client/vision/{quality,runs,observation}.ts tests/intake/vision-quality.test.ts
git commit -m "feat(vision): add quality gates and sustained-run helpers"
```

---

### Task 4: Head detectors

**Files:**
- Create: `src/onboarding/client/vision/features/head.ts`
- Test: `tests/intake/vision-head.test.ts`

**Interfaces:**
- Consumes: `Qualified`, `sustainedRuns`, `whenValid`, `eventObservation`, `shareMetric`, `gazeOnScreen`.
- Produces: `detectHead(q: Qualified[], t: Thresholds, ctx: Ctx): Observation[]` with kinds `head_turn_away`, `head_down`, `out_of_frame`, `gaze_on_screen_share`.

- [ ] **Step 1: Write the failing test**

`tests/intake/vision-head.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { detectHead } from '@/onboarding/client/vision/features/head'
import { qualify } from '@/onboarding/client/vision/quality'
import { THRESHOLDS as T } from '@/onboarding/client/vision/thresholds'
import { timeline, withFace } from './vision-fixtures'

const ctx = { recordingId: 'rec', modelVersion: 'test' }
const kinds = <T extends { kind: string }>(obs: T[], kind: string) => obs.filter((o) => o.kind === kind)

describe('detectHead', () => {
  it('reports a head turn above 25° held for 2 s, in either direction', () => {
    const obs = detectHead(qualify(timeline(0, 15000, 100, (s) =>
      s.tMs >= 3000 && s.tMs < 5500 ? withFace(s, { yawDeg: -30 }) : s), T), T, ctx)
    const turns = kinds(obs, 'head_turn_away')
    expect(turns).toHaveLength(1)
    expect(turns[0]).toMatchObject({ startMs: 3000, endMs: 5500, value: 2500, unit: 'ms' })
  })

  it('ignores 24° and turns shorter than 2 s', () => {
    const obs = detectHead(qualify(timeline(0, 15000, 100, (s) =>
      s.tMs < 6000 ? withFace(s, { yawDeg: 24 }) : s.tMs < 7900 ? withFace(s, { yawDeg: 40 }) : s), T), T, ctx)
    expect(kinds(obs, 'head_turn_away')).toHaveLength(0)
  })

  it('reports looking down', () => {
    const obs = detectHead(qualify(timeline(0, 15000, 100, (s) =>
      s.tMs >= 1000 && s.tMs < 4000 ? withFace(s, { pitchDeg: -25 }) : s), T), T, ctx)
    expect(kinds(obs, 'head_down')).toHaveLength(1)
  })

  it('reports leaving the frame for at least 1 s', () => {
    const obs = detectHead(qualify(timeline(0, 15000, 100, (s) =>
      s.tMs >= 2000 && s.tMs < 3500 ? { ...s, faces: 0, face: null } : s), T), T, ctx)
    expect(kinds(obs, 'out_of_frame')[0]).toMatchObject({ startMs: 2000, endMs: 3500 })
  })

  it('computes gaze share only with enough valid time', () => {
    const long = detectHead(qualify(timeline(0, 20000, 100, (s) =>
      s.tMs < 5000 ? withFace(s, { yawDeg: 40 }) : s), T), T, ctx)
    expect(kinds(long, 'gaze_on_screen_share')[0]!.value).toBeCloseTo(14900 / 19900, 3)

    const short = detectHead(qualify(timeline(0, 5000, 100), T), T, ctx)
    expect(kinds(short, 'gaze_on_screen_share')[0]).toMatchObject({ value: null, unavailableReason: 'not_enough_valid_time' })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/intake/vision-head.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

`src/onboarding/client/vision/features/head.ts`:
```ts
import { gazeOnScreen } from '../geometry'
import { eventObservation, shareMetric, type Ctx } from '../observation'
import type { Qualified } from '../quality'
import { sustainedRuns, whenValid, type Test } from '../runs'
import type { Thresholds } from '../thresholds'
import type { Observation } from '../types'

export function detectHead(q: readonly Qualified[], t: Thresholds, ctx: Ctx): Observation[] {
  const turnedAway = whenValid((x) => (x.s.face ? Math.abs(x.s.face.yawDeg) > t.headTurnYawDeg : null))
  const lookingDown = whenValid((x) => (x.s.face ? x.s.face.pitchDeg < t.headDownPitchDeg : null))
  const outOfFrame: Test = (x) => (x.reason === 'no_face' ? true : x.valid ? false : null)
  const onScreen = whenValid((x) => (x.s.face ? gazeOnScreen(x.s.face, t) : null))
  return [
    ...sustainedRuns(q, turnedAway, t.headTurnMinMs).map((r) => eventObservation(ctx, 'head_turn_away', r)),
    ...sustainedRuns(q, lookingDown, t.headDownMinMs).map((r) => eventObservation(ctx, 'head_down', r)),
    ...sustainedRuns(q, outOfFrame, t.outOfFrameMinMs).map((r) => eventObservation(ctx, 'out_of_frame', r)),
    shareMetric(ctx, 'gaze_on_screen_share', q, onScreen, t, 'not_enough_valid_time'),
  ]
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/intake/vision-head.test.ts`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/onboarding/client/vision/features/head.ts tests/intake/vision-head.test.ts
git commit -m "feat(vision): detect head turns, looking down and leaving frame"
```

---

### Task 5: Body detectors

**Files:**
- Create: `src/onboarding/client/vision/features/body.ts`
- Test: `tests/intake/vision-body.test.ts`

**Interfaces:**
- Produces: `bodyGeom(s, t): BodyGeom | null`, `bodyReferences(q, t): Map<number, BodyGeom>`, `detectBody(q, t, ctx): Observation[]` with kinds `posture_shift`, `lean_change` (direction `closer`/`farther`), `shoulder_raise`.

- [ ] **Step 1: Write the failing test**

`tests/intake/vision-body.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { bodyReferences, detectBody } from '@/onboarding/client/vision/features/body'
import { qualify } from '@/onboarding/client/vision/quality'
import { THRESHOLDS as T } from '@/onboarding/client/vision/thresholds'
import type { LandmarkSample } from '@/onboarding/client/vision/types'
import { pt, shifted, timeline, withPose } from './vision-fixtures'

const ctx = { recordingId: 'rec', modelVersion: 'test' }
const during = (from: number, to: number, f: (s: LandmarkSample) => LandmarkSample) => (s: LandmarkSample) =>
  s.tMs >= from && s.tMs < to ? f(s) : s

/** Scale shoulders around their centre (0.5, 0.36). Base width is 0.24. */
const scaleShoulders = (k: number) => (s: LandmarkSample) =>
  withPose(s, { lShoulder: pt(0.5 + 0.12 * k, 0.36), rShoulder: pt(0.5 - 0.12 * k, 0.36) })

describe('detectBody', () => {
  it('builds a reference from the first 5 s of each segment', () => {
    const refs = bodyReferences(qualify(timeline(0, 10000, 100), T), T)
    expect(refs.get(0)!.width).toBeCloseTo(0.24, 5)
    expect(refs.get(0)!.neckD).toBeCloseTo(0.75, 5)
  })

  it('reports a posture shift over 0.25 shoulder widths held 2 s', () => {
    const obs = detectBody(qualify(timeline(0, 15000, 100, during(7000, 9500, (s) => shifted(s, 0.07, 0))), T), T, ctx)
    expect(obs.filter((o) => o.kind === 'posture_shift')).toHaveLength(1)
  })

  it('ignores a 0.2-width shift', () => {
    const obs = detectBody(qualify(timeline(0, 15000, 100, during(7000, 10000, (s) => shifted(s, 0.048, 0))), T), T, ctx)
    expect(obs.filter((o) => o.kind === 'posture_shift')).toHaveLength(0)
  })

  it('reports leaning closer and farther with direction', () => {
    const obs = detectBody(qualify(timeline(0, 20000, 100, (s) =>
      s.tMs >= 7000 && s.tMs < 10000 ? scaleShoulders(1.2)(s) : s.tMs >= 12000 && s.tMs < 15000 ? scaleShoulders(0.8)(s) : s), T), T, ctx)
    const lean = obs.filter((o) => o.kind === 'lean_change')
    expect(lean.map((o) => o.direction)).toEqual(['closer', 'farther'])
  })

  it('reports raised shoulders', () => {
    const raise = (s: LandmarkSample) => withPose(s, { lShoulder: pt(0.62, 0.31), rShoulder: pt(0.38, 0.31) })
    const obs = detectBody(qualify(timeline(0, 15000, 100, during(7000, 9000, raise)), T), T, ctx)
    expect(obs.filter((o) => o.kind === 'shoulder_raise')).toHaveLength(1)
  })

  it('says nothing when shoulders are not visible', () => {
    const hidden = (s: LandmarkSample) => withPose(s, { lShoulder: pt(0.62, 0.36, 0.3), rShoulder: pt(0.38, 0.36, 0.3) })
    expect(detectBody(qualify(timeline(0, 15000, 100, hidden), T), T, ctx)).toEqual([])
  })

  it('rebuilds the reference after a camera move instead of reporting a shift', () => {
    const obs = detectBody(qualify(timeline(0, 20000, 100, during(8000, 20000, (s) => shifted(s, 0.32, 0))), T), T, ctx)
    expect(obs.filter((o) => o.kind === 'posture_shift')).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/intake/vision-body.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

`src/onboarding/client/vision/features/body.ts`:
```ts
import { dist, mid, type Vec } from '../geometry'
import { eventObservation, type Ctx } from '../observation'
import type { Qualified } from '../quality'
import { sustainedRuns, whenValid, type Test } from '../runs'
import { avg } from '../stats'
import type { Thresholds } from '../thresholds'
import type { LandmarkSample, Observation } from '../types'

/** neckD: vertical nose-to-shoulder-line distance in shoulder widths (scale-invariant). */
export type BodyGeom = { center: Vec; width: number; neckD: number }

export function bodyGeom(s: LandmarkSample, t: Thresholds): BodyGeom | null {
  const p = s.pose
  if (!p || p.lShoulder.v < t.minConfidence || p.rShoulder.v < t.minConfidence) return null
  const width = dist(p.lShoulder, p.rShoulder)
  if (width < t.minShoulderWidth) return null
  const center = mid(p.lShoulder, p.rShoulder)
  return { center, width, neckD: (center.y - p.nose.y) / width }
}

/** The user's own reference per framing segment: mean geometry over its first referenceMs. */
export function bodyReferences(q: readonly Qualified[], t: Thresholds): Map<number, BodyGeom> {
  const acc = new Map<number, { firstMs: number; items: BodyGeom[] }>()
  for (const x of q) {
    if (!x.valid) continue
    const g = bodyGeom(x.s, t)
    if (!g) continue
    let a = acc.get(x.segment)
    if (!a) acc.set(x.segment, (a = { firstMs: x.s.tMs, items: [] }))
    if (x.s.tMs - a.firstMs < t.referenceMs) a.items.push(g)
  }
  const refs = new Map<number, BodyGeom>()
  for (const [segment, { items }] of acc) {
    if (items.length < t.referenceMinSamples) continue
    refs.set(segment, {
      center: { x: avg(items.map((g) => g.center.x)), y: avg(items.map((g) => g.center.y)) },
      width: avg(items.map((g) => g.width)),
      neckD: avg(items.map((g) => g.neckD)),
    })
  }
  return refs
}

export function detectBody(q: readonly Qualified[], t: Thresholds, ctx: Ctx): Observation[] {
  const refs = bodyReferences(q, t)
  const vsRef = (fn: (g: BodyGeom, ref: BodyGeom) => boolean): Test =>
    whenValid((x) => {
      const ref = refs.get(x.segment)
      const g = bodyGeom(x.s, t)
      return ref && g ? fn(g, ref) : null
    })
  return [
    ...sustainedRuns(q, vsRef((g, r) => dist(g.center, r.center) / r.width > t.postureShiftWidths), t.postureShiftMinMs)
      .map((run) => eventObservation(ctx, 'posture_shift', run)),
    ...sustainedRuns(q, vsRef((g, r) => g.width / r.width - 1 >= t.leanScaleChange), t.leanMinMs)
      .map((run) => eventObservation(ctx, 'lean_change', run, 'closer')),
    ...sustainedRuns(q, vsRef((g, r) => 1 - g.width / r.width >= t.leanScaleChange), t.leanMinMs)
      .map((run) => eventObservation(ctx, 'lean_change', run, 'farther')),
    ...sustainedRuns(q, vsRef((g, r) => r.neckD - g.neckD > t.shoulderRaiseWidths), t.shoulderRaiseMinMs)
      .map((run) => eventObservation(ctx, 'shoulder_raise', run)),
  ].sort((a, b) => a.startMs - b.startMs)
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/intake/vision-body.test.ts`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/onboarding/client/vision/features/body.ts tests/intake/vision-body.test.ts
git commit -m "feat(vision): detect posture shifts, leaning and raised shoulders"
```

---

### Task 6: Hand detectors

**Files:**
- Create: `src/onboarding/client/vision/features/hands.ts`
- Test: `tests/intake/vision-hands.test.ts`

**Interfaces:**
- Produces: `handPoints(s, t): Vec[] | null`, `detectHands(q, t, ctx, handsEnabled: boolean): Observation[]` with kinds `hand_to_face`, `hands_visible_share`, `gesture_activity`, `open_palm_share`.

- [ ] **Step 1: Write the failing test**

`tests/intake/vision-hands.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { detectHands } from '@/onboarding/client/vision/features/hands'
import { qualify } from '@/onboarding/client/vision/quality'
import { THRESHOLDS as T } from '@/onboarding/client/vision/thresholds'
import type { LandmarkSample } from '@/onboarding/client/vision/types'
import { pt, timeline, withHands, withPose } from './vision-fixtures'

const ctx = { recordingId: 'rec', modelVersion: 'test' }
const of = <T extends { kind: string }>(obs: T[], kind: string) => obs.filter((o) => o.kind === kind)
const hand = (x: number, y: number, openPalm = false) => ({ center: { x, y }, openPalm })

describe('detectHands', () => {
  it('reports a hand near the face for at least 0.7 s', () => {
    const obs = detectHands(qualify(timeline(0, 15000, 100, (s) =>
      s.tMs >= 4000 && s.tMs < 5000 ? withHands(s, [hand(0.5, 0.2)]) : s), T), T, ctx, true)
    expect(of(obs, 'hand_to_face')[0]).toMatchObject({ startMs: 4000, endMs: 5000 })
  })

  it('falls back to visible pose wrists when hand tracking is off', () => {
    const atChin = (s: LandmarkSample) => withPose(withHands(s, null), { rWrist: pt(0.48, 0.27, 0.9) })
    const obs = detectHands(qualify(timeline(0, 15000, 100, (s) =>
      s.tMs >= 4000 && s.tMs < 5000 ? atChin(s) : withHands(s, null)), T), T, ctx, false)
    expect(of(obs, 'hand_to_face')).toHaveLength(1)
    expect(of(obs, 'open_palm_share')[0]).toMatchObject({ value: null, unavailableReason: 'hands_disabled' })
  })

  it('treats hidden wrists as unknown for hand-to-face, not as a hand away from the face', () => {
    const obs = detectHands(qualify(timeline(0, 15000, 100, (s) => withHands(s, null)), T), T, ctx, false)
    expect(of(obs, 'hand_to_face')).toHaveLength(0)
    expect(of(obs, 'hands_visible_share')[0]!.value).toBe(0)
  })

  it('computes hands-visible and open-palm shares', () => {
    const obs = detectHands(qualify(timeline(0, 20000, 100, (s) =>
      s.tMs < 9000 ? withHands(s, [hand(0.3, 0.45, s.tMs < 5000)]) : s), T), T, ctx, true)
    expect(of(obs, 'hands_visible_share')[0]!.value).toBeCloseTo(9000 / 19900, 3)
    // only 9 s of visible hands: below the 10 s minimum, so the palm share is withheld
    expect(of(obs, 'open_palm_share')).toMatchObject([{ value: null, unavailableReason: 'limbs_not_visible' }])
  })

  it('counts gesture bursts per visible minute', () => {
    // hand visible 30 s; it sweeps 0.5 frame widths in 1 s every 5 s (and snaps back) → 6 bursts → ~12 per minute
    const obs = detectHands(qualify(timeline(0, 30000, 100, (s) => {
      const phase = s.tMs % 5000
      const x = 0.3 + (phase < 1000 ? (phase / 1000) * 0.5 : 0.5)
      return withHands(s, [hand(x, 0.45)])
    }), T), T, ctx, true)
    expect(of(obs, 'gesture_activity')[0]!.value).toBeCloseTo(12, 0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/intake/vision-hands.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

`src/onboarding/client/vision/features/hands.ts`:
```ts
import { dist, inBox, type Vec } from '../geometry'
import { eventObservation, metricObservation, shareMetric, windowOf, type Ctx } from '../observation'
import { coverage, type Qualified } from '../quality'
import { sustainedRuns, whenValid, type Run } from '../runs'
import type { Thresholds } from '../thresholds'
import type { LandmarkSample, Observation } from '../types'

/** Visible hand positions; [] when none are visible; null when neither hands nor pose ran. */
export function handPoints(s: LandmarkSample, t: Thresholds): Vec[] | null {
  if (s.hands) return s.hands.map((h) => h.center)
  if (!s.pose) return null
  return [s.pose.lWrist, s.pose.rWrist].filter((p) => p.v >= t.minConfidence)
}

export function detectHands(q: readonly Qualified[], t: Thresholds, ctx: Ctx, handsEnabled: boolean): Observation[] {
  const nearFace = whenValid((x) => {
    const pts = handPoints(x.s, t)
    const face = x.s.face
    if (!face || !pts) return null
    if (pts.length === 0) return x.s.hands ? false : null
    return pts.some((p) => inBox(p, face.box, t.handToFaceBoxExpand))
  })
  const visible = whenValid((x) => {
    const pts = handPoints(x.s, t)
    return pts ? pts.length > 0 : null
  })
  const openPalm = whenValid((x) => (x.s.hands && x.s.hands.length > 0 ? x.s.hands.some((h) => h.openPalm) : null))

  const palm = handsEnabled
    ? shareMetric(ctx, 'open_palm_share', q, openPalm, t, 'limbs_not_visible')
    : metricObservation(ctx, 'open_palm_share', windowOf(q), null, 'ratio', 0, coverage(q).observedMs, 'hands_disabled')

  return [
    ...sustainedRuns(q, nearFace, t.handToFaceMinMs).map((r) => eventObservation(ctx, 'hand_to_face', r)),
    shareMetric(ctx, 'hands_visible_share', q, visible, t, 'limbs_not_visible'),
    gestureActivity(q, t, ctx),
    palm,
  ]
}

/** Bursts of fast hand movement per minute of hands-visible time. */
function gestureActivity(q: readonly Qualified[], t: Thresholds, ctx: Ctx): Observation {
  let visibleMs = 0
  const bursts: Run[] = []
  let cur: Run | null = null
  q.forEach((b, i) => {
    const pb = b.valid ? handPoints(b.s, t) : null
    if (!pb || pb.length === 0) return
    visibleMs += b.durMs
    const a = q[i - 1]
    const pa = a?.valid ? handPoints(a.s, t) : null
    if (!a || !pa || pa.length !== pb.length) return
    const dt = (b.s.tMs - a.s.tMs) / 1000
    if (dt <= 0 || dt * 1000 > t.maxSampleGapMs) return
    const speed = Math.max(...pb.map((p) => Math.min(...pa.map((o) => dist(p, o))))) / dt
    if (speed <= t.gestureSpeed) return
    if (cur && a.s.tMs - cur.endMs <= t.gestureGapMs) cur.endMs = b.s.tMs
    else {
      if (cur) bursts.push(cur)
      cur = { startMs: a.s.tMs, endMs: b.s.tMs }
    }
  })
  if (cur) bursts.push(cur)
  const count = bursts.filter((r) => r.endMs - r.startMs >= t.gestureMinMs).length
  const enough = visibleMs >= t.summaryMinValidMs
  return metricObservation(ctx, 'gesture_activity', windowOf(q), enough ? count / (visibleMs / 60000) : null,
    'per_min', visibleMs, coverage(q).observedMs, 'limbs_not_visible')
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/intake/vision-hands.test.ts`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/onboarding/client/vision/features/hands.ts tests/intake/vision-hands.test.ts
git commit -m "feat(vision): detect hand-to-face, gestures and open palms"
```

---

### Task 7: Face detectors and detectAll

**Files:**
- Create: `src/onboarding/client/vision/features/face.ts`, `src/onboarding/client/vision/detect.ts`
- Test: `tests/intake/vision-face.test.ts`

**Interfaces:**
- Produces: `detectFace(q, t, ctx): Observation[]` (kinds `brow_raise`, `lip_press`, `smile_share`, `blink_rate`); `type DetectOptions = { recordingId: string; modelVersion: string; handsEnabled: boolean; thresholds?: Thresholds }`; `detectAll(samples, o): { qualified: Qualified[]; observations: Observation[] }` sorted by `startMs`.

- [ ] **Step 1: Write the failing test**

`tests/intake/vision-face.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { detectAll } from '@/onboarding/client/vision/detect'
import { detectFace } from '@/onboarding/client/vision/features/face'
import { qualify } from '@/onboarding/client/vision/quality'
import { THRESHOLDS as T } from '@/onboarding/client/vision/thresholds'
import { EVENT_KINDS, METRIC_KINDS } from '@/onboarding/client/vision/types'
import { timeline, withBlend, withFace } from './vision-fixtures'

const ctx = { recordingId: 'rec', modelVersion: 'test' }
const of = <T extends { kind: string }>(obs: T[], kind: string) => obs.filter((o) => o.kind === kind)

describe('detectFace', () => {
  it('reports brow raises ≥0.5 s and lip presses ≥1 s', () => {
    const obs = detectFace(qualify(timeline(0, 15000, 100, (s) =>
      s.tMs >= 2000 && s.tMs < 2600 ? withBlend(s, { browUp: 0.8 })
      : s.tMs >= 5000 && s.tMs < 5800 ? withBlend(s, { press: 0.9 })
      : s.tMs >= 8000 && s.tMs < 9200 ? withBlend(s, { press: 0.9 })
      : s), T), T, ctx)
    expect(of(obs, 'brow_raise')).toHaveLength(1)
    expect(of(obs, 'lip_press')).toMatchObject([{ startMs: 8000 }])
  })

  it('computes smile share', () => {
    const obs = detectFace(qualify(timeline(0, 20000, 100, (s) => s.tMs < 4000 ? withBlend(s, { smile: 0.7 }) : s), T), T, ctx)
    expect(of(obs, 'smile_share')[0]!.value).toBeCloseTo(4000 / 19900, 3)
  })

  it('counts blinks per minute at 10 fps', () => {
    // a 200 ms blink every 4 s over 60 s → 15 blinks/min
    const obs = detectFace(qualify(timeline(0, 60000, 100, (s) =>
      s.tMs % 4000 < 200 ? withBlend(s, { blinkL: 0.9, blinkR: 0.9 }) : s), T), T, ctx)
    expect(of(obs, 'blink_rate')[0]!.value).toBeCloseTo(15, 0)
  })

  it('refuses blink rate at 5 fps', () => {
    const obs = detectFace(qualify(timeline(0, 60000, 200), T), T, ctx)
    expect(of(obs, 'blink_rate')[0]).toMatchObject({ value: null, unavailableReason: 'frame_rate_too_low' })
  })
})

describe('detectAll', () => {
  it('returns one observation per metric kind and sorted events', () => {
    const { observations } = detectAll(timeline(0, 20000, 100, (s) =>
      s.tMs >= 3000 && s.tMs < 6000 ? withFace(s, { yawDeg: 35 }) : s), { recordingId: 'rec', modelVersion: 'v', handsEnabled: true })
    for (const kind of METRIC_KINDS) expect(of(observations, kind)).toHaveLength(1)
    expect(observations.every((o) => (EVENT_KINDS as readonly string[]).includes(o.kind) || o.unit !== 'ms')).toBe(true)
    expect(observations.map((o) => o.startMs)).toEqual([...observations.map((o) => o.startMs)].sort((a, b) => a - b))
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/intake/vision-face.test.ts`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement**

`src/onboarding/client/vision/features/face.ts`:
```ts
import { eventObservation, metricObservation, shareMetric, windowOf, type Ctx } from '../observation'
import { coverage, type Qualified } from '../quality'
import { sustainedRuns, whenValid } from '../runs'
import { median } from '../stats'
import type { Thresholds } from '../thresholds'
import type { Blend, Observation } from '../types'

export function detectFace(q: readonly Qualified[], t: Thresholds, ctx: Ctx): Observation[] {
  const blend = (fn: (b: Blend) => boolean) => whenValid((x) => (x.s.face ? fn(x.s.face.blend) : null))
  return [
    ...sustainedRuns(q, blend((b) => b.browUp > t.browRaiseThreshold), t.browRaiseMinMs).map((r) => eventObservation(ctx, 'brow_raise', r)),
    ...sustainedRuns(q, blend((b) => b.press > t.lipPressThreshold), t.lipPressMinMs).map((r) => eventObservation(ctx, 'lip_press', r)),
    shareMetric(ctx, 'smile_share', q, blend((b) => b.smile > t.smileThreshold), t, 'not_enough_valid_time'),
    blinkRate(q, t, ctx),
  ]
}

/** Blinks are ~100–300 ms, so they are only countable at ≥ ~8 fps. */
function blinkRate(q: readonly Qualified[], t: Thresholds, ctx: Ctx): Observation {
  const faceQ = q.filter((x) => x.valid && x.s.face)
  const faceMs = faceQ.reduce((sum, x) => sum + x.durMs, 0)
  const observedMs = coverage(q).observedMs
  const metric = (value: number | null, reason: 'not_enough_valid_time' | 'frame_rate_too_low' | null) =>
    metricObservation(ctx, 'blink_rate', windowOf(q), value, 'per_min', faceMs, observedMs, reason)
  if (faceMs < t.summaryMinValidMs) return metric(null, 'not_enough_valid_time')
  const interval = median(faceQ.slice(1).map((x, i) => x.s.tMs - faceQ[i]!.s.tMs))
  if (interval > t.blinkMaxIntervalMs) return metric(null, 'frame_rate_too_low')
  let blinks = 0
  let closed = false
  for (const x of faceQ) {
    const b = x.s.face!.blend
    const nowClosed = Math.min(b.blinkL, b.blinkR) > t.blinkThreshold
    if (nowClosed && !closed) blinks++
    closed = nowClosed
  }
  return metric(blinks / (faceMs / 60000), null)
}
```

`src/onboarding/client/vision/detect.ts`:
```ts
import { detectBody } from './features/body'
import { detectFace } from './features/face'
import { detectHands } from './features/hands'
import { detectHead } from './features/head'
import { qualify, type Qualified } from './quality'
import { THRESHOLDS, type Thresholds } from './thresholds'
import type { LandmarkSample, Observation } from './types'

export type DetectOptions = { recordingId: string; modelVersion: string; handsEnabled: boolean; thresholds?: Thresholds }

/** Samples must be sorted by tMs. */
export function detectAll(samples: readonly LandmarkSample[], o: DetectOptions): { qualified: Qualified[]; observations: Observation[] } {
  const t = o.thresholds ?? THRESHOLDS
  const ctx = { recordingId: o.recordingId, modelVersion: o.modelVersion }
  const qualified = qualify(samples, t)
  const observations = [
    ...detectHead(qualified, t, ctx),
    ...detectBody(qualified, t, ctx),
    ...detectHands(qualified, t, ctx, o.handsEnabled),
    ...detectFace(qualified, t, ctx),
  ].sort((a, b) => a.startMs - b.startMs)
  return { qualified, observations }
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/intake/vision-face.test.ts`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/onboarding/client/vision/features/face.ts src/onboarding/client/vision/detect.ts tests/intake/vision-face.test.ts
git commit -m "feat(vision): detect facial movements and combine detectors"
```

---

### Task 8: Summary and speech alignment

**Files:**
- Create: `src/onboarding/client/vision/{summary,align}.ts`
- Test: `tests/intake/vision-summary.test.ts`

**Interfaces:**
- Produces: `summarize(q: Qualified[], observations: Observation[], t: Thresholds, maxEvents = 5): VisualSummary`; `alignMoments(observations, turns: SpeechTurn[], keyTurnIds: string[] = [], max = 3): Moment[]` (key turns first, then by event count, then by time).

- [ ] **Step 1: Write the failing test**

`tests/intake/vision-summary.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { alignMoments } from '@/onboarding/client/vision/align'
import { detectAll } from '@/onboarding/client/vision/detect'
import { summarize } from '@/onboarding/client/vision/summary'
import { THRESHOLDS as T } from '@/onboarding/client/vision/thresholds'
import type { LandmarkSample } from '@/onboarding/client/vision/types'
import { timeline, withFace } from './vision-fixtures'

const opts = { recordingId: 'rec', modelVersion: 'v', handsEnabled: true }
const run = (samples: LandmarkSample[]) => {
  const { qualified, observations } = detectAll(samples, opts)
  return summarize(qualified, observations, T)
}
const turnAt = (from: number, to: number) => (s: LandmarkSample) => (s.tMs >= from && s.tMs < to ? withFace(s, { yawDeg: 40 }) : s)

describe('summarize', () => {
  it('is ready with ≥10 s valid and ≥70% coverage', () => {
    const s = run(timeline(0, 20000, 100, turnAt(5000, 8000)))
    expect(s.status).toBe('ready')
    expect(s.events.map((e) => e.kind)).toEqual(['head_turn_away'])
    expect(s.metrics.length).toBeGreaterThan(0)
  })

  it('is partial when coverage is below 70% but a clear event exists', () => {
    const s = run(timeline(0, 30000, 100, (x) => (x.tMs >= 10000 ? { ...x, luma: 5 } : turnAt(2000, 5000)(x))))
    expect(s.status).toBe('partial')
    expect(s.unavailableReason).toBe('too_dark')
    expect(s.events).toHaveLength(1)
    expect(s.metrics).toEqual([])
  })

  it('is unavailable at 9 s of valid time with no events', () => {
    const s = run(timeline(0, 9100, 100))
    expect(s).toMatchObject({ status: 'unavailable', unavailableReason: 'not_enough_valid_time', events: [] })
  })
})

describe('alignMoments', () => {
  const { observations } = detectAll(timeline(0, 30000, 100, (s) => turnAt(4000, 7000)(turnAt(20000, 23000)(s))), opts)
  const turns = [
    { turnId: 'a', t0Ms: 3000, t1Ms: 8000 },
    { turnId: 'b', t0Ms: 10000, t1Ms: 15000 },
    { turnId: 'ask', t0Ms: 19000, t1Ms: 24000 },
  ]

  it('keeps turns with overlapping events, key turns first', () => {
    const m = alignMoments(observations, turns, ['ask'])
    expect(m.map((x) => x.turnId)).toEqual(['ask', 'a'])
    expect(m[0]!.isKey).toBe(true)
    expect(m[0]!.observations.map((o) => o.kind)).toEqual(['head_turn_away'])
  })

  it('never returns more than max moments and ignores metrics', () => {
    expect(alignMoments(observations, turns, [], 1)).toHaveLength(1)
    expect(alignMoments(observations, turns).flatMap((m) => m.observations).every((o) => o.unit === 'ms')).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/intake/vision-summary.test.ts`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement**

`src/onboarding/client/vision/summary.ts`:
```ts
import { coverage, type Qualified } from './quality'
import type { Thresholds } from './thresholds'
import type { Observation, VisualSummary } from './types'

export function summarize(q: readonly Qualified[], observations: readonly Observation[], t: Thresholds, maxEvents = 5): VisualSummary {
  const cov = coverage(q)
  const ratio = cov.observedMs > 0 ? cov.validMs / cov.observedMs : 0
  const events = observations
    .filter((o) => o.unit === 'ms')
    .sort((a, b) => (b.value ?? 0) - (a.value ?? 0))
    .slice(0, maxEvents)
    .sort((a, b) => a.startMs - b.startMs)
  const base = { validMs: cov.validMs, observedMs: cov.observedMs, coverage: ratio }

  if (cov.validMs >= t.summaryMinValidMs && ratio >= t.summaryMinCoverage) {
    return { ...base, status: 'ready', unavailableReason: null, events, metrics: observations.filter((o) => o.unit !== 'ms') }
  }
  const unavailableReason = cov.dominantReason ?? 'not_enough_valid_time'
  if (events.length > 0) return { ...base, status: 'partial', unavailableReason, events, metrics: [] }
  return { ...base, status: 'unavailable', unavailableReason, events: [], metrics: [] }
}
```

`src/onboarding/client/vision/align.ts`:
```ts
import type { Moment, Observation, SpeechTurn } from './types'

/** Visual events that overlap what the user was saying. Key turns (e.g. the ask) come first. */
export function alignMoments(observations: readonly Observation[], turns: readonly SpeechTurn[], keyTurnIds: readonly string[] = [], max = 3): Moment[] {
  const events = observations.filter((o) => o.unit === 'ms')
  const key = new Set(keyTurnIds)
  return turns
    .map((turn) => ({
      ...turn,
      isKey: key.has(turn.turnId),
      observations: events.filter((o) => o.startMs < turn.t1Ms && o.endMs > turn.t0Ms),
    }))
    .filter((m) => m.observations.length > 0)
    .sort((a, b) => Number(b.isKey) - Number(a.isKey) || b.observations.length - a.observations.length || a.t0Ms - b.t0Ms)
    .slice(0, max)
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/intake/vision-summary.test.ts`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/onboarding/client/vision/{summary,align}.ts tests/intake/vision-summary.test.ts
git commit -m "feat(vision): gate the visual summary and align events with speech"
```

---

### Task 9: Copy and the VisualReport component

**Files:**
- Create: `src/onboarding/client/vision/copy.ts`, `src/onboarding/ui/VisualReport.tsx`
- Test: `tests/intake/vision-report.test.tsx`

**Interfaces:**
- Produces: `fmtTime(ms)`, `fmtDur(ms)`, `describe(o: Observation): string`, `describeMoment(m: Moment): string`, `REASON_TEXT: Record<UnavailableReason, string>`, `BANNED_TERMS: RegExp[]`; React `VisualReport({ summary, moments? })`.

- [ ] **Step 1: Write the failing test**

`tests/intake/vision-report.test.tsx`:
```tsx
import { renderToStaticMarkup } from 'react-dom/server'
import { describe as suite, expect, it } from 'vitest'
import { BANNED_TERMS, REASON_TEXT, describe, describeMoment, fmtTime } from '@/onboarding/client/vision/copy'
import { metricObservation, eventObservation } from '@/onboarding/client/vision/observation'
import { EVENT_KINDS, METRIC_KINDS, UNAVAILABLE_REASONS, type VisualSummary } from '@/onboarding/client/vision/types'
import { VisualReport } from '@/onboarding/ui/VisualReport'

const ctx = { recordingId: 'rec', modelVersion: 'v' }
const ev = (kind: (typeof EVENT_KINDS)[number], startMs = 42000, ms = 3000) => eventObservation(ctx, kind, { startMs, endMs: startMs + ms })
const metric = (kind: (typeof METRIC_KINDS)[number], value: number | null) =>
  metricObservation(ctx, kind, { startMs: 0, endMs: 60000 }, value, kind === 'gesture_activity' || kind === 'blink_rate' ? 'per_min' : 'ratio', 50000, 60000, value === null ? 'limbs_not_visible' : null)

const allStrings = () => [
  ...EVENT_KINDS.map((k) => describe(ev(k))),
  describe({ ...ev('lean_change'), direction: 'farther' }),
  ...METRIC_KINDS.flatMap((k) => [describe(metric(k, 0.42)), describe(metric(k, null))]),
  ...UNAVAILABLE_REASONS.map((r) => REASON_TEXT[r]),
]

suite('copy', () => {
  it('formats times and events as facts', () => {
    expect(fmtTime(62000)).toBe('1:02')
    expect(describe(ev('head_turn_away'))).toBe('Head turned away for ~3 s at 0:42')
    expect(describe({ ...ev('lean_change'), direction: 'closer' })).toBe('Moved closer to the camera for ~3 s at 0:42')
    expect(describe(metric('gaze_on_screen_share', 0.78))).toBe('Gaze toward the screen about 78% of visible time (approximate)')
    expect(describe(metric('gesture_activity', null))).toBe('Hand gestures: not available (shoulders or hands were not in view)')
    expect(describeMoment({ turnId: 't', t0Ms: 41000, t1Ms: 47000, isKey: true, observations: [ev('head_down', 42000, 2000), ev('hand_to_face', 43000, 1000)] }))
      .toBe('0:41–0:47 (key moment): looked down ~2 s; hand near face ~1 s')
  })

  it('never uses interpretive or diagnostic language', () => {
    for (const text of allStrings()) for (const term of BANNED_TERMS) expect(text).not.toMatch(term)
  })
})

suite('VisualReport', () => {
  const ready: VisualSummary = {
    status: 'ready', validMs: 42000, observedMs: 50000, coverage: 0.84, unavailableReason: null,
    events: [ev('head_turn_away')], metrics: [metric('smile_share', 0.2)],
  }

  it('renders coverage, events and metrics when ready', () => {
    const html = renderToStaticMarkup(<VisualReport summary={ready} />)
    expect(html).toContain('42 s')
    expect(html).toContain('84%')
    expect(html).toContain('Head turned away for ~3 s at 0:42')
    expect(html).toContain('Smiling about 20% of visible time')
    for (const term of BANNED_TERMS) expect(html).not.toMatch(term)
  })

  it('explains partial and unavailable states', () => {
    expect(renderToStaticMarkup(<VisualReport summary={{ ...ready, status: 'partial', unavailableReason: 'too_dark', metrics: [] }} />))
      .toContain('Showing individual moments only')
    expect(renderToStaticMarkup(<VisualReport summary={{ ...ready, status: 'unavailable', unavailableReason: 'camera_off', events: [], metrics: [] }} />))
      .toContain('Visual feedback unavailable: Camera was off.')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/intake/vision-report.test.tsx`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement**

`src/onboarding/client/vision/copy.ts`:
```ts
import { isEventKind, type EventKind, type MetricKind, type Moment, type Observation, type UnavailableReason } from './types'

/** Report language must describe movements, never what they supposedly mean. */
export const BANNED_TERMS = [
  /nervous/i, /confiden/i, /anxious/i, /\blying\b/i, /\bhonest/i, /diagnos/i,
  /bad posture|posture is bad/i, /eye contact/i, /insecure/i, /fidget/i,
]

export const REASON_TEXT: Record<UnavailableReason, string> = {
  no_face: 'Your face was not in view',
  multiple_people: 'More than one person was in view',
  too_dark: 'The room was too dark for the camera',
  camera_moved: 'The camera moved',
  limbs_not_visible: 'Shoulders or hands were not in view',
  hands_disabled: 'Hand tracking is off',
  not_enough_valid_time: 'Not enough clear camera time',
  frame_rate_too_low: 'The camera frame rate was too low',
  device_too_slow: 'This device could not keep up, so visual analysis was turned off',
  camera_off: 'Camera was off',
  model_failed: 'Visual analysis could not start',
}

const METRIC_LABEL: Record<MetricKind, string> = {
  gaze_on_screen_share: 'Gaze toward the screen',
  gesture_activity: 'Hand gestures',
  hands_visible_share: 'Hands in view',
  open_palm_share: 'Open palms',
  smile_share: 'Smiling',
  blink_rate: 'Blink rate',
}

export const fmtTime = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}
export const fmtDur = (ms: number) => `~${Math.max(1, Math.round(ms / 1000))} s`
const pct = (v: number) => `${Math.round(v * 100)}%`

function eventPhrase(o: Observation & { kind: EventKind }): string {
  switch (o.kind) {
    case 'head_turn_away': return 'head turned away'
    case 'head_down': return 'looked down'
    case 'out_of_frame': return 'out of frame'
    case 'posture_shift': return 'shifted position'
    case 'lean_change': return o.direction === 'farther' ? 'moved back from the camera' : 'moved closer to the camera'
    case 'shoulder_raise': return 'shoulders raised'
    case 'hand_to_face': return 'hand near face'
    case 'brow_raise': return 'raised eyebrows'
    case 'lip_press': return 'pressed lips'
  }
}

function metricText(kind: MetricKind, v: number): string {
  switch (kind) {
    case 'gaze_on_screen_share': return `Gaze toward the screen about ${pct(v)} of visible time (approximate)`
    case 'gesture_activity': return `About ${Math.round(v)} hand gestures per minute while hands were visible`
    case 'hands_visible_share': return `Hands in view ${pct(v)} of the time`
    case 'open_palm_share': return `Open palms ${pct(v)} of the time hands were visible`
    case 'smile_share': return `Smiling about ${pct(v)} of visible time`
    case 'blink_rate': return `About ${Math.round(v)} blinks per minute`
  }
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

export function describe(o: Observation): string {
  if (isEventKind(o.kind)) {
    const e = o as Observation & { kind: EventKind }
    return `${capitalize(eventPhrase(e))} for ${fmtDur(e.endMs - e.startMs)} at ${fmtTime(e.startMs)}`
  }
  const kind = o.kind as MetricKind
  if (o.value === null) return `${METRIC_LABEL[kind]}: not available (${REASON_TEXT[o.unavailableReason ?? 'not_enough_valid_time'].toLowerCase()})`
  return metricText(kind, o.value)
}

export function describeMoment(m: Moment): string {
  const parts = m.observations
    .filter((o) => isEventKind(o.kind))
    .map((o) => `${eventPhrase(o as Observation & { kind: EventKind })} ${fmtDur(o.endMs - o.startMs)}`)
  return `${fmtTime(m.t0Ms)}–${fmtTime(m.t1Ms)}${m.isKey ? ' (key moment)' : ''}: ${parts.join('; ')}`
}
```

`src/onboarding/ui/VisualReport.tsx`:
```tsx
import { REASON_TEXT, describe, describeMoment } from '../client/vision/copy'
import type { Moment, VisualSummary } from '../client/vision/types'

type Props = { summary: VisualSummary; moments?: Moment[] }

/** Camera section of the intake review. Styling uses brandbook tokens mapped in Tailwind. */
export function VisualReport({ summary, moments = [] }: Props) {
  const pct = Math.round(summary.coverage * 100)
  return (
    <section aria-labelledby="visual-report-title" className="rounded-lg border border-line bg-raised p-6 text-ink">
      <h3 id="visual-report-title" className="font-display text-lg font-semibold">Camera observations</h3>
      {summary.status === 'unavailable' ? (
        <p className="mt-2 text-muted">
          Visual feedback unavailable: {REASON_TEXT[summary.unavailableReason ?? 'not_enough_valid_time']}.
        </p>
      ) : (
        <>
          <p className="mt-1 text-sm text-muted">
            Based on <span className="font-mono">{Math.round(summary.validMs / 1000)} s</span> of clear camera time
            (<span className="font-mono">{pct}%</span> of the call).
          </p>
          {summary.status === 'partial' && (
            <p className="mt-2 text-sm text-muted">
              Not enough clear camera time for overall figures
              {summary.unavailableReason ? ` (${REASON_TEXT[summary.unavailableReason].toLowerCase()})` : ''}.
              Showing individual moments only.
            </p>
          )}
          {moments.length > 0 && (
            <div className="mt-4">
              <h4 className="text-sm font-semibold">While you spoke</h4>
              <ul className="mt-2 space-y-1">{moments.map((m) => <li key={m.turnId}>{describeMoment(m)}</li>)}</ul>
            </div>
          )}
          {summary.events.length > 0 && (
            <div className="mt-4">
              <h4 className="text-sm font-semibold">Moments</h4>
              <ul className="mt-2 space-y-1">{summary.events.map((o) => <li key={o.id}>{describe(o)}</li>)}</ul>
            </div>
          )}
          {summary.metrics.length > 0 && (
            <div className="mt-4">
              <h4 className="text-sm font-semibold">Across the call</h4>
              <ul className="mt-2 space-y-1">{summary.metrics.map((o) => <li key={o.id}>{describe(o)}</li>)}</ul>
            </div>
          )}
        </>
      )}
      <p className="mt-4 text-xs text-muted">
        Measured on your device from a 2D webcam. These describe movements, not how you felt.
      </p>
    </section>
  )
}
```

- [ ] **Step 4: Run tests and typecheck**

Run: `npx vitest run tests/intake/vision-report.test.tsx && npm run typecheck`
Expected: all PASS; typecheck exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/onboarding/client/vision/copy.ts src/onboarding/ui/VisualReport.tsx tests/intake/vision-report.test.tsx
git commit -m "feat(vision): add factual report copy and VisualReport"
```

---

### Task 10: Events uploader and mock endpoint

**Files:**
- Create: `src/onboarding/client/vision/{upload,mock-events}.ts`
- Test: `tests/intake/vision-upload.test.ts`

**Interfaces:**
- Produces: `type EventsUploaderOptions`, `type EventsUploader = { push(obs: readonly Observation[]): void; flush(): Promise<void>; revoke(): void; dispose(): void }`, `createEventsUploader(o)`; `createMockEventsServer(o?: { failFirst?: number; status?: number }) → { fetchImpl: typeof fetch; batches: EventsBatch[]; calls: { key: string | null }[] }`.

- [ ] **Step 1: Write the failing test**

`tests/intake/vision-upload.test.ts`:
```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockEventsServer } from '@/onboarding/client/vision/mock-events'
import { eventObservation } from '@/onboarding/client/vision/observation'
import { createEventsUploader } from '@/onboarding/client/vision/upload'

const ctx = { recordingId: 'rec', modelVersion: 'v' }
const obs = (i: number) => eventObservation(ctx, 'head_turn_away', { startMs: i * 1000, endMs: i * 1000 + 2500 })

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('createEventsUploader', () => {
  it('sends on the interval with an idempotency key per batch', async () => {
    const server = createMockEventsServer()
    const up = createEventsUploader({ intakeId: 'i1', consentVersion: 2, fetchImpl: server.fetchImpl })
    up.push([obs(1), obs(2), obs(3)])
    expect(server.batches).toHaveLength(0)
    await vi.advanceTimersByTimeAsync(5000)
    expect(server.batches).toEqual([{ seq: 0, consentVersion: 2, observations: [obs(1), obs(2), obs(3)] }])
    expect(server.calls[0]!.key).toBe('i1:0')
    up.dispose()
  })

  it('sends immediately at 20 observations and de-duplicates by id', async () => {
    const server = createMockEventsServer()
    const up = createEventsUploader({ intakeId: 'i1', consentVersion: 1, fetchImpl: server.fetchImpl })
    up.push(Array.from({ length: 20 }, (_, i) => obs(i)))
    up.push([obs(0), obs(1)])
    await up.flush()
    expect(server.batches).toHaveLength(1)
    expect(server.batches[0]!.observations).toHaveLength(20)
    up.dispose()
  })

  it('retries a failed batch with the same key', async () => {
    const server = createMockEventsServer({ failFirst: 1 })
    const onError = vi.fn()
    const up = createEventsUploader({ intakeId: 'i1', consentVersion: 1, fetchImpl: server.fetchImpl, onError })
    up.push([obs(1)])
    await up.flush()
    expect(server.batches).toHaveLength(0)
    expect(onError).toHaveBeenCalledOnce()
    await vi.advanceTimersByTimeAsync(1000)
    expect(server.batches).toHaveLength(1)
    expect(server.calls.map((c) => c.key)).toEqual(['i1:0', 'i1:0'])
    up.dispose()
  })

  it('drops everything and stops sending on revoke', async () => {
    const server = createMockEventsServer()
    const up = createEventsUploader({ intakeId: 'i1', consentVersion: 1, fetchImpl: server.fetchImpl })
    up.push([obs(1)])
    up.revoke()
    up.push([obs(2)])
    await vi.advanceTimersByTimeAsync(20000)
    await up.flush()
    expect(server.calls).toHaveLength(0)
  })

  it('stops for good on 409 or 410', async () => {
    const server = createMockEventsServer({ status: 410 })
    const onFatal = vi.fn()
    const up = createEventsUploader({ intakeId: 'i1', consentVersion: 1, fetchImpl: server.fetchImpl, onFatal })
    up.push([obs(1)])
    await up.flush()
    up.push([obs(2)])
    await vi.advanceTimersByTimeAsync(20000)
    expect(onFatal).toHaveBeenCalledWith(410)
    expect(server.calls).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/intake/vision-upload.test.ts`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement**

`src/onboarding/client/vision/upload.ts`:
```ts
import { EventsBatchSchema, type EventsBatch, type Observation } from './types'

export type EventsUploaderOptions = {
  intakeId: string
  consentVersion: number
  fetchImpl: typeof fetch
  baseUrl?: string
  intervalMs?: number
  maxBatch?: number
  onFatal?: (status: number) => void
  onError?: (error: Error) => void
}

export type EventsUploader = {
  push(observations: readonly Observation[]): void
  flush(): Promise<void>
  /** Consent withdrawn: drop queued data and never send again for this consentVersion. */
  revoke(): void
  dispose(): void
}

const BACKOFF_MS = [1000, 2000, 4000]

export function createEventsUploader(o: EventsUploaderOptions): EventsUploader {
  const maxBatch = o.maxBatch ?? 20
  const url = `${o.baseUrl ?? ''}/api/intake/${encodeURIComponent(o.intakeId)}/events`
  const known = new Set<string>()
  let queue: Observation[] = []
  let pending: EventsBatch | null = null
  let seq = 0
  let failures = 0
  let closed = false
  let inFlight: Promise<void> | null = null
  let retryTimer: ReturnType<typeof setTimeout> | null = null
  const interval = setInterval(() => void flush(), o.intervalMs ?? 5000)

  function push(observations: readonly Observation[]) {
    if (closed) return
    for (const obs of observations) {
      if (known.has(obs.id)) continue
      known.add(obs.id)
      queue.push(obs)
    }
    if (queue.length >= maxBatch) void flush()
  }

  function flush(): Promise<void> {
    if (closed) return Promise.resolve()
    inFlight ??= drain().finally(() => { inFlight = null })
    return inFlight
  }

  async function drain(): Promise<void> {
    while (!closed) {
      if (!pending) {
        if (queue.length === 0) return
        pending = EventsBatchSchema.parse({ seq: seq++, consentVersion: o.consentVersion, observations: queue.splice(0, maxBatch) })
      }
      const batch = pending
      let res: Response
      try {
        res = await o.fetchImpl(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'idempotency-key': `${o.intakeId}:${batch.seq}` },
          body: JSON.stringify(batch),
        })
      } catch (err) {
        return fail(err instanceof Error ? err : new Error(String(err)))
      }
      if (closed) return
      if (res.ok) {
        pending = null
        failures = 0
        continue
      }
      if (res.status === 409 || res.status === 410) {
        close()
        o.onFatal?.(res.status)
        return
      }
      return fail(new Error(`events upload failed with HTTP ${res.status}`))
    }
  }

  /** Retry with backoff three times; after that the batch waits for the next interval flush. */
  function fail(error: Error) {
    failures++
    o.onError?.(error)
    const delay = BACKOFF_MS[failures - 1]
    if (delay !== undefined && !retryTimer) {
      retryTimer = setTimeout(() => {
        retryTimer = null
        void flush()
      }, delay)
    }
  }

  function close() {
    closed = true
    queue = []
    pending = null
    clearInterval(interval)
    if (retryTimer) clearTimeout(retryTimer)
  }

  return { push, flush, revoke: close, dispose: close }
}
```

`src/onboarding/client/vision/mock-events.ts`:
```ts
import { EventsBatchSchema, type EventsBatch } from './types'

/** Stand-in for B's POST /api/intake/:id/events until it exists: validates, de-duplicates by key, records. */
export function createMockEventsServer(o: { failFirst?: number; status?: number } = {}) {
  const batches: EventsBatch[] = []
  const calls: { key: string | null }[] = []
  const seen = new Map<string, string>()
  let failuresLeft = o.failFirst ?? 0

  const fetchImpl: typeof fetch = async (_input, init) => {
    const key = new Headers(init?.headers).get('idempotency-key')
    calls.push({ key })
    if (failuresLeft > 0) {
      failuresLeft--
      return new Response(null, { status: 503 })
    }
    if (o.status) return new Response(null, { status: o.status })
    const body = String(init?.body ?? '')
    const parsed = EventsBatchSchema.safeParse(JSON.parse(body))
    if (!key || !parsed.success) return new Response(JSON.stringify({ error: 'invalid_batch' }), { status: 400 })
    const previous = seen.get(key)
    if (previous !== undefined) return new Response(null, { status: previous === body ? 202 : 409 })
    seen.set(key, body)
    batches.push(parsed.data)
    return new Response(null, { status: 202 })
  }

  return { fetchImpl, batches, calls }
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/intake/vision-upload.test.ts`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/onboarding/client/vision/{upload,mock-events}.ts tests/intake/vision-upload.test.ts
git commit -m "feat(vision): batch observations to the intake events endpoint"
```

---

### Task 11: MediaPipe result extraction and pinned assets

**Files:**
- Create: `src/onboarding/client/vision/{models,extract}.ts`, `scripts/fetch-vision-assets.ts`, `public/intake/models/manifest.json` (generated)
- Test: `tests/intake/vision-extract.test.ts`

**Interfaces:**
- Produces: `TASKS_VISION_VERSION`, `type PoseTier = 'heavy' | 'full' | 'lite'`, `MODEL_FILES`, `MODEL_SOURCES`, `ASSET_BASE = '/intake'`, `modelVersion(tier, thresholdsVersion)`; `type RawFrame`, `toSample(f: RawFrame): LandmarkSample`, `isOpenPalm(pts, label)`.

- [ ] **Step 1: Write the failing test**

`tests/intake/vision-extract.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { isOpenPalm, toSample, type RawFrame } from '@/onboarding/client/vision/extract'
import { LandmarkSampleSchema } from '@/onboarding/client/vision/types'

const lm = (x: number, y: number, visibility = 0.99) => ({ x, y, z: 0, visibility })
const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]

function openRightHand() {
  const pts = Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.5 }))
  Object.assign(pts, {
    0: { x: 0.5, y: 0.5 }, 5: { x: 0.53, y: 0.42 }, 17: { x: 0.47, y: 0.42 },
    6: { x: 0.53, y: 0.38 }, 8: { x: 0.53, y: 0.30 }, 10: { x: 0.51, y: 0.37 }, 12: { x: 0.51, y: 0.28 },
    14: { x: 0.49, y: 0.38 }, 16: { x: 0.49, y: 0.30 }, 18: { x: 0.47, y: 0.39 }, 20: { x: 0.47, y: 0.32 },
  })
  return pts
}

function frame(): RawFrame {
  const pose = Array.from({ length: 33 }, () => lm(0.5, 0.5, 0.1))
  Object.assign(pose, { 0: lm(0.5, 0.3), 11: lm(0.62, 0.64), 12: lm(0.38, 0.64) })
  const face = Array.from({ length: 478 }, () => lm(0.5, 0.3))
  face[0] = lm(0.42, 0.15)
  face[1] = lm(0.58, 0.45)
  return {
    tMs: 1000, frameW: 640, frameH: 360, luma: 110,
    pose: { landmarks: [pose] },
    face: {
      faceLandmarks: [face],
      facialTransformationMatrixes: [{ rows: 4, columns: 4, data: identity }],
      faceBlendshapes: [{ categories: [
        { categoryName: 'mouthSmileLeft', score: 0.6, index: 0, displayName: '' },
        { categoryName: 'mouthSmileRight', score: 0.4, index: 1, displayName: '' },
        { categoryName: 'eyeBlinkLeft', score: 0.9, index: 2, displayName: '' },
      ], headIndex: 0, headName: '' }],
    },
    hands: { landmarks: [openRightHand().map((p) => lm(p.x, p.y))], handedness: [[{ categoryName: 'Left', score: 0.9, index: 0, displayName: '' }]] },
  }
}

describe('toSample', () => {
  it('converts results into a valid compact sample in frame-width units', () => {
    const s = toSample(frame())
    expect(LandmarkSampleSchema.parse(s)).toEqual(s)
    expect(s.pose!.lShoulder).toEqual({ x: 0.62, y: 0.64 * 0.5625, v: 0.99 })
    expect(s.face!.box.y1).toBeCloseTo(0.45 * 0.5625, 6)
    expect(s.face!.blend.smile).toBeCloseTo(0.5, 6)
    expect(s.face!.blend.blinkL).toBe(0.9)
    expect(s.face!.yawDeg).toBeCloseTo(0, 6)
    expect(s.hands).toHaveLength(1)
    expect(s.hands![0]!.openPalm).toBe(true)
  })

  it('reports absent detections as null and counts people', () => {
    const f = frame()
    const s = toSample({ ...f, pose: { landmarks: [] }, face: { ...f.face, faceLandmarks: [] }, hands: null })
    expect(s).toMatchObject({ pose: null, face: null, hands: null, faces: 0, poses: 0 })
  })
})

describe('isOpenPalm', () => {
  it('needs extended fingers and the palm facing the camera', () => {
    expect(isOpenPalm(openRightHand(), 'Left')).toBe(true)
    expect(isOpenPalm(openRightHand(), 'Right')).toBe(false)
    expect(isOpenPalm(openRightHand(), null)).toBe(false)
    const fist = openRightHand()
    for (const tip of [8, 12, 16, 20]) fist[tip] = { x: 0.5, y: 0.44 }
    expect(isOpenPalm(fist, 'Left')).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/intake/vision-extract.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

`src/onboarding/client/vision/models.ts`:
```ts
export const TASKS_VISION_VERSION = '1.1.1'
export type PoseTier = 'heavy' | 'full' | 'lite'
/** Served from public/: models at /intake/models, wasm at /intake/wasm. */
export const ASSET_BASE = '/intake'

export const MODEL_FILES = {
  pose: { heavy: 'pose_landmarker_heavy.task', full: 'pose_landmarker_full.task', lite: 'pose_landmarker_lite.task' },
  face: 'face_landmarker.task',
  hand: 'hand_landmarker.task',
} as const

const GCS = 'https://storage.googleapis.com/mediapipe-models'
export const MODEL_SOURCES: Record<string, string> = {
  'pose_landmarker_heavy.task': `${GCS}/pose_landmarker/pose_landmarker_heavy/float16/1/pose_landmarker_heavy.task`,
  'pose_landmarker_full.task': `${GCS}/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task`,
  'pose_landmarker_lite.task': `${GCS}/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task`,
  'face_landmarker.task': `${GCS}/face_landmarker/face_landmarker/float16/1/face_landmarker.task`,
  'hand_landmarker.task': `${GCS}/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task`,
}

export const modelVersion = (tier: PoseTier, thresholdsVersion: number) => `tv${TASKS_VISION_VERSION}/pose-${tier}/t${thresholdsVersion}`
```

`src/onboarding/client/vision/extract.ts`:
```ts
import type { FaceLandmarkerResult, HandLandmarkerResult, NormalizedLandmark, PoseLandmarkerResult } from '@mediapipe/tasks-vision'
import { clamp, dist, headAngles, irisOffset, type Vec } from './geometry'
import { avg } from './stats'
import type { Face, Hand, LandmarkSample, Point, Pose } from './types'

export type RawFrame = {
  tMs: number
  frameW: number
  frameH: number
  luma: number
  pose: Pick<PoseLandmarkerResult, 'landmarks'>
  face: Pick<FaceLandmarkerResult, 'faceLandmarks' | 'facialTransformationMatrixes' | 'faceBlendshapes'>
  hands: Pick<HandLandmarkerResult, 'landmarks' | 'handedness'> | null
}

const POSE_INDEX = { nose: 0, lShoulder: 11, rShoulder: 12, lElbow: 13, rElbow: 14, lWrist: 15, rWrist: 16 } as const

/** Convert MediaPipe results (unmirrored frame) to a compact sample in frame-width units. */
export function toSample(f: RawFrame): LandmarkSample {
  const k = f.frameH / f.frameW
  return {
    tMs: f.tMs,
    luma: clamp(f.luma, 0, 255),
    faces: f.face.faceLandmarks.length,
    poses: f.pose.landmarks.length,
    face: toFace(f.face, k),
    pose: toPose(f.pose, k),
    hands: f.hands ? toHands(f.hands, k) : null,
  }
}

const toPoint = (l: NormalizedLandmark, k: number): Point => ({ x: l.x, y: l.y * k, v: clamp(l.visibility ?? 0, 0, 1) })

function toPose(r: RawFrame['pose'], k: number): Pose | null {
  const lm = r.landmarks[0]
  if (!lm) return null
  const at = (i: number) => {
    const l = lm[i]
    if (!l) throw new Error(`pose landmark ${i} missing`)
    return toPoint(l, k)
  }
  return {
    nose: at(POSE_INDEX.nose), lShoulder: at(POSE_INDEX.lShoulder), rShoulder: at(POSE_INDEX.rShoulder),
    lElbow: at(POSE_INDEX.lElbow), rElbow: at(POSE_INDEX.rElbow), lWrist: at(POSE_INDEX.lWrist), rWrist: at(POSE_INDEX.rWrist),
  }
}

function toFace(r: RawFrame['face'], k: number): Face | null {
  const lm = r.faceLandmarks[0]
  if (!lm) return null
  const matrix = r.facialTransformationMatrixes?.[0]?.data
  if (!matrix) throw new Error('face landmarker returned no transformation matrix; enable outputFacialTransformationMatrixes')
  const scores = new Map((r.faceBlendshapes?.[0]?.categories ?? []).map((c) => [c.categoryName, c.score]))
  const s = (name: string) => scores.get(name) ?? 0
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (const l of lm) {
    x0 = Math.min(x0, l.x); x1 = Math.max(x1, l.x)
    y0 = Math.min(y0, l.y * k); y1 = Math.max(y1, l.y * k)
  }
  return {
    ...headAngles(matrix),
    box: { x0, y0, x1, y1 },
    gaze: irisOffset(lm),
    blend: {
      smile: (s('mouthSmileLeft') + s('mouthSmileRight')) / 2,
      browUp: Math.max(s('browInnerUp'), (s('browOuterUpLeft') + s('browOuterUpRight')) / 2),
      press: (s('mouthPressLeft') + s('mouthPressRight')) / 2,
      blinkL: s('eyeBlinkLeft'),
      blinkR: s('eyeBlinkRight'),
    },
  }
}

function toHands(r: NonNullable<RawFrame['hands']>, k: number): Hand[] {
  return r.landmarks.slice(0, 2).map((lm, i) => {
    const pts = lm.map((l) => ({ x: l.x, y: l.y * k }))
    return {
      center: { x: avg(pts.map((p) => p.x)), y: avg(pts.map((p) => p.y)) },
      openPalm: isOpenPalm(pts, r.handedness[i]?.[0]?.categoryName ?? null),
    }
  })
}

const FINGERS = [[8, 6], [12, 10], [16, 14], [20, 18]] as const

/** ≥3 fingers extended and the palm normal pointing at the camera. */
export function isOpenPalm(pts: readonly Vec[], label: string | null): boolean {
  const p = (i: number) => {
    const v = pts[i]
    if (!v) throw new Error(`hand landmark ${i} missing`)
    return v
  }
  const wrist = p(0)
  const extended = FINGERS.filter(([tip, pip]) => dist(wrist, p(tip)) > dist(wrist, p(pip)) * 1.15).length
  if (extended < 3 || label === null) return false
  const a = { x: p(5).x - wrist.x, y: p(5).y - wrist.y }
  const b = { x: p(17).x - wrist.x, y: p(17).y - wrist.y }
  const cross = a.x * b.y - a.y * b.x
  // MediaPipe labels handedness as if the image were mirrored; we infer on the unmirrored frame, so the label is swapped.
  const isRightHand = label === 'Left'
  return isRightHand ? cross < 0 : cross > 0
}
```

`scripts/fetch-vision-assets.ts`:
```ts
import { createHash } from 'node:crypto'
import { access, cp, mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { MODEL_SOURCES } from '../src/onboarding/client/vision/models'

const root = fileURLToPath(new URL('..', import.meta.url))
const modelsDir = path.join(root, 'public/intake/models')
const manifestPath = path.join(modelsDir, 'manifest.json')
const exists = (p: string) => access(p).then(() => true, () => false)

await mkdir(modelsDir, { recursive: true })
const pinned: Record<string, string> = (await exists(manifestPath)) ? JSON.parse(await readFile(manifestPath, 'utf8')) : {}
const manifest: Record<string, string> = {}

for (const [file, url] of Object.entries(MODEL_SOURCES)) {
  const target = path.join(modelsDir, file)
  if (!(await exists(target))) {
    const res = await fetch(url)
    if (!res.ok) throw new Error(`download ${url}: HTTP ${res.status}`)
    await writeFile(target, Buffer.from(await res.arrayBuffer()))
    console.log(`downloaded ${file}`)
  }
  const hash = createHash('sha256').update(await readFile(target)).digest('hex')
  if (pinned[file] && pinned[file] !== hash) {
    throw new Error(`${file} does not match its pinned hash; delete it and investigate before re-pinning`)
  }
  manifest[file] = hash
}

await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
await cp(path.join(root, 'node_modules/@mediapipe/tasks-vision/wasm'), path.join(root, 'public/intake/wasm'), { recursive: true })
console.log('vision assets ready')
```

- [ ] **Step 4: Run tests, typecheck, fetch assets**

Run: `npx vitest run tests/intake/vision-extract.test.ts && npm run typecheck && npm run vision:assets`
Expected: tests PASS; typecheck exit 0; script prints five `downloaded …` lines and `vision assets ready`; `public/intake/models/manifest.json` lists five SHA-256 hashes. Run `npm run vision:assets` a second time: no downloads, same manifest.

- [ ] **Step 5: Commit**

```bash
git add src/onboarding/client/vision/{models,extract}.ts scripts/fetch-vision-assets.ts public/intake/models/manifest.json tests/intake/vision-extract.test.ts
git commit -m "feat(vision): convert MediaPipe results and pin model assets"
```

---

### Task 12: Inference, worker and landmark sources

**Files:**
- Create: `src/onboarding/client/vision/{inference,worker-protocol,worker,source}.ts`
- Test: `tests/intake/vision-protocol.test.ts`

**Interfaces:**
- Consumes: `toSample`, `MODEL_FILES`, `ASSET_BASE`, `PoseTier`, `LandmarkSampleSchema`.
- Produces:
  - `type HandsMode = 'run' | 'reuse' | 'off'`
  - `createInference({ tier, enableHands, assetBase }): Promise<Inference>` where `Inference = { run(frame: ImageBitmap, tMs: number, hands: HandsMode): LandmarkSample; close(): void }`
  - `type ToWorker`, `FromWorkerSchema`, `type FromWorker`
  - `interface LandmarkSource { init(o: { tier: PoseTier; enableHands: boolean }): Promise<void>; process(frame: ImageBitmap, tMs: number, hands: HandsMode): Promise<{ sample: LandmarkSample; inferenceMs: number }>; dispose(): void }`
  - `createWorkerSource(assetBase?)`, `createMainThreadSource(assetBase?)`

- [ ] **Step 1: Write the failing test**

`tests/intake/vision-protocol.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { FromWorkerSchema } from '@/onboarding/client/vision/worker-protocol'
import { baseSample } from './vision-fixtures'

describe('worker → main protocol', () => {
  it('accepts compact samples', () => {
    expect(FromWorkerSchema.safeParse({ type: 'sample', id: 3, inferenceMs: 21, sample: baseSample(0) }).success).toBe(true)
    expect(FromWorkerSchema.safeParse({ type: 'ready' }).success).toBe(true)
    expect(FromWorkerSchema.safeParse({ type: 'error', id: null, message: 'boom' }).success).toBe(true)
  })

  it('rejects any extra payload such as raw landmarks or pixels', () => {
    expect(FromWorkerSchema.safeParse({ type: 'sample', id: 3, inferenceMs: 21, sample: baseSample(0), landmarks: [] }).success).toBe(false)
    expect(FromWorkerSchema.safeParse({ type: 'sample', id: 3, inferenceMs: 21, sample: { ...baseSample(0), pixels: [1, 2] } }).success).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/intake/vision-protocol.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

`src/onboarding/client/vision/worker-protocol.ts`:
```ts
import { z } from 'zod'
import type { PoseTier } from './models'
import { LandmarkSampleSchema } from './types'

export type HandsMode = 'run' | 'reuse' | 'off'

export type ToWorker =
  | { type: 'init'; tier: PoseTier; enableHands: boolean; assetBase: string }
  | { type: 'frame'; id: number; tMs: number; bitmap: ImageBitmap; hands: HandsMode }
  | { type: 'dispose' }

/** Everything the worker may send back. Strict: nothing beyond a compact sample crosses the boundary. */
export const FromWorkerSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('ready') }),
  z.strictObject({ type: z.literal('sample'), id: z.number().int(), inferenceMs: z.number().nonnegative(), sample: LandmarkSampleSchema }),
  z.strictObject({ type: z.literal('error'), id: z.number().int().nullable(), message: z.string().max(500) }),
])
export type FromWorker = z.infer<typeof FromWorkerSchema>
```

`src/onboarding/client/vision/inference.ts`:
```ts
import { FaceLandmarker, FilesetResolver, HandLandmarker, PoseLandmarker, type HandLandmarkerResult } from '@mediapipe/tasks-vision'
import { toSample } from './extract'
import { MODEL_FILES, type PoseTier } from './models'
import type { LandmarkSample } from './types'
import type { HandsMode } from './worker-protocol'

export type InferenceOptions = { tier: PoseTier; enableHands: boolean; assetBase: string }
export type Inference = { run(frame: ImageBitmap, tMs: number, hands: HandsMode): LandmarkSample; close(): void }

const MIN_CONFIDENCE = 0.7
const HAND_REUSE_MS = 250

async function loadVerified(url: string, expected: string | undefined): Promise<Uint8Array> {
  if (!expected) throw new Error(`no pinned hash for ${url}; run npm run vision:assets`)
  const res = await fetch(url)
  if (!res.ok) throw new Error(`failed to load ${url}: HTTP ${res.status}`)
  const buf = await res.arrayBuffer()
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', buf))
  const hash = Array.from(digest, (b) => b.toString(16).padStart(2, '0')).join('')
  if (hash !== expected) throw new Error(`hash mismatch for ${url}`)
  return new Uint8Array(buf)
}

/** GPU first; some browsers (notably Safari in workers) only manage CPU. */
async function withGpuFallback<T>(create: (delegate: 'GPU' | 'CPU') => Promise<T>): Promise<T> {
  try {
    return await create('GPU')
  } catch (err) {
    console.warn('vision: GPU delegate failed, using CPU', err)
    return create('CPU')
  }
}

export async function createInference(o: InferenceOptions): Promise<Inference> {
  const manifestRes = await fetch(`${o.assetBase}/models/manifest.json`)
  if (!manifestRes.ok) throw new Error(`failed to load vision manifest: HTTP ${manifestRes.status}`)
  const manifest = (await manifestRes.json()) as Record<string, string>
  const model = (file: string) => loadVerified(`${o.assetBase}/models/${file}`, manifest[file])
  const fileset = await FilesetResolver.forVisionTasks(`${o.assetBase}/wasm`, true)

  const poseModel = await model(MODEL_FILES.pose[o.tier])
  const pose = await withGpuFallback((delegate) => PoseLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetBuffer: poseModel, delegate }, runningMode: 'VIDEO', numPoses: 2,
    minPoseDetectionConfidence: MIN_CONFIDENCE, minPosePresenceConfidence: MIN_CONFIDENCE, minTrackingConfidence: MIN_CONFIDENCE,
  }))
  const faceModel = await model(MODEL_FILES.face)
  const face = await withGpuFallback((delegate) => FaceLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetBuffer: faceModel, delegate }, runningMode: 'VIDEO', numFaces: 2,
    outputFaceBlendshapes: true, outputFacialTransformationMatrixes: true,
    minFaceDetectionConfidence: MIN_CONFIDENCE, minFacePresenceConfidence: MIN_CONFIDENCE, minTrackingConfidence: MIN_CONFIDENCE,
  }))
  let hand: HandLandmarker | null = null
  if (o.enableHands) {
    const handModel = await model(MODEL_FILES.hand)
    hand = await withGpuFallback((delegate) => HandLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetBuffer: handModel, delegate }, runningMode: 'VIDEO', numHands: 2,
      minHandDetectionConfidence: MIN_CONFIDENCE, minHandPresenceConfidence: MIN_CONFIDENCE, minTrackingConfidence: MIN_CONFIDENCE,
    }))
  }

  const canvas = new OffscreenCanvas(32, 18)
  const ctx2d = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx2d) throw new Error('vision: 2d context unavailable for brightness check')
  const luma = (frame: ImageBitmap) => {
    ctx2d.drawImage(frame, 0, 0, 32, 18)
    const d = ctx2d.getImageData(0, 0, 32, 18).data
    let sum = 0
    for (let i = 0; i < d.length; i += 4) sum += 0.2126 * d[i]! + 0.7152 * d[i + 1]! + 0.0722 * d[i + 2]!
    return sum / (d.length / 4)
  }

  let lastHands: { tMs: number; result: HandLandmarkerResult } | null = null

  return {
    run(frame, tMs, handsMode) {
      const poseRes = pose.detectForVideo(frame, tMs)
      const faceRes = face.detectForVideo(frame, tMs)
      let handsRes: HandLandmarkerResult | null = null
      if (hand && handsMode !== 'off') {
        if (handsMode === 'run' || !lastHands || tMs - lastHands.tMs > HAND_REUSE_MS) {
          lastHands = { tMs, result: hand.detectForVideo(frame, tMs) }
        }
        handsRes = lastHands.result
      }
      const sample = toSample({ tMs, frameW: frame.width, frameH: frame.height, luma: luma(frame), pose: poseRes, face: faceRes, hands: handsRes })
      poseRes.close()
      return sample
    },
    close() {
      pose.close()
      face.close()
      hand?.close()
    },
  }
}
```

`src/onboarding/client/vision/worker.ts`:
```ts
import { createInference, type Inference } from './inference'
import type { FromWorker, ToWorker } from './worker-protocol'

type Scope = { postMessage(message: FromWorker): void; onmessage: ((e: MessageEvent<ToWorker>) => void) | null }
const scope = self as unknown as Scope
let inference: Inference | null = null

const message = (err: unknown) => (err instanceof Error ? err.message : String(err)).slice(0, 500)

scope.onmessage = (e) => void handle(e.data)

async function handle(m: ToWorker) {
  switch (m.type) {
    case 'init':
      try {
        inference?.close()
        inference = await createInference(m)
        scope.postMessage({ type: 'ready' })
      } catch (err) {
        scope.postMessage({ type: 'error', id: null, message: message(err) })
      }
      return
    case 'frame':
      try {
        if (!inference) throw new Error('frame received before init')
        const t0 = performance.now()
        const sample = inference.run(m.bitmap, m.tMs, m.hands)
        scope.postMessage({ type: 'sample', id: m.id, sample, inferenceMs: performance.now() - t0 })
      } catch (err) {
        scope.postMessage({ type: 'error', id: m.id, message: message(err) })
      } finally {
        m.bitmap.close()
      }
      return
    case 'dispose':
      inference?.close()
      inference = null
      return
  }
}
```

`src/onboarding/client/vision/source.ts`:
```ts
import { ASSET_BASE, type PoseTier } from './models'
import type { LandmarkSample } from './types'
import { FromWorkerSchema, type HandsMode, type ToWorker } from './worker-protocol'

export type ProcessResult = { sample: LandmarkSample; inferenceMs: number }

export interface LandmarkSource {
  init(o: { tier: PoseTier; enableHands: boolean }): Promise<void>
  /** Takes ownership of `frame` and closes it. */
  process(frame: ImageBitmap, tMs: number, hands: HandsMode): Promise<ProcessResult>
  dispose(): void
}

type Waiter<T> = { resolve: (v: T) => void; reject: (e: Error) => void }

export function createWorkerSource(assetBase = ASSET_BASE): LandmarkSource {
  const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })
  const pending = new Map<number, Waiter<ProcessResult>>()
  let initWaiter: Waiter<void> | null = null
  let nextId = 0

  const failAll = (error: Error) => {
    initWaiter?.reject(error)
    initWaiter = null
    for (const w of pending.values()) w.reject(error)
    pending.clear()
  }

  worker.onmessage = (e: MessageEvent<unknown>) => {
    const parsed = FromWorkerSchema.safeParse(e.data)
    if (!parsed.success) return failAll(new Error('vision worker sent an unexpected message'))
    const m = parsed.data
    if (m.type === 'ready') {
      initWaiter?.resolve()
      initWaiter = null
    } else if (m.type === 'sample') {
      pending.get(m.id)?.resolve({ sample: m.sample, inferenceMs: m.inferenceMs })
      pending.delete(m.id)
    } else {
      const error = new Error(`vision worker: ${m.message}`)
      if (m.id === null) failAll(error)
      else {
        pending.get(m.id)?.reject(error)
        pending.delete(m.id)
      }
    }
  }
  worker.onerror = (e) => failAll(new Error(`vision worker crashed: ${e.message}`))

  const post = (m: ToWorker, transfer: Transferable[] = []) => worker.postMessage(m, transfer)

  return {
    init: (o) => new Promise<void>((resolve, reject) => {
      initWaiter = { resolve, reject }
      post({ type: 'init', tier: o.tier, enableHands: o.enableHands, assetBase })
    }),
    process: (bitmap, tMs, hands) => new Promise<ProcessResult>((resolve, reject) => {
      const id = nextId++
      pending.set(id, { resolve, reject })
      post({ type: 'frame', id, tMs, bitmap, hands }, [bitmap])
    }),
    dispose: () => {
      post({ type: 'dispose' })
      worker.terminate()
      failAll(new Error('vision source disposed'))
    },
  }
}

/** Same pipeline on the main thread, for browsers where MediaPipe will not start in a module worker. */
export function createMainThreadSource(assetBase = ASSET_BASE): LandmarkSource {
  let inference: import('./inference').Inference | null = null
  return {
    async init(o) {
      const { createInference } = await import('./inference')
      inference?.close()
      inference = await createInference({ ...o, assetBase })
    },
    async process(frame, tMs, hands) {
      try {
        if (!inference) throw new Error('process called before init')
        const t0 = performance.now()
        const sample = inference.run(frame, tMs, hands)
        return { sample, inferenceMs: performance.now() - t0 }
      } finally {
        frame.close()
      }
    },
    dispose() {
      inference?.close()
      inference = null
    },
  }
}
```

- [ ] **Step 4: Run tests and typecheck**

Run: `npx vitest run tests/intake/vision-protocol.test.ts && npm run typecheck`
Expected: PASS; typecheck exit 0. If typecheck flags a MediaPipe option name, read `node_modules/@mediapipe/tasks-vision/vision.d.ts` for the correct name and fix it; do not cast to `any`.

- [ ] **Step 5: Commit**

```bash
git add src/onboarding/client/vision/{inference,worker-protocol,worker,source}.ts tests/intake/vision-protocol.test.ts
git commit -m "feat(vision): run MediaPipe in a worker behind LandmarkSource"
```

---

### Task 13: Pacing and the vision session

**Files:**
- Create: `src/onboarding/client/vision/{pacing,session}.ts`
- Test: `tests/intake/vision-session.test.ts`

**Interfaces:**
- Consumes: `LandmarkSource`, `HandsMode`, `detectAll`, `summarize`, `modelVersion`, `p95`, `EventsUploader`.
- Produces:
  - `type Pacing = { fps: 10 | 5; hands: boolean; off: boolean }`, `initialPacing(enableHands)`, `nextPacing(p, p95Ms)`
  - `type VisionUpdate = { status: 'starting' | 'running' | 'stopped' | 'off'; tier: PoseTier | null; pacing: Pacing; observations: Observation[]; validMs: number; observedMs: number; offReason: UnavailableReason | null }`
  - `createVisionSession(o: VisionSessionOptions): VisionSession` with `start(): Promise<void>`, `stop(): Promise<VisualSummary>`, `getSamples(): LandmarkSample[]`, `getObservations(): Observation[]`

- [ ] **Step 1: Write the failing test**

`tests/intake/vision-session.test.ts`:
```ts
import { describe, expect, it, vi } from 'vitest'
import type { PoseTier } from '@/onboarding/client/vision/models'
import { initialPacing, nextPacing } from '@/onboarding/client/vision/pacing'
import { createVisionSession, type VisionUpdate } from '@/onboarding/client/vision/session'
import type { LandmarkSource } from '@/onboarding/client/vision/source'
import type { LandmarkSample } from '@/onboarding/client/vision/types'
import { baseSample, withFace } from './vision-fixtures'

describe('nextPacing', () => {
  it('steps down fps, then hands, then turns off', () => {
    let p = initialPacing(true)
    expect(nextPacing(p, 50)).toBe(p)
    p = nextPacing(p, 80)
    expect(p).toEqual({ fps: 5, hands: true, off: false })
    p = nextPacing(p, 150)
    expect(p).toEqual({ fps: 5, hands: false, off: false })
    expect(nextPacing(p, 150)).toEqual({ fps: 5, hands: false, off: true })
  })
})

function fakeSource(o: { inferenceMs?: (tier: PoseTier) => number; sampleAt?: (tMs: number) => LandmarkSample; failInit?: boolean } = {}) {
  const calls = { inits: [] as PoseTier[], frames: 0, disposed: false }
  let tier: PoseTier = 'heavy'
  const source: LandmarkSource = {
    async init(x) {
      if (o.failInit) throw new Error('model failed to load')
      tier = x.tier
      calls.inits.push(x.tier)
    },
    async process(_frame, tMs) {
      calls.frames++
      return { sample: (o.sampleAt ?? baseSample)(tMs), inferenceMs: o.inferenceMs?.(tier) ?? 10 }
    },
    dispose() { calls.disposed = true },
  }
  return { source, calls }
}

const yieldTask = () => new Promise<void>((r) => setImmediate(r))
async function until(cond: () => boolean) {
  for (let i = 0; i < 100000 && !cond(); i++) await yieldTask()
  if (!cond()) throw new Error('condition never met')
}

function setup(o: Parameters<typeof fakeSource>[0] & { enableHands?: boolean; consent?: boolean } = {}) {
  const { source, calls } = fakeSource(o)
  let now = 0
  const updates: VisionUpdate[] = []
  const uploader = { push: vi.fn(), flush: vi.fn(async () => {}) }
  const session = createVisionSession({
    video: {} as HTMLVideoElement,
    clock: () => (now += 100),
    recordingId: 'rec',
    consent: o.consent ?? true,
    enableHands: o.enableHands ?? true,
    source,
    uploader,
    grabFrame: async () => ({ close() {} }) as unknown as ImageBitmap,
    sleep: yieldTask,
    onUpdate: (u) => updates.push(u),
  })
  return { session, calls, updates, uploader }
}

describe('createVisionSession', () => {
  it('refuses to start without consent', () => {
    expect(() => setup({ consent: false })).toThrow(/consent/)
  })

  it('benchmarks tiers and keeps the first one that is fast enough', async () => {
    const { session, calls, updates } = setup({ inferenceMs: (t) => (t === 'heavy' ? 50 : 30) })
    await session.start()
    await until(() => calls.frames > 60)
    await session.stop()
    expect(calls.inits).toEqual(['heavy', 'full'])
    expect(updates.at(-1)!.tier).toBe('full')
  })

  it('uploads finalised events while running and returns a summary on stop', async () => {
    const sampleAt = (t: number) => (t >= 5000 && t < 8000 ? withFace(baseSample(t), { yawDeg: 40 }) : baseSample(t))
    const { session, calls, uploader } = setup({ sampleAt })
    await session.start()
    await until(() => calls.frames >= 200)
    const pushedWhileRunning = uploader.push.mock.calls.flat(2)
    const summary = await session.stop()
    expect(pushedWhileRunning.some((o) => o.kind === 'head_turn_away')).toBe(true)
    expect(summary.status).toBe('ready')
    expect(summary.events.map((e) => e.kind)).toContain('head_turn_away')
    expect(uploader.flush).toHaveBeenCalled()
    expect(calls.disposed).toBe(true)
  })

  it('turns visual analysis off on a device that cannot keep up', async () => {
    const { session, updates } = setup({ inferenceMs: () => 200 })
    await session.start()
    await until(() => updates.some((u) => u.status === 'off'))
    expect(updates.at(-1)).toMatchObject({ status: 'off', offReason: 'device_too_slow', pacing: { off: true } })
    await session.stop()
  })

  it('reports model_failed without throwing when models cannot load', async () => {
    const { session, updates } = setup({ failInit: true })
    await session.start()
    await until(() => updates.some((u) => u.status === 'off'))
    const summary = await session.stop()
    expect(summary).toMatchObject({ status: 'unavailable', unavailableReason: 'model_failed' })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/intake/vision-session.test.ts`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement**

`src/onboarding/client/vision/pacing.ts`:
```ts
export type Pacing = { fps: 10 | 5; hands: boolean; off: boolean }

export const initialPacing = (enableHands: boolean): Pacing => ({ fps: 10, hands: enableHands, off: false })

/** Inference must fit in this share of the frame interval, leaving room for the call itself. */
const BUDGET_SHARE = 0.6

export function nextPacing(p: Pacing, p95Ms: number): Pacing {
  if (p.off || p95Ms <= (1000 / p.fps) * BUDGET_SHARE) return p
  if (p.fps === 10) return { ...p, fps: 5 }
  if (p.hands) return { ...p, hands: false }
  return { ...p, off: true }
}
```

`src/onboarding/client/vision/session.ts`:
```ts
import { detectAll } from './detect'
import { modelVersion, type PoseTier } from './models'
import { initialPacing, nextPacing, type Pacing } from './pacing'
import { createWorkerSource, type LandmarkSource } from './source'
import { p95 } from './stats'
import { summarize } from './summary'
import { THRESHOLDS, type Thresholds } from './thresholds'
import type { LandmarkSample, Observation, UnavailableReason, VisualSummary } from './types'
import type { EventsUploader } from './upload'
import type { HandsMode } from './worker-protocol'

export type VisionStatus = 'starting' | 'running' | 'stopped' | 'off'
export type VisionUpdate = {
  status: VisionStatus
  tier: PoseTier | null
  pacing: Pacing
  observations: Observation[]
  validMs: number
  observedMs: number
  offReason: UnavailableReason | null
}

export type VisionSessionOptions = {
  /** Local camera preview. Owned by the caller, who also stops its tracks. */
  video: HTMLVideoElement
  /** Recording-relative clock shared with audio capture (ms). */
  clock: () => number
  recordingId: string
  /** visualAnalysis consent. Without it no session may exist. */
  consent: boolean
  enableHands: boolean
  signal?: AbortSignal
  source?: LandmarkSource
  uploader?: Pick<EventsUploader, 'push' | 'flush'>
  grabFrame?: (video: HTMLVideoElement) => Promise<ImageBitmap | null>
  sleep?: (ms: number) => Promise<void>
  onUpdate?: (u: VisionUpdate) => void
  /** Debug/calibration only (demo page). */
  onSample?: (s: LandmarkSample) => void
  thresholds?: Thresholds
}

export type VisionSession = {
  start(): Promise<void>
  stop(): Promise<VisualSummary>
  getSamples(): LandmarkSample[]
  getObservations(): Observation[]
}

const TIER_LIMITS: readonly (readonly [PoseTier, number])[] = [['heavy', 40], ['full', 70]]
const BENCHMARK_FRAMES = 20
const UPDATE_EVERY_MS = 1000
/** Events ending this long ago will not grow any more and are safe to upload. */
const FINALIZE_LAG_MS = 3000

const defaultGrab = async (video: HTMLVideoElement) => (video.readyState >= 2 ? createImageBitmap(video) : null)
const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

export function createVisionSession(o: VisionSessionOptions): VisionSession {
  if (!o.consent) throw new Error('visual analysis requires visualAnalysis consent')
  const t = o.thresholds ?? THRESHOLDS
  const grab = o.grabFrame ?? defaultGrab
  const sleep = o.sleep ?? defaultSleep

  const samples: LandmarkSample[] = []
  let source: LandmarkSource | null = null
  let tier: PoseTier | null = null
  let pacing = initialPacing(o.enableHands)
  let status: VisionStatus = 'starting'
  let offReason: UnavailableReason | null = null
  let running = false
  let loop: Promise<void> | null = null
  let lastT = -1
  let frameIndex = 0
  let lastUpdateT = 0
  let observations: Observation[] = []

  const detect = () => detectAll(samples, {
    recordingId: o.recordingId, modelVersion: modelVersion(tier ?? 'lite', t.version), handsEnabled: o.enableHands, thresholds: t,
  })

  function emit(validMs = 0, observedMs = 0) {
    o.onUpdate?.({ status, tier, pacing, observations, validMs, observedMs, offReason })
  }

  async function step(): Promise<number | null> {
    const frame = await grab(o.video)
    if (!frame) return null
    if (!source) {
      frame.close()
      return null
    }
    const tMs = Math.max(o.clock(), lastT + 1)
    lastT = tMs
    const hands: HandsMode = !pacing.hands ? 'off' : frameIndex++ % 2 === 0 ? 'run' : 'reuse'
    const { sample, inferenceMs } = await source.process(frame, tMs, hands)
    samples.push(sample)
    if (samples.length > t.maxSamples) samples.shift()
    o.onSample?.(sample)
    return inferenceMs
  }

  async function pickTier(): Promise<PoseTier> {
    for (const [candidate, limit] of TIER_LIMITS) {
      await source!.init({ tier: candidate, enableHands: o.enableHands })
      tier = candidate
      const times: number[] = []
      for (let attempts = 0; running && times.length < BENCHMARK_FRAMES && attempts < BENCHMARK_FRAMES * 5; attempts++) {
        const ms = await step()
        if (ms === null) await sleep(50)
        else times.push(ms)
      }
      if (times.length > 0 && p95(times) < limit) return candidate
    }
    await source!.init({ tier: 'lite', enableHands: o.enableHands })
    return 'lite'
  }

  function goOff(reason: UnavailableReason) {
    status = 'off'
    offReason = reason
    running = false
    source?.dispose()
    source = null
    emit()
  }

  async function run() {
    try {
      source = o.source ?? createWorkerSource()
      tier = await pickTier()
    } catch (err) {
      if (!running) return
      console.error('vision: model init failed', err)
      return goOff('model_failed')
    }
    if (!running) return
    status = 'running'
    emit()
    let recent: number[] = []
    while (running) {
      const started = performance.now()
      let ms: number | null
      try {
        ms = await step()
      } catch (err) {
        if (!running) return
        console.error('vision: frame failed', err)
        return goOff('model_failed')
      }
      if (ms !== null) {
        recent.push(ms)
        if (recent.length >= pacing.fps) {
          const next = nextPacing(pacing, p95(recent))
          recent = []
          if (next !== pacing) {
            pacing = next
            if (pacing.off) return goOff('device_too_slow')
          }
        }
      }
      if (lastT - lastUpdateT >= UPDATE_EVERY_MS) {
        lastUpdateT = lastT
        const { qualified, observations: next } = detect()
        observations = next
        o.uploader?.push(observations.filter((x) => x.unit === 'ms' && x.endMs < lastT - FINALIZE_LAG_MS))
        const validMs = qualified.reduce((s, x) => s + (x.valid ? x.durMs : 0), 0)
        const observedMs = qualified.reduce((s, x) => s + x.durMs, 0)
        emit(validMs, observedMs)
      }
      await sleep(Math.max(0, 1000 / pacing.fps - (performance.now() - started)))
    }
  }

  async function stop(): Promise<VisualSummary> {
    running = false
    source?.dispose()
    source = null
    await loop
    if (status !== 'off') status = 'stopped'
    const { qualified, observations: finalObs } = detect()
    observations = finalObs
    if (o.uploader) {
      o.uploader.push(finalObs)
      await o.uploader.flush()
    }
    emit()
    if (samples.length === 0) {
      return { status: 'unavailable', validMs: 0, observedMs: 0, coverage: 0, unavailableReason: offReason ?? 'camera_off', events: [], metrics: [] }
    }
    return summarize(qualified, finalObs, t)
  }

  return {
    async start() {
      if (loop) throw new Error('vision session already started')
      running = true
      emit()
      o.signal?.addEventListener('abort', () => void stop(), { once: true })
      loop = run()
    },
    stop,
    getSamples: () => [...samples],
    getObservations: () => [...observations],
  }
}
```

- [ ] **Step 4: Run tests and typecheck**

Run: `npx vitest run tests/intake/vision-session.test.ts && npm run typecheck`
Expected: all PASS; typecheck exit 0.

- [ ] **Step 5: Run the whole intake suite**

Run: `npm run test:intake`
Expected: every vision test file PASS, 0 failures.

- [ ] **Step 6: Commit**

```bash
git add src/onboarding/client/vision/{pacing,session}.ts tests/intake/vision-session.test.ts
git commit -m "feat(vision): add the vision session with tier selection and backoff"
```

---

### Task 14: Demo page, evaluation harness and live calibration

**Files:**
- Create: `src/onboarding/client/vision/eval.ts`, `scripts/vision-eval.ts`, `dev/vision-demo/{index.html,main.tsx,theme.css,vite.config.ts}`
- Modify (only if calibration requires): `src/onboarding/client/vision/geometry.ts` (`PITCH_SIGN`, `GAZE_H_SIGN`)
- Test: `tests/intake/vision-eval.test.ts`

**Interfaces:**
- Produces: `LabelledClipSchema`, `type LabelledClip`, `type KindScore = { kind; tp; fp; fn; precision: number | null; recall: number | null }`, `scoreClips(clips, { handsEnabled, thresholds? }): KindScore[]`.

- [ ] **Step 1: Write the failing test**

`tests/intake/vision-eval.test.ts`:
```ts
import { describe, expect, it } from 'vitest'
import { scoreClips } from '@/onboarding/client/vision/eval'
import { timeline, withFace } from './vision-fixtures'

describe('scoreClips', () => {
  it('counts matched, spurious and missed events per kind', () => {
    const samples = timeline(0, 20000, 100, (s) =>
      (s.tMs >= 3000 && s.tMs < 6000) || (s.tMs >= 12000 && s.tMs < 15000) ? withFace(s, { yawDeg: 40 }) : s)
    const scores = scoreClips([{
      name: 'c1', samples,
      labels: [
        { kind: 'head_turn_away', startMs: 3200, endMs: 5800 },
        { kind: 'head_down', startMs: 9000, endMs: 11000 },
      ],
    }], { handsEnabled: true })
    expect(scores.find((s) => s.kind === 'head_turn_away')).toMatchObject({ tp: 1, fp: 1, fn: 0, precision: 0.5, recall: 1 })
    expect(scores.find((s) => s.kind === 'head_down')).toMatchObject({ tp: 0, fp: 0, fn: 1, precision: null, recall: 0 })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/intake/vision-eval.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement eval and the CLI**

`src/onboarding/client/vision/eval.ts`:
```ts
import { z } from 'zod'
import { detectAll } from './detect'
import type { Thresholds } from './thresholds'
import { EVENT_KINDS, LandmarkSampleSchema, type EventKind } from './types'

export const LabelledClipSchema = z.strictObject({
  name: z.string(),
  samples: z.array(LandmarkSampleSchema),
  labels: z.array(z.strictObject({ kind: z.enum(EVENT_KINDS), startMs: z.number(), endMs: z.number() })),
})
export type LabelledClip = z.infer<typeof LabelledClipSchema>
export type KindScore = { kind: EventKind; tp: number; fp: number; fn: number; precision: number | null; recall: number | null }

/** A prediction matches an unused label of the same kind when their intervals overlap. */
export function scoreClips(clips: readonly LabelledClip[], o: { handsEnabled: boolean; thresholds?: Thresholds }): KindScore[] {
  const counts = new Map(EVENT_KINDS.map((k) => [k, { tp: 0, fp: 0, fn: 0 }]))
  for (const clip of clips) {
    const { observations } = detectAll(clip.samples, { recordingId: clip.name, modelVersion: 'eval', ...o })
    for (const kind of EVENT_KINDS) {
      const c = counts.get(kind)!
      const labels = clip.labels.filter((l) => l.kind === kind)
      const used = new Set<number>()
      for (const p of observations.filter((x) => x.kind === kind)) {
        const i = labels.findIndex((l, j) => !used.has(j) && l.startMs < p.endMs && l.endMs > p.startMs)
        if (i >= 0) {
          used.add(i)
          c.tp++
        } else c.fp++
      }
      c.fn += labels.length - used.size
    }
  }
  return EVENT_KINDS.map((kind) => {
    const { tp, fp, fn } = counts.get(kind)!
    return { kind, tp, fp, fn, precision: tp + fp ? tp / (tp + fp) : null, recall: tp + fn ? tp / (tp + fn) : null }
  })
}
```

`scripts/vision-eval.ts`:
```ts
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { LabelledClipSchema, scoreClips } from '../src/onboarding/client/vision/eval'

const dir = process.argv[2]
if (!dir) throw new Error('usage: npm run vision:eval -- <folder of labelled clip .json files, kept outside git>')
const handsEnabled = !process.argv.includes('--no-hands')

const files = (await readdir(dir)).filter((f) => f.endsWith('.json'))
const clips = await Promise.all(files.map(async (f) => LabelledClipSchema.parse(JSON.parse(await readFile(path.join(dir, f), 'utf8')))))
const scores = scoreClips(clips, { handsEnabled })
const fmt = (v: number | null) => (v === null ? '   –' : v.toFixed(2))

console.log(`${clips.length} clips\nkind                 tp   fp   fn  precision  recall`)
for (const s of scores) {
  const flag = s.precision !== null && s.precision < 0.9 ? '  ← below 0.90, disable this kind' : ''
  console.log(`${s.kind.padEnd(20)} ${String(s.tp).padStart(3)}  ${String(s.fp).padStart(3)}  ${String(s.fn).padStart(3)}  ${fmt(s.precision).padStart(9)}  ${fmt(s.recall).padStart(6)}${flag}`)
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/intake/vision-eval.test.ts`
Expected: PASS.

- [ ] **Step 5: Demo page**

`dev/vision-demo/vite.config.ts`:
```ts
import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const repo = fileURLToPath(new URL('../..', import.meta.url))

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  publicDir: `${repo}/public`,
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': `${repo}/src` } },
  server: { fs: { allow: [repo] } },
  worker: { format: 'es' },
})
```

`dev/vision-demo/index.html`:
```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Vision Demo</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter+Tight:wght@600;700&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@500&display=swap" />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="./main.tsx"></script>
  </body>
</html>
```

`dev/vision-demo/theme.css` (temporary stand-in for B's Tailwind token mapping; values from `brandbook.html`):
```css
@import "tailwindcss";
@source "../../src";
@source "./";

:root {
  --paper: #f4f6f8; --raised: #ffffff; --line: #dce1e7; --ink: #101820; --muted: #5a6674;
  --hold: #1b4dff; --on-hold: #ffffff; --hold-tint: #e4ebff; --won: #0e7a3e; --gap: #b45309;
  --font-display-stack: "Inter Tight", Inter, "Helvetica Neue", Arial, sans-serif;
  --font-sans-stack: Inter, "Helvetica Neue", Arial, sans-serif;
  --font-mono-stack: "JetBrains Mono", ui-monospace, Menlo, monospace;
  color-scheme: light;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --paper: #0c1218; --raised: #151d26; --line: #26303b; --ink: #eef1f5; --muted: #9aa6b4;
    --hold: #6c8bff; --on-hold: #0c1218; --hold-tint: #1a2646; --won: #3dd68c; --gap: #ffb454;
    color-scheme: dark;
  }
}

@theme inline {
  --color-paper: var(--paper); --color-raised: var(--raised); --color-line: var(--line);
  --color-ink: var(--ink); --color-muted: var(--muted); --color-hold: var(--hold);
  --color-on-hold: var(--on-hold); --color-hold-tint: var(--hold-tint); --color-won: var(--won); --color-gap: var(--gap);
  --font-display: var(--font-display-stack); --font-sans: var(--font-sans-stack); --font-mono: var(--font-mono-stack);
}

body { margin: 0; background: var(--paper); color: var(--ink); font-family: var(--font-sans-stack); }
:focus-visible { outline: 2px solid var(--hold); outline-offset: 2px; }
```

`dev/vision-demo/main.tsx`:
```tsx
import { StrictMode, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './theme.css'
import { alignMoments } from '@/onboarding/client/vision/align'
import { describe } from '@/onboarding/client/vision/copy'
import { createMockEventsServer } from '@/onboarding/client/vision/mock-events'
import { createVisionSession, type VisionSession, type VisionUpdate } from '@/onboarding/client/vision/session'
import type { LandmarkSample, Moment, SpeechTurn, VisualSummary } from '@/onboarding/client/vision/types'
import { createEventsUploader } from '@/onboarding/client/vision/upload'
import { VisualReport } from '@/onboarding/ui/VisualReport'

type Live = { session: VisionSession; stream: MediaStream; t0: number; turns: SpeechTurn[]; speakingSince: number | null; server: ReturnType<typeof createMockEventsServer> }

function App() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const live = useRef<Live | null>(null)
  const [consent, setConsent] = useState(false)
  const [hands, setHands] = useState(true)
  const [update, setUpdate] = useState<VisionUpdate | null>(null)
  const [last, setLast] = useState<LandmarkSample | null>(null)
  const [summary, setSummary] = useState<VisualSummary | null>(null)
  const [moments, setMoments] = useState<Moment[]>([])
  const [batches, setBatches] = useState(0)
  const [error, setError] = useState<string | null>(null)

  async function start() {
    setSummary(null)
    setError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 360 }, audio: false })
      const video = videoRef.current!
      video.srcObject = stream
      await video.play()
      const t0 = performance.now()
      const server = createMockEventsServer()
      const uploader = createEventsUploader({ intakeId: 'demo', consentVersion: 1, fetchImpl: server.fetchImpl, onError: (e) => console.warn(e) })
      let lastUi = 0
      const session = createVisionSession({
        video, clock: () => performance.now() - t0, recordingId: 'demo-recording', consent, enableHands: hands, uploader,
        onUpdate: (u) => { setUpdate(u); setBatches(server.batches.length) },
        onSample: (s) => { if (s.tMs - lastUi > 200) { lastUi = s.tMs; setLast(s) } },
      })
      live.current = { session, stream, t0, turns: [], speakingSince: null, server }
      await session.start()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  async function stop() {
    const l = live.current
    if (!l) return
    const s = await l.session.stop()
    l.stream.getTracks().forEach((track) => track.stop())
    setSummary(s)
    setMoments(alignMoments(l.session.getObservations(), l.turns, l.turns.slice(-1).map((t) => t.turnId)))
    setBatches(l.server.batches.length)
  }

  const speaking = (down: boolean) => {
    const l = live.current
    if (!l) return
    const now = performance.now() - l.t0
    if (down) l.speakingSince = now
    else if (l.speakingSince !== null) {
      l.turns.push({ turnId: `turn-${l.turns.length + 1}`, t0Ms: l.speakingSince, t1Ms: now })
      l.speakingSince = null
    }
  }

  function download() {
    const l = live.current
    if (!l) return
    const clip = { name: `clip-${Date.now()}`, samples: l.session.getSamples(), labels: [] }
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([JSON.stringify(clip)], { type: 'application/json' }))
    a.download = `${clip.name}.json`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const events = (update?.observations ?? []).filter((o) => o.unit === 'ms').slice(-5)
  const btn = 'h-11 rounded-md px-4 font-semibold'

  return (
    <main className="mx-auto max-w-5xl px-4 py-6">
      <h1 className="font-display text-2xl font-bold">Body language: on-device demo</h1>
      <p className="mt-1 text-sm text-muted">Frames are analysed in this browser. Nothing but observations reaches the mock endpoint.</p>

      <div className="mt-4 flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2"><input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} /> Analyse my camera on this device</label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={hands} onChange={(e) => setHands(e.target.checked)} /> Hand tracking</label>
        <button className={`${btn} bg-hold text-on-hold disabled:opacity-50`} disabled={!consent || update?.status === 'running'} onClick={start}>Start</button>
        <button className={`${btn} border border-line bg-raised`} onClick={stop}>Stop</button>
        <button className={`${btn} border border-line bg-raised`} onPointerDown={() => speaking(true)} onPointerUp={() => speaking(false)}>Hold while speaking</button>
        <button className={`${btn} border border-line bg-raised`} onClick={download}>Download clip</button>
      </div>
      {error && <p className="mt-2 text-gap">{error}</p>}

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <video ref={videoRef} muted playsInline className="w-full rounded-lg border border-line" style={{ transform: 'scaleX(-1)' }} />
        <div className="rounded-lg border border-line bg-raised p-4 font-mono text-sm">
          <div>status {update?.status ?? '–'} · tier {update?.tier ?? '–'} · {update?.pacing.fps ?? '–'} fps · hands {String(update?.pacing.hands ?? '–')}</div>
          <div>valid {Math.round((update?.validMs ?? 0) / 1000)} s / {Math.round((update?.observedMs ?? 0) / 1000)} s{update?.offReason ? ` · off: ${update.offReason}` : ''}</div>
          <div>yaw {last?.face?.yawDeg.toFixed(0) ?? '–'}° · pitch {last?.face?.pitchDeg.toFixed(0) ?? '–'}° · gaze h {last?.face?.gaze?.h.toFixed(2) ?? '–'} v {last?.face?.gaze?.v.toFixed(2) ?? '–'}</div>
          <div>faces {last?.faces ?? '–'} · poses {last?.poses ?? '–'} · luma {last?.luma.toFixed(0) ?? '–'} · open palms {last?.hands?.filter((h) => h.openPalm).length ?? '–'}/{last?.hands?.length ?? '–'}</div>
          <div>mock batches received {batches}</div>
          <ul className="mt-2 font-sans">{events.map((o) => <li key={o.id}>{describe(o)}</li>)}</ul>
        </div>
      </div>

      {summary && <div className="mt-6"><VisualReport summary={summary} moments={moments} /></div>}
    </main>
  )
}

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>)
```

- [ ] **Step 6: Typecheck and start the demo**

Run: `npm run typecheck && npm run vision:demo`
Expected: typecheck exit 0; Vite prints a local URL. Open it in Chrome.

- [ ] **Step 7: Live calibration (record results in the commit message)**

With consent ticked and Start pressed, wait for `status running` and a tier:
1. Look straight at the camera: yaw and pitch within ±10°, gaze h/v within ±0.3.
2. Look down at the keyboard: pitch must go **negative**. If positive, set `PITCH_SIGN = -1` in `geometry.ts`.
3. Turn your head to your left, then look at the far left of the screen with eyes only: yaw and gaze h must have the **same** sign. If opposite, set `GAZE_H_SIGN = -1`.
4. Raise your right hand, palm to the camera, fingers spread: open palms 1/1. Turn the back of the hand to the camera: 0/1. If inverted, swap the `isRightHand` mapping in `extract.ts` and its unit test, and note why in the code comment.
5. Turn your head away for 3 s: within ~4 s, "Head turned away for ~3 s at m:ss" appears in the list.
6. Hold "Hold while speaking" for a few seconds while touching your face, then Stop: the report shows a "While you spoke" moment with "hand near face".
7. Cover the camera for 10 s: valid time stops growing; after Stop the report says why coverage was short.
8. Ask someone to step into frame: `faces 2`; no new events are created while they are in view.

Re-run `npm run test:intake` after any constant change. Expected: all PASS.

- [ ] **Step 8: Privacy and lifecycle checks**

In Chrome DevTools → Network, with "All" selected, run a 30 s session and Stop:
- Only requests to `/intake/models/*`, `/intake/wasm/*` and fonts appear. No request carries image or video data (the mock uploader uses an in-page `fetch`, so it appears nowhere).
- In DevTools → Sources → Threads, the `worker.ts` thread disappears after Stop.
- The camera indicator in the browser goes off after Stop.

Repeat Steps 7–8 in Safari on macOS. If the worker fails to start (status `off`, reason `model_failed`, console shows a MediaPipe loader error), change the default in `session.ts` from `createWorkerSource()` to: worker first, and on init failure dispose it and retry with `createMainThreadSource()`; add a session test for that fallback with a fake source whose first `init` throws.

- [ ] **Step 9: Commit**

```bash
git add src/onboarding/client/vision/eval.ts scripts/vision-eval.ts dev/vision-demo tests/intake/vision-eval.test.ts src/onboarding/client/vision/geometry.ts src/onboarding/client/vision/extract.ts tests/intake/vision-extract.test.ts
git commit -m "feat(vision): add demo page and evaluation harness

Calibration on <browser/OS>: PITCH_SIGN=<value>, GAZE_H_SIGN=<value>, open palm mapping <ok|swapped>."
```

(Fill the three values in from Step 7 before committing.)

---

## After this plan

- **Labelled clips (acceptance, plan 4 §6):** record ≥ 30 clips with "Download clip" from volunteers who consent, label events by hand in each JSON, keep them outside git, run `npm run vision:eval -- <folder>`. Disable every kind with precision < 0.90 by removing it from the report (not by adding a disclaimer). Hand-derived kinds stay off by default (`enableHands: false` in D3's call UI) until they pass.
- **Hand-off to teammates:** D3's call UI calls `createVisionSession` after the lobby consent and renders `VisualReport` in the review; B implements `POST /api/intake/:id/events` matching `EventsBatchSchema` and folds `package.json` / `vitest.config.ts` / the demo's Tailwind tokens into the Next.js scaffold, running `npm run vision:assets` in the build.
