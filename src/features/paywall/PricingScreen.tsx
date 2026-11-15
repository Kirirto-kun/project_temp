'use client';

import { ArrowRight, Check, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { ConfigResponse, EntitlementResponse } from '@/contracts/api';
import { formatMoney } from '@/domain/money';
import { ApiClientError } from '@/client/api/client';
import { getConfig, getEntitlement, startCheckout } from '@/client/api/session';

export function PricingScreen() {
  const params = useSearchParams();
  const [config, setConfig] = useState<ConfigResponse | null>(null);
  const [entitlement, setEntitlement] = useState<EntitlementResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const returned = params.get('checkout') === 'success';

  useEffect(() => {
    getConfig().then(setConfig).catch(() => setConfig(null));
    let attempts = 0;
    let cancelled = false;
    async function poll() {
      const value = await getEntitlement().catch(() => null);
      if (cancelled) return;
      setEntitlement(value);
      if (returned && value?.status === 'pending' && attempts < 20) {
        attempts += 1;
        setTimeout(poll, 3_000);
      }
    }
    void poll();
    return () => {
      cancelled = true;
    };
  }, [returned]);

  async function buy() {
    setBusy(true);
    setError(null);
    try {
      const checkout = await startCheckout();
      window.location.assign(checkout.checkoutUrl);
    } catch (err) {
      setBusy(false);
      setError(err instanceof ApiClientError ? err.message : 'Checkout is not available right now.');
    }
  }

  const product = config?.paidProduct ?? null;
  const freeItems = ['The coach call or the quick form', 'Every standard round, with replays', 'The full debrief, money and voice'];
  const packItems = ['One scenario written from your own description', 'One analysis of a real offer you paste in'];
  return (
    <div className="mx-auto grid max-w-[960px] gap-10">
      <header className="grid justify-items-center gap-4 text-center">
        <p className="eyebrow m-0">Pricing</p>
        <h1 className="h-section m-0 max-w-[16ch]">
          Practice is free. <span className="serif text-hold-text">Your own scenario</span> is a pack.
        </h1>
        <p className="lede m-0">No subscription and nothing to cancel. Free rounds run within a daily limit.</p>
      </header>

      <div className="grid gap-4 md:grid-cols-2">
        <section className="card grid content-start gap-5 p-6 sm:p-8" aria-labelledby="plan-free">
          <div className="grid gap-2">
            <span id="plan-free" className="label">
              Free
            </span>
            <div className="text-[44px] font-extrabold leading-none tracking-[-0.05em]">$0</div>
            <p className="m-0 text-[14.5px] text-muted">The coach call, the quick form, every standard round, replays and the debrief, within a daily limit.</p>
          </div>
          <ul className="m-0 grid list-none gap-3 p-0">
            {freeItems.map((item) => (
              <li key={item} className="flex items-start gap-3 text-[15px]">
                <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-hold-tint text-hold-text">
                  <Check size={12} strokeWidth={3} aria-hidden />
                </span>
                {item}
              </li>
            ))}
          </ul>
          <Link href="/intake" className="btn btn-secondary mt-auto">
            Start practising <ArrowRight size={16} strokeWidth={2} className="arrow" aria-hidden />
          </Link>
        </section>

        <section className="on-violet relative grid content-start gap-5 overflow-hidden rounded-[24px] p-6 shadow-[var(--shadow-lift)] sm:p-8" aria-labelledby="plan-pack">
          <div className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full bg-violet-400/40 blur-3xl" aria-hidden />
          <div className="relative grid gap-2">
            <div className="flex items-center justify-between gap-3">
              <span id="plan-pack" className="text-[12px] font-medium uppercase tracking-[0.08em] text-white/75">
                Conversation pack
              </span>
              <span className="badge bg-white/15 text-white">One-time</span>
            </div>
            <div className="text-[44px] font-extrabold leading-none tracking-[-0.05em] text-white">{product ? formatMoney(product.priceMinor) : '—'}</div>
            <p className="m-0 text-[13.5px] text-white/80">One-time payment. No subscription, no renewal. Access is tied to this browser.</p>
          </div>
          <ul className="relative m-0 grid list-none gap-3 p-0">
            {packItems.map((item) => (
              <li key={item} className="flex items-start gap-3 text-[15px] text-white">
                <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-white text-violet-700">
                  <Check size={12} strokeWidth={3} aria-hidden />
                </span>
                {item}
              </li>
            ))}
          </ul>
          <div className="relative mt-auto grid gap-2">
            {entitlement?.status === 'active' ? (
              <>
                <p className="m-0 rounded-[14px] bg-white/15 p-3 text-[14px] text-white">
                  Active: {entitlement.customScenariosRemaining} scenario and {entitlement.offerAnalysesRemaining} offer analysis left.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Link href="/custom" className="btn btn-white">
                    Write my scenario
                  </Link>
                  <Link href="/offer" className="btn hero-ghost">
                    Analyse an offer
                  </Link>
                </div>
              </>
            ) : entitlement?.status === 'pending' ? (
              <p className="m-0 flex items-center gap-2 text-white/85" role="status">
                <Loader2 size={16} className="animate-spin" aria-hidden /> Waiting for the payment confirmation…
              </p>
            ) : product ? (
              <button type="button" className="btn btn-white btn-xl !max-w-none" onClick={() => void buy()} disabled={busy}>
                {busy ? <Loader2 size={18} className="animate-spin" aria-hidden /> : null}
                {busy ? 'Opening checkout…' : `Buy for ${formatMoney(product.priceMinor)}`}
              </button>
            ) : (
              <p className="m-0 rounded-[14px] bg-white/12 p-3 text-[14px] text-white/85">Payments are not enabled on this deployment.</p>
            )}
            {entitlement?.status === 'revoked' && <p className="m-0 rounded-[14px] bg-white/15 p-3 text-[14px] text-white">This pack was refunded, so its unused credits were removed.</p>}
            {error && (
              <p className="m-0 rounded-[14px] bg-white/15 p-3 text-[14px] text-white" role="alert">
                {error}
              </p>
            )}
          </div>
        </section>
      </div>

      <section id="billing" className="panel mx-auto grid w-full max-w-[720px] gap-2 p-6">
        <h2 className="m-0 text-[18px] font-semibold tracking-[-0.015em]">Why was I charged?</h2>
        <p className="m-0 text-[15px] leading-6 text-muted">Only if you bought a conversation pack. The receipt from our payment provider shows the date and the amount. There is nothing to cancel because nothing renews.</p>
      </section>
    </div>
  );
}
