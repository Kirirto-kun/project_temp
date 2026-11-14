import { z } from 'zod';

/**
 * Shared domain contract, contractVersion 1.
 * Every *Minor field is an integer number of US cents: $104,000 === 10_400_000.
 */
export const CONTRACT_VERSION = 1 as const;

export const LIMITS = {
  maxTurns: 20,
  amountMinMinor: 1,
  amountMaxMinor: 10_000_000_000,
  replyMaxChars: 2_000,
  descriptionMaxChars: 4_000,
  offerTextMaxChars: 20_000,
  sessionLimitSeconds: 300,
  intakeLimitSeconds: 300,
  sessionRetentionSeconds: 24 * 60 * 60,
} as const;

export const MinorAmountSchema = z
  .number()
  .int('Amounts are whole cents.')
  .min(LIMITS.amountMinMinor, 'Amount must be positive.')
  .max(LIMITS.amountMaxMinor, 'Amount is too large.');

export const PeriodSchema = z.enum(['year', 'month', 'one_time']);
export type Period = z.infer<typeof PeriodSchema>;

export const ObjectiveSchema = z.enum(['maximize', 'minimize']);
export type Objective = z.infer<typeof ObjectiveSchema>;

export const ScenarioKindSchema = z.enum(['raise', 'offer', 'rent', 'bill', 'custom']);
export type ScenarioKind = z.infer<typeof ScenarioKindSchema>;

export const ArchetypeSchema = z.enum(['budget_guard', 'analyst', 'relationship', 'hardliner']);
export type Archetype = z.infer<typeof ArchetypeSchema>;

export const MOVE_TYPES = [
  'state_number',
  'justify',
  'concede',
  'ask_question',
  'hold_silence',
  'ultimatum',
  'accept',
  'offtopic',
] as const;
export const MoveTypeSchema = z.enum(MOVE_TYPES);
export type MoveType = z.infer<typeof MoveTypeSchema>;

export const ToneSchema = z.enum(['neutral', 'apologetic', 'assertive', 'aggressive']);
export type Tone = z.infer<typeof ToneSchema>;

export const MoneyBasisSchema = z.enum(['gross', 'net', 'unspecified']);
export type MoneyBasis = z.infer<typeof MoneyBasisSchema>;

export const InputModeSchema = z.enum(['personal', 'example']);
export type InputMode = z.infer<typeof InputModeSchema>;

export const RangeSourceSchema = z.enum(['user_provided', 'practice_assumption', 'example']);
export type RangeSource = z.infer<typeof RangeSourceSchema>;

export const CurrencySchema = z.literal('USD');

const IsoDateSchema = z.iso.date();

/** Kinds that the standard (free) session endpoint can start. */
export const STANDARD_KINDS = ['raise', 'offer', 'rent', 'bill'] as const;
export type StandardKind = (typeof STANDARD_KINDS)[number];

export function objectiveForKind(kind: StandardKind): Objective {
  return kind === 'raise' || kind === 'offer' ? 'maximize' : 'minimize';
}

export function allowedPeriodsForKind(kind: ScenarioKind): readonly Period[] {
  switch (kind) {
    case 'raise':
    case 'offer':
      return ['year'];
    case 'rent':
      return ['month'];
    case 'bill':
      return ['month', 'one_time'];
    case 'custom':
      return ['year', 'month', 'one_time'];
  }
}

export const QuizAnswersBaseSchema = z.object({
  kind: ScenarioKindSchema,
  description: z.string().max(LIMITS.descriptionMaxChars),
  counterpartRole: z.string().trim().min(1).max(80),
  conversationDate: IsoDateSchema.nullable(),
  currentMinor: MinorAmountSchema,
  targetMinor: MinorAmountSchema,
  marketLowMinor: MinorAmountSchema,
  marketHighMinor: MinorAmountSchema,
  period: PeriodSchema,
  fear: z.string().max(500),
  avatarId: z.string().trim().min(1).max(64),
  currency: CurrencySchema,
  moneyBasis: MoneyBasisSchema,
  inputMode: InputModeSchema,
  rangeSource: RangeSourceSchema,
  userRole: z.string().trim().max(120).optional(),
  sourceIntakeId: z.string().max(64).optional(),
  /** Only for kind=custom, where the direction cannot be inferred from the kind. */
  objective: ObjectiveSchema.optional(),
});

export type QuizAnswers = z.infer<typeof QuizAnswersBaseSchema>;

/** Objective for a quiz, or null when a custom quiz does not choose one. */
export function quizObjective(quiz: Pick<QuizAnswers, 'kind' | 'objective'>): Objective | null {
  if (quiz.kind === 'custom') return quiz.objective ?? null;
  return objectiveForKind(quiz.kind);
}

