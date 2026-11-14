import type { QuizDraft } from '@/contracts/intake';
import { readVersioned, removeKey, writeVersioned } from './safe-storage';

/**
 * The quick-form draft lives in sessionStorage only (cleared with the tab), so salary numbers
 * are not kept in long-lived browser storage by default.
 */
const KEY = 'hl-quiz-draft';
const VERSION = 1;

export interface DraftState {
  draft: QuizDraft;
  step: number;
  marketUnknown: boolean;
  practiceRangeConfirmed: boolean;
  avatarId: string | null;
  baselineId: string | null;
  intake: { intakeId: string; profileRevision: number; missingFields: string[] } | null;
}

export const EMPTY_DRAFT: DraftState = { draft: {}, step: 0, marketUnknown: false, practiceRangeConfirmed: false, avatarId: null, baselineId: null, intake: null };

function isDraftState(value: unknown): value is DraftState {
  return Boolean(value) && typeof value === 'object' && 'draft' in (value as object) && 'step' in (value as object);
}

export function loadDraft(): DraftState {
  return { ...EMPTY_DRAFT, ...(readVersioned('session', KEY, VERSION, isDraftState) ?? {}) };
}

export function saveDraft(state: DraftState): void {
  writeVersioned('session', KEY, VERSION, state);
}

export function clearDraft(): void {
  removeKey('session', KEY);
}
