import { describe, expect, it } from 'vitest'
import { alignMoments } from '@/onboarding/client/vision/align'
import { detectAll } from '@/onboarding/client/vision/detect'
import { summarize } from '@/onboarding/client/vision/summary'
import { THRESHOLDS as T } from '@/onboarding/client/vision/thresholds'
import type { LandmarkSample } from '@/onboarding/client/vision/types'
import { timeline, withFace } from './vision-fixtures'

const opts = { recordingId: 'rec', modelVersion: 'v', handsEnabled: true }
const run = (samples: LandmarkSample[]) => {
  const { qualified, observations } = detectAll(samples, opts)
  return summarize(qualified, observations, T)
}
const turnAt = (from: number, to: number) => (s: LandmarkSample) => (s.tMs >= from && s.tMs < to ? withFace(s, { yawDeg: 40 }) : s)

describe('summarize', () => {
  it('is ready with ≥10 s valid and ≥70% coverage', () => {
    const s = run(timeline(0, 20000, 100, turnAt(5000, 8000)))
    expect(s.status).toBe('ready')
    expect(s.events.map((e) => e.kind)).toEqual(['head_turn_away'])
    expect(s.metrics.length).toBeGreaterThan(0)
  })

  it('is partial when coverage is below 70% but a clear event exists', () => {
    const s = run(timeline(0, 30000, 100, (x) => (x.tMs >= 10000 ? { ...x, luma: 5 } : turnAt(2000, 5000)(x))))
    expect(s.status).toBe('partial')
    expect(s.unavailableReason).toBe('too_dark')
    expect(s.events).toHaveLength(1)
    expect(s.metrics).toEqual([])
  })

  it('is unavailable at 9 s of valid time with no events', () => {
    const s = run(timeline(0, 9100, 100))
    expect(s).toMatchObject({ status: 'unavailable', unavailableReason: 'not_enough_valid_time', events: [] })
  })
})

describe('alignMoments', () => {
  const { observations } = detectAll(timeline(0, 30000, 100, (s) => turnAt(4000, 7000)(turnAt(20000, 23000)(s))), opts)
  const turns = [
    { turnId: 'a', t0Ms: 3000, t1Ms: 8000 },
    { turnId: 'b', t0Ms: 10000, t1Ms: 15000 },
    { turnId: 'ask', t0Ms: 19000, t1Ms: 24000 },
  ]

  it('keeps turns with overlapping events, key turns first', () => {
    const m = alignMoments(observations, turns, ['ask'])
    expect(m.map((x) => x.turnId)).toEqual(['ask', 'a'])
    expect(m[0]!.isKey).toBe(true)
    expect(m[0]!.observations.map((o) => o.kind)).toEqual(['head_turn_away'])
  })

  it('never returns more than max moments and ignores metrics', () => {
    expect(alignMoments(observations, turns, [], 1)).toHaveLength(1)
    expect(alignMoments(observations, turns).flatMap((m) => m.observations).every((o) => o.unit === 'ms')).toBe(true)
  })
})
