import { describe, expect, it } from 'vitest'
import { FromWorkerSchema } from '@/onboarding/client/vision/worker-protocol'
import { baseSample } from './vision-fixtures'

describe('worker → main protocol', () => {
  it('accepts compact samples', () => {
    expect(FromWorkerSchema.safeParse({ type: 'sample', id: 3, inferenceMs: 21, sample: baseSample(0) }).success).toBe(true)
    expect(FromWorkerSchema.safeParse({ type: 'ready' }).success).toBe(true)
    expect(FromWorkerSchema.safeParse({ type: 'error', id: null, message: 'boom' }).success).toBe(true)
  })

  it('rejects any extra payload such as raw landmarks or pixels', () => {
    expect(FromWorkerSchema.safeParse({ type: 'sample', id: 3, inferenceMs: 21, sample: baseSample(0), landmarks: [] }).success).toBe(false)
    expect(FromWorkerSchema.safeParse({ type: 'sample', id: 3, inferenceMs: 21, sample: { ...baseSample(0), pixels: [1, 2] } }).success).toBe(false)
  })
})
