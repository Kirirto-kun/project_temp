import { describe, expect, it } from 'vitest'
import { detectAll } from '@/onboarding/client/vision/detect'
import { detectFace } from '@/onboarding/client/vision/features/face'
import { qualify } from '@/onboarding/client/vision/quality'
import { THRESHOLDS as T } from '@/onboarding/client/vision/thresholds'
import { EVENT_KINDS, METRIC_KINDS } from '@/onboarding/client/vision/types'
import { timeline, withBlend, withFace } from './vision-fixtures'

const ctx = { recordingId: 'rec', modelVersion: 'test' }
const of = <O extends { kind: string }>(obs: O[], kind: string) => obs.filter((o) => o.kind === kind)

describe('detectFace', () => {
  it('reports brow raises ≥0.5 s and lip presses ≥1 s', () => {
    const obs = detectFace(qualify(timeline(0, 15000, 100, (s) =>
      s.tMs >= 2000 && s.tMs < 2600 ? withBlend(s, { browUp: 0.8 })
      : s.tMs >= 5000 && s.tMs < 5800 ? withBlend(s, { press: 0.9 })
      : s.tMs >= 8000 && s.tMs < 9200 ? withBlend(s, { press: 0.9 })
      : s), T), T, ctx)
    expect(of(obs, 'brow_raise')).toHaveLength(1)
    expect(of(obs, 'lip_press')).toMatchObject([{ startMs: 8000 }])
  })

  it('computes smile share', () => {
    const obs = detectFace(qualify(timeline(0, 20000, 100, (s) => s.tMs < 4000 ? withBlend(s, { smile: 0.7 }) : s), T), T, ctx)
    expect(of(obs, 'smile_share')[0]!.value).toBeCloseTo(4000 / 19900, 3)
  })

  it('counts blinks per minute at 10 fps', () => {
    // a 200 ms blink every 4 s over 60 s → 15 blinks/min
    const obs = detectFace(qualify(timeline(0, 60000, 100, (s) =>
      s.tMs % 4000 < 200 ? withBlend(s, { blinkL: 0.9, blinkR: 0.9 }) : s), T), T, ctx)
    expect(of(obs, 'blink_rate')[0]!.value).toBeCloseTo(15, 0)
  })

  it('refuses blink rate at 5 fps', () => {
    const obs = detectFace(qualify(timeline(0, 60000, 200), T), T, ctx)
    expect(of(obs, 'blink_rate')[0]).toMatchObject({ value: null, unavailableReason: 'frame_rate_too_low' })
  })
})

describe('detectAll', () => {
  it('returns one observation per metric kind and sorted events', () => {
    const { observations } = detectAll(timeline(0, 20000, 100, (s) =>
      s.tMs >= 3000 && s.tMs < 6000 ? withFace(s, { yawDeg: 35 }) : s), { recordingId: 'rec', modelVersion: 'v', handsEnabled: true })
    for (const kind of METRIC_KINDS) expect(of(observations, kind)).toHaveLength(1)
    expect(observations.every((o) => (EVENT_KINDS as readonly string[]).includes(o.kind) || o.unit !== 'ms')).toBe(true)
    expect(observations.map((o) => o.startMs)).toEqual([...observations.map((o) => o.startMs)].sort((a, b) => a - b))
  })
})
