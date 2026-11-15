'use client';

import { CircleAlert, Loader2, ScanText } from 'lucide-react';
import { useState } from 'react';
import type { OfferAnalysis } from '@/contracts/api';
import { formatMoney } from '@/domain/money';
import { ApiClientError } from '@/client/api/client';
import { analyzeOffer } from '@/client/api/session';

function Part({ label, part, period }: { label: string; part: OfferAnalysis['base']; period: OfferAnalysis['period'] }) {
  return (
    <div className="border-b border-line px-5 py-4">
      <div className="flex items-baseline justify-between gap-3">
        <span className="label">{label}</span>
        <span className="num text-[19px] font-bold tracking-[-0.02em]">{part.amountMinor !== null ? formatMoney(part.amountMinor, label === 'Sign-on' ? null : period) : 'Not stated'}</span>
      </div>
      {part.sourceText && <p className="m-0 mt-1 text-[13px] italic text-muted">“{part.sourceText}”</p>}
      {part.amountMinor !== null && <span className={`badge mt-2 ${part.guaranteed ? 'badge-won' : ''}`}>{part.guaranteed ? 'Guaranteed' : 'Not guaranteed'}</span>}
    </div>
  );
}

export function OfferForm() {
  const [text, setText] = useState('');
  const [analysis, setAnalysis] = useState<OfferAnalysis | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      setAnalysis(await analyzeOffer(text));
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Could not analyse the offer.');
    }
    setBusy(false);
  }

  return (
    <div className="mx-auto grid max-w-[680px] gap-6">
      <header className="grid gap-3">
        <p className="eyebrow m-0">Conversation pack</p>
        <h1 className="h-title m-0">Read a real offer</h1>
        <p className="m-0 text-[15px] leading-6 text-muted">Paste the offer text. Every amount is read from the text itself; anything not stated stays unknown. This is not a financial forecast.</p>
      </header>
      <textarea className="input min-h-[220px] font-[450]" placeholder="Paste the offer letter or email here" maxLength={20_000} value={text} onChange={(e) => setText(e.target.value)} aria-label="Offer text" />
      <button type="button" className="btn btn-primary btn-xl" disabled={busy || text.trim().length < 20} onClick={() => void submit()}>
        {busy ? <Loader2 size={18} className="animate-spin" aria-hidden /> : <ScanText size={18} strokeWidth={2} aria-hidden />}
        {busy ? 'Reading…' : 'Analyse the offer'}
      </button>
      {error && (
        <p className="callout callout-warn m-0 flex items-start gap-2 text-ink" role="alert">
          <CircleAlert size={18} strokeWidth={2} className="mt-px shrink-0 text-gap" aria-hidden />
          {error}
        </p>
      )}
      {analysis && (
        <section className="card pop-in overflow-hidden p-0" aria-label="Offer analysis">
          <Part label="Base" part={analysis.base} period={analysis.period} />
          <Part label="Bonus" part={analysis.bonus} period={analysis.period} />
          <Part label="Equity" part={analysis.equity} period={analysis.period} />
          <Part label="Sign-on" part={analysis.signOn} period={analysis.period} />
          <div className="on-violet grid gap-1 px-5 py-5">
            <div className="text-[12px] font-medium uppercase tracking-[0.08em] text-white/75">First-year guaranteed cash</div>
            <div className="num text-[34px] font-extrabold tracking-[-0.04em] text-white">{analysis.guaranteedTotalMinor !== null ? formatMoney(analysis.guaranteedTotalMinor) : 'Unknown'}</div>
            <p className="m-0 text-[13px] text-white/75">Base + guaranteed bonus + sign-on, computed by code. Equity and target bonuses are not added.</p>
          </div>
          <ul className="m-0 grid gap-1.5 px-5 pb-1 pl-10 pt-5 text-[14.5px] leading-6">
            {analysis.unknowns.map((u) => (
              <li key={u}>{u}</li>
            ))}
          </ul>
          <div className="label px-5 pt-4">Questions to ask</div>
          <ul className="m-0 grid gap-1.5 px-5 pb-5 pl-10 pt-2 text-[14.5px] leading-6">
            {analysis.questionsToAsk.map((q) => (
              <li key={q}>{q}</li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
