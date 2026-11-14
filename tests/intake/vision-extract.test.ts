import { describe, expect, it } from 'vitest'
import { isOpenPalm, toSample, type RawFrame } from '@/onboarding/client/vision/extract'
import { LandmarkSampleSchema } from '@/onboarding/client/vision/types'

const lm = (x: number, y: number, visibility = 0.99) => ({ x, y, z: 0, visibility })
const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]

function openRightHand() {
  const pts = Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.5 }))
  Object.assign(pts, {
    0: { x: 0.5, y: 0.5 }, 5: { x: 0.53, y: 0.42 }, 17: { x: 0.47, y: 0.42 },
    6: { x: 0.53, y: 0.38 }, 8: { x: 0.53, y: 0.30 }, 10: { x: 0.51, y: 0.37 }, 12: { x: 0.51, y: 0.28 },
    14: { x: 0.49, y: 0.38 }, 16: { x: 0.49, y: 0.30 }, 18: { x: 0.47, y: 0.39 }, 20: { x: 0.47, y: 0.32 },
  })
  return pts
}

function frame(): RawFrame {
  const pose = Array.from({ length: 33 }, () => lm(0.5, 0.5, 0.1))
  Object.assign(pose, { 0: lm(0.5, 0.3), 11: lm(0.62, 0.64), 12: lm(0.38, 0.64) })
  const face = Array.from({ length: 478 }, () => lm(0.5, 0.3))
  face[0] = lm(0.42, 0.15)
  face[1] = lm(0.58, 0.45)
  return {
    tMs: 1000, frameW: 640, frameH: 360, luma: 110,
    pose: { landmarks: [pose] },
    face: {
      faceLandmarks: [face],
      facialTransformationMatrixes: [{ rows: 4, columns: 4, data: identity }],
      faceBlendshapes: [{ categories: [
        { categoryName: 'mouthSmileLeft', score: 0.6, index: 0, displayName: '' },
        { categoryName: 'mouthSmileRight', score: 0.4, index: 1, displayName: '' },
        { categoryName: 'eyeBlinkLeft', score: 0.9, index: 2, displayName: '' },
      ], headIndex: 0, headName: '' }],
    },
    handsFresh: true,
    hands: { landmarks: [openRightHand().map((p) => lm(p.x, p.y))], handedness: [[{ categoryName: 'Right', score: 0.9, index: 0, displayName: '' }]] },
  }
}

describe('toSample', () => {
  it('converts results into a valid compact sample in frame-width units', () => {
    const s = toSample(frame())
    expect(LandmarkSampleSchema.parse(s)).toEqual(s)
    expect(s.pose!.lShoulder).toEqual({ x: 0.62, y: 0.64 * 0.5625, v: 0.99 })
    expect(s.face!.box.y1).toBeCloseTo(0.45 * 0.5625, 6)
    expect(s.face!.blend.smile).toBeCloseTo(0.5, 6)
    expect(s.face!.blend.blinkL).toBe(0.9)
    expect(s.face!.yawDeg).toBeCloseTo(0, 6)
    expect(s.hands).toHaveLength(1)
    expect(s.hands![0]!.openPalm).toBe(true)
    expect(s.handsFresh).toBe(true)
  })

  it('marks reused hands as not fresh, and absent hands never fresh', () => {
    expect(toSample({ ...frame(), handsFresh: false }).handsFresh).toBe(false)
    expect(toSample({ ...frame(), hands: null, handsFresh: true })).toMatchObject({ hands: null, handsFresh: false })
  })

  it('reports absent detections as null and counts people', () => {
    const f = frame()
    const s = toSample({ ...f, pose: { landmarks: [] }, face: { ...f.face, faceLandmarks: [] }, hands: null })
    expect(s).toMatchObject({ pose: null, face: null, hands: null, handsFresh: false, faces: 0, poses: 0 })
  })
})

describe('counting people', () => {
  const shift = (lms: { x: number; y: number; visibility?: number }[], dx: number) => lms.map((l) => lm(l.x + dx, l.y, l.visibility ?? 1))

  it('does not count an overlapping second face or pose as another person (same head detected twice)', () => {
    const f = frame()
    const ghostFace = shift(f.face.faceLandmarks[0]!, 0.02)
    const ghostPose = shift(f.pose.landmarks[0]!, 0.03)
    const s = toSample({ ...f, face: { ...f.face, faceLandmarks: [f.face.faceLandmarks[0]!, ghostFace] }, pose: { landmarks: [f.pose.landmarks[0]!, ghostPose] } })
    expect(s).toMatchObject({ faces: 1, poses: 1 })
  })

  it('counts a separate second face and pose', () => {
    const f = frame()
    const otherFace = shift(f.face.faceLandmarks[0]!, 0.3)
    const otherPose = shift(f.pose.landmarks[0]!, 0.3)
    const s = toSample({ ...f, face: { ...f.face, faceLandmarks: [f.face.faceLandmarks[0]!, otherFace] }, pose: { landmarks: [f.pose.landmarks[0]!, otherPose] } })
    expect(s).toMatchObject({ faces: 2, poses: 2 })
  })
})

describe('isOpenPalm', () => {
  it('needs extended fingers and the palm facing the camera', () => {
    expect(isOpenPalm(openRightHand(), 'Right')).toBe(true)
    expect(isOpenPalm(openRightHand(), 'Left')).toBe(false)
    expect(isOpenPalm(openRightHand(), null)).toBe(false)
    const fist = openRightHand()
    for (const tip of [8, 12, 16, 20]) fist[tip] = { x: 0.5, y: 0.44 }
    expect(isOpenPalm(fist, 'Right')).toBe(false)
  })
})
