import { z } from 'zod';
import type { MoneyAnswer } from '@/contracts/intake';
import { formatMoney } from '@/domain/money';
import { parseAmounts } from '@/domain/money-parse';
import type { RangeValue } from '../contracts';
import { clarificationQuestion, describeMoney, keepPendingIfUnanswered, salaryKind, type ExtractContext, type Extraction } from './extract';

/**
 * Model-assisted reading of one coach answer. The model only maps the user's own words onto
 * profile fields; every amount must be traceable to digits the user typed (or to an amount
 * already in the profile), unit conversions are done here in code, and nothing is confirmed:
 * values stay candidates until the user confirms them on the review card.
 */

const MoneySchema = z.object({
  amount: z.number().positive(),
  period: z.enum(['year', 'month', 'hour', 'one_time']),
  periodStated: z.boolean(),
  currency: z.string().regex(/^[A-Z]{3}$/),
  currencyStated: z.boolean(),
  basis: z.enum(['gross', 'net', 'unspecified']),
});

export const ModelExtractionSchema = z.object({
  intent: z.enum(['info', 'confirm', 'reject', 'skip', 'dont_know', 'end', 'unclear']),
  kind: z.enum(['raise', 'offer', 'rent', 'bill']).nullable(),
  userRole: z.string().max(120).nullable(),
  counterpartRole: z.string().max(80).nullable(),
  currentMoney: MoneySchema.nullable(),
  targetMoney: MoneySchema.nullable(),
  marketRange: z.object({ low: z.number().positive(), high: z.number().positive(), period: z.enum(['year', 'month', 'hour', 'one_time']), periodStated: z.boolean(), currency: z.string().regex(/^[A-Z]{3}$/) }).nullable(),
  fear: z.string().max(500).nullable(),
  reasons: z.string().max(1_000).nullable(),
  conversationDate: z.string().regex(/^20\d\d-\d\d-\d\d$/).nullable(),
  ack: z.string().max(160).nullable(),
});
export type ModelExtraction = z.infer<typeof ModelExtractionSchema>;

const money = {
  type: ['object', 'null'],
  additionalProperties: false,
  required: ['amount', 'period', 'periodStated', 'currency', 'currencyStated', 'basis'],
  properties: {
    amount: { type: 'number', description: 'Amount in major units exactly as the user meant it, e.g. 95000 for "95k".' },
    period: { type: 'string', enum: ['year', 'month', 'hour', 'one_time'] },
    periodStated: { type: 'boolean', description: 'True only if the user explicitly said the period.' },
    currency: { type: 'string', description: 'ISO 4217 code. Default USD.' },
    currencyStated: { type: 'boolean', description: 'True only if the user named the currency or used a currency sign.' },
    basis: { type: 'string', enum: ['gross', 'net', 'unspecified'] },
  },
} as const;

export const MODEL_EXTRACTION_JSON_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: ['intent', 'kind', 'userRole', 'counterpartRole', 'currentMoney', 'targetMoney', 'marketRange', 'fear', 'reasons', 'conversationDate', 'ack'],
  properties: {
    intent: { type: 'string', enum: ['info', 'confirm', 'reject', 'skip', 'dont_know', 'end', 'unclear'] },
    kind: { type: ['string', 'null'], enum: ['raise', 'offer', 'rent', 'bill', null] },
    userRole: { type: ['string', 'null'], description: "The user's own job title, in English, 1-5 words. Null if not stated." },
    counterpartRole: { type: ['string', 'null'], description: 'Who the user will talk to, in English, e.g. "Manager", "Landlord". Null if not stated.' },
    currentMoney: { ...money, description: 'What the user is paid/charged now, or the offer on the table.' },
    targetMoney: { ...money, description: 'What the user wants to get (or pay).' },
    marketRange: {
      type: ['object', 'null'],
      additionalProperties: false,
      required: ['low', 'high', 'period', 'periodStated', 'currency'],
      properties: { low: { type: 'number' }, high: { type: 'number' }, period: { type: 'string', enum: ['year', 'month', 'hour', 'one_time'] }, periodStated: { type: 'boolean' }, currency: { type: 'string' } },
    },
    fear: { type: ['string', 'null'], description: 'The response or pushback the user is worried about, in English.' },
    reasons: { type: ['string', 'null'], description: 'Evidence or reasons the user gave for their ask, in English.' },
    conversationDate: { type: ['string', 'null'], description: 'YYYY-MM-DD only if the user gave an exact date.' },
    ack: { type: ['string', 'null'], description: 'One short, natural English sentence reflecting what the user just said. No numbers, no questions, no praise words like "great".' },
  },
};

