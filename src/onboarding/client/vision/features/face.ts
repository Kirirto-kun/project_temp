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
