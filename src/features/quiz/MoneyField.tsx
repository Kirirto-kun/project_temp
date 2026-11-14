'use client';

import { useId, useState } from 'react';
import type { Period } from '@/contracts/domain';
import { formatMoney, periodSuffix } from '@/domain/money';
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
}: {
  label: string;
  hint?: string;
  valueMinor: number | undefined;
  period: Period;
  onChange: (minor: number | undefined) => void;
  error?: string | null;
  salaryScale?: boolean;
  autoFocus?: boolean;
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
  const message = error ?? (text && parsed === null ? 'Use a number like 95,000 or 95k.' : looksLikeThousands ? `That is ${formatMoney(parsed!, period)}. If you meant thousands, type ${minorToInput(parsed! * 1_000)}.` : null);
  return (
    <div className="grid gap-2">
      <label htmlFor={id} className="text-[15px] font-semibold">
        {label}
      </label>
      {hint && (
        <p id={`${id}-hint`} className="m-0 text-[14px] leading-5 text-muted">
          {hint}
        </p>
      )}
      <div className="flex items-center gap-2">
        <span className="num text-[20px] text-muted" aria-hidden>
          $
        </span>
        <input
          id={id}
          className="input num max-w-[260px] text-[20px]"
          inputMode="decimal"
          autoComplete="off"
          autoFocus={autoFocus}
          value={text}
          aria-invalid={Boolean(error) || (text !== '' && parsed === null)}
          aria-describedby={`${hint ? `${id}-hint ` : ''}${id}-msg`}
          onChange={(e) => {
            setText(e.target.value);
            onChange(parseTypedMoney(e.target.value) ?? undefined);
          }}
        />
        <span className="mono text-[13px] text-muted">{periodSuffix(period) || 'one-time'}</span>
      </div>
      <p id={`${id}-msg`} className={`m-0 min-h-5 text-[14px] leading-5 ${message ? 'text-gap' : 'text-muted'}`} role={message ? 'status' : undefined}>
        {message ?? (parsed !== null ? formatMoney(parsed, period) : '')}
      </p>
    </div>
  );
}
