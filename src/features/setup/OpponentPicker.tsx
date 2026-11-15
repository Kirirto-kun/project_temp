'use client';

import { ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { StandardKind } from '@/contracts/domain';
import { Avatar } from '@/components/holdline/Avatar';
import { ChoiceCard } from '@/components/ui/ChoiceCard';
import { ScreenSkeleton } from '@/components/ui/skeleton';
import { ARCHETYPE_LABELS, AVATAR_CARDS } from '@/content/avatars';
import { useDraft } from './useDraft';

export function OpponentPicker() {
  const router = useRouter();
  const [state, setState] = useDraft();
  if (!state) return <ScreenSkeleton />;
  const kind = state.draft.kind as StandardKind | undefined;
  if (!kind || kind === ('custom' as string)) {
    return (
      <div className="mx-auto grid max-w-[560px] justify-items-start gap-4">
        <h1 className="h-title m-0">Set up the round first</h1>
        <p className="m-0 text-muted">The counterpart depends on what you are negotiating.</p>
        <div className="flex flex-wrap gap-3">
          <Link href="/quiz" className="btn btn-primary">
            Quick form
          </Link>
          <Link href="/intake" className="btn btn-secondary">
            Talk to the coach
          </Link>
        </div>
      </div>
    );
  }
  const cards = AVATAR_CARDS.filter((c) => c.kinds.includes(kind));
  return (
    <div className="mx-auto grid max-w-[760px] gap-8">
      <header className="grid gap-3">
        <p className="eyebrow m-0">Counterpart</p>
        <h1 className="h-title m-0">Who will you practise against?</h1>
        <p className="m-0 text-[15px] leading-6 text-muted">Each one says no differently. The numbers come from your range either way.</p>
      </header>
      <div className="grid gap-2.5 sm:grid-cols-2" role="radiogroup" aria-label="Counterparts">
        {cards.map((card, i) => {
          const selected = state.avatarId === card.avatarId;
          return (
            <ChoiceCard
              key={card.avatarId}
              selected={selected}
              onSelect={() => setState({ ...state, avatarId: card.avatarId })}
              align="start"
              leading={<Avatar avatarId={card.avatarId} size={44} />}
              title={card.name}
              description={`${card.role} · ${card.tenure}`}
              className="pop-in gap-3.5 p-4"
              style={{ ['--delay' as string]: `${Math.round(120 * (1 - Math.pow(0.7, i)))}ms` }}
            >
              <span className="mt-1.5 text-[12.5px] font-medium leading-4 text-hold-text">{ARCHETYPE_LABELS[card.archetype].title}</span>
              <span className="mt-1 text-[14px] font-normal leading-5 text-ink-soft">{card.style}</span>
            </ChoiceCard>
          );
        })}
      </div>
      <div className="funnel-actions">
        <button type="button" className="btn btn-primary btn-xl !max-w-none sm:!w-full" disabled={!state.avatarId} onClick={() => router.push('/calibration')}>
          Continue <ArrowRight size={18} strokeWidth={2} className="arrow" aria-hidden />
        </button>
      </div>
    </div>
  );
}
