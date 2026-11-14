import type { ObjectionSeed } from './types';

export const RENT_OBJECTIONS: readonly ObjectionSeed[] = [
  { id: 'rent_costs', text: 'Taxes and maintenance went up across the building.', clearedBy: ['justify', 'ask_question'] },
  { id: 'rent_demand', text: 'I have other people interested in the unit.', clearedBy: ['justify', 'hold_silence'] },
  { id: 'rent_market', text: 'Similar units nearby rent for the same.', clearedBy: ['justify'] },
];
