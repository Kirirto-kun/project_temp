import 'server-only';
import {
  LIMITS,
  QuizAnswersSchema,
  ScenarioConfigSchema,
  STANDARD_KINDS,
  type QuizAnswers,
  type ScenarioConfig,
  type SessionState,
  type SessionView,
  type TransportMode,
  type TurnInput,
  type TurnRecord,
} from '@/contracts/domain';
import type { CreateSessionRequest } from '@/contracts/api';
import type { Debrief, VoiceMetrics } from '@/contracts/voice';
import { buildQuizAnswers, PracticeDraftError } from '@/domain/intake-handoff';
import { applyMove, createInitialState, finishSession } from '@/engine';
import { buildDebrief, classifyMove, createScenario, renderCounterpart, renderOpening } from '@/intelligence';
import { ScenarioBuildError } from '@/scenarios';
import { ApiError } from '../http';
import { bodyHash, newId } from '../ids';
import type { PlatformDeps } from '../platform';
import { readJson } from '../storage/kv';
import { SessionRepo, turnLockKey } from '../storage/sessions';
import { toSessionView } from './view';

const TURN_LOCK_SECONDS = 30;

export function sessionRepo(deps: PlatformDeps): SessionRepo {
  return new SessionRepo(deps.kv, deps.now);
}

export async function loadOwnedSession(deps: PlatformDeps, sessionId: string, ownerId: string): Promise<SessionState> {
  const session = await sessionRepo(deps).read(sessionId);
  if (!session || session.ownerId !== ownerId) throw new ApiError('NOT_FOUND', 'This practice round is not available. It may have expired after 24 hours.');
  return session;
}

/** Applies the server deadline: a session past its 5 minutes is finished as timeout. */
export async function enforceDeadline(deps: PlatformDeps, session: SessionState): Promise<SessionState> {
  if (session.state.ended || deps.now().getTime() < new Date(session.deadlineAt).getTime()) return session;
  const { session: updated } = await sessionRepo(deps).update(session.id, (current) =>
    current.state.ended ? null : { ...current, state: finishSession(current.state, 'timeout'), activeMode: current.activeMode, voiceBindingId: null },
  );
  return updated;
}

function freshSession(deps: PlatformDeps, ownerId: string, config: ScenarioConfig, extra: { replayOf: string | null; replayRootId: string | null; baselineId: string | null }): SessionState {
  const id = newId('ses');
  const now = deps.now();
  const initial = createInitialState(config);
  return {
    id,
    ownerId,
    scenarioId: config.id,
    scenarioVersion: config.version,
    scenarioSnapshot: config,
    initialState: initial,
    state: initial,
    turns: [],
    version: 1,
    startedAt: now.toISOString(),
    deadlineAt: new Date(now.getTime() + LIMITS.sessionLimitSeconds * 1_000).toISOString(),
    replayOf: extra.replayOf,
    replayRootId: extra.replayRootId ?? id,
    baselineId: extra.baselineId,
    voiceAnalysisStatus: 'not_requested',
    activeMode: 'text',
    transportEpoch: 0,
    voiceBindingId: null,
    analysisId: null,
    openingLine: renderOpening(config),
  };
}

async function validateBaseline(deps: PlatformDeps, baselineId: string | null, ownerId: string): Promise<string | null> {
  if (!baselineId) return null;
  const record = await readJson<{ ownerId: string }>(deps.kv, `bl:${baselineId}`);
  if (!record || record.ownerId !== ownerId) throw new ApiError('INVALID_INPUT', 'Unknown calibration. Record it again or skip it.');
  return baselineId;
}

function kindAvailable(deps: PlatformDeps, kind: QuizAnswers['kind']): boolean {
  if (kind === 'raise') return true;
  if (kind === 'rent') return deps.capabilities.rent;
  if (kind === 'offer') return deps.capabilities.offer;
  if (kind === 'bill') return deps.capabilities.bill;
  return false;
}