export const MODEL_EXTRACTION_SYSTEM = [
  'You read one answer from a user preparing a money conversation (a raise, a job offer, rent, or a bill) and map it onto profile fields.',
  'Only use what the user actually said in this answer or in the pending check. Never invent amounts, titles or dates. Use null for anything not said.',
  'Amounts: return the number the user meant in major units ("95k" -> 95000, "a hundred and ten" for a salary -> 110000). Hourly rates use period "hour".',
  'If there is a pending check and the user answers yes/correct -> intent "confirm"; no/wrong -> "reject". If they correct only the period or currency (e.g. "monthly"), return the pending amount again with the corrected unit and periodStated true.',
  'intent: "info" when the answer contains any field; "skip" if they decline; "dont_know" if they do not know; "end" if they want to stop; "unclear" otherwise.',
  'The user may write in any language; return text fields in English.',
].join('\n');

export function modelExtractionInput(text: string, ctx: ExtractContext): Record<string, unknown> {
  const p = ctx.profile;
  return {
    question_asked: ctx.asked,
    pending_check: ctx.pending ? { field: ctx.pending.field, question: ctx.pending.question } : null,
    known: {
      kind: p.kind.value,
      userRole: p.userRole.value,
      counterpartRole: p.counterpartRole.value,
      currentMoney: p.currentMoney.value ? describeMoney(p.currentMoney.value) : null,
      targetMoney: p.targetMoney.value ? describeMoney(p.targetMoney.value) : null,
    },
    answer: text.slice(0, 2_000),
  };
}

const HOURS_PER_MONTH = 160;

/** Amounts (minor units) the user has actually given: digits in this answer, the pending proposal and the profile. */
function groundedAmounts(text: string, ctx: ExtractContext): Set<number> {
  const out = new Set<number>();
  for (const a of parseAmounts(text)) {
    out.add(a.valueMinor);
    out.add(a.valueMinor * 1_000);
  }
  // Digits with a "k"/"к" suffix or thousands separators that the parser may not read (e.g. other languages).
  for (const m of text.matchAll(/(\d[\d,.\s]*\d|\d)\s*([kкK]|тыс)?/g)) {
    const n = Number(m[1]!.replace(/[\s,]/g, ''));
    if (!Number.isFinite(n)) continue;
    out.add(Math.round(n * 100));
    if (m[2] || n < 1_000) out.add(Math.round(n * 1_000 * 100));
  }
  const pending = ctx.pending?.proposal as (MoneyAnswer & RangeValue) | undefined;
  if (pending) for (const v of [pending.amountMinor, pending.lowMinor, pending.highMinor]) if (v) out.add(v);
  for (const v of [ctx.profile.currentMoney.value?.amountMinor, ctx.profile.targetMoney.value?.amountMinor]) if (v) out.add(v);
  return out;
}

const noDigits = (s: string | null): string | null => (s && !/\d/.test(s) && !s.includes('?') ? s.trim() : null);

type ModelMoney = NonNullable<ModelExtraction['currentMoney']>;

