import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockEventsServer } from '@/onboarding/client/vision/mock-events'
import { eventObservation } from '@/onboarding/client/vision/observation'
import { createEventsUploader } from '@/onboarding/client/vision/upload'

const ctx = { recordingId: 'rec', modelVersion: 'v' }
const obs = (i: number) => eventObservation(ctx, 'head_turn_away', { startMs: i * 1000, endMs: i * 1000 + 2500 })

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('createEventsUploader', () => {
  it('sends on the interval with an idempotency key per batch', async () => {
    const server = createMockEventsServer()
    const up = createEventsUploader({ intakeId: 'i1', consentVersion: 2, fetchImpl: server.fetchImpl })
    up.push([obs(1), obs(2), obs(3)])
    expect(server.batches).toHaveLength(0)
    await vi.advanceTimersByTimeAsync(5000)
    expect(server.batches).toEqual([{ seq: 0, consentVersion: 2, observations: [obs(1), obs(2), obs(3)] }])
    expect(server.calls[0]!.key).toMatch(/^i1:2:[0-9a-f-]{36}:0$/)
    up.dispose()
  })

  it('sends immediately at 20 observations and de-duplicates by id', async () => {
    const server = createMockEventsServer()
    const up = createEventsUploader({ intakeId: 'i1', consentVersion: 1, fetchImpl: server.fetchImpl })
    up.push(Array.from({ length: 20 }, (_, i) => obs(i)))
    up.push([obs(0), obs(1)])
    await up.flush()
    expect(server.batches).toHaveLength(1)
    expect(server.batches[0]!.observations).toHaveLength(20)
    up.dispose()
  })

  it('retries a failed batch with the same key', async () => {
    const server = createMockEventsServer({ failFirst: 1 })
    const onError = vi.fn()
    const up = createEventsUploader({ intakeId: 'i1', consentVersion: 1, fetchImpl: server.fetchImpl, onError })
    up.push([obs(1)])
    await up.flush()
    expect(server.batches).toHaveLength(0)
    expect(onError).toHaveBeenCalledOnce()
    await vi.advanceTimersByTimeAsync(1000)
    expect(server.batches).toHaveLength(1)
    const keys = server.calls.map((c) => c.key)
    expect(keys).toHaveLength(2)
    expect(keys[0]).toMatch(/^i1:1:[0-9a-f-]{36}:0$/)
    expect(keys[1]).toBe(keys[0])
    up.dispose()
  })

  it('drops everything and stops sending on revoke', async () => {
    const server = createMockEventsServer()
    const up = createEventsUploader({ intakeId: 'i1', consentVersion: 1, fetchImpl: server.fetchImpl })
    up.push([obs(1)])
    up.revoke()
    up.push([obs(2)])
    await vi.advanceTimersByTimeAsync(20000)
    await up.flush()
    expect(server.calls).toHaveLength(0)
  })

  it('stops for good on 409 or 410', async () => {
    const server = createMockEventsServer({ status: 410 })
    const onFatal = vi.fn()
    const up = createEventsUploader({ intakeId: 'i1', consentVersion: 1, fetchImpl: server.fetchImpl, onFatal })
    up.push([obs(1)])
    await up.flush()
    up.push([obs(2)])
    await vi.advanceTimersByTimeAsync(20000)
    expect(onFatal).toHaveBeenCalledWith(410)
    expect(server.calls).toHaveLength(1)
  })

  it('stops for good on 409', async () => {
    const server = createMockEventsServer({ status: 409 })
    const onFatal = vi.fn()
    const up = createEventsUploader({ intakeId: 'i1', consentVersion: 1, fetchImpl: server.fetchImpl, onFatal })
    up.push([obs(1)])
    await up.flush()
    await vi.advanceTimersByTimeAsync(20000)
    expect(onFatal).toHaveBeenCalledWith(409)
    expect(server.calls).toHaveLength(1)
  })

  it('does not collide idempotency keys across uploader instances', () => {
    const server = createMockEventsServer()
    const a = createEventsUploader({ intakeId: 'i1', consentVersion: 1, fetchImpl: server.fetchImpl })
    const b = createEventsUploader({ intakeId: 'i1', consentVersion: 1, fetchImpl: server.fetchImpl })
    a.push([obs(1)])
    b.push([obs(2)])
    void a.flush()
    void b.flush()
    expect(server.calls[0]!.key).not.toBe(server.calls[1]!.key)
    a.dispose()
    b.dispose()
  })

  describe('in flight', () => {
    function manual() {
      const reqs: ((r: Response | Error) => void)[] = []
      const bodies: string[] = []
      const fetchImpl = vi.fn((_u: unknown, init?: RequestInit) => {
        bodies.push(String(init?.body))
        return new Promise<Response>((res, rej) => reqs.push((r) => (r instanceof Error ? rej(r) : res(r))))
      }) as unknown as typeof fetch
      return { reqs, bodies, fetchImpl }
    }

    it('revoke during a request: late failure is silent and nothing more is sent', async () => {
      const m = manual()
      const onError = vi.fn()
      const onFatal = vi.fn()
      const up = createEventsUploader({ intakeId: 'i1', consentVersion: 1, fetchImpl: m.fetchImpl, onError, onFatal })
      up.push([obs(1)])
      const p = up.flush()
      up.revoke()
      m.reqs[0]!(new Error('network down'))
      await p
      expect(onError).not.toHaveBeenCalled()
      expect(onFatal).not.toHaveBeenCalled()
      expect(vi.getTimerCount()).toBe(0)
      await vi.advanceTimersByTimeAsync(20000)
      expect(m.reqs).toHaveLength(1)
    })

    it('revoke during a request: a late 410 or 503 response is silent', async () => {
      for (const status of [410, 503]) {
        const m = manual()
        const onError = vi.fn()
        const onFatal = vi.fn()
        const up = createEventsUploader({ intakeId: 'i1', consentVersion: 1, fetchImpl: m.fetchImpl, onError, onFatal })
        up.push([obs(1)])
        const p = up.flush()
        up.dispose()
        m.reqs[0]!(new Response(null, { status }))
        await p
        expect(onError).not.toHaveBeenCalled()
        expect(onFatal).not.toHaveBeenCalled()
        expect(vi.getTimerCount()).toBe(0)
      }
    })

    it('concurrent flush calls share one request', async () => {
      const server = createMockEventsServer()
      const up = createEventsUploader({ intakeId: 'i1', consentVersion: 1, fetchImpl: server.fetchImpl })
      up.push([obs(1)])
      await Promise.all([up.flush(), up.flush(), up.flush()])
      expect(server.calls).toHaveLength(1)
      up.dispose()
    })

    it('sends pushes that arrive mid-flight afterwards', async () => {
      const m = manual()
      const up = createEventsUploader({ intakeId: 'i1', consentVersion: 1, fetchImpl: m.fetchImpl })
      up.push([obs(1)])
      const p = up.flush()
      up.push([obs(2)])
      m.reqs[0]!(new Response(null, { status: 202 }))
      await vi.advanceTimersByTimeAsync(0)
      expect(m.reqs).toHaveLength(2)
      m.reqs[1]!(new Response(null, { status: 202 }))
      await p
      expect(m.bodies.map((b) => JSON.parse(b).observations)).toEqual([[obs(1)], [obs(2)]])
      up.dispose()
    })
  })

  it('backs off 1s, 2s, 4s and does not send early when pushes pile up', async () => {
    const server = createMockEventsServer({ failFirst: 3 })
    const up = createEventsUploader({ intakeId: 'i1', consentVersion: 1, fetchImpl: server.fetchImpl })
    up.push([obs(0)])
    await up.flush()
    expect(server.calls).toHaveLength(1)
    up.push(Array.from({ length: 25 }, (_, i) => obs(i + 10)))
    expect(server.calls).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(999)
    expect(server.calls).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(server.calls).toHaveLength(2)
    await vi.advanceTimersByTimeAsync(1999)
    expect(server.calls).toHaveLength(2)
    await vi.advanceTimersByTimeAsync(1)
    expect(server.calls).toHaveLength(3)
    await vi.advanceTimersByTimeAsync(3999)
    expect(server.calls).toHaveLength(3)
    expect(server.batches).toHaveLength(0)
    await vi.advanceTimersByTimeAsync(1)
    expect(server.calls.slice(0, 4).every((c) => c.key === server.calls[0]!.key)).toBe(true)
    expect(server.batches[0]!.observations).toEqual([obs(0)])
    expect(server.batches.flatMap((b) => b.observations)).toHaveLength(26)
    up.dispose()
  })

  it('drops a batch on 400 and still sends the next one', async () => {
    const server = createMockEventsServer({ failFirst: 1, failStatus: 400 })
    const onError = vi.fn()
    const onFatal = vi.fn()
    const up = createEventsUploader({ intakeId: 'i1', consentVersion: 1, fetchImpl: server.fetchImpl, maxBatch: 1, onError, onFatal })
    up.push([obs(1), obs(2)])
    await up.flush()
    expect(onError).toHaveBeenCalledOnce()
    expect(onFatal).not.toHaveBeenCalled()
    expect(server.batches.map((b) => b.observations)).toEqual([[obs(2)]])
    expect(vi.getTimerCount()).toBe(1)
    up.dispose()
  })

  it('drops an invalid batch with onError, never rejects, and sends valid ones', async () => {
    const server = createMockEventsServer()
    const onError = vi.fn()
    const up = createEventsUploader({ intakeId: 'i1', consentVersion: 1, fetchImpl: server.fetchImpl, maxBatch: 1, onError })
    up.push([{ ...obs(1), extra: 1 } as never, obs(2)])
    await expect(up.flush()).resolves.toBeUndefined()
    expect(onError).toHaveBeenCalledOnce()
    expect(onError.mock.calls[0]![0]).toBeInstanceOf(Error)
    expect(server.batches.map((b) => b.observations)).toEqual([[obs(2)]])
    up.dispose()
  })

  it('keeps retrying when onError throws', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const server = createMockEventsServer({ failFirst: 1 })
    const onError = vi.fn(() => { throw new Error('boom') })
    const up = createEventsUploader({ intakeId: 'i1', consentVersion: 1, fetchImpl: server.fetchImpl, onError })
    up.push([obs(1)])
    await expect(up.flush()).resolves.toBeUndefined()
    await vi.advanceTimersByTimeAsync(1000)
    expect(server.batches).toHaveLength(1)
    expect(spy).toHaveBeenCalled()
    up.dispose()
    spy.mockRestore()
  })
})
