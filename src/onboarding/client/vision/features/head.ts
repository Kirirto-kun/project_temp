import { gazeOnScreen } from '../geometry'
import { eventObservation, shareMetric, type Ctx } from '../observation'
import type { Qualified } from '../quality'
import { sustainedRuns, whenValid, type Test } from '../runs'
import type { Thresholds } from '../thresholds'
import type { Observation } from '../types'
import { bodyGeom, bodyReferences } from './body'

export function detectHead(q: readonly Qualified[], t: Thresholds, ctx: Ctx): Observation[] {
  const refs = bodyReferences(q, t)
  // Face models lose the face at steep pitch. With one body still in view, the nose dropping
  // toward the shoulder line (vs the user's own reference) stands in for pitch.
  const faceLostBody = (x: Qualified) => (x.reason === 'no_face' && x.s.poses === 1 ? bodyGeom(x.s, t) : null)
  const turnedAway = whenValid((x) => (x.s.face ? Math.abs(x.s.face.yawDeg) > t.headTurnYawDeg : null))
  const lookingDown: Test = (x) => {
    if (x.valid) return x.s.face ? x.s.face.pitchDeg < t.headDownPitchDeg : null
    const g = faceLostBody(x)
    const ref = refs.get(x.segment)
    if (!g || g.neckD === null || !ref || ref.neckD === null) return null
    return ref.neckD - g.neckD > t.headDownNeckDropWidths
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
