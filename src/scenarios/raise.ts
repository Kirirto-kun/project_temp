import type { ObjectionSeed } from './types';

export const RAISE_OBJECTIONS: readonly ObjectionSeed[] = [
  { id: 'raise_budget', text: 'The budget for raises is already set for this cycle.', clearedBy: ['justify', 'ask_question'] },
  { id: 'raise_level', text: "That's above what we pay at your level.", clearedBy: ['justify'] },
  { id: 'raise_timing', text: "Let's revisit this at the next review.", clearedBy: ['justify', 'hold_silence'] },
];
