import { describe, expect, it } from 'vitest'
import { detectHead } from '@/onboarding/client/vision/features/head'
import { qualify } from '@/onboarding/client/vision/quality'
import { THRESHOLDS as T } from '@/onboarding/client/vision/thresholds'
import { timeline, withFace } from './vision-fixtures'

const ctx = { recordingId: 'rec', modelVersion: 'test' }
const kinds = <T extends { kind: string }>(obs: T[], kind: string) => obs.filter((o) => o.kind === kind)

describe('detectHead', () => {
  it('reports a head turn above 25° held for 2 s, in either direction', () => {
    const obs = detectHead(qualify(timeline(0, 15000, 100, (s) =>
      s.tMs >= 3000 && s.tMs < 5500 ? withFace(s, { yawDeg: -30 }) : s), T), T, ctx)
    const turns = kinds(obs, 'head_turn_away')
    expect(turns).toHaveLength(1)
    expect(turns[0]).toMatchObject({ startMs: 3000, endMs: 5500, value: 2500, unit: 'ms' })
  })

  it('ignores 24° and turns shorter than 2 s', () => {
    const obs = detectHead(qualify(timeline(0, 15000, 100, (s) =>
      s.tMs < 6000 ? withFace(s, { yawDeg: 24 }) : s.tMs < 7900 ? withFace(s, { yawDeg: 40 }) : s), T), T, ctx)
    expect(kinds(obs, 'head_turn_away')).toHaveLength(0)
  })

  it('reports looking down', () => {
    const obs = detectHead(qualify(timeline(0, 15000, 100, (s) =>
      s.tMs >= 1000 && s.tMs < 4000 ? withFace(s, { pitchDeg: -25 }) : s), T), T, ctx)
    expect(kinds(obs, 'head_down')).toHaveLength(1)
  })

  it('reports leaving the frame for at least 1 s', () => {
    const obs = detectHead(qualify(timeline(0, 15000, 100, (s) =>
      s.tMs >= 2000 && s.tMs < 3500 ? { ...s, faces: 0, face: null } : s), T), T, ctx)
    expect(kinds(obs, 'out_of_frame')[0]).toMatchObject({ startMs: 2000, endMs: 3500 })
  })

  it('computes gaze share only with enough valid time', () => {
    const long = detectHead(qualify(timeline(0, 20000, 100, (s) =>
      s.tMs < 5000 ? withFace(s, { yawDeg: 40 }) : s), T), T, ctx)
    expect(kinds(long, 'gaze_on_screen_share')[0]!.value).toBeCloseTo(14900 / 19900, 3)

    const short = detectHead(qualify(timeline(0, 5000, 100), T), T, ctx)
    expect(kinds(short, 'gaze_on_screen_share')[0]).toMatchObject({ value: null, unavailableReason: 'not_enough_valid_time' })
  })
})
