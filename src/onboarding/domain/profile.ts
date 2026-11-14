import type { MoneyAnswer } from '@/contracts/intake';
import type { IntakeProfile, ProfileKey, RangeValue } from '../contracts';

type Field<T> = { value: T | null; status: 'unknown' | 'candidate' | 'confirmed' | 'skipped'; sourceTurnId: string | null; revision: number; formula: string | null };

const empty = <T,>(): Field<T> => ({ value: null, status: 'unknown', sourceTurnId: null, revision: 0, formula: null });

export function emptyProfile(): IntakeProfile {
  return {
    userRole: empty(),
    kind: empty(),
    counterpartRole: empty(),
    currentMoney: empty(),
    targetMoney: empty(),
    marketRange: empty(),
    practiceRange: empty(),
    reasons: empty(),
    conversationDate: empty(),
    fear: empty(),
    selfReportedNervousness: empty(),
  };
}

export type PatchValue =
  | { field: 'userRole' | 'counterpartRole' | 'reasons' | 'conversationDate' | 'fear' | 'selfReportedNervousness'; value: string }
  | { field: 'kind'; value: 'raise' | 'offer' | 'rent' | 'bill' }
  | { field: 'currentMoney' | 'targetMoney'; value: MoneyAnswer }
  | { field: 'marketRange' | 'practiceRange'; value: RangeValue };

export interface Patch {
  patch: PatchValue;
  formula?: string | null;
}

const MONEY_FIELDS: ProfileKey[] = ['currentMoney', 'targetMoney', 'marketRange', 'practiceRange'];

/**
 * Applies a candidate value. A new value is never "confirmed" here: only the user's explicit
 * confirmation on the review card does that. Changing current or target revokes the
 * derived practice range and sends confirmed money back to candidate.
 */
export function applyCandidate(profile: IntakeProfile, patch: Patch, sourceTurnId: string | null): IntakeProfile {
  const { field, value } = patch.patch;
  const previous = profile[field] as Field<unknown>;
  const next: IntakeProfile = {
    ...profile,
    [field]: { value, status: 'candidate', sourceTurnId, revision: previous.revision + 1, formula: patch.formula ?? null },
  };
  if (field === 'currentMoney' || field === 'targetMoney') {
    if (profile.practiceRange.status !== 'unknown') next.practiceRange = { ...empty<RangeValue>(), revision: profile.practiceRange.revision + 1 };
    for (const key of MONEY_FIELDS) {
      const f = next[key] as Field<unknown>;
      if (key !== field && f.status === 'confirmed') (next as Record<ProfileKey, Field<unknown>>)[key] = { ...f, status: 'candidate' };
    }
    if (field === 'currentMoney' && profile.targetMoney.formula?.includes('%')) {
      next.targetMoney = { ...empty<MoneyAnswer>(), revision: profile.targetMoney.revision + 1 };
    }
  }
  return next;
}

export function markSkipped(profile: IntakeProfile, field: ProfileKey): IntakeProfile {
  const f = profile[field] as Field<unknown>;
  return { ...profile, [field]: { ...f, value: null, status: 'skipped', revision: f.revision + 1, formula: null } };
}

export function markUnknown(profile: IntakeProfile, field: ProfileKey): IntakeProfile {
  const f = profile[field] as Field<unknown>;
  return { ...profile, [field]: { ...f, value: null, status: 'unknown', revision: f.revision + 1, formula: null } };
}

export function confirmFields(profile: IntakeProfile, fields: readonly ProfileKey[]): IntakeProfile {
  const next = { ...profile } as Record<ProfileKey, Field<unknown>>;
  for (const key of fields) {
    const f = next[key];
    if (f && f.status === 'candidate' && f.value !== null) next[key] = { ...f, status: 'confirmed' };
  }
  return next as IntakeProfile;
}

/** True when the field has an answer or an explicit decision (skip / unknown accepted). */
export function answered(profile: IntakeProfile, field: ProfileKey): boolean {
  const f = profile[field] as Field<unknown>;
  return f.status === 'candidate' || f.status === 'confirmed' || f.status === 'skipped';
}
