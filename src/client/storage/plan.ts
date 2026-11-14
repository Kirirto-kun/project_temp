import type { Debrief } from '@/contracts/voice';
import type { Period, ScenarioKind } from '@/contracts/domain';
import { readVersioned, writeVersioned } from './safe-storage';

const KEY = 'hl-plan';
const VERSION = 1;

export interface PlannedConversation {
  id: string;
  kind: ScenarioKind;
  /** Local calendar date YYYY-MM-DD, or null. */
  date: string | null;
  description: string;
  lastSessionId: string | null;
  status: 'planned' | 'practised' | 'done';
}

export interface RoundResult {
  sessionId: string;
  replayRootId: string;
  kind: ScenarioKind;
  period: Period;
  outcome: Debrief['outcome'];
  gainMinor: number | null;
  leftOnTableMinor: number | null;
  finishedAt: string;
}

export interface PlanState {
  conversations: PlannedConversation[];
  results: RoundResult[];
}

const EMPTY: PlanState = { conversations: [], results: [] };

function isPlan(value: unknown): value is PlanState {
  const v = value as PlanState;
  return Boolean(v) && Array.isArray(v.conversations) && Array.isArray(v.results);
}

export function loadPlan(): PlanState {
  return readVersioned('local', KEY, VERSION, isPlan) ?? EMPTY;
}

export function savePlan(plan: PlanState): boolean {
  return writeVersioned('local', KEY, VERSION, plan);
}

export function recordResult(debrief: Debrief): void {
  const plan = loadPlan();
  if (plan.results.some((r) => r.sessionId === debrief.sessionId)) return;
  plan.results.push({
    sessionId: debrief.sessionId,
    replayRootId: debrief.replayRootId,
    kind: debrief.kind as ScenarioKind,
    period: debrief.period,
    outcome: debrief.outcome,
    gainMinor: debrief.gainMinor,
    leftOnTableMinor: debrief.leftOnTableMinor,
    finishedAt: new Date().toISOString(),
  });
  savePlan({ ...plan, results: plan.results.slice(-100) });
}

/**
 * Simulated gains: for each original round only the best attempt counts, grouped by period so
 * yearly pay, monthly rent and one-time bills are never added into one number.
 */
export function simulatedGains(results: RoundResult[]): { period: Period; totalMinor: number; rounds: number }[] {
  const best = new Map<string, RoundResult>();
  for (const r of results) {
    if (r.gainMinor === null) continue;
    const prev = best.get(r.replayRootId);
    if (!prev || (prev.gainMinor ?? 0) < r.gainMinor) best.set(r.replayRootId, r);
  }
  const byPeriod = new Map<Period, { totalMinor: number; rounds: number }>();
  for (const r of best.values()) {
    const entry = byPeriod.get(r.period) ?? { totalMinor: 0, rounds: 0 };
    entry.totalMinor += r.gainMinor ?? 0;
    entry.rounds += 1;
    byPeriod.set(r.period, entry);
  }
  return [...byPeriod.entries()].map(([period, v]) => ({ period, ...v }));
}
