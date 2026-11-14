import { FaceLandmarker, FilesetResolver, HandLandmarker, PoseLandmarker, type HandLandmarkerResult } from '@mediapipe/tasks-vision'
import { toSample } from './extract'
import { MODEL_FILES, type PoseTier } from './models'
import type { LandmarkSample } from './types'
import type { HandsMode } from './worker-protocol'

export type InferenceOptions = { tier: PoseTier; enableHands: boolean; assetBase: string }
/** Callers must pass strictly increasing `tMs` (MediaPipe VIDEO mode requirement); the session enforces it. */
export type Inference = { run(frame: ImageBitmap, tMs: number, hands: HandsMode): LandmarkSample; close(): void }

const MIN_CONFIDENCE = 0.7
const HAND_REUSE_MS = 250

async function loadVerified(url: string, expected: string | undefined): Promise<Uint8Array> {
  if (!expected) throw new Error(`no pinned hash for ${url}; run npm run vision:assets`)
  const res = await fetch(url)
  if (!res.ok) throw new Error(`failed to load ${url}: HTTP ${res.status}`)
  const buf = await res.arrayBuffer()
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', buf))
  const hash = Array.from(digest, (b) => b.toString(16).padStart(2, '0')).join('')
  if (hash !== expected) throw new Error(`hash mismatch for ${url}`)
  return new Uint8Array(buf)
}

/** GPU first; some browsers (notably Safari in workers) only manage CPU. */
async function withGpuFallback<T>(create: (delegate: 'GPU' | 'CPU') => Promise<T>): Promise<T> {
  try {
    return await create('GPU')
  } catch (err) {
    console.warn('vision: GPU delegate failed, using CPU', err)
    return create('CPU')
  }
}

export async function createInference(o: InferenceOptions): Promise<Inference> {
  const manifestRes = await fetch(`${o.assetBase}/models/manifest.json`)
  if (!manifestRes.ok) throw new Error(`failed to load vision manifest: HTTP ${manifestRes.status}`)
  const manifest = (await manifestRes.json()) as Record<string, string>
  const model = (file: string) => loadVerified(`${o.assetBase}/models/${file}`, manifest[file])
  const fileset = await FilesetResolver.forVisionTasks(`${o.assetBase}/wasm`, true)

  // Close any landmarker already created if a later step throws, so a failed init leaks no WASM heap.
  const made: { close(): void }[] = []
  try {
    const poseModel = await model(MODEL_FILES.pose[o.tier])
    const pose = await withGpuFallback((delegate) => PoseLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetBuffer: poseModel, delegate }, runningMode: 'VIDEO', numPoses: 2,
      minPoseDetectionConfidence: MIN_CONFIDENCE, minPosePresenceConfidence: MIN_CONFIDENCE, minTrackingConfidence: MIN_CONFIDENCE,
    }))
    made.push(pose)
    const faceModel = await model(MODEL_FILES.face)
    const face = await withGpuFallback((delegate) => FaceLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetBuffer: faceModel, delegate }, runningMode: 'VIDEO', numFaces: 2,
      outputFaceBlendshapes: true, outputFacialTransformationMatrixes: true,
      minFaceDetectionConfidence: MIN_CONFIDENCE, minFacePresenceConfidence: MIN_CONFIDENCE, minTrackingConfidence: MIN_CONFIDENCE,
    }))
    made.push(face)
    let hand: HandLandmarker | null = null
    if (o.enableHands) {
      const handModel = await model(MODEL_FILES.hand)
      hand = await withGpuFallback((delegate) => HandLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetBuffer: handModel, delegate }, runningMode: 'VIDEO', numHands: 2,
        minHandDetectionConfidence: MIN_CONFIDENCE, minHandPresenceConfidence: MIN_CONFIDENCE, minTrackingConfidence: MIN_CONFIDENCE,
      }))
    }
    if (hand) made.push(hand)

    const canvas = new OffscreenCanvas(32, 18)
    const ctx2d = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx2d) throw new Error('vision: 2d context unavailable for brightness check')
    const luma = (frame: ImageBitmap) => {
      ctx2d.drawImage(frame, 0, 0, 32, 18)
      const d = ctx2d.getImageData(0, 0, 32, 18).data
      let sum = 0
      for (let i = 0; i < d.length; i += 4) sum += 0.2126 * d[i]! + 0.7152 * d[i + 1]! + 0.0722 * d[i + 2]!
      return sum / (d.length / 4)
    }

    let lastHands: { tMs: number; result: HandLandmarkerResult } | null = null

    return {
      run(frame, tMs, handsMode) {
        const poseRes = pose.detectForVideo(frame, tMs)
        try {
          const faceRes = face.detectForVideo(frame, tMs)
          let handsRes: HandLandmarkerResult | null = null
          if (hand && handsMode !== 'off') {
            if (handsMode === 'run' || !lastHands || tMs - lastHands.tMs > HAND_REUSE_MS) {
              lastHands = { tMs, result: hand.detectForVideo(frame, tMs) }
            }
            handsRes = lastHands.result
          }
          return toSample({ tMs, frameW: frame.width, frameH: frame.height, luma: luma(frame), pose: poseRes, face: faceRes, hands: handsRes })
        } finally {
          poseRes.close()
        }
      },
      close() {
        pose.close()
        face.close()
        hand?.close()
      },
    }
  } catch (err) {
    for (const m of made) {
      try { m.close() } catch { /* keep closing the rest; the original error matters more */ }
    }
    throw err
  }
}
