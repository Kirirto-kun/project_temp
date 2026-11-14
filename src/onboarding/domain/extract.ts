import type { MoneyAnswer } from '@/contracts/intake';
import { applyMoneyPercent } from '@/domain/intake-handoff';
import { formatMoney } from '@/domain/money';
import { parseAmounts, parsePercents, type ParsedAmount } from '@/domain/money-parse';
import type { IntakeProfile, PendingClarification, RangeValue } from '../contracts';
import type { Patch } from './profile';

export type AskedField = 'kind' | 'userRole' | 'counterpartRole' | 'currentMoney' | 'targetMoney' | 'marketRange' | 'fear' | 'mini_practice' | null;

export interface Extraction {
  patches: Patch[];
  clarification: PendingClarification | null;
  skipped: AskedField;
  dontKnow: boolean;
  yes: boolean;
  no: boolean;
  wantsEnd: boolean;
  /** Fields this utterance touched, for acknowledgements. */
  touched: string[];
}

const YES = /^\s*(yes|yeah|yep|yup|correct|right|exactly|that'?s right|that is right|sure|ok(ay)?|confirmed?)\b/i;
const NO = /^\s*(no|nope|not quite|that'?s wrong|wrong|incorrect)\b/i;
const SKIP = /\b(skip( (it|this))?|pass|i'?d rather not( say)?|prefer not( to (say|share))?|i don'?t want to (say|share)|next question)\b/i;
const DONT_KNOW = /\b(don'?t know|do not know|no idea|not sure|unsure|haven'?t (checked|looked)|no clue)\b/i;
const END = /\b(stop( the call| here)?|end (the )?call|let'?s stop|that'?s all|i'?m done)\b/i;
const CORRECTION = /\b(i meant|i mean|actually|correction)\b|\b(sorry|no),|\bnot\b.+\bbut\b/i;

const KIND_PATTERNS: [RegExp, 'raise' | 'offer' | 'rent' | 'bill'][] = [
  [/\b(job offer|new job|an offer|the offer|offer from|recruiter|hiring manager|counter-?offer)\b/i, 'offer'],
  [/\b(raise|promotion|pay rise|salary (review|increase)|comp(ensation)? review|performance review|annual review|my pay)\b/i, 'raise'],
  [/\b(rent|lease|landlord|apartment|flat|tenant|renewal)\b/i, 'rent'],
  [/\b(bill|subscription|internet|phone plan|mobile plan|insurance|utility|provider|cable)\b/i, 'bill'],
];

const ROLE_STOP = /^(asking|hoping|looking|thinking|not|sure|preparing|going|trying|here|ok|okay|fine|good|nervous|worried|currently|paid|making|earning|planning|about|afraid|getting|on|at|in|a bit|very|so|really|also|just|happy|the one)\b/i;
const ROLE = /\b(?:i'?m|i am|i work as|working as|my role is|my job is|my title is)\s+(?:an?\s+|the\s+)?([a-z][a-z\-/ ]{2,50}?)(?=\s*[,.;!?]|\s+(?:and|at|in|for|but|who|with|making|earning|on|here|currently)\b|\s*$)/i;

const COUNTERPART: [RegExp, string][] = [
  [/\bhiring manager\b/i, 'Hiring manager'],
  [/\bproperty manager\b/i, 'Property manager'],
  [/\bhead of (people|hr)\b/i, 'Head of people'],
  [/\b(hr|human resources)\b/i, 'Head of people'],
  [/\bretention (team|specialist|agent|department)\b/i, 'Retention specialist'],
  [/\baccount manager\b/i, 'Account manager'],
  [/\b(customer service|support agent)\b/i, 'Retention specialist'],
  [/\brecruiter\b/i, 'Recruiter'],
  [/\blandlord\b/i, 'Landlord'],
  [/\b(director|vp|vice president|cto|ceo)\b/i, 'Director'],
  [/\b(manager|boss|team lead|lead)\b/i, 'Manager'],
];

const CURRENT_CUE = /\b(make|making|earn|earning|currently|current|right now|now|paid|paying|pay is|salary is|base is|they offered|offered|offer is|offer was|rent is|charges?|charging|bill is|at)\b[^.?!]{0,24}$/i;
const TARGET_CUE = /\b(want|wanted|ask(ing)? for|target|hoping|hope|like|aim(ing)?|get to|up to|down to|reach|would be|to)\b[^.?!]{0,24}$/i;
const RANGE_CUE = /\b(between|range|market|levels|glassdoor|similar|others|peers|comparable|from)\b/i;
const MONTH = /\b(per month|a month|monthly|\/\s?mo|each month|every month)\b/i;
const YEAR = /\b(per year|a year|annual(ly)?|yearly|\/\s?yr|per annum)\b/i;
const HOUR = /\b(per hour|an hour|hourly|\/\s?hr)\b/i;
const GROSS = /\b(before tax|pre-?tax|gross)\b/i;
const NET = /\b(after tax|net|take[- ]?home)\b/i;

function salaryKind(kind: IntakeProfile['kind']['value']): boolean {
  return kind === null || kind === 'raise' || kind === 'offer';
}

function naturalPeriod(kind: IntakeProfile['kind']['value']): MoneyAnswer['period'] {
  return kind === 'rent' || kind === 'bill' ? 'month' : 'year';
}

interface Interpreted {
  answer: MoneyAnswer;
  /** True when we inferred a magnitude, period, currency or basis that the user did not state. */
  needsClarification: boolean;
  /** Same, ignoring the tax basis (ranges are not asked about tax). */
  needsUnitCheck: boolean;
  start: number;
}

function interpret(amount: ParsedAmount, text: string, kind: IntakeProfile['kind']['value']): Interpreted | null {
  const near = text.slice(amount.start, Math.min(text.length, amount.end + 40)) + ' ' + text.slice(0, amount.start).slice(-20);
  if (HOUR.test(near)) return null;
  let value = amount.valueMinor;
  let inferred = false;
  if (salaryKind(kind) && !amount.explicitMagnitude && value < 100_000) {
    value *= 1_000;
    inferred = true;
  }
  const period: MoneyAnswer['period'] = MONTH.test(near) ? 'month' : YEAR.test(near) ? 'year' : naturalPeriod(kind);
  const periodExplicit = MONTH.test(near) || YEAR.test(near);
  const basis: MoneyAnswer['basis'] = GROSS.test(text) ? 'gross' : NET.test(text) ? 'net' : 'unspecified';
  const currency = amount.currency ?? 'USD';
  const needsUnitCheck = inferred || !amount.currency || (!periodExplicit && salaryKind(kind));
  const needsClarification = needsUnitCheck || (salaryKind(kind) && basis === 'unspecified');
  if (value < 1 || value > 10_000_000_000) return null;
  return { answer: { amountMinor: value, currency, period, basis }, needsClarification, needsUnitCheck, start: amount.start };
}

function describeMoney(m: MoneyAnswer): string {
  return m.currency === 'USD' ? formatMoney(m.amountMinor, m.period) : `${(m.amountMinor / 100).toLocaleString('en-US')} ${m.currency}${m.period === 'year' ? ' a year' : m.period === 'month' ? ' a month' : ''}`;
}

function clarificationQuestion(kind: IntakeProfile['kind']['value'], answers: MoneyAnswer[]): string {
  const list = answers.map(describeMoney).join(' and ');
  if (salaryKind(kind)) return `Just to check: ${list}, in US dollars, before tax?`;
  return `Just to check: ${list}?`;
}

function classifyAmount(text: string, start: number, asked: AskedField): 'current' | 'target' | null {
  const before = text.slice(Math.max(0, start - 40), start);
  const targetIdx = before.search(TARGET_CUE);
  const currentIdx = before.search(CURRENT_CUE);
  if (targetIdx >= 0 && (currentIdx < 0 || targetIdx > currentIdx)) return 'target';
  if (currentIdx >= 0) return 'current';
  if (asked === 'currentMoney') return 'current';
  if (asked === 'targetMoney') return 'target';
  return null;
}

export interface ExtractContext {
  asked: AskedField;
  profile: IntakeProfile;
  pending: PendingClarification | null;
  /** The money field most recently set, for "I meant fifty". */
  lastMoneyField: 'currentMoney' | 'targetMoney' | null;
}

/**
 * Deterministic extraction from the user's own words. Every amount comes from the parser;
 * inferred units (a bare "ninety-five" for a salary) produce a clarification question and stay
 * candidates until the user confirms them on the review card.
 */
export function extractFromUtterance(raw: string, ctx: ExtractContext): Extraction {
  const text = raw.trim();
  const out: Extraction = { patches: [], clarification: null, skipped: null, dontKnow: false, yes: false, no: false, wantsEnd: false, touched: [] };
  if (!text) return out;
  const kind = ctx.profile.kind.value;
  out.wantsEnd = END.test(text);

  if (ctx.pending && YES.test(text) && parseAmounts(text).length === 0) {
    out.yes = true;
    const p = ctx.pending;
    if (p.field === 'marketRange') out.patches.push({ patch: { field: 'marketRange', value: p.proposal as RangeValue } });
    else {
      const money = p.proposal as MoneyAnswer;
      out.patches.push({ patch: { field: p.field, value: { ...money, basis: money.basis === 'unspecified' && salaryKind(kind) ? 'gross' : money.basis } } });
    }
    out.touched.push(p.field);
    return out;
  }
  if (ctx.pending && NO.test(text) && parseAmounts(text).length === 0) {
    out.no = true;
    return out;
  }

  if (SKIP.test(text) && parseAmounts(text).length === 0) {
    out.skipped = ctx.asked;
    return out;
  }

  for (const [pattern, k] of KIND_PATTERNS) {
    if (pattern.test(text) && ctx.profile.kind.status !== 'confirmed' && (ctx.profile.kind.value === null || ctx.asked === 'kind')) {
      out.patches.push({ patch: { field: 'kind', value: k } });
      out.touched.push('kind');
      break;
    }
  }
  const effectiveKind = (out.patches.find((p) => p.patch.field === 'kind')?.patch.value as typeof kind) ?? kind;

  const role = ROLE.exec(text);
  if (role && !ROLE_STOP.test(role[1]!.trim()) && !/\b(manager|boss|landlord|recruiter)\b/i.test(role[1]!) && (effectiveKind === null || salaryKind(effectiveKind))) {
    out.patches.push({ patch: { field: 'userRole', value: role[1]!.trim().replace(/\s+/g, ' ') } });
    out.touched.push('userRole');
  }

  const shortAnswer = text.split(/\s+/).length <= 5 && !/[?]/.test(text) && parseAmounts(text).length === 0;
  if (ctx.asked === 'userRole' && shortAnswer && !out.touched.includes('userRole') && !KIND_PATTERNS.some(([p]) => p.test(text))) {
    const plain = text.replace(/^(i'?m|i am|i work as|as)\s+(an?\s+)?/i, '').replace(/[.!]+$/, '').trim();
    if (plain && !ROLE_STOP.test(plain)) {
      out.patches.push({ patch: { field: 'userRole', value: plain.slice(0, 120) } });
      out.touched.push('userRole');
    }
  }
  if (ctx.asked === 'counterpartRole' || /\b(with|to|ask|talk|speaking|meeting)\b/i.test(text)) {
    for (const [pattern, label] of COUNTERPART) {
      if (pattern.test(text) && !(ROLE.exec(text)?.[1] ?? '').toLowerCase().includes(label.toLowerCase())) {
        out.patches.push({ patch: { field: 'counterpartRole', value: label } });
        out.touched.push('counterpartRole');
        break;
      }
    }
    if (ctx.asked === 'counterpartRole' && shortAnswer && !out.touched.includes('counterpartRole')) {
      const plain = text.replace(/^(my|the|our|a|an)\s+/i, '').replace(/[.!]+$/, '').trim();
      if (plain) {
        out.patches.push({ patch: { field: 'counterpartRole', value: plain.charAt(0).toUpperCase() + plain.slice(1, 80) } });
        out.touched.push('counterpartRole');
      }
    }
  }

  // Money.
  const amounts = parseAmounts(text);
  // "fifty, not fifteen": an amount right after "not" is the rejected one.
  const kept = amounts.filter((a) => !/\bnot\s*$/i.test(text.slice(Math.max(0, a.start - 6), a.start)));
  const interpreted = kept.map((a) => interpret(a, text, effectiveKind)).filter((v): v is Interpreted => v !== null);
  const isRange = interpreted.length === 2 && (RANGE_CUE.test(text) || /\d\s*(-|–|to)\s*\$?\d/.test(text)) && (ctx.asked === 'marketRange' || RANGE_CUE.test(text));
  const toClarify: MoneyAnswer[] = [];
  if (isRange) {
    const [a, b] = interpreted as [Interpreted, Interpreted];
    const range: RangeValue = {
      lowMinor: Math.min(a.answer.amountMinor, b.answer.amountMinor),
      highMinor: Math.max(a.answer.amountMinor, b.answer.amountMinor),
      currency: a.answer.currency,
      period: a.answer.period,
    };
    out.patches.push({ patch: { field: 'marketRange', value: range } });
    out.touched.push('marketRange');
    if (a.needsUnitCheck || b.needsUnitCheck) {
      out.clarification = { field: 'marketRange', question: `Just to check: a range of ${describeMoney({ ...a.answer, amountMinor: range.lowMinor })} to ${describeMoney({ ...a.answer, amountMinor: range.highMinor })}?`, proposal: range };
    }
  } else if (interpreted.length > 0) {
    const correction = CORRECTION.test(text) && ctx.lastMoneyField !== null;
    // A correction replaces the last amount the user gave with the last amount in this utterance.
    const items = correction ? interpreted.slice(-1) : interpreted.slice(0, 2);
    for (const item of items) {
      let slot = classifyAmount(text, item.start, ctx.asked);
      if (correction) slot = ctx.lastMoneyField === 'currentMoney' ? 'current' : 'target';
      if (!slot) {
        if (interpreted.length === 2) slot = interpreted.indexOf(item) === 0 ? 'current' : 'target';
        else if (ctx.profile.currentMoney.value === null) slot = 'current';
        else if (ctx.profile.targetMoney.value === null) slot = 'target';
        else continue;
      }
      const field = slot === 'current' ? 'currentMoney' : 'targetMoney';
      if (out.touched.includes(field)) continue;
      if (item.needsClarification) {
        toClarify.push(item.answer);
        if (!out.clarification) out.clarification = { field, question: '', proposal: item.answer };
        out.patches.push({ patch: { field, value: item.answer } });
      } else {
        out.patches.push({ patch: { field, value: item.answer } });
      }
      out.touched.push(field);
    }
    if (out.clarification && toClarify.length > 0) out.clarification.question = clarificationQuestion(effectiveKind, toClarify);
  }

  // "15% more" relative to the current amount, computed by code.
  const percent = parsePercents(text)[0];
  const current = out.patches.find((p) => p.patch.field === 'currentMoney')?.patch.value as MoneyAnswer | undefined ?? ctx.profile.currentMoney.value;
  if (percent && current && !out.touched.includes('targetMoney') && (ctx.asked === 'targetMoney' || /\b(more|raise|increase|less|discount|lower|cut)\b/i.test(text))) {
    const direction = percent.direction ?? (effectiveKind === 'rent' || effectiveKind === 'bill' ? 'down' : 'up');
    const candidate = applyMoneyPercent(current, direction === 'up' ? percent.basisPoints : -percent.basisPoints);
    out.patches.push({ patch: { field: 'targetMoney', value: candidate.value }, formula: candidate.formula });
    out.touched.push('targetMoney');
  }

  if (ctx.asked === 'marketRange') {
    if (DONT_KNOW.test(text) && !isRange) out.dontKnow = true;
    if (!isRange && text.length > 3) {
      out.patches.push({ patch: { field: 'reasons', value: text.slice(0, 1_000) } });
      out.touched.push('reasons');
    }
  }
  if (ctx.asked === 'fear' && text.length > 1 && !out.touched.length) {
    out.patches.push({ patch: { field: 'fear', value: text.slice(0, 500) } });
    out.touched.push('fear');
  }
  const iso = /\b(20\d\d-\d\d-\d\d)\b/.exec(text);
  if (iso) {
    out.patches.push({ patch: { field: 'conversationDate', value: iso[1]! } });
    out.touched.push('conversationDate');
  }
  return out;
}
