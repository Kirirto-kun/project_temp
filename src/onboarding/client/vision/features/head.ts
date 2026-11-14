import { gazeOnScreen } from '../geometry'
import { eventObservation, shareMetric, type Ctx } from '../observation'
import type { Qualified } from '../quality'
import { sustainedRuns, whenValid, type Test } from '../runs'
import type { Thresholds } from '../thresholds'
import type { Observation } from '../types'
import { bodyGeom, bodyReferences, neckClosure } from './body'

export function detectHead(q: readonly Qualified[], t: Thresholds, ctx: Ctx): Observation[] {
  const refs = bodyReferences(q, t)
  /** Body geometry and its reference where the frame shows one person, with or without a tracked face. */
  const body = (x: Qualified) => {
    if (!(x.valid || (x.reason === 'no_face' && x.s.poses === 1))) return null
    const g = bodyGeom(x.s, t)
    const ref = refs.get(x.segment)
    return g && ref ? { g, ref } : null
  }
  const either = (a: boolean | null, b: boolean | null) => (a === true || b === true ? true : a === null && b === null ? null : false)

  const turnedAway: Test = (x) => {
    if (x.valid) return x.s.face ? Math.abs(x.s.face.yawDeg) > t.headTurnYawDeg : null
    // Face models drop a face turned far away; the nose moving sideways over the shoulders stands in for yaw.
    const b = body(x)
    if (!b || b.g.noseX === null || b.ref.noseX === null) return null
    return Math.abs(b.g.noseX - b.ref.noseX) > t.headTurnNoseOffsetWidths
  }
  // Face pitch saturates and jumps around at steep angles, so the nose dropping toward the shoulder
  // line (and not the shoulders rising) counts as looking down whether or not the face is tracked.
  const lookingDown: Test = (x) => {
    const byFace = x.valid && x.s.face ? x.s.face.pitchDeg < t.headDownPitchDeg : null
    const b = body(x)
    const c = b ? neckClosure(b.g, b.ref, t) : null
    return either(byFace, c === null ? null : c === 'head_drop')
  }
  // Out of frame means nobody is there; a lost face over a visible body is unknown, not absent.
  const outOfFrame: Test = (x) =>
    x.reason === 'no_face' ? (x.s.poses === 0 || !bodyGeom(x.s, t) ? true : null) : x.valid ? false : null
  const onScreen = whenValid((x) => (x.s.face ? gazeOnScreen(x.s.face, t) : null))
  return [
    ...sustainedRuns(q, turnedAway, t.headTurnMinMs).map((r) => eventObservation(ctx, 'head_turn_away', r)),
    ...sustainedRuns(q, lookingDown, t.headDownMinMs).map((r) => eventObservation(ctx, 'head_down', r)),
    ...sustainedRuns(q, outOfFrame, t.outOfFrameMinMs).map((r) => eventObservation(ctx, 'out_of_frame', r)),
    shareMetric(ctx, 'gaze_on_screen_share', q, onScreen, t, 'not_enough_valid_time'),
  ]
}
