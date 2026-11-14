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

  it('does not call looking down a shoulder raise', () => {
    const down = (s: LandmarkSample) => withPose(s, { nose: pt(0.5, 0.24) })
    const obs = detectBody(qualify(timeline(0, 15000, 100, during(7000, 9000, down)), T), T, ctx)
    expect(obs.filter((o) => o.kind === 'shoulder_raise')).toHaveLength(0)
  })

  it('ignores shoulder raise while the nose is not visible', () => {
    const raiseHiddenNose = (s: LandmarkSample) =>
      withPose(s, { lShoulder: pt(0.62, 0.31), rShoulder: pt(0.38, 0.31), nose: pt(0.5, 0.18, 0.3) })
    const obs = detectBody(qualify(timeline(0, 15000, 100, during(7000, 9000, raiseHiddenNose)), T), T, ctx)
    expect(obs.filter((o) => o.kind === 'shoulder_raise')).toHaveLength(0)
  })

  it('still reports a posture shift while only the nose is hidden', () => {
    const shiftHiddenNose = (s: LandmarkSample) => {
      const m = shifted(s, 0.07, 0)
      return withPose(m, { nose: pt(m.pose!.nose.x, m.pose!.nose.y, 0.3) })
    }
    const obs = detectBody(qualify(timeline(0, 15000, 100, during(7000, 9500, shiftHiddenNose)), T), T, ctx)
    expect(obs.filter((o) => o.kind === 'posture_shift')).toHaveLength(1)
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
