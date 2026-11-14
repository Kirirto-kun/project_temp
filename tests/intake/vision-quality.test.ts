import { describe, expect, it } from 'vitest'
import { coverage, qualify } from '@/onboarding/client/vision/quality'
import { share, sustainedRuns, whenValid } from '@/onboarding/client/vision/runs'
import { eventObservation, metricObservation, shareMetric, windowOf } from '@/onboarding/client/vision/observation'
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

describe('observation builders', () => {
  const ctx = { recordingId: 'rec', modelVersion: 'test' }

  it('eventObservation derives value and quality from the run', () => {
    const o = eventObservation(ctx, 'head_turn_away', { startMs: 1000, endMs: 3500 })
    expect(o).toMatchObject({
      id: 'head_turn_away:1000', value: 2500, unit: 'ms', direction: null, quality: 1,
      validMs: 2500, observedMs: 2500, unavailableReason: null,
    })
    expect(eventObservation(ctx, 'head_turn_away', { startMs: 1000, endMs: 3500 }, 'closer').direction).toBe('closer')
  })

  it('shareMetric is unavailable below summaryMinValidMs of known time', () => {
    const q = qualify(timeline(0, 5000, 100), T)
    const o = shareMetric(ctx, 'gaze_on_screen_share', q, whenValid(() => true), T, 'not_enough_valid_time')
    expect(o.value).toBeNull()
    expect(o.unavailableReason).toBe('not_enough_valid_time')
  })

  it('shareMetric excludes invalid samples from known time', () => {
    const q = qualify(timeline(0, 20000, 100, (s) => (s.tMs >= 15000 ? { ...s, luma: 5 } : s)), T)
    const o = shareMetric(ctx, 'gaze_on_screen_share', q, whenValid((x) => x.s.tMs < 5000), T, 'not_enough_valid_time')
    expect(o.value).toBeCloseTo(5000 / 15000, 10)
    expect(o.unavailableReason).toBeNull()
    expect(o.quality).toBeCloseTo(15000 / 19900, 10)
    expect(o.validMs).toBe(15000)
    expect(o.observedMs).toBe(19900)
  })

  it('windowOf is empty for no samples and metricObservation gives quality 0 with no observed time', () => {
    expect(windowOf([])).toEqual({ startMs: 0, endMs: 0 })
    const o = metricObservation(ctx, 'smile_share', { startMs: 0, endMs: 0 }, null, 'ratio', 0, 0, 'no_face')
    expect(o.quality).toBe(0)
    expect(o.unavailableReason).toBe('no_face')
  })
})
