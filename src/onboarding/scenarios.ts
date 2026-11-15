import type { ConversationKind } from '@/contracts/domain';

const optionalMoney = {
  financial: false, currentLabel: 'Current amount · USD',
  targetLabel: 'Desired amount · USD', periodLabel: 'Amount period',
};

export const conversationScenarios = {
  raise: { label: 'Raise', financial: true, currentLabel: 'Current base pay · USD', targetLabel: 'Amount you want to ask for · USD', periodLabel: 'Pay period' },
  offer: { label: 'Job offer', financial: true, currentLabel: 'Current offer · USD', targetLabel: 'Desired offer · USD', periodLabel: 'Pay period' },
  rent: { label: 'Rent', financial: true, currentLabel: 'Current rent · USD', targetLabel: 'Desired rent · USD', periodLabel: 'Rent period' },
  bill: { label: 'Bill', financial: true, currentLabel: 'Current bill · USD', targetLabel: 'Desired bill · USD', periodLabel: 'Bill period' },
  interview: { label: 'Interview', ...optionalMoney },
  feedback: { label: 'Feedback', ...optionalMoney },
  conflict: { label: 'Conflict', ...optionalMoney },
  relationship: { label: 'Relationship', ...optionalMoney },
  presentation: { label: 'Presentation', ...optionalMoney },
  custom: { label: 'Something else', ...optionalMoney },
} satisfies Record<ConversationKind, { label: string; financial: boolean; currentLabel: string; targetLabel: string; periodLabel: string }>;

export const unselectedScenario = { label: 'Not provided', ...optionalMoney };
