import { detectAll } from './detect'
import { modelVersion, type PoseTier } from './models'
import { initialPacing, nextPacing, type Pacing } from './pacing'
import { createWorkerSource, type LandmarkSource } from './source'
import { p95 } from './stats'
import { summarize } from './summary'
import { THRESHOLDS, type Thresholds } from './thresholds'
import type { LandmarkSample, Observation, UnavailableReason, VisualSummary } from './types'
import type { EventsUploader } from './upload'
import type { HandsMode } from './worker-protocol'

export type VisionStatus = 'starting' | 'running' | 'stopped' | 'off'
export type VisionUpdate = {
  status: VisionStatus
  tier: PoseTier | null
  pacing: Pacing
  observations: Observation[]
  validMs: number
  observedMs: number
  offReason: UnavailableReason | null
}

export type VisionSessionOptions = {
  /** Local camera preview. Owned by the caller, who also stops its tracks. */
  video: HTMLVideoElement
  /** Recording-relative clock shared with audio capture (ms). */
  clock: () => number
  recordingId: string
  /** visualAnalysis consent. Without it no session may exist. */
  consent: boolean
  enableHands: boolean
  signal?: AbortSignal
  source?: LandmarkSource
  uploader?: Pick<EventsUploader, 'push' | 'flush'>
  grabFrame?: (video: HTMLVideoElement) => Promise<ImageBitmap | null>
  sleep?: (ms: number) => Promise<void>
  onUpdate?: (u: VisionUpdate) => void
  /** Debug/calibration only (demo page). */
  onSample?: (s: LandmarkSample) => void
  thresholds?: Thresholds
}

export type VisionSession = {
  start(): Promise<void>
  stop(): Promise<VisualSummary>
  getSamples(): LandmarkSample[]
  getObservations(): Observation[]
}

/** Heavy/full limits follow the pacing budget (60% of the 100 ms frame at 10 fps). */
const TIER_LIMITS: readonly (readonly [PoseTier, number])[] = [['heavy', 40], ['full', 60]]
const BENCHMARK_FRAMES = 20
const UPDATE_EVERY_MS = 1000
/** Events ending this long ago will not grow any more and are safe to upload. */
const FINALIZE_LAG_MS = 3000

const defaultGrab = async (video: HTMLVideoElement) => (video.readyState >= 2 ? createImageBitmap(video) : null)
const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

