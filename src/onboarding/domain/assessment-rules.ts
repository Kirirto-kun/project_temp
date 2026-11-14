import { formatMoney } from '@/domain/money';
import { parseAmounts } from '@/domain/money-parse';
import type { FeedbackItem, IntakeProfile, Observation } from '../contracts';

const APOLOGY = /\b(sorry|apologi[sz]e|i hate to ask|i know (it'?s|this is) a lot|i feel bad)\b/i;
const HEDGES = /\b(maybe|perhaps|just|i think|i guess|kind of|sort of|if (it'?s )?possible|i was wondering|hopefully|a little)\b/gi;
const REASON = /\b(because|since|given|i (led|built|shipped|delivered|grew|saved|launched|took over|own|manage)|my (results|impact|scope|work)|market|range)\b/i;
const FILLERS = new Set(['um', 'uh', 'er', 'erm']);

export interface SpokenWord {
  text: string;
  startMs: number;
  endMs: number;
}

let counter = 0;
const nextId = (kind: string) => `obs_${kind}_${(counter += 1)}`;

/** Observations from the words of the mini-practice. Each one quotes the text it is based on. */
export function textObservations(text: string, profile: IntakeProfile): Observation[] {
  const obs: Observation[] = [];
  const base = { recordingId: null, startMs: null, endMs: null, unit: null, quality: 'measured' as const, source: 'text' as const, modelVersion: null, unavailableReason: null };
  const amounts = parseAmounts(text);
  const target = profile.targetMoney.value;
  if (amounts.length === 0) {
    obs.push({ ...base, id: nextId('ask'), kind: 'ask_without_number', value: true, quote: text.slice(0, 160) });
  } else {
    const first = amounts[0]!;
    const wordsBefore = text.slice(0, first.start).trim().split(/\s+/).filter(Boolean).length;
    obs.push({ ...base, id: nextId('pos'), kind: 'number_position', value: wordsBefore, unit: 'words before the amount', quote: first.text });
    if (target && target.currency === 'USD') {
      const resolved = first.explicitMagnitude || first.valueMinor >= 100_000 ? first.valueMinor : first.valueMinor * 1_000;
      const below = (profile.kind.value === 'rent' || profile.kind.value === 'bill') ? resolved > target.amountMinor : resolved < target.amountMinor;
      if (below) obs.push({ ...base, id: nextId('below'), kind: 'below_target', value: formatMoney(resolved), quote: first.text });
    }
  }
  const apology = APOLOGY.exec(text);
  if (apology) obs.push({ ...base, id: nextId('apology'), kind: 'apology', value: true, quote: apology[0] });
  const hedges = [...text.matchAll(HEDGES)].map((m) => m[0]);
  if (hedges.length) obs.push({ ...base, id: nextId('hedge'), kind: 'hedge', value: hedges.length, unit: 'hedging words', quote: hedges.slice(0, 3).join(', ') });
  const reason = REASON.exec(text);
  if (reason) obs.push({ ...base, id: nextId('reason'), kind: 'reason_given', value: true, quote: reason[0] });
  return obs;
}

/** Speech observations from a raw (verbatim) transcript with word timestamps. */
export function speechObservations(words: SpokenWord[], recordingId: string | null): Observation[] {
  const obs: Observation[] = [];
  const base = { recordingId, unit: null, quality: 'measured' as const, source: 'scribe' as const, modelVersion: null, unavailableReason: null };
  if (words.length === 0) return obs;
  for (const w of words) {
    const norm = w.text.toLowerCase().replace(/[^a-z]/g, '');
    if (FILLERS.has(norm)) obs.push({ ...base, id: nextId('filler'), kind: 'filler', startMs: w.startMs, endMs: w.endMs, value: norm, quote: w.text });
  }
  for (let i = 1; i < words.length; i += 1) {
    const a = words[i - 1]!.text.toLowerCase().replace(/[^a-z']/g, '');
    const b = words[i]!.text.toLowerCase().replace(/[^a-z']/g, '');
    if (a && a === b && !FILLERS.has(a)) {
      obs.push({ ...base, id: nextId('rep'), kind: 'repetition', startMs: words[i - 1]!.startMs, endMs: words[i]!.endMs, value: a, quote: `${words[i - 1]!.text} ${words[i]!.text}`, quality: 'estimated' });
    }
  }
  const numberIndex = words.findIndex((w) => /\d|\$/.test(w.text) || /^(hundred|thousand|grand|k)$/i.test(w.text) || /^(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)$/i.test(w.text.replace(/[^a-z]/gi, '')));
  if (numberIndex > 0) {
    const gap = words[numberIndex]!.startMs - words[numberIndex - 1]!.endMs;
    obs.push({ ...base, id: nextId('pause'), kind: 'pause_before_amount', startMs: words[numberIndex - 1]!.endMs, endMs: words[numberIndex]!.startMs, value: Math.max(0, gap), unit: 'ms', quote: words.slice(Math.max(0, numberIndex - 2), numberIndex + 1).map((w) => w.text).join(' ') });
  }
  const span = words.at(-1)!.endMs - words[0]!.startMs;
  if (span > 2_000) {
    const spoken = words.filter((w) => !FILLERS.has(w.text.toLowerCase().replace(/[^a-z]/g, '')));
    obs.push({ ...base, id: nextId('pace'), kind: 'pace', startMs: words[0]!.startMs, endMs: words.at(-1)!.endMs, value: Math.round((spoken.length / span) * 60_000), unit: 'words per minute', quote: null });
  }
  return obs;
}

const LIMIT_TEXT = 'Based on one short attempt; a typed attempt has no speech measurements.';

/**
 * At most three feedback items: one thing that worked, one thing to improve and one concrete
 * next attempt. Every item points at observations; none judges personality, accent or nerves.
 */
export function buildFeedback(observations: Observation[], profile: IntakeProfile, speechAvailable: boolean): { items: FeedbackItem[]; focus: string | null } {
  const by = (kind: Observation['kind']) => observations.filter((o) => o.kind === kind);
  const target = profile.targetMoney.value;
  const targetText = target && target.currency === 'USD' ? formatMoney(target.amountMinor, target.period) : 'your number';
  const items: FeedbackItem[] = [];
  const limitations = speechAvailable ? 'Based on one short recorded attempt.' : LIMIT_TEXT;

  const reason = by('reason_given')[0];
  const position = by('number_position')[0];
  if (reason) items.push({ category: 'strength', claim: 'You gave a reason with your ask.', evidenceIds: [reason.id], quote: reason.quote, suggestion: 'Keep the reason short and specific to results.', confidenceLabel: 'observed', limitations });
  else if (position && typeof position.value === 'number' && position.value <= 5 && by('apology').length === 0) items.push({ category: 'strength', claim: 'You stated the number early.', evidenceIds: [position.id], quote: position.quote, suggestion: 'Leading with the number anchors the conversation.', confidenceLabel: 'observed', limitations });

  const noNumber = by('ask_without_number')[0];
  const below = by('below_target')[0];
  const apology = by('apology')[0];
  const pause = by('pause_before_amount').find((o) => typeof o.value === 'number' && o.value >= 1_200);
  const fillers = by('filler');
  const hedge = by('hedge')[0];
  if (noNumber) items.push({ category: 'improve', claim: 'The opening asked without naming a number.', evidenceIds: [noNumber.id], quote: noNumber.quote, suggestion: `Name the amount: “I’m asking for ${targetText}.”`, confidenceLabel: 'observed', limitations });
  else if (below) items.push({ category: 'improve', claim: `The amount you said (${below.value}) is below the target you gave me.`, evidenceIds: [below.id], quote: below.quote, suggestion: `Open with ${targetText}; you can always move later, rarely up.`, confidenceLabel: 'observed', limitations });
  else if (apology) items.push({ category: 'improve', claim: 'The ask started with an apology.', evidenceIds: [apology.id], quote: apology.quote, suggestion: 'Drop the apology and state the number plainly.', confidenceLabel: 'observed', limitations });
  else if (pause) items.push({ category: 'improve', claim: `You paused for ${((pause.value as number) / 1000).toFixed(1)} seconds before the amount.`, evidenceIds: [pause.id], quote: pause.quote, suggestion: 'Say the number, then pause.', confidenceLabel: 'observed', limitations: 'A pause is normal; this only points at where it fell.' });
  else if (fillers.length >= 2) items.push({ category: 'improve', claim: `${fillers.length} filler words were transcribed (${fillers.map((f) => f.quote).slice(0, 3).join(', ')}).`, evidenceIds: fillers.map((f) => f.id), quote: null, suggestion: 'Try the sentence once more and let short silences replace the fillers.', confidenceLabel: 'observed', limitations: 'Speech recognition may miss or add fillers.' });
  else if (hedge && typeof hedge.value === 'number' && hedge.value >= 2) items.push({ category: 'improve', claim: 'Several softening words came before the ask.', evidenceIds: [hedge.id], quote: hedge.quote, suggestion: 'Cut the softeners; keep one courteous phrase.', confidenceLabel: 'observed', limitations });

  const anchor = items[0]?.evidenceIds[0] ?? observations[0]?.id;
  if (anchor) {
    items.push({
      category: 'next_attempt',
      claim: 'Next attempt',
      evidenceIds: [anchor],
      quote: null,
      suggestion: `Try: “Based on what I delivered this year, I’m asking for ${targetText}.” Then stop and wait.`,
      confidenceLabel: 'observed',
      limitations: null,
    });
  }
  const focus = items.find((i) => i.category === 'improve')?.suggestion ?? null;
  return { items: items.slice(0, 3), focus };
}

export const FORBIDDEN_FEEDBACK = /\b(diagnos\w*|stutter\w*|disorder|nervous person|low confidence|insecure|bad english|accent|personality|lying|liar|anxious person)\b/i;
