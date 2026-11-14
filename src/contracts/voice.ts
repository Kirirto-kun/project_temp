import { z } from 'zod';
import {
  EndReasonSchema,
  InputModeSchema,
  MoneyBasisSchema,
  MoveTypeSchema,
  ObjectiveSchema,
  PeriodSchema,
  RangeSourceSchema,
} from './domain';

/**
 * Measurement constants v1, shared by the browser (sampling) and the server (analysis).
 * They are implementation parameters to be smoke-tested, not claims of universal accuracy.
 */
export const VOICE_CONSTANTS = {
  sampleIntervalMs: 50,
  pauseRmsThreshold: 0.01,
  pauseMinMs: 200,
  baselineTargetMs: 20_000,
  baselineMinSpeechMs: 5_000,
  baselineMinWords: 10,
  turnMinVoicedMs: 500,
  rmsDipRatio: 0.7,
  rmsDipWindowMs: 1_000,
  rmsDipMinContextMs: 300,
  fillers: ['um', 'uh', 'erm', 'er'] as readonly string[],
  maxRecordingMs: 300_000,
  maxBaselineMs: 40_000,
  maxUploadBytes: 20 * 1024 * 1024,
  maxSamples: 300_000 / 50 + 200,
  formulaVersion: 1,
} as const;

export const SUPPORTED_AUDIO_MIME_PREFIXES = ['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg', 'audio/wav', 'audio/x-wav', 'audio/aac'] as const;

export function isSupportedAudioMime(mime: string): boolean {
  const base = mime.split(';')[0]?.trim().toLowerCase() ?? '';
  return (SUPPORTED_AUDIO_MIME_PREFIXES as readonly string[]).includes(base);
}

const nullableMeasure = z.number().finite().nullable();

export const VoiceBaselineSchema = z.object({
  id: z.string(),
  durationMs: z.number().int().min(0),
  wpm: nullableMeasure,
  f0MeanHz: nullableMeasure,
  f0StdHz: nullableMeasure,
  pauseRatio: nullableMeasure,
  rms: nullableMeasure,
  fillersPerMin: nullableMeasure,
  quality: z.enum(['valid', 'insufficient']),
  unavailableReasons: z.array(z.string()),
});
export type VoiceBaseline = z.infer<typeof VoiceBaselineSchema>;

export const AcousticSampleSchema = z.object({
  tMs: z.number().int().min(0),
  rms: z.number().finite().min(0).max(1),
  f0Hz: z.number().finite().min(40).max(1_000).nullable(),
});
export type AcousticSample = z.infer<typeof AcousticSampleSchema>;

export const ManifestTurnSchema = z.object({
  turnId: z.string().min(1),
  t0Ms: z.number().int().min(0),
  t1Ms: z.number().int().min(0),
});
export type ManifestTurn = z.infer<typeof ManifestTurnSchema>;

const manifestBase = {
  recordingId: z.string().min(8).max(80),
  durationMs: z.number().int().min(1).max(VOICE_CONSTANTS.maxRecordingMs + 30_000),
  mimeType: z.string().min(3).max(100),
  timebase: z.literal('recording_ms'),
  samples: z.array(AcousticSampleSchema).max(VOICE_CONSTANTS.maxSamples),
};

export const AudioManifestSchema = z
  .discriminatedUnion('purpose', [
    z.object({
      ...manifestBase,
      purpose: z.literal('baseline'),
      sessionId: z.null(),
      intakeId: z.null(),
      turns: z.array(ManifestTurnSchema).max(0),
    }),
    z.object({
      ...manifestBase,
      purpose: z.literal('session'),
      sessionId: z.string().min(1),
      intakeId: z.null(),
      turns: z.array(ManifestTurnSchema).max(40),
    }),
    z.object({
      ...manifestBase,
      purpose: z.literal('intake'),
      sessionId: z.null(),
      intakeId: z.string().min(1),
      turns: z.array(ManifestTurnSchema).max(60),
    }),
  ])
  .superRefine((manifest, ctx) => {
    manifest.turns.forEach((turn, index) => {
      if (!(turn.t0Ms < turn.t1Ms && turn.t1Ms <= manifest.durationMs)) {
        ctx.addIssue({ code: 'custom', path: ['turns', index], message: 'Turn interval must satisfy 0 <= t0 < t1 <= durationMs.' });
      }
    });
    let previous = -1;
    manifest.samples.forEach((sample, index) => {
      if (sample.tMs < previous || sample.tMs > manifest.durationMs) {
        ctx.addIssue({ code: 'custom', path: ['samples', index], message: 'Samples must be ordered and inside the recording.' });
      }
      previous = sample.tMs;
    });
  });