async function quizFromIntake(deps: PlatformDeps, request: Extract<CreateSessionRequest, { intakeId: string }>, ownerId: string): Promise<QuizAnswers> {
  if (!deps.intake) throw new ApiError('FEATURE_DISABLED', 'The coach intake is not available.');
  const handoff = await deps.intake.getConfirmedHandoff(request.intakeId, ownerId);
  if (handoff.profileRevision !== request.profileRevision) {
    throw new ApiError('PROFILE_STALE', 'Your profile changed after you confirmed it. Check the numbers again.', { currentVersion: handoff.profileRevision });
  }
  await deps.intake.ensureMediaClosed(request.intakeId, ownerId);
  const completion = request.completion ?? {};
  const allowed = new Set<string>(handoff.missingFields);
  const extra: Record<string, unknown> = {};
  for (const [field, value] of Object.entries(completion)) {
    if (field === 'avatarId' || field === 'sourceIntakeId') continue;
    if (!allowed.has(field)) throw new ApiError('INVALID_INPUT', `${field} was already confirmed in your profile. Edit it there.`);
    extra[field] = value;
  }
  if (handoff.quizDraft.kind === 'custom') throw new ApiError('ENTITLEMENT_REQUIRED', 'A custom conversation uses the paid generator.');
  try {
    return buildQuizAnswers({ ...handoff.quizDraft, ...extra, sourceIntakeId: request.intakeId }, request.avatarId, {
      availableKinds: STANDARD_KINDS.filter((k) => kindAvailable(deps, k)),
    });
  } catch (error) {
    if (error instanceof PracticeDraftError) {
      throw new ApiError('PROFILE_INCOMPLETE', error.message, { missingFields: error.missingFields, fields: error.errors.map((e) => ({ field: e.field, message: e.message })) });
    }
    throw error;
  }
}

export interface CreateContext {
  ownerId: string;
  ipHash: string;
  idempotencyKey: string | null;
}

export async function createSession(deps: PlatformDeps, request: CreateSessionRequest, ctx: CreateContext): Promise<SessionView> {
  const idemKey = ctx.idempotencyKey ? `idem:create:${ctx.ownerId}:${ctx.idempotencyKey}` : null;
  const hash = bodyHash(request);
  if (idemKey) {
    const previous = await readJson<{ hash: string; sessionId: string }>(deps.kv, idemKey);
    if (previous) {
      if (previous.hash !== hash) throw new ApiError('IDEMPOTENCY_CONFLICT', 'This request key was already used with different answers.');
      return toSessionView(await loadOwnedSession(deps, previous.sessionId, ctx.ownerId));
    }
  }

  const baselineId = await validateBaseline(deps, request.baselineId, ctx.ownerId);
  let config: ScenarioConfig;
  if ('customScenarioId' in request) {
    const stored = await readJson<{ ownerId: string; config: ScenarioConfig }>(deps.kv, `cust:${request.customScenarioId}`);
    if (!stored || stored.ownerId !== ctx.ownerId) throw new ApiError('NOT_FOUND', 'Custom scenario not found.');
    config = ScenarioConfigSchema.parse(stored.config);
    await deps.quota.consume('session', ctx.ipHash, ctx.ownerId);
  } else {
    let quiz: QuizAnswers;
    if ('intakeId' in request) {
      quiz = await quizFromIntake(deps, request, ctx.ownerId);
    } else {
      const { sourceIntakeId: _ignored, ...rest } = request.quiz;
      quiz = QuizAnswersSchema.parse(rest);
    }
    if (quiz.kind === 'custom') throw new ApiError('ENTITLEMENT_REQUIRED', 'A custom conversation uses the paid generator.');
    if (!kindAvailable(deps, quiz.kind)) throw new ApiError('FEATURE_DISABLED', `A ${quiz.kind} practice is not available yet.`);
    await deps.quota.consume('session', ctx.ipHash, ctx.ownerId);
    try {
      config = await createScenario(quiz, deps.models);
    } catch (error) {
      await deps.quota.refund('session', ctx.ipHash);
      if (error instanceof ScenarioBuildError) throw new ApiError('INVALID_INPUT', error.message);
      throw error;
    }
  }

  const session = freshSession(deps, ctx.ownerId, config, { replayOf: null, replayRootId: null, baselineId });
  await sessionRepo(deps).create(session);
  if (idemKey) await deps.kv.set(idemKey, JSON.stringify({ hash, sessionId: session.id }), { ttlSeconds: 86_400 });
  return toSessionView(session);
}

export interface ProcessTurnInput {
  sessionId: string;
  turnId: string;
  expectedVersion: number | null;
  text: string;
  mode: TransportMode;
  sourceTurnKey: string | null;
  /** Voice turns: the binding that must still be active. */
  bindingId?: string | null;
}

export interface ProcessTurnResult {
  session: SessionView;
  committedTurnId: string;
  replyText: string;
  state: SessionState;
}

function existingResult(session: SessionState, record: TurnRecord): ProcessTurnResult {
  return { session: toSessionView(session), committedTurnId: record.turnId, replyText: record.replyText, state: session };
}

/**
 * One transactional turn shared by the text endpoint and the voice agent callback:
 * owner/mode/version checks, a short exclusive lock, classify -> engine -> actor, then one
 * atomic commit. Retries with the same turnId (or the same voice turn key) return the stored
 * result instead of applying the move twice.
 */
