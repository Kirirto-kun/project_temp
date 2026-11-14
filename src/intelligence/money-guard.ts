import { parseAmounts, parsePercents } from '@/domain/money-parse';

const NUMBER_WORDS =
  /\b(zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|million|billion|grand|dozen|half|quarter|double|triple|twice)\b/i;
const MONEY_MARKERS = /[$€£¥₹₸%]|\b(usd|dollars?|bucks|cents?|percent|k\b|mm\b|raise of|bonus of)/i;
const DIGITS = /\d/;

/**
 * True when a text contains anything that could be heard as a number or an amount: digits,
 * number words, currency or percent markers. Model-written lines must contain none of these;
 * every number in a counterpart reply is inserted by code.
 */
export function containsNumberLike(text: string): boolean {
  return DIGITS.test(text) || NUMBER_WORDS.test(text) || MONEY_MARKERS.test(text);
}

/**
 * Checks a full reply: every amount it states must be one of the allowed amounts (in cents),
 * and it must not state percentages. Used for the final text after code-side substitution.
 */
export function onlyAllowedAmounts(text: string, allowedMinor: readonly number[]): boolean {
  if (parsePercents(text).length > 0) return false;
  for (const amount of parseAmounts(text)) {
    if (!allowedMinor.includes(amount.valueMinor)) return false;
  }
  return true;
}

export const AMOUNT_PLACEHOLDER = '{{AMOUNT}}';

/** Replaces the placeholder with the code-formatted amount; null when the template is unsafe. */
export function fillAmount(line: string, formattedAmount: string): string | null {
  const count = line.split(AMOUNT_PLACEHOLDER).length - 1;
  if (count !== 1) return null;
  const withoutPlaceholder = line.replace(AMOUNT_PLACEHOLDER, '');
  if (containsNumberLike(withoutPlaceholder)) return null;
  return line.replace(AMOUNT_PLACEHOLDER, formattedAmount);
}