export const QuizAnswersSchema = QuizAnswersBaseSchema.superRefine((quiz, ctx) => {
  if (!allowedPeriodsForKind(quiz.kind).includes(quiz.period)) {
    ctx.addIssue({ code: 'custom', path: ['period'], message: `A ${quiz.kind} scenario cannot use the ${quiz.period} period.` });
  }
  if (quiz.marketLowMinor > quiz.marketHighMinor) {
    ctx.addIssue({ code: 'custom', path: ['marketLowMinor'], message: 'The low end of the range is above the high end.' });
  }
  const objective = quizObjective(quiz);
  if (!objective) {
    ctx.addIssue({ code: 'custom', path: ['objective'], message: 'Choose whether you want the number to go up or down.' });
    return;
  }
  if (objective === 'maximize') {
    if (quiz.targetMinor <= quiz.currentMinor) {
      ctx.addIssue({ code: 'custom', path: ['targetMinor'], message: 'Your target should be above the current amount.' });
    }
    if (quiz.currentMinor > quiz.marketHighMinor) {
      ctx.addIssue({ code: 'custom', path: ['marketHighMinor'], message: 'The high end of the range should be at least your current amount.' });
    }
  } else {
    if (quiz.targetMinor >= quiz.currentMinor) {
      ctx.addIssue({ code: 'custom', path: ['targetMinor'], message: 'Your target should be below the current amount.' });
    }
    if (quiz.currentMinor < quiz.marketLowMinor) {
      ctx.addIssue({ code: 'custom', path: ['marketLowMinor'], message: 'The low end of the range should be at most the current amount.' });
    }
  }
});

export const PersonaSchema = z.object({
  name: z.string().min(1).max(60),
  role: z.string().min(1).max(80),
  archetype: ArchetypeSchema,
  avatarId: z.string().min(1).max(64),
  voiceKey: z.string().min(1).max(64),
});
export type Persona = z.infer<typeof PersonaSchema>;

export const ObjectionSchema = z.object({
  id: z.string().min(1).max(64),
  text: z.string().min(1).max(300),
  clearedBy: z.array(MoveTypeSchema).min(1),
});
export type Objection = z.infer<typeof ObjectionSchema>;

export const ScenarioConfigSchema = z
  .object({
    id: z.string().min(1).max(64),
    version: z.number().int().min(1),
    kind: ScenarioKindSchema,
    currency: CurrencySchema,
    period: PeriodSchema,
    objective: ObjectiveSchema,
    currentMinor: MinorAmountSchema,
    targetMinor: MinorAmountSchema,
    marketLowMinor: MinorAmountSchema,
    marketHighMinor: MinorAmountSchema,
    reservationAmountMinor: MinorAmountSchema,
    initialOfferMinor: MinorAmountSchema,
    concessionStepMinor: MinorAmountSchema,
    patience0: z.number().int().min(1).max(100),
    trust0: z.number().int().min(0).max(100),
    maxTurns: z.number().int().min(1).max(LIMITS.maxTurns),
    objections: z.array(ObjectionSchema).max(8),
    persona: PersonaSchema,
    moneyBasis: MoneyBasisSchema,
    inputMode: InputModeSchema,
    rangeSource: RangeSourceSchema,
    counterpartRole: z.string().min(1).max(80),
    userRole: z.string().max(120).nullable(),
    description: z.string().max(LIMITS.descriptionMaxChars),
    fear: z.string().max(500),
    sourceIntakeId: z.string().max(64).nullable(),
  })
  .superRefine((config, ctx) => {
    if (config.marketLowMinor > config.marketHighMinor) {
      ctx.addIssue({ code: 'custom', path: ['marketLowMinor'], message: 'marketLow is above marketHigh.' });
    }
    const towardUser = config.objective === 'maximize' ? 1 : -1;
    if (towardUser * (config.reservationAmountMinor - config.initialOfferMinor) < 0) {
      ctx.addIssue({ code: 'custom', path: ['initialOfferMinor'], message: 'The initial offer is already past the reservation amount.' });
    }
  });
export type ScenarioConfig = z.infer<typeof ScenarioConfigSchema>;

export const EndReasonSchema = z.enum(['accepted', 'walked_away', 'timeout', 'stopped']);
export type EndReason = z.infer<typeof EndReasonSchema>;

export const CounterpartActionSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('hold') }),
  z.object({ kind: z.literal('probe') }),
  z.object({ kind: z.literal('walk_away') }),
  z.object({ kind: z.literal('object'), objectionId: z.string().min(1) }),
  z.object({ kind: z.literal('concede'), toMinor: MinorAmountSchema }),
  z.object({ kind: z.literal('accept'), atMinor: MinorAmountSchema }),
]);
export type CounterpartAction = z.infer<typeof CounterpartActionSchema>;

export const MoveSchema = z.object({
  type: MoveTypeSchema,
  amountMinor: MinorAmountSchema.nullable(),
  hasReason: z.boolean(),
  tone: ToneSchema,
  raw: z.string().max(LIMITS.replyMaxChars),
});
export type Move = z.infer<typeof MoveSchema>;

