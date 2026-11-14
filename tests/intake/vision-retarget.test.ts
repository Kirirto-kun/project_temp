import { describe, expect, it, vi } from 'vitest'
import type { Inference, InferenceOptions } from '@/onboarding/client/vision/inference'
import { retarget } from '@/onboarding/client/vision/retarget'

const opts = (p: Partial<InferenceOptions> = {}): InferenceOptions => ({ tier: 'heavy', enableHands: true, assetBase: '/intake', ...p })
const fake = (o: InferenceOptions) => ({ options: { ...o }, run: vi.fn(), setTier: vi.fn(async () => {}), close: vi.fn() }) as unknown as
  Inference & { setTier: ReturnType<typeof vi.fn>; close: ReturnType<typeof vi.fn> }

describe('retarget', () => {
  it('creates when there is nothing to reuse', async () => {
    const made = fake(opts())
    const create = vi.fn(async () => made)
    await expect(retarget(null, opts(), create)).resolves.toBe(made)
  })

  it('swaps only the pose tier when hands and assets match', async () => {
    const cur = fake(opts())
    const create = vi.fn()
    await expect(retarget(cur, opts({ tier: 'lite' }), create)).resolves.toBe(cur)
    expect(cur.setTier).toHaveBeenCalledWith('lite')
    expect(create).not.toHaveBeenCalled()
  })

  it('does nothing for identical options', async () => {
    const cur = fake(opts())
    await retarget(cur, opts(), vi.fn())
    expect(cur.setTier).not.toHaveBeenCalled()
  })

  it('rebuilds when hand tracking changes, closing the old models first', async () => {
    const cur = fake(opts())
    const made = fake(opts({ enableHands: false }))
    await expect(retarget(cur, opts({ enableHands: false }), async () => made)).resolves.toBe(made)
    expect(cur.close).toHaveBeenCalledOnce()
  })
})
