import type { MoneyAnswer } from '@/contracts/intake';
import { formatMoney } from '@/domain/money';
import type { IntakeProfile } from '../contracts';
import type { AskedField, Extraction } from './extract';
import { answered } from './profile';

export const GREETING =
  "I'm Alex, your AI practice coach. We'll map out your conversation, then practise it. You can pause or skip a question. What do you do, and what conversation are you preparing for?";

const ACKS = ['Got it.', 'Thanks.', 'Understood.', 'Okay.'];

/** Order of questions; fields already given in an earlier answer are not asked again. */
export function nextField(profile: IntakeProfile): Exclude<AskedField, null> {
  if (!answered(profile, 'kind')) return 'kind';
  const salary = profile.kind.value === 'raise' || profile.kind.value === 'offer';
  if (salary && !answered(profile, 'userRole')) return 'userRole';
  if (!answered(profile, 'counterpartRole')) return 'counterpartRole';
  if (!answered(profile, 'currentMoney')) return 'currentMoney';
  if (!answered(profile, 'targetMoney')) return 'targetMoney';
  if (!answered(profile, 'marketRange') && !answered(profile, 'reasons')) return 'marketRange';
  if (!answered(profile, 'fear')) return 'fear';
  return 'mini_practice';
}

export function questionFor(field: Exclude<AskedField, null>, profile: IntakeProfile): string {
  const kind = profile.kind.value;
  switch (field) {
    case 'kind':
      return 'What conversation are you preparing for: a raise, a job offer, rent, or a bill?';
    case 'userRole':
      return 'What do you do?';
    case 'counterpartRole':
      return 'Who will you be speaking with?';
    case 'currentMoney':
      return kind === 'offer' ? 'What base pay does the offer state?' : kind === 'rent' ? 'What rent are they asking for, per month?' : kind === 'bill' ? 'What does the bill charge now?' : 'What is your current base pay?';
    case 'targetMoney':
      return kind === 'rent' || kind === 'bill' ? 'What would you like to pay instead?' : 'What amount would you like to ask for?';
    case 'marketRange':
      return 'What are you basing that number on? If you know a range for similar roles or places, tell me. It is fine to say you don’t know.';
    case 'fear':
      return 'What response are you most concerned about?';
    case 'mini_practice':
      return 'Now say the first sentence you would use to make the ask, as if you were in the room.';
  }
}

function money(m: MoneyAnswer | null): string {
  if (!m) return '';
  return m.currency === 'USD' ? formatMoney(m.amountMinor, m.period) : `${(m.amountMinor / 100).toLocaleString('en-US')} ${m.currency}`;
}

/**
 * Builds the coach's next line: a short acknowledgement (never a repeated "Great!"), a
 * clarification when units were inferred, otherwise the next unanswered question.
 */
export function coachReply(profile: IntakeProfile, extraction: Extraction, turn: number): { text: string; asked: Exclude<AskedField, null> } {
  const ack = ACKS[turn % ACKS.length]!;
  const next = nextField(profile);
  if (extraction.wantsEnd) return { text: 'Okay. Let’s stop here and look at what I have so far.', asked: 'mini_practice' };
  if (extraction.clarification) return { text: extraction.clarification.question, asked: extraction.clarification.field === 'marketRange' ? 'marketRange' : extraction.clarification.field };
  if (extraction.no) return { text: 'Thanks for catching that. Tell me the exact amount, and whether it is per year or per month.', asked: next === 'mini_practice' ? 'targetMoney' : next };
  const parts: string[] = [];
  if (extraction.skipped) parts.push('No problem, we can leave that out.');
  else if (extraction.dontKnow) parts.push('That’s fine. At the end I can offer practice bounds between your current amount and your target, clearly marked as an assumption.');
  else if (extraction.touched.includes('targetMoney') && profile.targetMoney.formula) parts.push(`${profile.targetMoney.formula}. You’ll confirm it at the end.`);
  else if (extraction.touched.some((f) => f === 'currentMoney' || f === 'targetMoney')) {
    const noted = [extraction.touched.includes('currentMoney') ? money(profile.currentMoney.value) : null, extraction.touched.includes('targetMoney') ? money(profile.targetMoney.value) : null].filter(Boolean).join(' and ');
    parts.push(`I noted ${noted}. You’ll confirm the numbers at the end.`);
  } else if (extraction.touched.length > 0 || extraction.yes) parts.push(ack);
  else parts.push('I didn’t catch an answer to that.');
  parts.push(questionFor(next, profile));
  return { text: parts.join(' '), asked: next };
}
