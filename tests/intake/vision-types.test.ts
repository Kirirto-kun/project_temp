import { describe, expect, it } from 'vitest'
import { EventsBatchSchema, LandmarkSampleSchema, ObservationSchema, isEventKind } from '@/onboarding/client/vision/types'
import { detectAll } from '@/onboarding/client/vision/detect'
import { baseSample, timeline, withFace, withHands } from './vision-fixtures'

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

  it('rejects observations that end before they start or are valid for longer than observed', () => {
    expect(ObservationSchema.safeParse({ ...observation, startMs: 8000, endMs: 5000 }).success).toBe(false)
    expect(ObservationSchema.safeParse({ ...observation, validMs: 3002 }).success).toBe(false)
    expect(ObservationSchema.safeParse({ ...observation, validMs: 3000.5 }).success).toBe(true)
  })

  it('is satisfied by every observation the detectors build', () => {
    const samples = timeline(0, 40000, 100, (x) => {
      const dark = x.tMs >= 20000 && x.tMs < 23000 ? { ...x, luma: 5 } : x
      const turned = x.tMs >= 5000 && x.tMs < 9000 ? withFace(dark, { yawDeg: 40 }) : dark
      return x.tMs < 30000 ? withHands(turned, [{ center: { x: 0.3 + (x.tMs % 1000) / 1000, y: 0.45 }, openPalm: x.tMs % 2000 < 1000 }]) : turned
    })
    for (const handsEnabled of [true, false]) {
      const { observations } = detectAll(samples, { recordingId: 'rec', modelVersion: 'test', handsEnabled })
      expect(observations.length).toBeGreaterThan(0)
      for (const o of observations) expect(ObservationSchema.safeParse(o).success, `${o.kind} ${o.id}`).toBe(true)
    }
  })

  it('rejects extra fields on samples', () => {
    expect(LandmarkSampleSchema.safeParse({ ...baseSample(0), image: 'x' }).success).toBe(false)
  })

  it('separates event kinds from metric kinds', () => {
    expect(isEventKind('hand_to_face')).toBe(true)
    expect(isEventKind('smile_share')).toBe(false)
  })
})
