import { describe, expect, it } from 'vitest'
import { scoreClips } from '@/onboarding/client/vision/eval'
import { timeline, withFace } from './vision-fixtures'

describe('scoreClips', () => {
  it('counts matched, spurious and missed events per kind', () => {
    const samples = timeline(0, 20000, 100, (s) =>
      (s.tMs >= 3000 && s.tMs < 6000) || (s.tMs >= 12000 && s.tMs < 15000) ? withFace(s, { yawDeg: 40 }) : s)
    const scores = scoreClips([{
      name: 'c1', samples,
      labels: [
        { kind: 'head_turn_away', startMs: 3200, endMs: 5800 },
        { kind: 'head_down', startMs: 9000, endMs: 11000 },
      ],
    }], { handsEnabled: true })
    expect(scores.find((s) => s.kind === 'head_turn_away')).toMatchObject({ tp: 1, fp: 1, fn: 0, precision: 0.5, recall: 1 })
    expect(scores.find((s) => s.kind === 'head_down')).toMatchObject({ tp: 0, fp: 0, fn: 1, precision: null, recall: 0 })
  })
})
