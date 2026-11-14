import { EventsBatchSchema, type EventsBatch, type Observation } from './types'

export type EventsUploaderOptions = {
  intakeId: string
  consentVersion: number
  fetchImpl: typeof fetch
  baseUrl?: string
  intervalMs?: number
  maxBatch?: number
  onFatal?: (status: number) => void
  onError?: (error: Error) => void
}

export type EventsUploader = {
  push(observations: readonly Observation[]): void
  flush(): Promise<void>
  /** Consent withdrawn: drop queued data and never send again for this consentVersion. */
  revoke(): void
  dispose(): void
}

const BACKOFF_MS = [1000, 2000, 4000]

export function createEventsUploader(o: EventsUploaderOptions): EventsUploader {
  const maxBatch = o.maxBatch ?? 20
  const url = `${o.baseUrl ?? ''}/api/intake/${encodeURIComponent(o.intakeId)}/events`
  const known = new Set<string>()
  let queue: Observation[] = []
  let pending: EventsBatch | null = null
  let seq = 0
  let failures = 0
  let closed = false
  let inFlight: Promise<void> | null = null
  let retryTimer: ReturnType<typeof setTimeout> | null = null
  const interval = setInterval(() => void flush(), o.intervalMs ?? 5000)

  function push(observations: readonly Observation[]) {
    if (closed) return
    for (const obs of observations) {
      if (known.has(obs.id)) continue
      known.add(obs.id)
      queue.push(obs)
    }
    if (queue.length >= maxBatch) void flush()
  }

  function flush(): Promise<void> {
    if (closed) return Promise.resolve()
    inFlight ??= drain().finally(() => { inFlight = null })
    return inFlight
  }

  async function drain(): Promise<void> {
    while (!closed) {
      if (!pending) {
        if (queue.length === 0) return
        pending = EventsBatchSchema.parse({ seq: seq++, consentVersion: o.consentVersion, observations: queue.splice(0, maxBatch) })
      }
      const batch = pending
      let res: Response
      try {
        res = await o.fetchImpl(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'idempotency-key': `${o.intakeId}:${batch.seq}` },
          body: JSON.stringify(batch),
        })
      } catch (err) {
        return fail(err instanceof Error ? err : new Error(String(err)))
      }
      if (closed) return
      if (res.ok) {
        pending = null
        failures = 0
        continue
      }
      if (res.status === 409 || res.status === 410) {
        close()
        o.onFatal?.(res.status)
        return
      }
      return fail(new Error(`events upload failed with HTTP ${res.status}`))
    }
  }

  /** Retry with backoff three times; after that the batch waits for the next interval flush. */
  function fail(error: Error) {
    failures++
    o.onError?.(error)
    const delay = BACKOFF_MS[failures - 1]
    if (delay !== undefined && !retryTimer) {
      retryTimer = setTimeout(() => {
        retryTimer = null
        void flush()
      }, delay)
    }
  }

  function close() {
    closed = true
    queue = []
    pending = null
    clearInterval(interval)
    if (retryTimer) clearTimeout(retryTimer)
  }

  return { push, flush, revoke: close, dispose: close }
}
