import { createInference, type Inference } from './inference'
import type { FromWorker, ToWorker } from './worker-protocol'

type Scope = { postMessage(message: FromWorker): void; onmessage: ((e: MessageEvent<ToWorker>) => void) | null }
const scope = self as unknown as Scope
let inference: Inference | null = null

const message = (err: unknown) => (err instanceof Error ? err.message : String(err)).slice(0, 500)

scope.onmessage = (e) => void handle(e.data)

async function handle(m: ToWorker) {
  switch (m.type) {
    case 'init':
      try {
        inference?.close()
        inference = null
        inference = await createInference(m)
        scope.postMessage({ type: 'ready' })
      } catch (err) {
        scope.postMessage({ type: 'error', id: null, message: message(err) })
      }
      return
    case 'frame':
      try {
        if (!inference) throw new Error('frame received before init')
        const t0 = performance.now()
        const sample = inference.run(m.bitmap, m.tMs, m.hands)
        scope.postMessage({ type: 'sample', id: m.id, sample, inferenceMs: performance.now() - t0 })
      } catch (err) {
        scope.postMessage({ type: 'error', id: m.id, message: message(err) })
      } finally {
        m.bitmap.close()
      }
      return
  }
}
