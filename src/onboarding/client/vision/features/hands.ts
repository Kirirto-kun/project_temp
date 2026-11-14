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
