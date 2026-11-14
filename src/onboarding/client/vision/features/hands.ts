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

  // Hands were requested but no frame ever ran the hand landmarker (e.g. pacing switched it off).
  const palm = handsEnabled && q.some((x) => x.s.hands)
    ? shareMetric(ctx, 'open_palm_share', q, openPalm, t, 'limbs_not_visible')
    : metricObservation(ctx, 'open_palm_share', windowOf(q), null, 'ratio', 0, coverage(q).observedMs, 'hands_disabled')

  return [
    ...sustainedRuns(q, nearFace, t.handToFaceMinMs).map((r) => eventObservation(ctx, 'hand_to_face', r)),
    shareMetric(ctx, 'hands_visible_share', q, visible, t, 'limbs_not_visible'),
    gestureActivity(q, t, ctx),
    palm,
  ]
}

/**
 * Bursts of fast hand movement per minute of hands-visible time.
 * Hand-landmarker positions are only comparable between frames where the landmarker really ran
 * (reused frames repeat the previous result), so speed is measured between consecutive fresh frames.
 * Pose-wrist fallback (no hand-landmarker data) uses every frame.
 */
function gestureActivity(q: readonly Qualified[], t: Thresholds, ctx: Ctx): Observation {
  let visibleMs = 0
  const bursts: Run[] = []
  let cur: Run | null = null
  let lastFresh: { tMs: number; pts: Vec[] } | null = null
  // Fresh frames are normally every other frame, so allow twice the usual gap between them.
  const maxFreshGapMs = t.maxSampleGapMs * 2
  q.forEach((b, i) => {
    const pb = b.valid ? handPoints(b.s, t) : null
    if (!pb || pb.length === 0) {
      lastFresh = null
      return
    }
    visibleMs += b.durMs
    let from: { tMs: number; pts: Vec[] } | null = null
    let maxGapMs = t.maxSampleGapMs
    if (b.s.hands) {
      if (!b.s.handsFresh) return
      from = lastFresh
      maxGapMs = maxFreshGapMs
      lastFresh = { tMs: b.s.tMs, pts: pb }
    } else {
      lastFresh = null
      const a = q[i - 1]
      const pa = a?.valid && !a.s.hands ? handPoints(a.s, t) : null
      if (a && pa) from = { tMs: a.s.tMs, pts: pa }
    }
    if (!from || from.pts.length !== pb.length) return
    const dtMs = b.s.tMs - from.tMs
    if (dtMs <= 0 || dtMs > maxGapMs) return
    const speed = Math.max(...pb.map((p) => Math.min(...from.pts.map((o) => dist(p, o))))) / (dtMs / 1000)
    if (speed <= t.gestureSpeed) return
    if (cur && from.tMs - cur.endMs <= t.gestureGapMs) cur.endMs = b.s.tMs
    else {
      if (cur) bursts.push(cur)
      cur = { startMs: from.tMs, endMs: b.s.tMs }
    }
  })
  if (cur) bursts.push(cur)
  const count = bursts.filter((r) => r.endMs - r.startMs >= t.gestureMinMs).length
  const enough = visibleMs >= t.summaryMinValidMs
  return metricObservation(ctx, 'gesture_activity', windowOf(q), enough ? count / (visibleMs / 60000) : null,
    'per_min', visibleMs, coverage(q).observedMs, 'limbs_not_visible')
}
