import type { ObjectionSeed } from './types';

export const BILL_OBJECTIONS: readonly ObjectionSeed[] = [
  { id: 'bill_standard', text: 'This is the standard rate for your plan.', clearedBy: ['justify', 'ask_question'] },
  { id: 'bill_promo', text: 'Promotions are only for new customers.', clearedBy: ['justify', 'hold_silence'] },
  { id: 'bill_costs', text: 'Our costs went up this year.', clearedBy: ['justify'] },
];
