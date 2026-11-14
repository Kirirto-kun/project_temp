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

const INIT_TIMEOUT_MS = 30_000

export function createWorkerSource(assetBase = ASSET_BASE, opts: { initTimeoutMs?: number } = {}): LandmarkSource {
  const initTimeoutMs = opts.initTimeoutMs ?? INIT_TIMEOUT_MS
  const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })
  const pending = new Map<number, Waiter<ProcessResult>>()
  let initWaiter: Waiter<void> | null = null
  let initTimer: ReturnType<typeof setTimeout> | undefined
  let nextId = 0
  let dead: Error | null = null // set once disposed or after a fatal worker failure; never cleared

  const settleInit = () => {
    clearTimeout(initTimer)
    const w = initWaiter
    initWaiter = null
    return w
  }

  const failAll = (error: Error) => {
    settleInit()?.reject(error)
    for (const w of pending.values()) w.reject(error)
    pending.clear()
  }

  const kill = (error: Error) => {
    if (dead) return
    dead = error
    // terminate() frees the worker's WASM heap and landmarkers; the worker needs no cleanup message.
    worker.terminate()
    failAll(error)
  }

  worker.onmessage = (e: MessageEvent<unknown>) => {
    const parsed = FromWorkerSchema.safeParse(e.data)
    if (!parsed.success) return kill(new Error('vision worker sent an unexpected message'))
    const m = parsed.data
    if (m.type === 'ready') {
      settleInit()?.resolve()
    } else if (m.type === 'sample') {
      pending.get(m.id)?.resolve({ sample: m.sample, inferenceMs: m.inferenceMs })
      pending.delete(m.id)
    } else {
      const error = new Error(`vision worker: ${m.message}`)
      if (m.id === null) kill(error)
      else {
        pending.get(m.id)?.reject(error)
        pending.delete(m.id)
      }
    }
  }
  worker.onerror = (e) => kill(new Error(`vision worker crashed: ${e.message}`))
  worker.onmessageerror = () => kill(new Error('vision worker sent an undeserializable message'))

  return {
    init: (o) => new Promise<void>((resolve, reject) => {
      if (dead) return reject(dead)
      if (initWaiter) return reject(new Error('vision source init already in progress'))
      initWaiter = { resolve, reject }
      initTimer = setTimeout(() => kill(new Error(`vision worker did not start within ${Math.round(initTimeoutMs / 1000)} s`)), initTimeoutMs)
      try {
        worker.postMessage({ type: 'init', tier: o.tier, enableHands: o.enableHands, assetBase } satisfies ToWorker)
      } catch (err) {
        settleInit()
        reject(err instanceof Error ? err : new Error(String(err)))
      }
    }),
    process: (bitmap, tMs, hands) => new Promise<ProcessResult>((resolve, reject) => {
      if (dead) {
        bitmap.close()
        return reject(dead)
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
    dispose: () => kill(new Error('vision source disposed')),
  }
}

/** Same pipeline on the main thread, for browsers where MediaPipe will not start in a module worker. */
export function createMainThreadSource(assetBase = ASSET_BASE): LandmarkSource {
  let inference: import('./inference').Inference | null = null
  let initializing = false
  let disposed = false
  return {
    async init(o) {
      if (disposed) throw new Error('vision source disposed')
      if (initializing) throw new Error('vision source init already in progress')
      initializing = true
      try {
        const { createInference } = await import('./inference')
        const created = await createInference({ ...o, assetBase })
        if (disposed) {
          created.close()
          throw new Error('vision source disposed')
        }
        inference?.close()
        inference = created
      } finally {
        initializing = false
      }
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
      disposed = true
      inference?.close()
      inference = null
    },
  }
}
