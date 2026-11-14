import type { Face, Hand, LandmarkSample, Point, Pose } from '@/onboarding/client/vision/types'

export const pt = (x: number, y: number, v = 1): Point => ({ x, y, v })

/** A centred laptop framing: face and shoulders visible, wrists below the frame edge. Frame-width units, H/W = 0.5625. */
export function baseSample(tMs: number): LandmarkSample {
  return {
    tMs,
    luma: 120,
    faces: 1,
    poses: 1,
    face: {
      yawDeg: 0, pitchDeg: 0, rollDeg: 0,
      box: { x0: 0.42, y0: 0.08, x1: 0.58, y1: 0.26 },
      gaze: { h: 0, v: 0 },
      blend: { smile: 0, browUp: 0, press: 0, blinkL: 0, blinkR: 0 },
    },
    pose: {
      nose: pt(0.5, 0.18), lShoulder: pt(0.62, 0.36), rShoulder: pt(0.38, 0.36),
      lElbow: pt(0.66, 0.5), rElbow: pt(0.34, 0.5), lWrist: pt(0.64, 0.6, 0.2), rWrist: pt(0.36, 0.6, 0.2),
    },
    hands: [],
  }
}

export const withFace = (s: LandmarkSample, f: Partial<Face>): LandmarkSample => ({ ...s, face: s.face ? { ...s.face, ...f } : null })
export const withBlend = (s: LandmarkSample, b: Partial<Face['blend']>): LandmarkSample =>
  s.face ? withFace(s, { blend: { ...s.face.blend, ...b } }) : s
export const withPose = (s: LandmarkSample, p: Partial<Pose>): LandmarkSample => ({ ...s, pose: s.pose ? { ...s.pose, ...p } : null })
export const withHands = (s: LandmarkSample, hands: Hand[] | null): LandmarkSample => ({ ...s, hands })

/** Samples every `stepMs` in [fromMs, toMs). */
export function timeline(fromMs: number, toMs: number, stepMs: number, patch: (s: LandmarkSample) => LandmarkSample = (s) => s): LandmarkSample[] {
  const out: LandmarkSample[] = []
  for (let t = fromMs; t < toMs; t += stepMs) out.push(patch(baseSample(t)))
  return out
}

/** Shift every pose point and the face box by (dx, dy). */
export function shifted(s: LandmarkSample, dx: number, dy: number): LandmarkSample {
  const mv = (p: Point): Point => ({ ...p, x: p.x + dx, y: p.y + dy })
  const pose = s.pose && (Object.fromEntries(Object.entries(s.pose).map(([k, p]) => [k, mv(p)])) as Pose)
  const face = s.face && { ...s.face, box: { x0: s.face.box.x0 + dx, y0: s.face.box.y0 + dy, x1: s.face.box.x1 + dx, y1: s.face.box.y1 + dy } }
  return { ...s, pose, face }
}
