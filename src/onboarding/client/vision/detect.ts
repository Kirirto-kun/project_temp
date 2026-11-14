import { detectBody } from './features/body'
import { detectFace } from './features/face'
import { detectHands } from './features/hands'
import { detectHead } from './features/head'
import { qualify, type Qualified } from './quality'
import { THRESHOLDS, type Thresholds } from './thresholds'
import type { LandmarkSample, Observation } from './types'

export type DetectOptions = { recordingId: string; modelVersion: string; handsEnabled: boolean; thresholds?: Thresholds }

/** Samples must be sorted by tMs. */
export function detectAll(samples: readonly LandmarkSample[], o: DetectOptions): { qualified: Qualified[]; observations: Observation[] } {
  const t = o.thresholds ?? THRESHOLDS
  const ctx = { recordingId: o.recordingId, modelVersion: o.modelVersion }
  const qualified = qualify(samples, t)
  const observations = [
    ...detectHead(qualified, t, ctx),
    ...detectBody(qualified, t, ctx),
    ...detectHands(qualified, t, ctx, o.handsEnabled),
    ...detectFace(qualified, t, ctx),
  ].sort((a, b) => a.startMs - b.startMs)
  return { qualified, observations }
}
