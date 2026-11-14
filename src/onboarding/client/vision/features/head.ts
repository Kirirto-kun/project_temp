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
