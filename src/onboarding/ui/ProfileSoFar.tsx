'use client';

import { useState } from 'react';
import type { MoneyAnswer } from '@/contracts/intake';
import { formatMoney } from '@/domain/money';
import { cn } from '@/components/ui/cn';
import type { IntakeProfile } from '../contracts';

export function moneyText(m: MoneyAnswer | null | undefined): string {
  if (!m) return '—';
  const base = m.currency === 'USD' ? formatMoney(m.amountMinor, m.period) : `${(m.amountMinor / 100).toLocaleString('en-US')} ${m.currency}${m.period === 'year' ? '/year' : m.period === 'month' ? '/month' : ''}`;
  return m.basis === 'unspecified' ? base : `${base}, ${m.basis === 'gross' ? 'before tax' : 'after tax'}`;
}

/** Live summary during the call. Values are candidates until the review; a value that just arrived flashes once. */
export function ProfileSoFar({ profile }: { profile: IntakeProfile }) {
  const rows: [string, string][] = [
    ['Conversation', profile.kind.value ?? '—'],
    ['You', profile.userRole.value ?? (profile.userRole.status === 'skipped' ? 'skipped' : '—')],
    ['Speaking with', profile.counterpartRole.value ?? '—'],
    ['Current', moneyText(profile.currentMoney.value)],
    ['Target', moneyText(profile.targetMoney.value)],
    ['Range', profile.marketRange.value ? `${formatMoney(profile.marketRange.value.lowMinor)} – ${formatMoney(profile.marketRange.value.highMinor)}` : profile.marketRange.status === 'unknown' && profile.reasons.status !== 'unknown' ? 'not known' : '—'],
  ];
  const [initial] = useState(() => new Map(rows));
  const filled = rows.filter(([, v]) => v !== '—').length;
  return (
    <aside className="card grid gap-4 p-5 lg:sticky lg:top-24" aria-label="What Alex has so far">
      <div className="grid gap-2">
        <div className="flex items-center justify-between gap-3">
          <span className="label">So far</span>
          <span className="mono text-[12px] text-muted">
            {filled}/{rows.length}
          </span>
        </div>
        <div className="flex gap-1" aria-hidden>
          {rows.map(([k, v]) => (
            <span key={k} className={cn('h-1 flex-1 rounded-full transition-colors duration-300', v !== '—' ? 'bg-hold' : 'bg-sunken')} />
          ))}
        </div>
      </div>
      <dl className="m-0 grid gap-1 text-[14px] leading-5">
        {rows.map(([k, v]) => (
          <div key={k} className="-mx-2 flex items-baseline justify-between gap-3 rounded-[10px] px-2 py-1.5">
            <dt className="text-muted">{k}</dt>
            <dd key={v} className={cn('m-0 rounded-[6px] px-1 text-right font-medium', v === '—' && 'font-normal text-muted', v !== initial.get(k) && 'value-flash')}>
              {v}
            </dd>
          </div>
        ))}
      </dl>
      <p className="m-0 text-[12.5px] leading-5 text-muted">Candidates only. You confirm every value at the end.</p>
    </aside>
  );
}
