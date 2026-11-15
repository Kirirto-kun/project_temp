'use client';

import { useId, useState } from 'react';
import type { Period } from '@/contracts/domain';
import { formatMoney, periodSuffix } from '@/domain/money';
import { cn } from '@/components/ui/cn';
import { minorToInput, parseTypedMoney } from './money-input';

export function MoneyField({
  label,
  hint,
  valueMinor,
  period,
  onChange,
  error,
  salaryScale = false,
  autoFocus = false,
  size = 'lg',
}: {
  label: string;
  hint?: string;
  valueMinor: number | undefined;
  period: Period;
  onChange: (minor: number | undefined) => void;
  error?: string | null;
  salaryScale?: boolean;
  autoFocus?: boolean;
  size?: 'lg' | 'md';
}) {
  const id = useId();
  const [text, setText] = useState(minorToInput(valueMinor));
  const [seen, setSeen] = useState(valueMinor);
  if (seen !== valueMinor) {
    // Follow external changes (quick targets, restored drafts) without fighting the user's typing.
    setSeen(valueMinor);
    if (parseTypedMoney(text) !== (valueMinor ?? null)) setText(minorToInput(valueMinor));
  }
  const parsed = parseTypedMoney(text);
  const looksLikeThousands = salaryScale && parsed !== null && parsed < 100_000;
  const invalid = Boolean(error) || (text !== '' && parsed === null);
  const message = error ?? (text && parsed === null ? 'Use a number like 95,000 or 95k.' : looksLikeThousands ? `That is ${formatMoney(parsed!, period)}. If you meant thousands, type ${minorToInput(parsed! * 1_000)}.` : null);
  const big = size === 'lg';
  return (
    <div className="grid gap-2">
      <label htmlFor={id} className="text-[15px] font-semibold tracking-[-0.01em]">
        {label}
      </label>
      {hint && (
        <p id={`${id}-hint`} className="m-0 -mt-1 text-[14px] leading-5 text-muted">
          {hint}
        </p>
      )}
      <div className={cn('money-field', big ? 'min-h-[68px]' : 'min-h-[52px]')} data-invalid={invalid || undefined}>
        <span className={cn('select-none pl-4 font-semibold text-muted', big ? 'text-[26px]' : 'text-[19px]')} aria-hidden>
          $
        </span>
        <input
          id={id}
          className={cn('num w-0 min-w-0 flex-1 border-0 bg-transparent px-1.5 font-bold text-ink outline-none placeholder:font-semibold placeholder:text-line-strong', big ? 'text-[28px] tracking-[-0.03em]' : 'text-[19px] tracking-[-0.02em]')}
          inputMode="decimal"
          autoComplete="off"
          enterKeyHint="next"
          placeholder="0"
          autoFocus={autoFocus}
          value={text}
          aria-invalid={invalid}
          aria-describedby={`${hint ? `${id}-hint ` : ''}${id}-msg`}
          onChange={(e) => {
            setText(e.target.value);
            onChange(parseTypedMoney(e.target.value) ?? undefined);
          }}
        />
        <span className="mono mr-3 shrink-0 rounded-full bg-sunken px-2.5 py-1 text-[12px] text-muted">{big ? periodSuffix(period).replace('/', 'per ') || 'one-time' : periodSuffix(period) || 'once'}</span>
      </div>
      <p id={`${id}-msg`} className={cn('m-0 min-h-5 text-[14px] leading-5', message ? 'text-gap' : 'text-muted')} role={message ? 'status' : undefined}>
        {message ?? (parsed !== null ? formatMoney(parsed, period) : '')}
      </p>
    </div>
  );
}
