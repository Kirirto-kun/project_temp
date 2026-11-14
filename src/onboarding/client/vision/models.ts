export const TASKS_VISION_VERSION = '1.1.1'
export type PoseTier = 'heavy' | 'full' | 'lite'
/** Served from public/: models at /intake/models, wasm at /intake/wasm. */
export const ASSET_BASE = '/intake'

export const MODEL_FILES = {
  pose: { heavy: 'pose_landmarker_heavy.task', full: 'pose_landmarker_full.task', lite: 'pose_landmarker_lite.task' },
  face: 'face_landmarker.task',
  hand: 'hand_landmarker.task',
} as const

const GCS = 'https://storage.googleapis.com/mediapipe-models'
export const MODEL_SOURCES: Record<string, string> = {
  'pose_landmarker_heavy.task': `${GCS}/pose_landmarker/pose_landmarker_heavy/float16/1/pose_landmarker_heavy.task`,
  'pose_landmarker_full.task': `${GCS}/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task`,
  'pose_landmarker_lite.task': `${GCS}/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task`,
  'face_landmarker.task': `${GCS}/face_landmarker/face_landmarker/float16/1/face_landmarker.task`,
  'hand_landmarker.task': `${GCS}/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task`,
}

export const modelVersion = (tier: PoseTier, thresholdsVersion: number) => `tv${TASKS_VISION_VERSION}/pose-${tier}/t${thresholdsVersion}`
