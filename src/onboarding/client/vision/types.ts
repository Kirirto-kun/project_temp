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

/**
 * One analysed frame. `hands` is null when hand tracking did not run for this frame.
 * `handsFresh` is true iff `hands` came from a hand-landmarker detection on this very frame
 * (false when reused from an earlier frame, and whenever `hands` is null).
 */
export const LandmarkSampleSchema = z.strictObject({
  tMs: z.number().nonnegative(),
  luma: z.number().min(0).max(255),
  faces: z.number().int().nonnegative(),
  poses: z.number().int().nonnegative(),
  face: FaceSchema.nullable(),
  pose: PoseSchema.nullable(),
  hands: z.array(HandSchema).max(2).nullable(),
  handsFresh: z.boolean(),
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
