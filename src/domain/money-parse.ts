/**
 * Deterministic extraction of money amounts and percentages from free text.
 * The models never decide a number on their own: every amount that reaches the engine or the
 * intake profile comes from this parser (or from a user's explicit form input).
 */

export interface ParsedAmount {
  /** Value exactly as stated, in cents, before any scenario-scale interpretation. */
  valueMinor: number;
  /** True when the text carried a magnitude (k, thousand, million, grand) or 4+ digits. */
  explicitMagnitude: boolean;
  hasCurrencySign: boolean;
  /** Currency named in the text, when any: USD for $, dollars, bucks; others kept as said. */
  currency: string | null;
  start: number;
  end: number;
  text: string;
}

export interface ParsedPercent {
  basisPoints: number;
  direction: 'up' | 'down' | null;
  start: number;
  end: number;
  text: string;
}

const UNITS: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
  ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16,
  seventeen: 17, eighteen: 18, nineteen: 19,
};
const TENS: Record<string, number> = {
  twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90,
};
const SCALES: Record<string, number> = { hundred: 100, thousand: 1_000, grand: 1_000, million: 1_000_000 };

const NON_MONEY_UNITS = new Set([
  'year', 'years', 'yr', 'yrs', 'month', 'months', 'week', 'weeks', 'day', 'days', 'hour', 'hours',
  'minute', 'minutes', 'min', 'mins', 'second', 'seconds', 'people', 'person', 'engineers', 'engineer',
  'reports', 'report', 'projects', 'project', 'clients', 'client', 'customers', 'customer', 'times',
  'time', 'members', 'member', 'team', 'teams', 'users', 'user', 'tickets', 'releases', 'release',
  'features', 'feature', 'sprints', 'sprint', 'deals', 'deal', 'accounts', 'account', 'stars', 'points',
  'apps', 'services', 'products', 'percent', 'per', 'x', 'pm', 'am', 'st', 'nd', 'rd', 'th', 'kids',
  'children', 'rsu', 'rsus', 'shares', 'share', 'options', 'units', 'unit', 'stocks', 'rooms', 'bedroom', 'bedrooms', 'floors', 'offers', 'interviews', 'companies', 'jobs',
  'languages', 'certifications', 'promotions', 'questions', 'things', 'reasons', 'options', 'steps',
]);
const YEAR_PREFIXES = new Set(['in', 'since', 'by', 'from', 'until', 'til', 'till', 'of', 'year', 'back', 'during', 'before', 'after', 'early', 'late', 'mid', 'q1', 'q2', 'q3', 'q4']);
const CURRENCY_WORDS: Record<string, string> = {
  dollar: 'USD', dollars: 'USD', usd: 'USD', bucks: 'USD',
  euro: 'EUR', euros: 'EUR', eur: 'EUR',
  pound: 'GBP', pounds: 'GBP', gbp: 'GBP', quid: 'GBP',
  tenge: 'KZT', kzt: 'KZT', rupees: 'INR', inr: 'INR', yen: 'JPY', jpy: 'JPY',
  rubles: 'RUB', roubles: 'RUB', rub: 'RUB', cad: 'CAD', aud: 'AUD', chf: 'CHF',
};
const CURRENCY_SIGNS: Record<string, string> = { $: 'USD', '€': 'EUR', '£': 'GBP', '₸': 'KZT', '¥': 'JPY', '₹': 'INR' };

const UP_WORDS = /\b(more|raise|increase|higher|above|up|bump|on top|extra)\b/i;
const DOWN_WORDS = /\b(less|lower|discount|reduction|reduce|cut|below|down|off|decrease|cheaper)\b/i;

interface Token {
  text: string;
  lower: string;
  start: number;
  end: number;
}

function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  const re = /[$€£₸¥₹]|\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?|[A-Za-z]+(?:'[A-Za-z]+)?|%|-|–|—/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text))) {
    tokens.push({ text: match[0], lower: match[0].toLowerCase(), start: match.index, end: match.index + match[0].length });
  }
  return tokens;
}

function isNumberWord(lower: string): boolean {
  return lower in UNITS || lower in TENS || lower in SCALES;
}

function parseDigits(raw: string): number | null {
  const clean = raw.replace(/,(?=\d{3}\b)/g, '');
  if (!/^\d+(\.\d+)?$/.test(clean)) return null;
  const value = Number(clean);
  return Number.isFinite(value) ? value : null;
}

interface NumberSpan {
  value: number;
  startToken: number;
  endToken: number; // exclusive
  hadScale: boolean;
  fromWords: boolean;
  digitCount: number;
}

