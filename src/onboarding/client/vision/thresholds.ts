/** Engineering start values, tuned only via scripts/vision-eval.ts. Not behavioural norms. */
export const THRESHOLDS = {
  version: 1,
  minConfidence: 0.7,
  minLuma: 40,
  maxSampleGapMs: 300,
  cameraJumpFrac: 0.3,
  /** Frames up to this far apart are compared; must exceed the 5 fps frame gap (200 ms). */
  cameraJumpWindowMs: 350,
  cameraMovedInvalidMs: 1000,
  referenceMs: 5000,
  referenceMinSamples: 10,
  minShoulderWidth: 0.05,
  headTurnYawDeg: 25,
  headTurnMinMs: 2000,
  headDownPitchDeg: -20,
  headDownMinMs: 2000,
  /** Nose-to-shoulder-line distance below the reference by this many shoulder widths (face pitch fails at steep angles). */
  headDownNeckDropWidths: 0.15,
  /** Face lost: nose this many shoulder widths sideways from its reference counts as turned away. */
  headTurnNoseOffsetWidths: 0.2,
  /** Share of a nose drop that must come from the shoulders rising to call it a shoulder raise, not a head drop. */
  shoulderRiseShare: 0.5,
  /** A second face/pose seen for less than this is a detector ghost, not another person. */
  multiplePeopleMinMs: 500,
  gazeConeDeg: 20,
  gazeIrisYawGainDeg: 35,
  gazeIrisPitchGainDeg: 25,
  outOfFrameMinMs: 1000,
  postureShiftWidths: 0.25,
  postureShiftMinMs: 2000,
  leanScaleChange: 0.15,
  leanMinMs: 2000,
  shoulderRaiseWidths: 0.15,
  shoulderRaiseMinMs: 1500,
  handToFaceBoxExpand: 0.25,
  handToFaceMinMs: 700,
  gestureSpeed: 0.25,
  gestureMinMs: 200,
  gestureGapMs: 400,
  smileThreshold: 0.4,
  browRaiseThreshold: 0.5,
  browRaiseMinMs: 500,
  lipPressThreshold: 0.5,
  lipPressMinMs: 1000,
  blinkThreshold: 0.5,
  blinkMaxIntervalMs: 120,
  summaryMinValidMs: 10000,
  summaryMinCoverage: 0.7,
  /** 2x the 5-minute intake call limit, so a normal call is never trimmed. */
  maxBufferMs: 600_000,
}

export type Thresholds = typeof THRESHOLDS
