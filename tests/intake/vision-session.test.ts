import { describe, expect, it, vi } from 'vitest'
import type { PoseTier } from '@/onboarding/client/vision/models'
import { initialPacing, nextPacing } from '@/onboarding/client/vision/pacing'
import { createVisionSession, type VisionUpdate } from '@/onboarding/client/vision/session'
import type { LandmarkSource } from '@/onboarding/client/vision/source'
import type { LandmarkSample } from '@/onboarding/client/vision/types'
import { baseSample, withFace } from './vision-fixtures'

describe('nextPacing', () => {
  it('steps down fps, then hands, then turns off', () => {
    let p = initialPacing(true)
    expect(nextPacing(p, 50)).toBe(p)
    p = nextPacing(p, 80)
    expect(p).toEqual({ fps: 5, hands: true, off: false })
    p = nextPacing(p, 150)
    expect(p).toEqual({ fps: 5, hands: false, off: false })
    expect(nextPacing(p, 150)).toEqual({ fps: 5, hands: false, off: true })
  })
})

function fakeSource(o: { inferenceMs?: (tier: PoseTier) => number; sampleAt?: (tMs: number) => LandmarkSample; failInit?: boolean } = {}) {
  const calls = { inits: [] as PoseTier[], frames: 0, disposed: false }
  let tier: PoseTier = 'heavy'
  const source: LandmarkSource = {
    async init(x) {
      if (o.failInit) throw new Error('model failed to load')
      tier = x.tier
      calls.inits.push(x.tier)
    },
    async process(_frame, tMs) {
      calls.frames++
      return { sample: (o.sampleAt ?? baseSample)(tMs), inferenceMs: o.inferenceMs?.(tier) ?? 10 }
    },
    dispose() { calls.disposed = true },
  }
  return { source, calls }
}

const yieldTask = () => new Promise<void>((r) => setImmediate(r))
async function until(cond: () => boolean) {
  for (let i = 0; i < 100000 && !cond(); i++) await yieldTask()
  if (!cond()) throw new Error('condition never met')
}

function setup(o: Parameters<typeof fakeSource>[0] & { enableHands?: boolean; consent?: boolean } = {}) {
  const { source, calls } = fakeSource(o)
  let now = 0
  const updates: VisionUpdate[] = []
  const uploader = { push: vi.fn(), flush: vi.fn(async () => {}) }
  const session = createVisionSession({
    video: {} as HTMLVideoElement,
    clock: () => (now += 100),
    recordingId: 'rec',
    consent: o.consent ?? true,
    enableHands: o.enableHands ?? true,
    source,
    uploader,
    grabFrame: async () => ({ close() {} }) as unknown as ImageBitmap,
    sleep: yieldTask,
    onUpdate: (u) => updates.push(u),
  })
  return { session, calls, updates, uploader }
}

describe('createVisionSession', () => {
  it('refuses to start without consent', () => {
    expect(() => setup({ consent: false })).toThrow(/consent/)
  })

  it('benchmarks tiers and keeps the first one that is fast enough', async () => {
    const { session, calls, updates } = setup({ inferenceMs: (t) => (t === 'heavy' ? 50 : 30) })
    await session.start()
    await until(() => calls.frames > 60)
    await session.stop()
    expect(calls.inits).toEqual(['heavy', 'full'])
    expect(updates.at(-1)!.tier).toBe('full')
  })

  it('uploads finalised events while running and returns a summary on stop', async () => {
    const sampleAt = (t: number) => (t >= 5000 && t < 8000 ? withFace(baseSample(t), { yawDeg: 40 }) : baseSample(t))
    const { session, calls, uploader } = setup({ sampleAt })
    await session.start()
    await until(() => calls.frames >= 200)
    const pushedWhileRunning = uploader.push.mock.calls.flat(2)
    const summary = await session.stop()
    expect(pushedWhileRunning.some((o) => o.kind === 'head_turn_away')).toBe(true)
    expect(summary.status).toBe('ready')
    expect(summary.events.map((e) => e.kind)).toContain('head_turn_away')
    expect(uploader.flush).toHaveBeenCalled()
    expect(calls.disposed).toBe(true)
  })

  it('turns visual analysis off on a device that cannot keep up', async () => {
    const { session, updates } = setup({ inferenceMs: () => 200 })
    await session.start()
    await until(() => updates.some((u) => u.status === 'off'))
    expect(updates.at(-1)).toMatchObject({ status: 'off', offReason: 'device_too_slow', pacing: { off: true } })
    await session.stop()
  })

  it('reports model_failed without throwing when models cannot load', async () => {
    const { session, updates } = setup({ failInit: true })
    await session.start()
    await until(() => updates.some((u) => u.status === 'off'))
    const summary = await session.stop()
    expect(summary).toMatchObject({ status: 'unavailable', unavailableReason: 'model_failed' })
  })
})
