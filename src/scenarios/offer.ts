import type { ObjectionSeed } from './types';

export const OFFER_OBJECTIONS: readonly ObjectionSeed[] = [
  { id: 'offer_band', text: 'This offer is already at the standard band for the level.', clearedBy: ['justify', 'ask_question'] },
  { id: 'offer_equity', text: 'The equity package makes up for the base.', clearedBy: ['justify'] },
  { id: 'offer_internal', text: 'We need to keep it fair with people already on the team.', clearedBy: ['justify', 'hold_silence'] },
];
