import type { Metadata } from 'next';
import Link from 'next/link';
import { Page } from '@/components/holdline/AppShell';
import { WindowCard } from '@/components/holdline/WindowCard';
import { FAQ, MOVES } from '@/content/copy';
import { LandingStats } from '@/features/landing/LandingStats';

export const metadata: Metadata = { title: 'Rehearse the money conversation' };

export default function LandingPage() {
  return (
    <Page>
      <section className="card grid justify-items-start gap-4 px-6 py-8 sm:px-8" aria-labelledby="hero-title">
        <p className="eyebrow m-0">Negotiation simulator</p>
        <h1 id="hero-title" className="h-display m-0 max-w-[17ch]">
          Rehearse the raise before it costs you <span className="fig-chip">$8,000</span>
        </h1>
        <p className="m-0 max-w-[52ch] text-muted">
          Start with a short call with Alex, your AI practice coach. Then play the conversation against a counterpart who does not give in for free, and see which move left money on the table.
        </p>
        <div className="flex w-full flex-wrap items-center gap-3">
          <Link href="/intake" className="btn btn-primary btn-xl">
            Start
          </Link>
          <Link href="/quiz" className="btn btn-ghost">
            Use the quick form
          </Link>
        </div>
        <ul className="m-0 flex list-none flex-wrap gap-2 p-0" aria-label="Facts">
          <li className="chip">Raise · offer · rent · bills</li>
          <li className="chip">Plays in the browser, no sign-up</li>
          <li className="chip">Debrief after every round</li>
        </ul>
      </section>

      <section className="pt-12" aria-labelledby="how">
        <h2 id="how" className="h-section m-0 mb-6">
          How it works
        </h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <WindowCard file="setup.log" step="01">
            <h3 className="m-0 text-[18px] font-semibold leading-6">Tell the coach your situation</h3>
            <p className="m-0 mt-2 text-[14px] leading-5 text-muted">Your role, what you earn, what you want and why. You confirm every number.</p>
          </WindowCard>
          <WindowCard file="round.log" step="02">
            <h3 className="m-0 text-[18px] font-semibold leading-6">Play it out</h3>
            <p className="m-0 mt-2 text-[14px] leading-5 text-muted">Your counterpart objects, stalls and tests you. Trust and patience move with every reply.</p>
          </WindowCard>
          <WindowCard file="debrief.log" step="03">
            <h3 className="m-0 text-[18px] font-semibold leading-6">See the gap</h3>
            <p className="m-0 mt-2 text-[14px] leading-5 text-muted">Where you stopped against your range, and the move that cost the most. Then replay.</p>
          </WindowCard>
        </div>
      </section>

      <section className="pt-12" aria-labelledby="steps">
        <h2 id="steps" className="h-section m-0 mb-6">
          Four steps
        </h2>
        <ol className="m-0 list-none border-t border-line p-0">
          {[
            ['Talk to the coach or fill in the form', 'What you are negotiating, your numbers, and what worries you.'],
            ['Pick your counterpart', 'Six to eight characters with different ways of saying no.'],
            ['Play the round', 'Type or speak. The counterpart answers in role, for up to five minutes.'],
            ['Read the debrief, then replay', 'The ledger shows each move and what it did to the money.'],
          ].map(([title, text], i) => (
            <li key={title} className="grid grid-cols-[40px_minmax(0,1fr)] gap-4 border-b border-line py-4">
              <span className="mono text-[18px] leading-6 text-muted">{String(i + 1).padStart(2, '0')}</span>
              <div>
                <h3 className="m-0 text-[18px] font-semibold leading-6">{title}</h3>
                <p className="m-0 mt-1 text-[14px] leading-5 text-muted">{text}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <LandingStats />

      <section className="pt-12" aria-label="Moves you practise">
        <p className="sr-only">Moves you practise: {MOVES.join(', ')}.</p>
        <div className="ticker" aria-hidden>
          <div className="ticker-track">
            {MOVES.map((m) => (
              <span key={m}>{m}</span>
            ))}
            {MOVES.map((m) => (
              <span key={`dup-${m}`} className="ticker-dup">
                {m}
              </span>
            ))}
          </div>
        </div>
      </section>

      <section className="mt-12 grid justify-items-start gap-4 rounded-[12px] px-6 py-8" style={{ background: 'var(--ink)', color: 'var(--paper)' }}>
        <p className="eyebrow m-0" style={{ color: 'var(--paper)', opacity: 0.8 }}>
          Your next money conversation
        </p>
        <h2 className="h-section m-0 max-w-[20ch]">Rehearse it before it costs you.</h2>
        <Link href="/intake" className="btn btn-primary btn-xl">
          Start
        </Link>
      </section>

      <section className="pt-12" aria-labelledby="faq">
        <h2 id="faq" className="h-section m-0 mb-4">
          Questions
        </h2>
        <div className="faq border-t border-line">
          {FAQ.map((item, i) => (
            <details key={item.q} open={i === 0}>
              <summary>
                {item.q}
                <span className="plus" aria-hidden />
              </summary>
              <p className="m-0 mb-4 text-muted">{item.a}</p>
            </details>
          ))}
        </div>
      </section>
    </Page>
  );
}
