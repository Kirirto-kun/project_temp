import { ArrowRight, AudioLines, Calculator, Check, Keyboard, ShieldCheck, UserRoundX } from 'lucide-react';
import Link from 'next/link';
import type { Debrief } from '@/contracts/voice';
import { formatMoney } from '@/domain/money';
import { Avatar } from '@/components/holdline/Avatar';
import { LogoMark } from '@/components/holdline/Logo';
import { OfferBar } from '@/components/holdline/OfferBar';
import { TurnLedger } from '@/components/holdline/TurnLedger';
import { InView } from '@/components/ui/in-view';
import { Marquee } from '@/components/ui/marquee';
import { ARCHETYPE_LABELS, AVATAR_CARDS } from '@/content/avatars';
import { MOVES } from '@/content/copy';
import { DemoRound } from './DemoRound';
import { Zigzag } from './Zigzag';

const delay = (ms: number) => ({ ['--delay' as string]: `${ms}ms` });

/* ------------------------------------------------------------------ Hero */

export function Hero() {
  return (
    <section className="relative px-2 sm:px-4" aria-labelledby="hero-title">
      <div className="on-violet relative mx-auto max-w-[1400px] overflow-hidden rounded-[32px] pb-[200px] pt-14 sm:rounded-[44px] sm:pb-[250px] sm:pt-24">
        <Zigzag />
        <div className="relative mx-auto grid max-w-[1080px] justify-items-center px-5 text-center">
          <p className="hero-pill fade-in m-0" style={delay(0)}>
            <span className="h-1.5 w-1.5 rounded-full bg-spark" aria-hidden />
            Negotiation simulator · free to practise
          </p>
          <h1 id="hero-title" className="h-display rise m-0 mt-6 max-w-[13ch] text-white sm:max-w-[14ch]" style={delay(60)}>
            Rehearse the raise{' '}
            <span className="hero-inline-avatar" aria-hidden>
              <Avatar avatarId="maya-chen" size={120} />
            </span>{' '}
            <span className="serif text-violet-200">before</span> it costs you <span className="fig-chip hero-tag">$8,000</span>
          </h1>
          <p className="rise m-0 mt-7 max-w-[54ch] text-[17px] leading-7 text-white/80 sm:text-[19px] sm:leading-8" style={{ ...delay(180), ['--rise' as string]: '10px' }}>
            Start with a short call with Alex, your AI practice coach. Then play the conversation against a counterpart who does not give in for free, and see which move left money on the table.
          </p>
          <div className="rise mt-9 flex w-full flex-col items-center justify-center gap-3 sm:w-auto sm:flex-row" style={{ ...delay(260), ['--rise' as string]: '8px' }}>
            <Link href="/intake" className="btn btn-white btn-xl">
              Start practising <ArrowRight size={18} strokeWidth={2} className="arrow" aria-hidden />
            </Link>
            <Link href="/quiz" className="btn btn-xl hero-ghost">
              Use the quick form
            </Link>
          </div>
          <ul className="fade-in m-0 mt-8 flex list-none flex-wrap justify-center gap-2 p-0" aria-label="Facts" style={delay(380)}>
            {['Raise · offer · rent · bills', 'Plays in the browser, no sign-up', 'Debrief after every round'].map((fact) => (
              <li key={fact} className="hero-fact">
                <Check size={14} strokeWidth={2.5} aria-hidden /> {fact}
              </li>
            ))}
          </ul>
        </div>
      </div>
      <div className="rise relative mx-auto -mt-[170px] max-w-[980px] px-1 sm:-mt-[210px] sm:px-6" style={{ ...delay(420), ['--rise' as string]: '28px' }}>
        <DemoRound />
        <p className="m-0 mt-3 text-center text-[12.5px] text-muted">An illustrative round. In yours, every amount comes from your own range.</p>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ Ribbons */

function Sparkle({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <path d="M12 0c.8 6.4 5.6 11.2 12 12-6.4.8-11.2 5.6-12 12-.8-6.4-5.6-11.2-12-12C6.4 11.2 11.2 6.4 12 0z" fill="currentColor" />
    </svg>
  );
}

export function Ribbons() {
  const kinds = ['Ask for a raise', 'Answer a job offer', 'Push back on rent', 'Cut a bill', 'Name your number', 'Hold the line'];
  return (
    <section aria-label="Moves you practise" className="relative overflow-hidden py-12 sm:py-16">
      <p className="sr-only">Moves you practise: {MOVES.join(', ')}.</p>
      <div aria-hidden className="relative h-[190px] sm:h-[250px]">
        <div className="ribbon absolute left-[-6%] top-1/2 z-0 bg-violet-200 text-violet-900" style={{ transform: 'translateY(-50%) rotate(-4deg)' }}>
          <Marquee duration={55} gap={36} reverse>
            {kinds.map((k) => (
              <span key={k} className="ribbon-item">
                {k}
                <Sparkle className="h-5 w-5 text-violet-500 sm:h-6 sm:w-6" />
              </span>
            ))}
          </Marquee>
        </div>
        <div className="ribbon absolute left-[-6%] top-1/2 z-10 bg-night text-white" style={{ transform: 'translateY(-50%) rotate(3deg)' }}>
          <Marquee duration={45} gap={36}>
            {MOVES.map((m) => (
              <span key={m} className="ribbon-item">
                {m}
                <LogoMark size={30} className="rotate-[8deg]" />
              </span>
            ))}
          </Marquee>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ How it works */

function BriefMock() {
  const rows: [string, string, boolean][] = [
    ['You', 'Backend engineer', true],
    ['Current', '$95,000/year', true],
    ['Target', '$112,000/year', true],
    ['Range', '$100,000 – $115,000', false],
  ];
  return (
    <div className="grid gap-2 rounded-[18px] bg-paper-subtle p-3 shadow-[inset_0_0_0_1px_var(--line)]">
      {rows.map(([k, v, ok]) => (
        <div key={k} className="flex items-center justify-between gap-3 rounded-[12px] bg-raised px-3 py-2 text-[13px] shadow-[var(--shadow-xs)]">
          <span className="text-muted">{k}</span>
          <span className="flex items-center gap-2 font-semibold">
            {v}
            <span className={`grid h-4 w-4 place-items-center rounded-full ${ok ? 'bg-hold text-white' : 'bg-sunken text-muted'}`}>
              <Check size={10} strokeWidth={3.5} aria-hidden />
            </span>
          </span>
        </div>
      ))}
    </div>
  );
}

function ChatMock() {
  return (
    <div className="grid gap-2">
      <div className="max-w-[85%] rounded-[16px_16px_16px_5px] bg-white/14 px-3 py-2 text-[13px] leading-5 text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.14)]">The budget is fixed this cycle.</div>
      <div className="ml-auto max-w-[85%] rounded-[16px_16px_5px_16px] bg-white px-3 py-2 text-[13px] leading-5 text-violet-900">I led the migration and cut incidents in half.</div>
      <div className="mt-1 grid gap-1.5 rounded-[14px] bg-white/10 p-3">
        {[
          ['Trust', 68],
          ['Patience', 54],
        ].map(([label, value]) => (
          <div key={label} className="grid grid-cols-[64px_minmax(0,1fr)_28px] items-center gap-2 text-[11px] font-medium uppercase tracking-[0.06em] text-white/75">
            {label}
            <span className="h-1.5 overflow-hidden rounded-full bg-white/15">
              <span className="block h-full rounded-full bg-white" style={{ width: `${value}%` }} />
            </span>
            <span className="text-right tabular-nums text-white">{value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function GapMock() {
  return (
    <div className="grid gap-3 rounded-[18px] bg-white/[0.06] p-4 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)]">
      <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-white/60">Left on the table</div>
      <div className="text-[34px] font-extrabold leading-none tracking-[-0.045em] text-[var(--on-dark-gap)]">$8,000</div>
      <div className="grid gap-1.5">
        <span className="h-2 w-full rounded-full bg-[repeating-linear-gradient(-45deg,white_0_5px,rgba(255,255,255,0.6)_5px_10px)]" />
        <span className="flex h-2 gap-[3px]">
          <span className="h-full w-[86%] rounded-full bg-[var(--on-dark-won)]" />
          <span className="h-full w-[12%] rounded-full bg-[var(--on-dark-gap)]" />
        </span>
      </div>
    </div>
  );
}

export function HowItWorks() {
  const steps = [
    {
      n: '01',
      title: 'Tell Alex your situation',
      text: 'Your role, what you earn, what you want and why. A short call or a quick form. You confirm every number.',
      tone: 'card',
      mock: <BriefMock />,
    },
    {
      n: '02',
      title: 'Play it out',
      text: 'Your counterpart objects, stalls and tests you. Trust and patience move with every reply. Up to five minutes.',
      tone: 'violet',
      mock: <ChatMock />,
    },
    {
      n: '03',
      title: 'See the gap',
      text: 'Where you stopped against your range, and the move that cost the most. Then replay the same round.',
      tone: 'ink',
      mock: <GapMock />,
    },
  ] as const;
  return (
    <section className="mx-auto w-full max-w-[1120px] px-4" aria-labelledby="how">
      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
        <div>
          <p className="eyebrow m-0">How it works</p>
          <h2 id="how" className="h-section m-0 mt-4 max-w-[16ch]">
            Three steps. <span className="serif text-hold-text">One</span> number that matters.
          </h2>
        </div>
        <p className="lede m-0 max-w-[36ch] sm:text-right">From a short intake to a debrief that shows, move by move, what each reply did to the money.</p>
      </div>
      <ol className="m-0 mt-12 grid list-none gap-4 p-0 md:grid-cols-3">
        {steps.map((step) => (
          <li
            key={step.n}
            className={`step-card group flex min-h-[440px] flex-col justify-between gap-8 rounded-[28px] p-6 sm:p-7 ${
              step.tone === 'violet' ? 'on-violet' : step.tone === 'ink' ? 'bg-night text-white [--muted:rgba(255,255,255,0.66)]' : 'bg-raised shadow-[var(--shadow-raise)]'
            }`}
          >
            <div>
              <span className={`mono text-[13px] ${step.tone === 'card' ? 'text-hold-text' : 'text-white/70'}`}>{step.n}</span>
              <h3 className="m-0 mt-3 text-[28px] font-bold leading-[1.05] tracking-[-0.04em]">{step.title}</h3>
              <p className="m-0 mt-3 text-[15px] leading-6 text-muted">{step.text}</p>
            </div>
            {step.mock}
          </li>
        ))}
      </ol>
    </section>
  );
}

/* ------------------------------------------------------------------ Counterparts */

export function Counterparts() {
  return (
    <section className="mx-auto w-full max-w-[1120px] px-4" aria-labelledby="who">
      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
        <div>
          <p className="eyebrow m-0">Counterparts</p>
          <h2 id="who" className="h-section m-0 mt-4 max-w-[14ch]">
            Eight ways to hear <span className="serif text-hold-text">no</span>.
          </h2>
        </div>
        <p className="lede m-0 max-w-[38ch] sm:text-right">Four archetypes, each with its own way of pushing back. The numbers always come from your range.</p>
      </div>
      <ul className="counterpart-rail m-0 mt-10 flex list-none gap-3 overflow-x-auto p-0 pb-3 lg:grid lg:grid-cols-4 lg:overflow-visible">
        {AVATAR_CARDS.map((card) => (
          <li key={card.avatarId} className="counterpart-card w-[248px] shrink-0 snap-start lg:w-auto">
            <div className="flex h-full flex-col gap-4 rounded-[24px] bg-raised p-5 shadow-[var(--shadow-raise)]">
              <div className="flex items-start justify-between gap-3">
                <Avatar avatarId={card.avatarId} size={64} />
                <span className="badge badge-hold">{ARCHETYPE_LABELS[card.archetype].title}</span>
              </div>
              <div>
                <div className="text-[17px] font-semibold tracking-[-0.015em]">{card.name}</div>
                <div className="text-[13.5px] text-muted">
                  {card.role} · {card.tenure}
                </div>
              </div>
              <p className="m-0 mt-auto text-[14px] leading-[1.5] text-ink-soft">“{card.style}”</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ------------------------------------------------------------------ Debrief preview */

export function DebriefPreview({ debrief }: { debrief: Debrief }) {
  const agreed = debrief.agreedMinor;
  return (
    <section className="mx-auto grid w-full max-w-[1120px] items-start gap-10 px-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-16" aria-labelledby="debrief-preview">
      <div className="lg:sticky lg:top-28">
        <p className="eyebrow m-0">The debrief</p>
        <h2 id="debrief-preview" className="h-section m-0 mt-4 max-w-[12ch]">
          See the move that <span className="serif text-gap">cost</span> you.
        </h2>
        <p className="lede m-0 mt-5">Every round ends with the money first: where you stopped, the scenario limit, and the formula between them. Then each move, with the line to try next time.</p>
        <ul className="m-0 mt-7 grid list-none gap-3 p-0">
          {['Left on the table, computed by code against your range', 'A ledger of every move and what it did to trust and the offer', 'Voice measurements when you speak: pace, pauses, filler words'].map((item) => (
            <li key={item} className="flex items-start gap-3 text-[15.5px] leading-6">
              <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-hold text-white">
                <Check size={12} strokeWidth={3} aria-hidden />
              </span>
              {item}
            </li>
          ))}
        </ul>
        <Link href="/example" className="btn btn-secondary mt-8">
          Open the full example <ArrowRight size={16} strokeWidth={2} className="arrow" aria-hidden />
        </Link>
      </div>
      <InView className="relative">
        <div className="absolute -inset-4 -z-10 rounded-[40px] bg-violet-100 dark:bg-[rgba(124,99,255,0.08)] sm:-inset-6" aria-hidden />
        <div className="grid gap-4 rounded-[28px] bg-raised p-5 shadow-[var(--shadow-lift)] sm:p-7">
          <div className="flex items-center justify-between gap-3">
            <span className="label">Left on the table</span>
            <span className="badge">Example</span>
          </div>
          {agreed !== null && debrief.leftOnTableMinor !== null && (
            <div className="figure-xl rise text-gap" style={{ ['--rise' as string]: '10px' }}>
              {formatMoney(debrief.leftOnTableMinor, debrief.period)}
            </div>
          )}
          <OfferBar
            objective={debrief.objective}
            period={debrief.period}
            currentMinor={debrief.initialOfferMinor}
            offerMinor={debrief.finalOfferMinor}
            targetMinor={debrief.targetMinor}
            reservationAmountMinor={debrief.reservationAmountMinor}
            agreedMinor={agreed}
          />
        </div>
        <div className="mt-4 hidden sm:block">
          <TurnLedger rows={debrief.rows.slice(0, 2)} period={debrief.period} objective={debrief.objective} />
        </div>
      </InView>
    </section>
  );
}

/* ------------------------------------------------------------------ Principles */

export function Principles() {
  const items = [
    { icon: Calculator, title: 'Numbers by code', text: 'Every amount is computed by a deterministic engine from your range. Language models only word the lines.' },
    { icon: ShieldCheck, title: 'Audio is deleted', text: 'Only your microphone, only after you agree. Raw audio is deleted after the analysis, within 24 hours.' },
    { icon: UserRoundX, title: 'No sign-up', text: 'Start in a second. Your round lives in this browser; there is nothing to cancel.' },
    { icon: Keyboard, title: 'Type or talk', text: 'Everything works by typing. Voice practice and the voice debrief are optional.' },
  ];
  return (
    <section className="mx-auto w-full max-w-[1120px] px-4" aria-labelledby="principles">
      <div className="rounded-[32px] bg-paper-subtle p-6 shadow-[inset_0_0_0_1px_var(--line)] sm:p-10">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h2 id="principles" className="m-0 max-w-[18ch] text-[clamp(28px,3.6vw,40px)] font-bold leading-[1.05] tracking-[-0.04em]">
            Honest by design, <span className="serif text-hold-text">not</span> by promise.
          </h2>
          <span className="badge badge-hold">
            <AudioLines size={12} strokeWidth={2.5} aria-hidden /> Practice, not financial advice
          </span>
        </div>
        <ul className="m-0 mt-8 grid list-none gap-4 p-0 sm:grid-cols-2 lg:grid-cols-4">
          {items.map(({ icon: Icon, title, text }) => (
            <li key={title} className="rounded-[22px] bg-raised p-5 shadow-[var(--shadow-raise)]">
              <span className="grid h-10 w-10 place-items-center rounded-[12px] bg-hold-tint text-hold-text">
                <Icon size={20} strokeWidth={1.75} aria-hidden />
              </span>
              <h3 className="m-0 mt-4 text-[17px] font-semibold tracking-[-0.015em]">{title}</h3>
              <p className="m-0 mt-1.5 text-[14px] leading-[1.55] text-muted">{text}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ Final CTA */

export function FinalCta() {
  return (
    <section className="px-2 sm:px-4" aria-labelledby="final-cta">
      <div className="on-violet relative mx-auto max-w-[1400px] overflow-hidden rounded-[32px] px-5 py-20 text-center sm:rounded-[44px] sm:py-28">
        <Zigzag />
        <div className="relative mx-auto grid max-w-[760px] justify-items-center">
          <p className="hero-pill m-0">Your next money conversation</p>
          <h2 id="final-cta" className="h-display m-0 mt-6 text-white">
            Ready to <span className="serif text-violet-200">hold</span> the line?
          </h2>
          <p className="m-0 mt-6 max-w-[44ch] text-[17px] leading-7 text-white/80">Rehearse it before it costs you. A round takes five minutes, and the debrief is yours to keep.</p>
          <div className="mt-9 flex w-full flex-col items-center justify-center gap-3 sm:w-auto sm:flex-row">
            <Link href="/intake" className="btn btn-white btn-xl">
              Start practising <ArrowRight size={18} strokeWidth={2} className="arrow" aria-hidden />
            </Link>
            <Link href="/example" className="btn btn-xl hero-ghost">
              See an example debrief
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