export async function processTurn(deps: PlatformDeps, input: ProcessTurnInput, ownerId: string | null, signal?: AbortSignal): Promise<ProcessTurnResult> {
  const repo = sessionRepo(deps);
  let session = await repo.read(input.sessionId);
  if (!session || (ownerId !== null && session.ownerId !== ownerId)) throw new ApiError('NOT_FOUND', 'This practice round is not available.');

  const prior = session.turns.find((t) => t.turnId === input.turnId || (input.sourceTurnKey !== null && t.input.sourceTurnKey === input.sourceTurnKey));
  if (prior) {
    if (prior.input.text !== input.text.trim() && input.mode === 'text') throw new ApiError('IDEMPOTENCY_CONFLICT', 'This turn id was already used for a different reply.');
    return existingResult(session, prior);
  }

  session = await enforceDeadline(deps, session);
  if (session.state.ended) throw new ApiError('SESSION_ENDED', 'This round has ended.', { currentVersion: session.version });
  if (session.activeMode !== input.mode) throw new ApiError('VERSION_CONFLICT', `This round is in ${session.activeMode} mode now.`, { currentVersion: session.version });
  if (input.mode === 'voice' && (!input.bindingId || session.voiceBindingId !== input.bindingId)) {
    throw new ApiError('VERSION_CONFLICT', 'This voice connection is no longer active.', { currentVersion: session.version });
  }
  if (input.expectedVersion !== null && input.expectedVersion !== session.version) {
    throw new ApiError('VERSION_CONFLICT', 'The round moved on. Refresh to see the latest reply.', { currentVersion: session.version });
  }

  const lock = turnLockKey(session.id);
  if (!(await deps.kv.set(lock, input.turnId, { ttlSeconds: TURN_LOCK_SECONDS, nx: true }))) {
    throw new ApiError('TURN_IN_PROGRESS', 'The previous reply is still being processed.', { currentVersion: session.version });
  }
  try {
    const turnInput: TurnInput = { turnId: input.turnId, expectedVersion: session.version, text: input.text.trim(), mode: input.mode, sourceTurnKey: input.sourceTurnKey };
    const move = await classifyMove(turnInput, session, deps.models, { signal });
    const config = session.scenarioSnapshot;
    const before = session.state;
    const { state: after, action } = applyMove(config, before, move);
    const replyText = await renderCounterpart(action, { session, move, next: after }, deps.models, signal);
    const record: TurnRecord = {
      turnId: input.turnId,
      turn: after.turn,
      input: turnInput,
      move,
      before,
      after,
      action,
      replyText,
      committedAt: deps.now().toISOString(),
    };
    const expectedBase = session.version;
    const { session: committed, written } = await repo.update(session.id, (current) => {
      if (current.version !== expectedBase || current.state.ended || current.activeMode !== input.mode) return null;
      return { ...current, state: after, turns: [...current.turns, record], voiceBindingId: after.ended ? null : current.voiceBindingId };
    });
    if (!written) {
      const again = committed.turns.find((t) => t.turnId === input.turnId);
      if (again) return existingResult(committed, again);
      throw new ApiError(committed.state.ended ? 'SESSION_ENDED' : 'VERSION_CONFLICT', 'The round changed while your reply was processed.', { currentVersion: committed.version });
    }
    return { session: toSessionView(committed), committedTurnId: record.turnId, replyText, state: committed };
  } finally {
    await deps.kv.compareAndDelete(lock, input.turnId);
  }
}

/** Explicit stop without a deal. Safe to repeat; an accepted deal is never turned into stopped. */
export async function finishSessionByUser(deps: PlatformDeps, sessionId: string, ownerId: string, _expectedVersion: number): Promise<SessionView> {
  const session = await loadOwnedSession(deps, sessionId, ownerId);
  if (session.state.ended) return toSessionView(session);
  if (await deps.kv.get(turnLockKey(sessionId))) throw new ApiError('TURN_IN_PROGRESS', 'Wait for the last reply, then finish.', { currentVersion: session.version });
  const { session: updated } = await sessionRepo(deps).update(sessionId, (current) =>
    current.state.ended ? null : { ...current, state: finishSession(current.state, 'stopped'), voiceBindingId: null },
  );
  return toSessionView(updated);
}

