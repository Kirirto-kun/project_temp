import { EventsBatchSchema, type EventsBatch } from './types'

/** Stand-in for B's POST /api/intake/:id/events until it exists: validates, de-duplicates by key, records. */
export function createMockEventsServer(o: { failFirst?: number; failStatus?: number; status?: number } = {}) {
  const batches: EventsBatch[] = []
  const calls: { key: string | null }[] = []
  const seen = new Map<string, string>()
  let failuresLeft = o.failFirst ?? 0

  const fetchImpl: typeof fetch = async (_input, init) => {
    const key = new Headers(init?.headers).get('idempotency-key')
    calls.push({ key })
    if (failuresLeft > 0) {
      failuresLeft--
      return new Response(null, { status: o.failStatus ?? 503 })
    }
    if (o.status) return new Response(null, { status: o.status })
    const body = String(init?.body ?? '')
    let json: unknown
    try { json = JSON.parse(body) } catch { return new Response(JSON.stringify({ error: 'invalid_json' }), { status: 400 }) }
    const parsed = EventsBatchSchema.safeParse(json)
    if (!key || !parsed.success) return new Response(JSON.stringify({ error: 'invalid_batch' }), { status: 400 })
    const previous = seen.get(key)
    if (previous !== undefined) return new Response(null, { status: previous === body ? 202 : 409 })
    seen.set(key, body)
    batches.push(parsed.data)
    return new Response(null, { status: 202 })
  }

  return { fetchImpl, batches, calls }
}
