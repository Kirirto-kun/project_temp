import { ASSET_BASE, type PoseTier } from './models'
import type { LandmarkSample } from './types'
import { FromWorkerSchema, type HandsMode, type ToWorker } from './worker-protocol'

export type ProcessResult = { sample: LandmarkSample; inferenceMs: number }

export interface LandmarkSource {
  init(o: { tier: PoseTier; enableHands: boolean }): Promise<void>
  /** Takes ownership of `frame` and closes it. */
  process(frame: ImageBitmap, tMs: number, hands: HandsMode): Promise<ProcessResult>
  dispose(): void
}

type Waiter<T> = { resolve: (v: T) => void; reject: (e: Error) => void }

export function createWorkerSource(assetBase = ASSET_BASE): LandmarkSource {
  const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })
  const pending = new Map<number, Waiter<ProcessResult>>()
  let initWaiter: Waiter<void> | null = null
  let nextId = 0

  const failAll = (error: Error) => {
    initWaiter?.reject(error)
    initWaiter = null
    for (const w of pending.values()) w.reject(error)
    pending.clear()
  }

  worker.onmessage = (e: MessageEvent<unknown>) => {
    const parsed = FromWorkerSchema.safeParse(e.data)
    if (!parsed.success) return failAll(new Error('vision worker sent an unexpected message'))
    const m = parsed.data
    if (m.type === 'ready') {
      initWaiter?.resolve()
      initWaiter = null
    } else if (m.type === 'sample') {
      pending.get(m.id)?.resolve({ sample: m.sample, inferenceMs: m.inferenceMs })
      pending.delete(m.id)
    } else {
      const error = new Error(`vision worker: ${m.message}`)
      if (m.id === null) failAll(error)
      else {
        pending.get(m.id)?.reject(error)
        pending.delete(m.id)
      }
    }
  }
  worker.onerror = (e) => failAll(new Error(`vision worker crashed: ${e.message}`))

  worker.onmessageerror = () => failAll(new Error('vision worker sent an undeserializable message'))

  let disposed = false
  const DISPOSED = () => new Error('vision source disposed')

  return {
    init: (o) => new Promise<void>((resolve, reject) => {
      if (disposed) return reject(DISPOSED())
      // A newer init supersedes a pending one: the earlier caller is rejected rather than orphaned.
      initWaiter?.reject(new Error('vision init superseded'))
      initWaiter = { resolve, reject }
      try {
        worker.postMessage({ type: 'init', tier: o.tier, enableHands: o.enableHands, assetBase } satisfies ToWorker)
      } catch (err) {
        initWaiter = null
        reject(err instanceof Error ? err : new Error(String(err)))
      }
    }),
    process: (bitmap, tMs, hands) => new Promise<ProcessResult>((resolve, reject) => {
      if (disposed) {
        bitmap.close()
        return reject(DISPOSED())
      }
      const id = nextId++
      pending.set(id, { resolve, reject })
      try {
        worker.postMessage({ type: 'frame', id, tMs, bitmap, hands } satisfies ToWorker, [bitmap])
      } catch (err) {
        pending.delete(id)
        bitmap.close() // the transfer did not happen, so we still own it
        reject(err instanceof Error ? err : new Error(String(err)))
      }
    }),
    // terminate() frees the worker's WASM heap and landmarkers; the worker needs no cleanup message.
    dispose: () => {
      disposed = true
      worker.terminate()
      failAll(DISPOSED())
    },
  }
}

/** Same pipeline on the main thread, for browsers where MediaPipe will not start in a module worker. */
export function createMainThreadSource(assetBase = ASSET_BASE): LandmarkSource {
  let inference: import('./inference').Inference | null = null
  let generation = 0 // bumped by dispose/init so a stale in-flight init can detect it was superseded
  return {
    async init(o) {
      const gen = ++generation
      const { createInference } = await import('./inference')
      const created = await createInference({ ...o, assetBase })
      if (gen !== generation) {
        created.close()
        throw new Error('vision source disposed')
      }
      inference?.close()
      inference = created
    },
    async process(frame, tMs, hands) {
      try {
        if (!inference) throw new Error('process called before init')
        const t0 = performance.now()
        const sample = inference.run(frame, tMs, hands)
        return { sample, inferenceMs: performance.now() - t0 }
      } finally {
        frame.close()
      }
    },
    dispose() {
      generation++
      inference?.close()
      inference = null
    },
  }
}
