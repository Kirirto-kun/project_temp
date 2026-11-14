import { describe, expect, it } from 'vitest'
import { detectHands } from '@/onboarding/client/vision/features/hands'
import { qualify } from '@/onboarding/client/vision/quality'
import { THRESHOLDS as T } from '@/onboarding/client/vision/thresholds'
import type { LandmarkSample } from '@/onboarding/client/vision/types'
import { pt, timeline, withHands, withPose } from './vision-fixtures'

const ctx = { recordingId: 'rec', modelVersion: 'test' }
const of = <O extends { kind: string }>(obs: O[], kind: string) => obs.filter((o) => o.kind === kind)
const hand = (x: number, y: number, openPalm = false) => ({ center: { x, y }, openPalm })

describe('detectHands', () => {
  it('reports a hand near the face for at least 0.7 s', () => {
    const obs = detectHands(qualify(timeline(0, 15000, 100, (s) =>
      s.tMs >= 4000 && s.tMs < 5000 ? withHands(s, [hand(0.5, 0.2)]) : s), T), T, ctx, true)
    expect(of(obs, 'hand_to_face')[0]).toMatchObject({ startMs: 4000, endMs: 5000 })
  })

  it('falls back to visible pose wrists when hand tracking is off', () => {
    const atChin = (s: LandmarkSample) => withPose(withHands(s, null), { rWrist: pt(0.48, 0.27, 0.9) })
    const obs = detectHands(qualify(timeline(0, 15000, 100, (s) =>
      s.tMs >= 4000 && s.tMs < 5000 ? atChin(s) : withHands(s, null)), T), T, ctx, false)
    expect(of(obs, 'hand_to_face')).toHaveLength(1)
    expect(of(obs, 'open_palm_share')[0]).toMatchObject({ value: null, unavailableReason: 'hands_disabled' })
  })

  it('treats hidden wrists as unknown for hand-to-face, not as a hand away from the face', () => {
    const obs = detectHands(qualify(timeline(0, 15000, 100, (s) => withHands(s, null)), T), T, ctx, false)
    expect(of(obs, 'hand_to_face')).toHaveLength(0)
    expect(of(obs, 'hands_visible_share')[0]!.value).toBe(0)
  })

  it('computes hands-visible and open-palm shares', () => {
    const obs = detectHands(qualify(timeline(0, 20000, 100, (s) =>
      s.tMs < 9000 ? withHands(s, [hand(0.3, 0.45, s.tMs < 5000)]) : s), T), T, ctx, true)
    expect(of(obs, 'hands_visible_share')[0]!.value).toBeCloseTo(9000 / 19900, 3)
    // only 9 s of visible hands: below the 10 s minimum, so the palm share is withheld
    expect(of(obs, 'open_palm_share')).toMatchObject([{ value: null, unavailableReason: 'limbs_not_visible' }])
  })

  it('counts gesture bursts per visible minute', () => {
    // hand visible 30 s; it sweeps 0.5 frame widths in 1 s every 5 s (and snaps back) → 6 bursts → ~12 per minute
    const obs = detectHands(qualify(timeline(0, 30000, 100, (s) => {
      const phase = s.tMs % 5000
      const x = 0.3 + (phase < 1000 ? (phase / 1000) * 0.5 : 0.5)
      return withHands(s, [hand(x, 0.45)])
    }), T), T, ctx, true)
    expect(of(obs, 'gesture_activity')[0]!.value).toBeCloseTo(12, 0)
  })
})
