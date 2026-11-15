import { formatMoney } from '@/domain/money';

/**
 * The plans shown on /pricing. Prices live here, not in Polar or env, so the page always shows
 * them. A Polar product must match these numbers before checkout is switched on.
 */
export const PRICING_HEADLINE = 'One free round. Then a plan.';

export type PlanKey = 'trial' | 'monthly' | 'annual';

export interface Plan {
  key: PlanKey;
  label: string;
  priceMinor: number;
  /** Period the first payment covers, shown after the price. */
  per: string;
  /** What happens after the first period. */
  then: string | null;
  guarantee: string | null;
}

const RENEWAL_MINOR = 2_999;

/** What the 7-day trial turns into. */
export const TRIAL_THEN = `then ${formatMoney(RENEWAL_MINOR)} every 4 weeks`;

export const PLANS: readonly Plan[] = [
  { key: 'trial', label: '7-day trial', priceMinor: 499, per: 'for 7 days', then: TRIAL_THEN, guarantee: null },
  { key: 'monthly', label: 'Monthly', priceMinor: RENEWAL_MINOR, per: 'per month', then: null, guarantee: null },
  { key: 'annual', label: 'Annual', priceMinor: 11_999, per: 'per year', then: null, guarantee: '30-day money-back guarantee' },
];
