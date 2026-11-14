export type Pacing = { fps: 10 | 5; hands: boolean; off: boolean }

export const initialPacing = (enableHands: boolean): Pacing => ({ fps: 10, hands: enableHands, off: false })

/** Inference must fit in this share of the frame interval, leaving room for the call itself. */
const BUDGET_SHARE = 0.6

export function nextPacing(p: Pacing, p95Ms: number): Pacing {
  if (p.off || p95Ms <= (1000 / p.fps) * BUDGET_SHARE) return p
  if (p.fps === 10) return { ...p, fps: 5 }
  if (p.hands) return { ...p, hands: false }
  return { ...p, off: true }
}
