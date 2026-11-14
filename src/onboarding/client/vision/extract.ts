import type { FaceLandmarkerResult, HandLandmarkerResult, NormalizedLandmark, PoseLandmarkerResult } from '@mediapipe/tasks-vision'
import { clamp, dist, headAngles, irisOffset, type Vec } from './geometry'
import { avg } from './stats'
import type { Face, Hand, LandmarkSample, Point, Pose } from './types'

export type RawFrame = {
  tMs: number
  frameW: number
  frameH: number
  luma: number
  pose: Pick<PoseLandmarkerResult, 'landmarks'>
  face: Pick<FaceLandmarkerResult, 'faceLandmarks' | 'facialTransformationMatrixes' | 'faceBlendshapes'>
  hands: Pick<HandLandmarkerResult, 'landmarks' | 'handedness'> | null
  /** The hand landmarker ran on this frame (false when `hands` is a reused earlier result). */
  handsFresh: boolean
}

const POSE_INDEX = { nose: 0, lShoulder: 11, rShoulder: 12, lElbow: 13, rElbow: 14, lWrist: 15, rWrist: 16 } as const

/** Convert MediaPipe results (unmirrored frame) to a compact sample in frame-width units. */
export function toSample(f: RawFrame): LandmarkSample {
  const k = f.frameH / f.frameW
  return {
    tMs: f.tMs,
    luma: clamp(f.luma, 0, 255),
    faces: f.face.faceLandmarks.length,
    poses: f.pose.landmarks.length,
    face: toFace(f.face, k),
    pose: toPose(f.pose, k),
    hands: f.hands ? toHands(f.hands, k) : null,
    handsFresh: f.hands !== null && f.handsFresh,
  }
}

const toPoint = (l: NormalizedLandmark, k: number): Point => ({ x: l.x, y: l.y * k, v: clamp(l.visibility ?? 0, 0, 1) })

function toPose(r: RawFrame['pose'], k: number): Pose | null {
  const lm = r.landmarks[0]
  if (!lm) return null
  const at = (i: number) => {
    const l = lm[i]
    if (!l) throw new Error(`pose landmark ${i} missing`)
    return toPoint(l, k)
  }
  return {
    nose: at(POSE_INDEX.nose), lShoulder: at(POSE_INDEX.lShoulder), rShoulder: at(POSE_INDEX.rShoulder),
    lElbow: at(POSE_INDEX.lElbow), rElbow: at(POSE_INDEX.rElbow), lWrist: at(POSE_INDEX.lWrist), rWrist: at(POSE_INDEX.rWrist),
  }
}

function toFace(r: RawFrame['face'], k: number): Face | null {
  const lm = r.faceLandmarks[0]
  if (!lm) return null
  const matrix = r.facialTransformationMatrixes?.[0]?.data
  if (!matrix) throw new Error('face landmarker returned no transformation matrix; enable outputFacialTransformationMatrixes')
  const scores = new Map((r.faceBlendshapes?.[0]?.categories ?? []).map((c) => [c.categoryName, c.score]))
  const s = (name: string) => scores.get(name) ?? 0
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (const l of lm) {
    x0 = Math.min(x0, l.x); x1 = Math.max(x1, l.x)
    y0 = Math.min(y0, l.y * k); y1 = Math.max(y1, l.y * k)
  }
  return {
    ...headAngles(matrix),
    box: { x0, y0, x1, y1 },
    gaze: irisOffset(lm),
    blend: {
      smile: (s('mouthSmileLeft') + s('mouthSmileRight')) / 2,
      browUp: Math.max(s('browInnerUp'), (s('browOuterUpLeft') + s('browOuterUpRight')) / 2),
      press: (s('mouthPressLeft') + s('mouthPressRight')) / 2,
      blinkL: s('eyeBlinkLeft'),
      blinkR: s('eyeBlinkRight'),
    },
  }
}

function toHands(r: NonNullable<RawFrame['hands']>, k: number): Hand[] {
  return r.landmarks.slice(0, 2).map((lm, i) => {
    const pts = lm.map((l) => ({ x: l.x, y: l.y * k }))
    return {
      center: { x: avg(pts.map((p) => p.x)), y: avg(pts.map((p) => p.y)) },
      openPalm: isOpenPalm(pts, r.handedness[i]?.[0]?.categoryName ?? null),
    }
  })
}

const FINGERS = [[8, 6], [12, 10], [16, 14], [20, 18]] as const

/** ≥3 fingers extended and the palm normal pointing at the camera. */
export function isOpenPalm(pts: readonly Vec[], label: string | null): boolean {
  const p = (i: number) => {
    const v = pts[i]
    if (!v) throw new Error(`hand landmark ${i} missing`)
    return v
  }
  const wrist = p(0)
  const extended = FINGERS.filter(([tip, pip]) => dist(wrist, p(tip)) > dist(wrist, p(pip)) * 1.15).length
  if (extended < 3 || label === null) return false
  const a = { x: p(5).x - wrist.x, y: p(5).y - wrist.y }
  const b = { x: p(17).x - wrist.x, y: p(17).y - wrist.y }
  const cross = a.x * b.y - a.y * b.x
  // Calibrated 2026-11-15 on the demo webcam (clip replay): on our unmirrored frames MediaPipe's label
  // matches the person's own hand, despite the docs describing mirrored input.
  const isRightHand = label === 'Right'
  return isRightHand ? cross < 0 : cross > 0
}