export type AudioManifest = z.infer<typeof AudioManifestSchema>;
export type AudioPurpose = AudioManifest['purpose'];

export const TurnVoiceSchema = z.object({
  turnId: z.string(),
  turn: z.number().int(),
  wpm: nullableMeasure,
  pauseRatio: nullableMeasure,
  f0MeanHz: nullableMeasure,
  f0StdHz: nullableMeasure,
  pauseBeforeNumberMs: nullableMeasure,
  fillers: z.number().int().min(0).nullable(),
  rmsDipAtNumber: z.boolean().nullable(),
  tensionIndex: z.number().int().min(0).max(100).nullable(),
  unavailableReasons: z.array(z.string()),
  relativeToBaseline: z.boolean(),
});
export type TurnVoice = z.infer<typeof TurnVoiceSchema>;

export const VoiceMetricsSchema = z.object({
  status: z.enum(['pending', 'ready', 'unavailable', 'failed']),
  baselineId: z.string().nullable(),
  turns: z.array(TurnVoiceSchema),
  formulaVersion: z.literal(1),
  reason: z.string().nullable(),
});
export type VoiceMetrics = z.infer<typeof VoiceMetricsSchema>;

export const MeterEffectSchema = z.object({
  patience: z.number().int(),
  trust: z.number().int(),
});

export const DebriefRowSchema = z.object({
  turnId: z.string(),
  turn: z.number().int(),
  move: MoveTypeSchema,
  /** User's own words for the turn, as committed. */
  userText: z.string(),
  counterpartText: z.string(),
  actionKind: z.enum(['hold', 'probe', 'walk_away', 'object', 'concede', 'accept']),
  note: z.string(),
  /** utility(after.offer) - utility(before.offer): positive always means better for the user. */
  offerDeltaMinor: z.number().int(),
  /** How far the user's own ask moved against them on this turn. Explanatory only. */
  userConcessionMinor: z.number().int().min(0),
  meterEffect: MeterEffectSchema,
  quality: z.enum(['good', 'cost', 'neutral']),
  voice: TurnVoiceSchema.nullable(),
  betterLine: z.string().nullable(),
});
export type DebriefRow = z.infer<typeof DebriefRowSchema>;

export const DebriefSchema = z.object({
  sessionId: z.string(),
  replayRootId: z.string(),
  replayOf: z.string().nullable(),
  scenarioId: z.string(),
  scenarioVersion: z.number().int(),
  currency: z.literal('USD'),
  period: PeriodSchema,
  objective: ObjectiveSchema,
  moneyBasis: MoneyBasisSchema,
  inputMode: InputModeSchema,
  rangeSource: RangeSourceSchema,
  outcome: EndReasonSchema,
  reservationAmountMinor: z.number().int(),
  initialOfferMinor: z.number().int(),
  targetMinor: z.number().int(),
  agreedMinor: z.number().int().nullable(),
  leftOnTableMinor: z.number().int().min(0).nullable(),
  leftOnTableAnnualizedMinor: z.number().int().min(0).nullable(),
  gainMinor: z.number().int().min(0).nullable(),
  finalOfferMinor: z.number().int().nullable(),
  rows: z.array(DebriefRowSchema),
  voice: VoiceMetricsSchema,
  persuasionScore: z.object({ value: z.number().int().min(0).max(100), rationale: z.string(), source: z.literal('model') }).nullable(),
  summary: z.string(),
  personaName: z.string(),
  counterpartRole: z.string(),
  kind: z.string(),
});
export type Debrief = z.infer<typeof DebriefSchema>;

export const TENSION_FORMULA_V1 =
  'tension = round(100 × min(1, 0.4·dF + 0.4·dW + 0.2·dP)), where dF = max(0, (F0 − baseF0)/baseF0), dW = max(0, (wpm − baseWpm)/baseWpm), dP = |pauseRatio − basePauseRatio| / max(basePauseRatio, 0.05)';
