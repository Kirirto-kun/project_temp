import type { MoneyAnswer } from '@/contracts/intake';
import { formatMoney } from '@/domain/money';
import type { IntakeProfile } from '../contracts';

export function moneyText(m: MoneyAnswer | null | undefined): string {
  if (!m) return '—';
  const base = m.currency === 'USD' ? formatMoney(m.amountMinor, m.period) : `${(m.amountMinor / 100).toLocaleString('en-US')} ${m.currency}${m.period === 'year' ? '/year' : m.period === 'month' ? '/month' : ''}`;
  return m.basis === 'unspecified' ? base : `${base}, ${m.basis === 'gross' ? 'before tax' : 'after tax'}`;
}

/** Live summary during the call. Values are candidates until the review. */
export function ProfileSoFar({ profile }: { profile: IntakeProfile }) {
  const rows: [string, string][] = [
    ['Conversation', profile.kind.value ?? '—'],
    ['You', profile.userRole.value ?? (profile.userRole.status === 'skipped' ? 'skipped' : '—')],
    ['Speaking with', profile.counterpartRole.value ?? '—'],
    ['Current', moneyText(profile.currentMoney.value)],
    ['Target', moneyText(profile.targetMoney.value)],
    ['Range', profile.marketRange.value ? `${formatMoney(profile.marketRange.value.lowMinor)} – ${formatMoney(profile.marketRange.value.highMinor)}` : profile.marketRange.status === 'unknown' && profile.reasons.status !== 'unknown' ? 'not known' : '—'],
  ];
  return (
    <aside className="card p-4" aria-label="What Alex has so far">
      <div className="label mb-2">So far · you confirm at the end</div>
      <dl className="m-0 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-[14px] leading-5">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-muted">{k}</dt>
            <dd className="m-0 text-right">{v}</dd>
          </div>
        ))}
      </dl>
    </aside>
  );
}