/** Reads a number (digits or words) starting at token i. */
function readNumber(tokens: Token[], i: number): NumberSpan | null {
  const first = tokens[i];
  if (!first) return null;
  if (/^\d/.test(first.text)) {
    const value = parseDigits(first.text);
    if (value === null) return null;
    let end = i + 1;
    let scaled = value;
    let hadScale = false;
    const next = tokens[end];
    if (next) {
      const touching = next.start === first.end;
      if ((next.lower === 'k' || next.lower === 'K'.toLowerCase()) && (touching || true)) {
        scaled = value * 1_000;
        hadScale = true;
        end += 1;
      } else if (next.lower === 'm' && touching) {
        scaled = value * 1_000_000;
        hadScale = true;
        end += 1;
      } else if (next.lower === 'thousand' || next.lower === 'grand') {
        scaled = value * 1_000;
        hadScale = true;
        end += 1;
      } else if (next.lower === 'million' || next.lower === 'mil' || next.lower === 'mm') {
        scaled = value * 1_000_000;
        hadScale = true;
        end += 1;
      } else if (next.lower === 'hundred') {
        scaled = value * 100;
        end += 1;
      }
    }
    // Inline suffix such as "110k" is tokenized as "110" + "k" (touching); handled above.
    const digitCount = first.text.replace(/[^\d]/g, '').split('.')[0]?.length ?? 0;
    return { value: scaled, startToken: i, endToken: end, hadScale, fromWords: false, digitCount };
  }
  if (!isNumberWord(first.lower) && !(first.lower === 'a' && tokens[i + 1] && tokens[i + 1]!.lower in SCALES)) return null;

  let total = 0;
  let current = 0;
  let j = i;
  let consumedAny = false;
  let hadScale = false;
  let lastWasNumber = false;
  while (j < tokens.length) {
    const t = tokens[j]!;
    const w = t.lower;
    if (w === 'a' && !consumedAny && tokens[j + 1] && tokens[j + 1]!.lower in SCALES) {
      current = 1;
      j += 1;
      consumedAny = true;
      lastWasNumber = true;
      continue;
    }
    if (w in UNITS) {
      current += UNITS[w]!;
    } else if (w in TENS) {
      current += TENS[w]!;
    } else if (w === 'hundred') {
      current = (current || 1) * 100;
    } else if (w === 'thousand' || w === 'grand' || w === 'million') {
      total += (current || 1) * SCALES[w]!;
      current = 0;
      hadScale = true;
    } else if ((w === 'and' || w === '-') && consumedAny && tokens[j + 1] && isNumberWord(tokens[j + 1]!.lower)) {
      j += 1;
      lastWasNumber = false;
      continue;
    } else {
      break;
    }
    consumedAny = true;
    lastWasNumber = true;
    j += 1;
  }
  if (!consumedAny || !lastWasNumber) return null;
  return { value: total + current, startToken: i, endToken: j, hadScale, fromWords: true, digitCount: 0 };
}

function currencyBefore(tokens: Token[], i: number): string | null {
  const prev = tokens[i - 1];
  if (!prev) return null;
  if (prev.text in CURRENCY_SIGNS) return CURRENCY_SIGNS[prev.text]!;
  if (prev.lower === 'usd' || prev.lower === 'eur' || prev.lower === 'gbp' || prev.lower === 'kzt') return prev.lower.toUpperCase();
  return null;
}

