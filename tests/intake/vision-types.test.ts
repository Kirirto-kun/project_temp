import { describe, expect, it } from 'vitest'
import { EventsBatchSchema, LandmarkSampleSchema, ObservationSchema, isEventKind } from '@/onboarding/client/vision/types'
import { baseSample } from './vision-fixtures'

const observation = {
  id: 'head_turn_away:5000', recordingId: 'rec-1', kind: 'head_turn_away', startMs: 5000, endMs: 8000,
  value: 3000, unit: 'ms', direction: null, quality: 1, validMs: 3000, observedMs: 3000,
  source: 'mediapipe', modelVersion: 'tv1.1.1/pose-full/t1', unavailableReason: null,
}

describe('vision schemas', () => {
  it('accepts a well-formed sample and observation', () => {
    expect(LandmarkSampleSchema.parse(baseSample(0))).toEqual(baseSample(0))
    expect(ObservationSchema.parse(observation)).toEqual(observation)
  })

  it('rejects raw landmark arrays or image data smuggled into an upload', () => {
    const batch = { seq: 0, consentVersion: 1, observations: [{ ...observation, landmarks: [[0.1, 0.2]] }] }
    expect(EventsBatchSchema.safeParse(batch).success).toBe(false)
    expect(EventsBatchSchema.safeParse({ seq: 0, consentVersion: 1, observations: [], frame: 'data:image/png' }).success).toBe(false)
  })

  it('rejects extra fields on samples', () => {
    expect(LandmarkSampleSchema.safeParse({ ...baseSample(0), image: 'x' }).success).toBe(false)
  })

  it('separates event kinds from metric kinds', () => {
    expect(isEventKind('hand_to_face')).toBe(true)
    expect(isEventKind('smile_share')).toBe(false)
  })
})