export function createVisionSession(o: VisionSessionOptions): VisionSession {
  if (!o.consent) throw new Error('visual analysis requires visualAnalysis consent')
  const t = o.thresholds ?? THRESHOLDS
  const grab = o.grabFrame ?? defaultGrab
  const sleep = o.sleep ?? defaultSleep

  const samples: LandmarkSample[] = []
  let source: LandmarkSource | null = null
  let tier: PoseTier | null = null
  let pacing = initialPacing(o.enableHands)
  let status: VisionStatus = 'starting'
  let offReason: UnavailableReason | null = null
  let running = false
  let started = false
  let stopping: Promise<VisualSummary> | null = null
  let lastT = -1
  let frameIndex = 0
  let lastUpdateT = 0
  let observations: Observation[] = []

  const detect = () => detectAll(samples, {
    recordingId: o.recordingId, modelVersion: modelVersion(tier ?? 'lite', t.version), handsEnabled: o.enableHands, thresholds: t,
  })

  function emit(validMs = 0, observedMs = 0) {
    o.onUpdate?.({ status, tier, pacing, observations, validMs, observedMs, offReason })
  }

  async function step(): Promise<number | null> {
    const clockMs = o.clock() // before grabbing, so a throwing clock cannot leak a frame
    const frame = await grab(o.video)
    if (!frame) return null
    const src = source
    if (!running || !src) {
      frame.close()
      return null
    }
    const tMs = Math.max(clockMs, lastT + 1)
    lastT = tMs
    const hands: HandsMode = !pacing.hands ? 'off' : frameIndex++ % 2 === 0 ? 'run' : 'reuse'
    const { sample, inferenceMs } = await src.process(frame, tMs, hands)
    if (!running) return null
    samples.push(sample)
    if (samples.length > t.maxSamples) samples.shift()
    o.onSample?.(sample)
    return inferenceMs
  }

  async function pickTier(): Promise<PoseTier> {
    for (const [candidate, limit] of TIER_LIMITS) {
      if (!running || !source) return 'lite'
      await source.init({ tier: candidate, enableHands: o.enableHands })
      tier = candidate
      const times: number[] = []
      for (let attempts = 0; running && times.length < BENCHMARK_FRAMES && attempts < BENCHMARK_FRAMES * 5; attempts++) {
        const ms = await step()
        if (ms === null) await sleep(50)
        else times.push(ms)
      }
      if (times.length > 0 && p95(times) < limit) return candidate
    }
    if (!running || !source) return 'lite'
    await source.init({ tier: 'lite', enableHands: o.enableHands })
    return 'lite'
  }

  function goOff(reason: UnavailableReason) {
    status = 'off'
    offReason = reason
    running = false
    source?.dispose()
    source = null
    emit()
  }

  async function run() {
    try {
      source = o.source ?? createWorkerSource()
      tier = await pickTier()
    } catch (err) {
      if (!running) return
      console.error('vision: model init failed', err)
      return goOff('model_failed')
    }
    if (!running) return
    status = 'running'
    emit()
    let recent: number[] = []
    while (running) {
      const started = performance.now()
      let ms: number | null
      try {
        ms = await step()
      } catch (err) {
        if (!running) return
        console.error('vision: frame failed', err)
        return goOff('model_failed')
      }
      if (!running) return
      if (ms !== null) {
        recent.push(ms)
        if (recent.length >= pacing.fps) {
          const next = nextPacing(pacing, p95(recent))
          recent = []
          if (next !== pacing) {
            pacing = next
            if (pacing.off) return goOff('device_too_slow')
          }
        }
      }
      if (lastT - lastUpdateT >= UPDATE_EVERY_MS) {
        lastUpdateT = lastT
        const { qualified, observations: next } = detect()
        observations = next
        o.uploader?.push(observations.filter((x) => x.unit === 'ms' && x.endMs < lastT - FINALIZE_LAG_MS))
        const validMs = qualified.reduce((s, x) => s + (x.valid ? x.durMs : 0), 0)
        const observedMs = qualified.reduce((s, x) => s + x.durMs, 0)
        emit(validMs, observedMs)
      }
      await sleep(Math.max(0, 1000 / pacing.fps - (performance.now() - started)))
    }
  }

  const onAbort = () => {
    stop().catch((err) => console.error('vision: stop on abort failed', err))
  }

  function stop(): Promise<VisualSummary> {
    return (stopping ??= doStop())
  }

  async function doStop(): Promise<VisualSummary> {
    running = false
    o.signal?.removeEventListener('abort', onAbort)
    source?.dispose()
    source = null
    if (status !== 'off') status = 'stopped'
    const { qualified, observations: finalObs } = detect()
    observations = finalObs
    if (o.uploader) {
      o.uploader.push(finalObs)
      await o.uploader.flush()
    }
    emit()
    if (samples.length === 0) {
      return { status: 'unavailable', validMs: 0, observedMs: 0, coverage: 0, unavailableReason: offReason ?? 'camera_off', events: [], metrics: [] }
    }
    return summarize(qualified, finalObs, t)
  }

  return {
    async start() {
      if (stopping) throw new Error('vision session already stopped')
      if (started) throw new Error('vision session already started')
      started = true
      if (o.signal?.aborted) {
        await stop()
        return
      }
      running = true
      emit()
      o.signal?.addEventListener('abort', onAbort, { once: true })
      void run()
    },
    stop,
    getSamples: () => [...samples],
    getObservations: () => [...observations],
  }
}