/** Extracts money-like amounts. Percentages, years, counts and durations are excluded. */
export function parseAmounts(text: string): ParsedAmount[] {
  const tokens = tokenize(text);
  const out: ParsedAmount[] = [];
  let i = 0;
  while (i < tokens.length) {
    const span = readNumber(tokens, i);
    if (!span) {
      i += 1;
      continue;
    }
    const after = tokens[span.endToken];
    const signCurrency = currencyBefore(tokens, span.startToken);
    const startTok = signCurrency ? span.startToken - 1 : span.startToken;
    let endTok = span.endToken;
    let wordCurrency: string | null = null;
    if (after && after.lower in CURRENCY_WORDS) {
      wordCurrency = CURRENCY_WORDS[after.lower]!;
      endTok += 1;
    }
    const nextAfterCurrency = tokens[endTok];
    const isPercent = after && (after.text === '%' || after.lower === 'percent' || (after.lower === 'per' && tokens[span.endToken + 1]?.lower === 'cent'));
    const hasCurrency = Boolean(signCurrency || wordCurrency);
    const unitAfter = !hasCurrency && after && NON_MONEY_UNITS.has(after.lower) && !(after.lower === 'per' && ['year', 'month', 'annum', 'hour'].includes(tokens[span.endToken + 1]?.lower ?? ''));
    const prev = tokens[span.startToken - 1];
    const looksLikeYear =
      !hasCurrency && !span.hadScale && !span.fromWords && span.digitCount === 4 && span.value >= 1950 && span.value <= 2100 &&
      ((prev && YEAR_PREFIXES.has(prev.lower)) || (after && /^(q[1-4]|budget|review|cycle)$/.test(after.lower)));
    const ordinal = after && after.start === tokens[span.endToken - 1]!.end && /^(st|nd|rd|th)$/.test(after.lower);
    const tinyWordNumber = span.fromWords && !span.hadScale && span.value < 10;
    if (isPercent || unitAfter || looksLikeYear || ordinal || tinyWordNumber) {
      i = span.endToken;
      continue;
    }
    // Ranges such as "110-115k" or "110 to 115 thousand": inherit the magnitude of the right side.
    const last = out[out.length - 1];
    if (last && !last.explicitMagnitude && span.hadScale) {
      const between = text.slice(last.end, tokens[startTok]!.start).trim().toLowerCase();
      if (between === '-' || between === '–' || between === 'to' || between === 'and') {
        const factor = Math.round(span.value / Math.max(1, Number(tokens[span.startToken]!.text.replace(/,/g, '')) || 1));
        if (factor >= 1000 && last.valueMinor / 100 < 1000) {
          last.valueMinor = Math.round(last.valueMinor * factor);
          last.explicitMagnitude = true;
        }
      }
    }
    void nextAfterCurrency;
    const startChar = tokens[startTok]!.start;
    const endChar = tokens[endTok - 1]!.end;
    const valueMinor = Math.round(span.value * 100);
    if (valueMinor > 0 && Number.isSafeInteger(valueMinor)) {
      out.push({
        valueMinor,
        explicitMagnitude: span.hadScale || span.digitCount >= 4,
        hasCurrencySign: Boolean(signCurrency),
        currency: signCurrency ?? wordCurrency,
        start: startChar,
        end: endChar,
        text: text.slice(startChar, endChar),
      });
    }
    i = endTok;
  }
  return out;
}

export function parsePercents(text: string): ParsedPercent[] {
  const tokens = tokenize(text);
  const out: ParsedPercent[] = [];
  let i = 0;
  while (i < tokens.length) {
    const span = readNumber(tokens, i);
    if (!span) {
      i += 1;
      continue;
    }
    const after = tokens[span.endToken];
    let endTok = span.endToken;
    let isPercent = false;
    if (after && (after.text === '%' || after.lower === 'percent')) {
      isPercent = true;
      endTok += 1;
    } else if (after && after.lower === 'per' && tokens[span.endToken + 1]?.lower === 'cent') {
      isPercent = true;
      endTok += 2;
    }
    if (isPercent && span.value > 0 && span.value <= 500) {
      const startChar = tokens[span.startToken]!.start;
      const endChar = tokens[endTok - 1]!.end;
      const context = text.slice(Math.max(0, startChar - 30), Math.min(text.length, endChar + 30));
      const up = UP_WORDS.test(context);
      const down = DOWN_WORDS.test(context);
      out.push({
        basisPoints: Math.round(span.value * 100),
        direction: up && !down ? 'up' : down && !up ? 'down' : null,
        start: startChar,
        end: endChar,
        text: text.slice(startChar, endChar),
      });
    }
    i = endTok;
  }
  return out;
}

/**
 * Interprets a stated amount in the units of a scenario whose current amount is
 * `referenceMinor`. A bare "110" in a $95,000 salary conversation means $110,000; the same
 * "110" in an $1,800 rent conversation is not plausible and returns null. Nothing outside
 * [0.25x, 5x] of the reference is accepted, so the engine never acts on a guessed number.
 */
export function resolveScenarioAmount(amount: ParsedAmount, referenceMinor: number): number | null {
  if (amount.currency && amount.currency !== 'USD') return null;
  const low = referenceMinor * 0.25;
  const high = referenceMinor * 5;
  const plausible = (v: number) => v >= low && v <= high;
  if (plausible(amount.valueMinor)) return amount.valueMinor;
  if (!amount.explicitMagnitude && amount.valueMinor < 100_000) {
    const scaled = amount.valueMinor * 1_000;
    if (plausible(scaled)) return scaled;
  }
  return null;
}

/** Distinct resolved amounts of a text in scenario units, in order of appearance. */
export function resolveAmounts(text: string, referenceMinor: number): number[] {
  const values: number[] = [];
  for (const amount of parseAmounts(text)) {
    const value = resolveScenarioAmount(amount, referenceMinor);
    if (value !== null && !values.includes(value)) values.push(value);
  }
  return values;
}

/** Applies a percentage change to an amount in cents, rounding to the nearest cent. */
export function applyBasisPoints(amountMinor: number, basisPoints: number, direction: 'up' | 'down'): number {
  const delta = Math.round((amountMinor * basisPoints) / 10_000);
  return direction === 'up' ? amountMinor + delta : amountMinor - delta;
}
