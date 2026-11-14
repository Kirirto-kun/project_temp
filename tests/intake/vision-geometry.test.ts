import { describe, expect, it } from 'vitest'
import { PITCH_SIGN, gazeOnScreen, headAngles, inBox, irisOffset } from '@/onboarding/client/vision/geometry'
import { median, p95 } from '@/onboarding/client/vision/stats'
import { THRESHOLDS } from '@/onboarding/client/vision/thresholds'
import { baseSample } from './vision-fixtures'

const colMajor = (r: number[][]) =>
  [0, 1, 2, 3].flatMap((c) => [0, 1, 2, 3].map((row) => (row < 3 && c < 3 ? r[row]![c]! : row === c ? 1 : 0)))
const rad = (d: number) => (d * Math.PI) / 180

describe('headAngles', () => {
  it('reads yaw from a rotation about Y', () => {
    const c = Math.cos(rad(30)), s = Math.sin(rad(30))
    const a = headAngles(colMajor([[c, 0, s], [0, 1, 0], [-s, 0, c]]))
    expect(a.yawDeg).toBeCloseTo(30, 5)
    expect(a.pitchDeg).toBeCloseTo(0, 5)
  })
  it('reads pitch from a rotation about X', () => {
    const c = Math.cos(rad(-20)), s = Math.sin(rad(-20))
    const a = headAngles(colMajor([[1, 0, 0], [0, c, -s], [0, s, c]]))
    expect(a.pitchDeg).toBeCloseTo(-20 * PITCH_SIGN, 5)
    expect(a.yawDeg).toBeCloseTo(0, 5)
  })
})

describe('irisOffset', () => {
  const eyes = () => {
    const lm = Array.from({ length: 478 }, () => ({ x: 0.5, y: 0.5 }))
    Object.assign(lm, {
      33: { x: 0.40, y: 0.30 }, 133: { x: 0.46, y: 0.30 }, 159: { x: 0.43, y: 0.29 }, 145: { x: 0.43, y: 0.31 },
      263: { x: 0.60, y: 0.30 }, 362: { x: 0.54, y: 0.30 }, 386: { x: 0.57, y: 0.29 }, 374: { x: 0.57, y: 0.31 },
      468: { x: 0.43, y: 0.30 }, 473: { x: 0.57, y: 0.30 },
    })
    return lm
  }
  it('is centred when irises are centred', () => {
    const g = irisOffset(eyes())!
    expect(g.h).toBeCloseTo(0, 5)
    expect(g.v).toBeCloseTo(0, 5)
  })
  it('moves with the irises', () => {
    const lm = eyes()
    lm[468] = { x: 0.445, y: 0.30 }
    lm[473] = { x: 0.585, y: 0.30 }
    expect(irisOffset(lm)!.h).toBeCloseTo(0.5, 5)
  })
  it('returns null without iris landmarks', () => {
    expect(irisOffset(eyes().slice(0, 468))).toBeNull()
  })
})

describe('gazeOnScreen', () => {
  it('is true when facing the camera and false when turned away', () => {
    const face = baseSample(0).face!
    expect(gazeOnScreen(face, THRESHOLDS)).toBe(true)
    expect(gazeOnScreen({ ...face, yawDeg: 30 }, THRESHOLDS)).toBe(false)
    expect(gazeOnScreen({ ...face, gaze: null }, THRESHOLDS)).toBeNull()
  })
})

describe('inBox', () => {
  it('expands the box by a fraction of its size', () => {
    const box = { x0: 0.4, y0: 0.1, x1: 0.6, y1: 0.3 }
    expect(inBox({ x: 0.62, y: 0.2 }, box, 0)).toBe(false)
    expect(inBox({ x: 0.62, y: 0.2 }, box, 0.25)).toBe(true)
  })
})

describe('stats', () => {
  it('computes median and nearest-rank p95', () => {
    expect(median([5, 1, 3])).toBe(3)
    expect(p95(Array.from({ length: 20 }, (_, i) => i + 1))).toBe(19)
  })
})
