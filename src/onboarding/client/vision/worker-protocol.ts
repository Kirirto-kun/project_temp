import { z } from 'zod'
import type { PoseTier } from './models'
import { LandmarkSampleSchema } from './types'

export type HandsMode = 'run' | 'reuse' | 'off'

export type ToWorker =
  | { type: 'init'; tier: PoseTier; enableHands: boolean; assetBase: string }
  | { type: 'frame'; id: number; tMs: number; bitmap: ImageBitmap; hands: HandsMode }

/** Everything the worker may send back. Strict: nothing beyond a compact sample crosses the boundary. */
export const FromWorkerSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('ready') }),
  z.strictObject({ type: z.literal('sample'), id: z.number().int(), inferenceMs: z.number().nonnegative(), sample: LandmarkSampleSchema }),
  z.strictObject({ type: z.literal('error'), id: z.number().int().nullable(), message: z.string().max(500) }),
])
export type FromWorker = z.infer<typeof FromWorkerSchema>
