import {
  LIMITS,
  ScenarioConfigSchema,
  objectiveForKind,
  type Archetype,
  type Objection,
  type QuizAnswers,
  type ScenarioConfig,
  type StandardKind,
} from '@/contracts/domain';
import { ARCHETYPE_PROFILES } from './archetypes';
import { BILL_OBJECTIONS } from './bill';
import { OFFER_OBJECTIONS } from './offer';
import { findPersona, personasForKind, toPersona } from './personas';
import { RAISE_OBJECTIONS } from './raise';
import { RENT_OBJECTIONS } from './rent';
import type { ObjectionSeed } from './types';

export { ARCHETYPE_PROFILES } from './archetypes';
export { PERSONAS, findPersona, personasForKind, toPersona, ARCHETYPES, type CatalogPersona } from './personas';

export const SCENARIO_VERSION = 1;

const OBJECTIONS_BY_KIND: Record<StandardKind, readonly ObjectionSeed[]> = {
  raise: RAISE_OBJECTIONS,
  offer: OFFER_OBJECTIONS,
  rent: RENT_OBJECTIONS,
  bill: BILL_OBJECTIONS,
};

/** Which seeded objections (by index) each archetype brings, in order. */
const OBJECTION_PICKS: Record<Archetype, readonly number[]> = {
  budget_guard: [0, 2],
  analyst: [1, 0],
  relationship: [2],
  hardliner: [1, 0, 2],
};

export class ScenarioBuildError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ScenarioBuildError';
  }
}

/** Stable, non-cryptographic hash used for scenario identifiers. */
export function stableHash(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(36);
}

export function isStandardKind(kind: string): kind is StandardKind {
  return kind === 'raise' || kind === 'offer' || kind === 'rent' || kind === 'bill';
}

export function objectionsFor(kind: StandardKind, archetype: Archetype): Objection[] {
  const seeds = OBJECTIONS_BY_KIND[kind];
  return OBJECTION_PICKS[archetype].map((index) => seeds[index]).filter((seed): seed is ObjectionSeed => Boolean(seed)).map((seed) => ({ ...seed, clearedBy: [...seed.clearedBy] }));
}

export function concessionStepFor(initialOfferMinor: number, reservationAmountMinor: number, archetype: Archetype): number {
  const room = Math.abs(reservationAmountMinor - initialOfferMinor);
  const raw = room * ARCHETYPE_PROFILES[archetype].stepShare;
  // Whole dollars, at least one dollar.
  return Math.max(100, Math.round(raw / 100) * 100);
}

/**
 * Deterministic scenario from validated quiz answers. Money boundaries come only from the
 * user's numbers: reservation = marketHigh (maximize) or marketLow (minimize).
 */
export function buildBaseScenario(quiz: QuizAnswers): ScenarioConfig {
  if (!isStandardKind(quiz.kind)) throw new ScenarioBuildError('Custom scenarios are built by the paid generator.');
  const catalog = findPersona(quiz.avatarId);
  if (!catalog) throw new ScenarioBuildError(`Unknown counterpart ${quiz.avatarId}.`);
  if (!catalog.kinds.includes(quiz.kind)) {
    const options = personasForKind(quiz.kind).map((p) => p.name).join(', ');
    throw new ScenarioBuildError(`${catalog.name} does not play a ${quiz.kind} conversation. Pick one of: ${options}.`);
  }
  const objective = objectiveForKind(quiz.kind);
  const archetype = catalog.archetype;
  const profile = ARCHETYPE_PROFILES[archetype];
  const reservationAmountMinor = objective === 'maximize' ? quiz.marketHighMinor : quiz.marketLowMinor;
  const initialOfferMinor = quiz.currentMinor;
  const id = `${quiz.kind}-${archetype}-${stableHash(
    JSON.stringify([quiz.kind, quiz.avatarId, quiz.currentMinor, quiz.targetMinor, quiz.marketLowMinor, quiz.marketHighMinor, quiz.period, quiz.counterpartRole]),
  )}`;

  return ScenarioConfigSchema.parse({
    id,
    version: SCENARIO_VERSION,
    kind: quiz.kind,
    currency: 'USD',
    period: quiz.period,
    objective,
    currentMinor: quiz.currentMinor,
    targetMinor: quiz.targetMinor,
    marketLowMinor: quiz.marketLowMinor,
    marketHighMinor: quiz.marketHighMinor,
    reservationAmountMinor,
    initialOfferMinor,
    concessionStepMinor: concessionStepFor(initialOfferMinor, reservationAmountMinor, archetype),
    patience0: profile.patience0,
    trust0: profile.trust0,
    maxTurns: LIMITS.maxTurns,
    objections: objectionsFor(quiz.kind, archetype),
    persona: toPersona(catalog),
    moneyBasis: quiz.moneyBasis,
    inputMode: quiz.inputMode,
    rangeSource: quiz.rangeSource,
    counterpartRole: quiz.counterpartRole,
    userRole: quiz.userRole ?? null,
    description: quiz.description,
    fear: quiz.fear,
    sourceIntakeId: quiz.sourceIntakeId ?? null,
  });
}
