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
  /** Resolves when the queue is drained or delivery failed; it never rejects (errors go to onError). */
  flush(): Promise<void>
  /** Consent withdrawn: drop queued data and never send again for this consentVersion. */
  revoke(): void
  /** Drops unsent data, so callers should flush() first if they want it delivered. */
  dispose(): void
}

const BACKOFF_MS = [1000, 2000, 4000]

export function createEventsUploader(o: EventsUploaderOptions): EventsUploader {
  const maxBatch = o.maxBatch ?? 20
  const url = `${o.baseUrl ?? ''}/api/intake/${encodeURIComponent(o.intakeId)}/events`
  const instanceId = crypto.randomUUID()
  const known = new Set<string>()
  let queue: Observation[] = []
  let pending: EventsBatch | null = null
  let seq = 0
  let failures = 0
  let closed = false
  let inFlight: Promise<void> | null = null
  let followUp: Promise<void> | null = null
  let retryTimer: ReturnType<typeof setTimeout> | null = null
  const interval = setInterval(() => { if (!retryTimer) void flush() }, o.intervalMs ?? 5000)

  function push(observations: readonly Observation[]) {
    if (closed) return
    for (const obs of observations) {
      if (known.has(obs.id)) continue
      known.add(obs.id)
      queue.push(obs)
    }
    if (queue.length >= maxBatch && !retryTimer && failures === 0) void flush()
  }

  function flush(): Promise<void> {
    if (closed) return Promise.resolve()
    if (inFlight) {
      // The running drain may already have seen an empty queue, so chain one more pass.
      followUp ??= inFlight.then(() => { followUp = null; return flush() })
      return followUp
    }
    inFlight = drain().catch((err) => report(o.onError, toError(err))).finally(() => { inFlight = null })
    return inFlight
  }

  async function drain(): Promise<void> {
    while (!closed) {
      if (!pending) {
        if (queue.length === 0) return
        const parsed = EventsBatchSchema.safeParse({ seq, consentVersion: o.consentVersion, observations: queue.splice(0, maxBatch) })
        if (!parsed.success) {
          report(o.onError, new Error(`invalid events batch dropped: ${parsed.error.message}`))
          continue
        }
        seq++
        pending = parsed.data
      }
      const batch = pending
      let res: Response
      try {
        res = await o.fetchImpl(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'idempotency-key': `${o.intakeId}:${o.consentVersion}:${instanceId}:${batch.seq}` },
          body: JSON.stringify(batch),
        })
      } catch (err) {
        return fail(toError(err))
      }
      if (closed) return
      if (res.ok) {
        pending = null
        failures = 0
        continue
      }
      if (res.status === 409 || res.status === 410) {
        close()
        report(o.onFatal, res.status)
        return
      }
      if (res.status >= 400 && res.status < 500 && res.status !== 408 && res.status !== 429) {
        pending = null
        failures = 0
        report(o.onError, new Error(`events batch ${batch.seq} dropped: HTTP ${res.status}`))
        continue
      }
      return fail(new Error(`events upload failed with HTTP ${res.status}`))
    }
  }

  /** Retry with backoff three times; after that the batch waits for the next interval flush. */
  function fail(error: Error) {
    if (closed) return
    failures++
    report(o.onError, error)
    const delay = BACKOFF_MS[failures - 1]
    if (!closed && delay !== undefined && !retryTimer) {
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
    retryTimer = null
  }

  return { push, flush, revoke: close, dispose: close }
}

const toError = (err: unknown) => (err instanceof Error ? err : new Error(String(err)))

/** A throwing callback must not break the drain or skip retry scheduling. */
function report<A>(cb: ((arg: A) => void) | undefined, arg: A) {
  try {
    cb?.(arg)
  } catch (err) {
    console.error('events uploader callback threw', err)
  }
}
