import { dist, mid, type Vec } from '../geometry'
import { eventObservation, type Ctx } from '../observation'
import type { Qualified } from '../quality'
import { sustainedRuns, whenValid, type Test } from '../runs'
import { avg } from '../stats'
import type { Thresholds } from '../thresholds'
import type { LandmarkSample, Observation } from '../types'

/** neckD: vertical nose-to-shoulder-line distance in shoulder widths (scale-invariant). */
export type BodyGeom = { center: Vec; width: number; neckD: number | null }

export function bodyGeom(s: LandmarkSample, t: Thresholds): BodyGeom | null {
  const p = s.pose
  if (!p || p.lShoulder.v < t.minConfidence || p.rShoulder.v < t.minConfidence) return null
  const width = dist(p.lShoulder, p.rShoulder)
  if (width < t.minShoulderWidth) return null
  const center = mid(p.lShoulder, p.rShoulder)
  const neckD = p.nose.v < t.minConfidence ? null : (center.y - p.nose.y) / width
  return { center, width, neckD }
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
    const necks = items.flatMap((g) => (g.neckD === null ? [] : [g.neckD]))
    refs.set(segment, {
      center: { x: avg(items.map((g) => g.center.x)), y: avg(items.map((g) => g.center.y)) },
      width: avg(items.map((g) => g.width)),
      neckD: necks.length ? avg(necks) : null,
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
    ...sustainedRuns(q, whenValid((x) => {
      const ref = refs.get(x.segment)
      const g = bodyGeom(x.s, t)
      if (!ref || !g || ref.neckD === null || g.neckD === null) return null
      return ref.neckD - g.neckD > t.shoulderRaiseWidths
    }), t.shoulderRaiseMinMs)
      .map((run) => eventObservation(ctx, 'shoulder_raise', run)),
  ].sort((a, b) => a.startMs - b.startMs)
}
