import { describe, expect, it, vi, type Mock } from 'vitest'
import type { PoseTier } from '@/onboarding/client/vision/models'
import { initialPacing, nextPacing } from '@/onboarding/client/vision/pacing'
import { createVisionSession, type VisionUpdate } from '@/onboarding/client/vision/session'
import type { LandmarkSource } from '@/onboarding/client/vision/source'
import type { LandmarkSample, Observation } from '@/onboarding/client/vision/types'
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

type Gate = { promise: Promise<void>; open: () => void }
function gate(): Gate {
  let open!: () => void
  const promise = new Promise<void>((r) => (open = r))
  return { promise, open }
}
type FakeFrame = { close: Mock<() => void> }

function fakeSource(o: {
  inferenceMs?: (tier: PoseTier) => number
  sampleAt?: (tMs: number) => LandmarkSample
  failInit?: boolean
  initGate?: Gate
  processGate?: Gate
} = {}) {
  const calls = { inits: [] as PoseTier[], initStarted: 0, frames: 0, times: [] as number[], disposed: false }
  let tier: PoseTier = 'heavy'
  const source: LandmarkSource = {
    async init(x) {
      calls.initStarted++
      await o.initGate?.promise
      if (o.failInit) throw new Error('model failed to load')
      tier = x.tier
      calls.inits.push(x.tier)
    },
    async process(frame, tMs) {
      calls.frames++
      calls.times.push(tMs)
      await o.processGate?.promise
      ;(frame as unknown as FakeFrame).close()
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

function setup(
  o: Parameters<typeof fakeSource>[0] & {
    enableHands?: boolean
    consent?: boolean
    clock?: () => number
    signal?: AbortSignal
    grabGate?: Gate
  } = {},
) {
  const { source, calls } = fakeSource(o)
  let now = 0
  const updates: VisionUpdate[] = []
  const frames: FakeFrame[] = []
  const grabs = { n: 0 }
  const uploader = { push: vi.fn(), flush: vi.fn(async () => {}) }
  const session = createVisionSession({
    video: {} as HTMLVideoElement,
    clock: o.clock ?? (() => (now += 100)),
    recordingId: 'rec',
    consent: o.consent ?? true,
    enableHands: o.enableHands ?? true,
    signal: o.signal,
    source,
    uploader,
    grabFrame: async () => {
      grabs.n++
      await o.grabGate?.promise
      const frame: FakeFrame = { close: vi.fn() }
      frames.push(frame)
      return frame as unknown as ImageBitmap
    },
    sleep: yieldTask,
    onUpdate: (u) => updates.push(u),
  })
  return { session, calls, updates, uploader, frames, grabs }
}

const allClosedOnce = (frames: FakeFrame[]) => frames.every((f) => f.close.mock.calls.length === 1)

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

  it('stops during init without ever running', async () => {
    const initGate = gate()
    const { session, calls, updates } = setup({ initGate })
    await session.start()
    await until(() => calls.initStarted > 0)
    const summary = await session.stop()
    initGate.open()
    for (let i = 0; i < 20; i++) await yieldTask()
    expect(calls.disposed).toBe(true)
    expect(updates.some((u) => u.status === 'running')).toBe(false)
    expect(updates.at(-1)!.status).toBe('stopped')
    expect(summary).toMatchObject({ status: 'unavailable', unavailableReason: 'camera_off' })
  })

  it('stops while process is in flight and processes nothing afterwards', async () => {
    const processGate = gate()
    const { session, calls, frames } = setup({ processGate })
    await session.start()
    await until(() => calls.frames > 0)
    await session.stop()
    processGate.open()
    for (let i = 0; i < 20; i++) await yieldTask()
    expect(calls.frames).toBe(1)
    expect(session.getSamples()).toHaveLength(0)
    expect(allClosedOnce(frames)).toBe(true)
  })

  it('makes concurrent and repeated stops share one summary', async () => {
    const { session, calls, uploader } = setup()
    await session.start()
    await until(() => calls.frames > 30)
    const [a, b] = await Promise.all([session.stop(), session.stop()])
    expect(b).toBe(a)
    expect(await session.stop()).toBe(a)
    expect(uploader.flush).toHaveBeenCalledTimes(1)
  })

  it('is one-way: start after stop throws', async () => {
    const first = setup()
    await first.session.start()
    await first.session.stop()
    await expect(first.session.start()).rejects.toThrow('vision session already stopped')
    const second = setup()
    await second.session.stop()
    await expect(second.session.start()).rejects.toThrow('vision session already stopped')
  })

  it('does not run when the signal is already aborted', async () => {
    const ac = new AbortController()
    ac.abort()
    const { session, calls, updates } = setup({ signal: ac.signal })
    await session.start()
    expect(calls.initStarted).toBe(0)
    expect(calls.frames).toBe(0)
    expect(updates.at(-1)!.status).toBe('stopped')
  })

  it('stops a running session on abort without unhandled rejections', async () => {
    const ac = new AbortController()
    const { session, calls, updates } = setup({ signal: ac.signal })
    await session.start()
    await until(() => calls.frames > 5)
    ac.abort()
    await until(() => updates.at(-1)!.status === 'stopped')
    expect(calls.disposed).toBe(true)
    await session.stop()
  })

  it('closes or hands over every grabbed frame, including ones grabbed after stop', async () => {
    const grabGate = gate()
    const stopped = setup({ grabGate })
    await stopped.session.start()
    await until(() => stopped.grabs.n > 0)
    await stopped.session.stop()
    grabGate.open()
    await until(() => stopped.frames.length === 1 && stopped.frames[0].close.mock.calls.length > 0)
    expect(stopped.calls.frames).toBe(0)
    expect(allClosedOnce(stopped.frames)).toBe(true)

    let n = 0
    const clockFail = setup({ clock: () => { if (++n === 3) throw new Error('clock broke'); return n * 100 } })
    await clockFail.session.start()
    await until(() => clockFail.updates.some((u) => u.status === 'off'))
    await clockFail.session.stop()
    expect(clockFail.frames.length).toBe(clockFail.grabs.n)
    expect(allClosedOnce(clockFail.frames)).toBe(true)
  })

  it('passes strictly increasing timestamps when the clock stalls or goes backwards', async () => {
    const seq = [1000, 1000, 900, 1000, 500, 1200]
    let i = 0
    const { session, calls } = setup({ clock: () => seq[i++ % seq.length] })
    await session.start()
    await until(() => calls.frames > 40)
    await session.stop()
    expect(calls.times.length).toBeGreaterThan(40)
    calls.times.forEach((t, k) => k > 0 && expect(t).toBeGreaterThan(calls.times[k - 1]))
  })

  it('only uploads finalised events while running, never metrics', async () => {
    const sampleAt = (t: number) => (t >= 5000 && t < 8000 ? withFace(baseSample(t), { yawDeg: 40 }) : baseSample(t))
    const { session, calls, uploader } = setup({ sampleAt })
    const pushed: { obs: Observation[]; latest: number }[] = []
    uploader.push.mockImplementation((obs: Observation[]) => pushed.push({ obs, latest: calls.times.at(-1)! }))
    await session.start()
    await until(() => calls.frames >= 200)
    const whileRunning = pushed.slice()
    await session.stop()
    expect(whileRunning.some((p) => p.obs.length > 0)).toBe(true)
    for (const { obs, latest } of whileRunning) {
      for (const x of obs) {
        expect(x.unit).toBe('ms')
        expect(x.endMs).toBeLessThan(latest - 3000)
      }
    }
  })
})