const MeterSchema = z.number().int().min(0).max(100);

export const CoreStateSchema = z.object({
  offerMinor: MinorAmountSchema.nullable(),
  userLastMinor: MinorAmountSchema.nullable(),
  patience: MeterSchema,
  trust: MeterSchema,
  clearedObjectionIds: z.array(z.string()),
  lastAction: CounterpartActionSchema.nullable(),
  turn: z.number().int().min(0),
  ended: EndReasonSchema.nullable(),
  agreedMinor: MinorAmountSchema.nullable(),
});
export type CoreState = z.infer<typeof CoreStateSchema>;

export const TransportModeSchema = z.enum(['text', 'voice']);
export type TransportMode = z.infer<typeof TransportModeSchema>;

export const TurnInputSchema = z.object({
  turnId: z.string().min(8).max(80),
  expectedVersion: z.number().int().min(0),
  text: z.string().trim().min(1).max(LIMITS.replyMaxChars),
  mode: TransportModeSchema,
  sourceTurnKey: z.string().max(200).nullable(),
});
export type TurnInput = z.infer<typeof TurnInputSchema>;

export const TurnRecordSchema = z.object({
  turnId: z.string(),
  turn: z.number().int().min(1),
  input: TurnInputSchema,
  move: MoveSchema,
  before: CoreStateSchema,
  after: CoreStateSchema,
  action: CounterpartActionSchema,
  replyText: z.string(),
  committedAt: z.string(),
});
export type TurnRecord = z.infer<typeof TurnRecordSchema>;

export const VoiceAnalysisStatusSchema = z.enum(['not_requested', 'pending', 'ready', 'unavailable', 'failed']);
export type VoiceAnalysisStatus = z.infer<typeof VoiceAnalysisStatusSchema>;

export const SessionStateSchema = z.object({
  id: z.string(),
  ownerId: z.string(),
  scenarioId: z.string(),
  scenarioVersion: z.number().int(),
  scenarioSnapshot: ScenarioConfigSchema,
  initialState: CoreStateSchema,
  state: CoreStateSchema,
  turns: z.array(TurnRecordSchema),
  version: z.number().int().min(0),
  startedAt: z.string(),
  deadlineAt: z.string(),
  replayOf: z.string().nullable(),
  replayRootId: z.string(),
  baselineId: z.string().nullable(),
  voiceAnalysisStatus: VoiceAnalysisStatusSchema,
  activeMode: TransportModeSchema,
  transportEpoch: z.number().int().min(0),
  /** The one active voice binding for this session, or null in text mode. */
  voiceBindingId: z.string().nullable(),
  analysisId: z.string().nullable(),
  /** Counterpart's opening line, rendered when the session is created. */
  openingLine: z.string(),
});
export type SessionState = z.infer<typeof SessionStateSchema>;

export const PublicPersonaSchema = PersonaSchema.pick({ name: true, role: true, archetype: true, avatarId: true });
export type PublicPersona = z.infer<typeof PublicPersonaSchema>;

export const ScenarioSummarySchema = z.object({
  kind: ScenarioKindSchema,
  currency: CurrencySchema,
  period: PeriodSchema,
  objective: ObjectiveSchema,
  currentMinor: MinorAmountSchema,
  targetMinor: MinorAmountSchema,
  marketLowMinor: MinorAmountSchema,
  marketHighMinor: MinorAmountSchema,
  moneyBasis: MoneyBasisSchema,
  inputMode: InputModeSchema,
  rangeSource: RangeSourceSchema,
  counterpartRole: z.string(),
  persona: PublicPersonaSchema,
});
export type ScenarioSummary = z.infer<typeof ScenarioSummarySchema>;

export const SessionMessageSchema = z.object({
  id: z.string(),
  turnId: z.string().nullable(),
  sourceTurnKey: z.string().nullable(),
  role: z.enum(['user', 'counterpart']),
  text: z.string(),
  status: z.literal('committed'),
});
export type SessionMessage = z.infer<typeof SessionMessageSchema>;

export const SessionViewSchema = z.object({
  id: z.string(),
  contractVersion: z.literal(CONTRACT_VERSION),
  version: z.number().int(),
  scenarioSummary: ScenarioSummarySchema,
  offerMinor: MinorAmountSchema.nullable(),
  patience: MeterSchema,
  trust: MeterSchema,
  turn: z.number().int(),
  maxTurns: z.number().int(),
  ended: EndReasonSchema.nullable(),
  agreedMinor: MinorAmountSchema.nullable(),
  deadlineAt: z.string(),
  messages: z.array(SessionMessageSchema),
  voiceAnalysisStatus: VoiceAnalysisStatusSchema,
  replayOf: z.string().nullable(),
  replayRootId: z.string(),
  activeMode: TransportModeSchema,
  baselineId: z.string().nullable(),
});
export type SessionView = z.infer<typeof SessionViewSchema>;
