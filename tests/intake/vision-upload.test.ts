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
    expect(server.calls[0]!.key).toBe('i1:0')
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
    expect(server.calls.map((c) => c.key)).toEqual(['i1:0', 'i1:0'])
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
})
