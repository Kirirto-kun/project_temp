import type { Archetype, MoveType } from '@/contracts/domain';

export interface ArchetypeProfile {
  archetype: Archetype;
  patience0: number;
  trust0: number;
  /** Share of the room between the opening offer and the reservation conceded per step. */
  stepShare: number;
  /** Moves this archetype responds to when an objection is open. */
  clearsWith: readonly MoveType[];
}

export const ARCHETYPE_PROFILES: Record<Archetype, ArchetypeProfile> = {
  budget_guard: { archetype: 'budget_guard', patience0: 60, trust0: 50, stepShare: 0.25, clearsWith: ['justify', 'ask_question'] },
  analyst: { archetype: 'analyst', patience0: 70, trust0: 40, stepShare: 0.2, clearsWith: ['justify'] },
  relationship: { archetype: 'relationship', patience0: 75, trust0: 60, stepShare: 0.3, clearsWith: ['justify', 'ask_question'] },
  hardliner: { archetype: 'hardliner', patience0: 45, trust0: 35, stepShare: 0.15, clearsWith: ['justify', 'hold_silence'] },
};