/** Converts a model reading to the deterministic Extraction shape. Returns null when it is unusable. */
export function extractionFromModel(m: ModelExtraction, text: string, ctx: ExtractContext): (Extraction & { ack: string | null }) | null {
  const out: Extraction & { ack: string | null } = { patches: [], clarification: null, skipped: null, dontKnow: false, yes: false, no: false, wantsEnd: m.intent === 'end', touched: [], ack: noDigits(m.ack) };
  const grounded = groundedAmounts(text, ctx);
  const ok = (major: number) => grounded.has(Math.round(major * 100));
  const hasMoney = Boolean(m.currentMoney || m.targetMoney || m.marketRange);

  if (ctx.pending && m.intent === 'confirm' && !hasMoney) {
    out.yes = true;
    const p = ctx.pending;
    if (p.field === 'marketRange') out.patches.push({ patch: { field: 'marketRange', value: p.proposal as RangeValue } });
    else {
      const proposal = p.proposal as MoneyAnswer;
      out.patches.push({ patch: { field: p.field, value: { ...proposal, basis: proposal.basis === 'unspecified' && salaryKind(ctx.profile.kind.value) ? 'gross' : proposal.basis } } });
    }
    out.touched.push(p.field);
    return out;
  }
  if (ctx.pending && m.intent === 'reject' && !hasMoney) return { ...out, no: true };
  if (m.intent === 'skip' && !hasMoney) return { ...out, skipped: ctx.asked };

  const kind = ctx.profile.kind.status !== 'confirmed' && m.kind ? m.kind : ctx.profile.kind.value;
  if (m.kind && ctx.profile.kind.status !== 'confirmed' && m.kind !== ctx.profile.kind.value) {
    out.patches.push({ patch: { field: 'kind', value: m.kind } });
    out.touched.push('kind');
  }
  if (m.userRole?.trim()) {
    out.patches.push({ patch: { field: 'userRole', value: m.userRole.trim().slice(0, 120) } });
    out.touched.push('userRole');
  }
  if (m.counterpartRole?.trim()) {
    const role = m.counterpartRole.trim();
    out.patches.push({ patch: { field: 'counterpartRole', value: (role.charAt(0).toUpperCase() + role.slice(1)).slice(0, 80) } });
    out.touched.push('counterpartRole');
  }

  const toClarify: MoneyAnswer[] = [];
  const hourly: { field: 'currentMoney' | 'targetMoney'; perHour: MoneyAnswer; perMonth: MoneyAnswer }[] = [];
  for (const field of ['currentMoney', 'targetMoney'] as const) {
    const v: ModelMoney | null = m[field];
    if (!v) continue;
    if (!ok(v.amount)) return null; // an amount the user did not give: distrust the whole reading
    const base: MoneyAnswer = { amountMinor: Math.round(v.amount * 100), currency: v.currency, period: v.period === 'hour' ? 'month' : v.period, basis: v.basis };
    if (v.period === 'hour') {
      // Unit conversion is code, not model: hours per month is a stated assumption the user checks.
      const perMonth = { ...base, amountMinor: base.amountMinor * HOURS_PER_MONTH };
      hourly.push({ field, perHour: base, perMonth });
      out.patches.push({ patch: { field, value: perMonth }, formula: `${formatMoney(base.amountMinor)}/hour × ${HOURS_PER_MONTH} hours = ${formatMoney(perMonth.amountMinor, 'month')}` });
    } else {
      out.patches.push({ patch: { field, value: base } });
      const needsCheck = !v.periodStated || !v.currencyStated || (salaryKind(kind) && v.basis === 'unspecified');
      if (needsCheck) {
        toClarify.push(base);
        if (!out.clarification) out.clarification = { field, question: '', proposal: base };
      }
    }
    out.touched.push(field);
  }
  if (hourly.length > 0) {
    const h = hourly[0]!;
    out.clarification = { field: h.field, question: `Just to check: ${formatMoney(h.perHour.amountMinor)} an hour is about ${formatMoney(h.perMonth.amountMinor, 'month')} at ${HOURS_PER_MONTH} hours a month. Shall I use that?`, proposal: h.perMonth };
  } else if (out.clarification && toClarify.length > 0) {
    out.clarification.question = clarificationQuestion(kind, toClarify);
  }

  if (m.marketRange) {
    const r = m.marketRange;
    if (!ok(r.low) || !ok(r.high)) return null;
    const factor = r.period === 'hour' ? HOURS_PER_MONTH : 1;
    const range: RangeValue = {
      lowMinor: Math.round(Math.min(r.low, r.high) * 100) * factor,
      highMinor: Math.round(Math.max(r.low, r.high) * 100) * factor,
      currency: r.currency,
      period: r.period === 'hour' ? 'month' : r.period,
    };
    out.patches.push({ patch: { field: 'marketRange', value: range } });
    out.touched.push('marketRange');
    if (!out.clarification && (!r.periodStated || factor !== 1)) {
      out.clarification = { field: 'marketRange', question: `Just to check: a range of ${describeMoney({ amountMinor: range.lowMinor, currency: range.currency, period: range.period, basis: 'unspecified' })} to ${describeMoney({ amountMinor: range.highMinor, currency: range.currency, period: range.period, basis: 'unspecified' })}?`, proposal: range };
    }
  }

  if (m.reasons?.trim() && (ctx.asked === 'marketRange' || !m.marketRange)) {
    out.patches.push({ patch: { field: 'reasons', value: m.reasons.trim().slice(0, 1_000) } });
    out.touched.push('reasons');
  }
  if (m.fear?.trim()) {
    out.patches.push({ patch: { field: 'fear', value: m.fear.trim().slice(0, 500) } });
    out.touched.push('fear');
  }
  if (m.conversationDate) {
    out.patches.push({ patch: { field: 'conversationDate', value: m.conversationDate } });
    out.touched.push('conversationDate');
  }
  if (m.intent === 'dont_know' && ctx.asked === 'marketRange' && !m.marketRange) out.dontKnow = true;
  return { ...keepPendingIfUnanswered(out, ctx), ack: out.ack };
}