export async function changeMode(deps: PlatformDeps, sessionId: string, ownerId: string, mode: TransportMode, expectedVersion: number): Promise<SessionView> {
  let session = await loadOwnedSession(deps, sessionId, ownerId);
  if (session.activeMode === mode) return toSessionView(session);
  if (mode === 'voice' && !deps.capabilities.voice) throw new ApiError('FEATURE_DISABLED', 'Voice practice is not available right now. Continue in text.');
  session = await enforceDeadline(deps, session);
  if (session.state.ended) throw new ApiError('SESSION_ENDED', 'This round has ended.', { currentVersion: session.version });
  if (await deps.kv.get(turnLockKey(sessionId))) throw new ApiError('TURN_IN_PROGRESS', 'A reply is still being processed.', { currentVersion: session.version });
  if (expectedVersion !== session.version) throw new ApiError('VERSION_CONFLICT', 'The round moved on. Refresh and try again.', { currentVersion: session.version });
  const { session: updated, written } = await sessionRepo(deps).update(sessionId, (current) =>
    current.version !== expectedVersion || current.state.ended ? null : { ...current, activeMode: mode, transportEpoch: current.transportEpoch + 1, voiceBindingId: null },
  );
  if (!written) throw new ApiError('VERSION_CONFLICT', 'The round moved on. Refresh and try again.', { currentVersion: updated.version });
  return toSessionView(updated);
}

export async function replaySession(deps: PlatformDeps, sessionId: string, ctx: CreateContext, baselineId: string | null): Promise<SessionView> {
  const original = await enforceDeadline(deps, await loadOwnedSession(deps, sessionId, ctx.ownerId));
  if (!original.state.ended) throw new ApiError('INVALID_INPUT', 'Finish this round before replaying it.');
  const idemKey = ctx.idempotencyKey ? `idem:replay:${ctx.ownerId}:${ctx.idempotencyKey}` : null;
  if (idemKey) {
    const previous = await readJson<{ sessionId: string; from: string }>(deps.kv, idemKey);
    if (previous) {
      if (previous.from !== sessionId) throw new ApiError('IDEMPOTENCY_CONFLICT', 'This request key was already used.');
      return toSessionView(await loadOwnedSession(deps, previous.sessionId, ctx.ownerId));
    }
  }
  const validBaseline = await validateBaseline(deps, baselineId, ctx.ownerId);
  await deps.quota.consume('session', ctx.ipHash, ctx.ownerId);
  const session = freshSession(deps, ctx.ownerId, original.scenarioSnapshot, { replayOf: original.id, replayRootId: original.replayRootId, baselineId: validBaseline });
  await sessionRepo(deps).create(session);
  if (idemKey) await deps.kv.set(idemKey, JSON.stringify({ sessionId: session.id, from: sessionId }), { ttlSeconds: 86_400 });
  return toSessionView(session);
}

export async function voiceMetricsFor(deps: PlatformDeps, session: SessionState): Promise<VoiceMetrics | null> {
  if (!session.analysisId) return null;
  const job = await readJson<{ metrics: VoiceMetrics }>(deps.kv, `ana:${session.analysisId}`);
  return job?.metrics ?? null;
}

interface CachedDebrief {
  version: number;
  voiceStatus: string;
  debrief: Debrief;
}

/** Debrief for a finished session, cached per session version and voice status. */
export async function getDebrief(deps: PlatformDeps, sessionId: string, ownerId: string): Promise<Debrief> {
  const session = await enforceDeadline(deps, await loadOwnedSession(deps, sessionId, ownerId));
  if (!session.state.ended) throw new ApiError('INVALID_INPUT', 'The debrief opens when the round has ended.');
  const voice = await voiceMetricsFor(deps, session);
  const voiceStatus = voice?.status ?? 'none';
  const cacheKey = `debrief:${sessionId}`;
  const cached = await readJson<CachedDebrief>(deps.kv, cacheKey);
  if (cached && cached.version === session.version && cached.voiceStatus === voiceStatus) return cached.debrief;
  // Model commentary is computed once per session; voice updates reuse it.
  const reuseComments = cached && cached.version === session.version ? cached.debrief : null;
  let debrief = await buildDebrief(session, voice, reuseComments ? { available: false, completeStructured: async () => null } : deps.models);
  if (reuseComments) {
    const lines = new Map(reuseComments.rows.map((r) => [r.turnId, r.betterLine]));
    debrief = { ...debrief, persuasionScore: reuseComments.persuasionScore, rows: debrief.rows.map((r) => ({ ...r, betterLine: lines.get(r.turnId) ?? r.betterLine })) };
  }
  await deps.kv.set(cacheKey, JSON.stringify({ version: session.version, voiceStatus, debrief } satisfies CachedDebrief), { ttlSeconds: LIMITS.sessionRetentionSeconds });
  return debrief;
}
