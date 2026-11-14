/**
 * Strict parsing for typed money in forms: digits with optional thousands separators,
 * optional cents and an optional "k". Returns cents or null; never guesses a magnitude.
 */
export function parseTypedMoney(input: string): number | null {
  const text = input.trim().replace(/^\$/, '').replace(/\s+/g, '').toLowerCase();
  if (!text) return null;
  const match = /^(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?(k)?$/.exec(text);
  if (!match) return null;
  const whole = Number(match[1]!.replace(/,/g, ''));
  const cents = match[2] ? Number(match[2].padEnd(2, '0')) : 0;
  let minor = whole * 100 + cents;
  if (match[3]) minor *= 1_000;
  if (!Number.isSafeInteger(minor) || minor <= 0 || minor > 10_000_000_000) return null;
  return minor;
}

export function minorToInput(minor: number | undefined | null): string {
  if (minor === undefined || minor === null) return '';
  const dollars = minor / 100;
  return Number.isInteger(dollars) ? dollars.toLocaleString('en-US') : dollars.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
