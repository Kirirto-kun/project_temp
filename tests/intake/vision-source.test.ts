import { beforeEach, describe, expect, it, vi } from 'vitest'
import { baseSample } from './vision-fixtures'

const inferenceMock = vi.hoisted(() => ({ createInference: vi.fn() }))
vi.mock('@/onboarding/client/vision/inference', () => inferenceMock)

import { createMainThreadSource, createWorkerSource } from '@/onboarding/client/vision/source'

class FakeWorker {
  static last: FakeWorker
  posted: unknown[] = []
  throwOnPost = false
  onmessage: ((e: { data: unknown }) => void) | null = null
  onerror: ((e: { message: string }) => void) | null = null
  onmessageerror: (() => void) | null = null
  terminate = vi.fn()
  constructor() { FakeWorker.last = this }
  postMessage(m: unknown) {
    if (this.throwOnPost) throw new Error('postMessage failed')
    this.posted.push(m)
  }
  emit(data: unknown) { this.onmessage?.({ data }) }
}

const bitmap = () => ({ close: vi.fn() }) as unknown as ImageBitmap & { close: ReturnType<typeof vi.fn> }
const initOpts = { tier: 'lite', enableHands: false } as never

beforeEach(() => {
  vi.stubGlobal('Worker', FakeWorker)
  inferenceMock.createInference.mockReset()
})

describe('worker source', () => {
  it('init resolves on ready and rejects on a fatal error', async () => {
    const a = createWorkerSource('/a')
    const p = a.init(initOpts)
    FakeWorker.last.emit({ type: 'ready' })
    await expect(p).resolves.toBeUndefined()

    const b = createWorkerSource('/a')
    const q = b.init(initOpts)
    FakeWorker.last.emit({ type: 'error', id: null, message: 'boom' })
    await expect(q).rejects.toThrow('boom')
  })

  it('process resolves on the matching sample', async () => {
    const s = createWorkerSource('/a')
    const p = s.process(bitmap(), 5, 'run')
    const id = (FakeWorker.last.posted[0] as { id: number }).id
    FakeWorker.last.emit({ type: 'sample', id, inferenceMs: 3, sample: baseSample(5) })
    await expect(p).resolves.toEqual({ sample: baseSample(5), inferenceMs: 3 })
  })

  it('rejects all pending on a malformed message, onerror and onmessageerror', async () => {
    for (const trigger of [
      (w: FakeWorker) => w.emit({ nope: 1 }),
      (w: FakeWorker) => w.onerror?.({ message: 'crash' }),
      (w: FakeWorker) => w.onmessageerror?.(),
    ]) {
      const s = createWorkerSource('/a')
      const i = s.init(initOpts)
      const p = s.process(bitmap(), 1, 'run')
      trigger(FakeWorker.last)
      await expect(i).rejects.toThrow()
      await expect(p).rejects.toThrow()
    }
  })

  it('a second init rejects the earlier waiter', async () => {
    const s = createWorkerSource('/a')
    const first = s.init(initOpts)
    const second = s.init(initOpts)
    await expect(first).rejects.toThrow()
    FakeWorker.last.emit({ type: 'ready' })
    await expect(second).resolves.toBeUndefined()
  })

  it('after dispose: process closes the frame and rejects, init rejects, worker terminated', async () => {
    const s = createWorkerSource('/a')
    const w = FakeWorker.last
    const pendingP = s.process(bitmap(), 1, 'run')
    s.dispose()
    await expect(pendingP).rejects.toThrow('disposed')
    expect(w.terminate).toHaveBeenCalledOnce()
    const f = bitmap()
    await expect(s.process(f, 2, 'run')).rejects.toThrow('disposed')
    expect(f.close).toHaveBeenCalledOnce()
    await expect(s.init(initOpts)).rejects.toThrow('disposed')
    expect(w.posted.filter((m) => (m as { type: string }).type !== 'frame')).toEqual([])
  })

  it('postMessage failure rejects, closes the bitmap and leaves nothing pending', async () => {
    const s = createWorkerSource('/a')
    FakeWorker.last.throwOnPost = true
    const f = bitmap()
    await expect(s.process(f, 1, 'run')).rejects.toThrow('postMessage failed')
    expect(f.close).toHaveBeenCalledOnce()
    await expect(s.init(initOpts)).rejects.toThrow('postMessage failed')
  })
})

describe('main-thread source', () => {
  const fakeInference = () => ({ run: vi.fn(() => baseSample(1)), close: vi.fn() })

  it('dispose during init closes the late inference and rejects init', async () => {
    let resolve!: (v: unknown) => void
    inferenceMock.createInference.mockReturnValue(new Promise((r) => { resolve = r }))
    const s = createMainThreadSource('/a')
    const p = s.init(initOpts)
    await vi.waitFor(() => expect(inferenceMock.createInference).toHaveBeenCalled())
    s.dispose()
    const inf = fakeInference()
    resolve(inf)
    await expect(p).rejects.toThrow('disposed')
    expect(inf.close).toHaveBeenCalledOnce()
  })

  it('process closes the frame on success and on error', async () => {
    const inf = fakeInference()
    inferenceMock.createInference.mockResolvedValue(inf)
    const s = createMainThreadSource('/a')
    await s.init(initOpts)
    const ok = bitmap()
    await expect(s.process(ok, 1, 'run')).resolves.toMatchObject({ sample: baseSample(1) })
    expect(ok.close).toHaveBeenCalledOnce()
    inf.run.mockImplementation(() => { throw new Error('bad') })
    const bad = bitmap()
    await expect(s.process(bad, 2, 'run')).rejects.toThrow('bad')
    expect(bad.close).toHaveBeenCalledOnce()
  })
})
