import type { Thresholds } from './thresholds'
import type { Face } from './types'

export type Vec = { x: number; y: number }
export type Box = { x0: number; y0: number; x1: number; y1: number }

/** Flip to -1 if the Task 14 calibration shows that looking down gives a positive pitch. */
export const PITCH_SIGN = 1
/** Flip to -1 if the Task 14 calibration shows iris offset and head yaw disagree in sign. */
export const GAZE_H_SIGN = 1

const DEG = 180 / Math.PI

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
export const dist = (a: Vec, b: Vec) => Math.hypot(a.x - b.x, a.y - b.y)
export const mid = (a: Vec, b: Vec): Vec => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })
export const boxCenter = (b: Box): Vec => ({ x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2 })

export function inBox(p: Vec, b: Box, expand: number): boolean {
  const dx = (b.x1 - b.x0) * expand
  const dy = (b.y1 - b.y0) * expand
  return p.x >= b.x0 - dx && p.x <= b.x1 + dx && p.y >= b.y0 - dy && p.y <= b.y1 + dy
}

/** Euler angles from MediaPipe's 4x4 facial transformation matrix (column-major data). */
export function headAngles(m: readonly number[]): { yawDeg: number; pitchDeg: number; rollDeg: number } {
  const r = (row: number, col: number) => m[col * 4 + row] ?? 0
  return {
    yawDeg: Math.atan2(r(0, 2), r(2, 2)) * DEG,
    pitchDeg: Math.asin(clamp(-r(1, 2), -1, 1)) * DEG * PITCH_SIGN,
    rollDeg: Math.atan2(r(1, 0), r(1, 1)) * DEG,
  }
}

const EYES = [
  { iris: 468, outer: 33, inner: 133, top: 159, bottom: 145 },
  { iris: 473, outer: 263, inner: 362, top: 386, bottom: 374 },
] as const

/** Iris position inside the eye opening, each axis in [-1, 1]; null without refined iris landmarks. */
export function irisOffset(lm: readonly Vec[]): { h: number; v: number } | null {
  if (lm.length < 478) return null
  let h = 0
  let v = 0
  for (const e of EYES) {
    const [iris, outer, inner, top, bottom] = [lm[e.iris]!, lm[e.outer]!, lm[e.inner]!, lm[e.top]!, lm[e.bottom]!]
    const halfW = Math.abs(inner.x - outer.x) / 2
    const halfH = Math.abs(bottom.y - top.y) / 2
    if (halfW < 1e-6 || halfH < 1e-6) return null
    h += (iris.x - (outer.x + inner.x) / 2) / halfW
    v += (iris.y - (top.y + bottom.y) / 2) / halfH
  }
  return { h: clamp((h / 2) * GAZE_H_SIGN, -1, 1), v: clamp(v / 2, -1, 1) }
}

/** Approximate: head pose plus iris offset inside a cone around the camera. Not eye contact. */
export function gazeOnScreen(face: Face, t: Thresholds): boolean | null {
  if (!face.gaze) return null
  const yaw = face.yawDeg + face.gaze.h * t.gazeIrisYawGainDeg
  const pitch = face.pitchDeg - face.gaze.v * t.gazeIrisPitchGainDeg
  return Math.abs(yaw) < t.gazeConeDeg && Math.abs(pitch) < t.gazeConeDeg
}
