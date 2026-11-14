'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { StandardKind } from '@/contracts/domain';
import { Avatar } from '@/components/holdline/Avatar';
import { ARCHETYPE_LABELS, AVATAR_CARDS } from '@/content/avatars';
import { useDraft } from './useDraft';

export function OpponentPicker() {
  const router = useRouter();
  const [state, setState] = useDraft();
  if (!state) return <p className="text-muted">Loading…</p>;
  const kind = state.draft.kind as StandardKind | undefined;
  if (!kind || kind === ('custom' as string)) {
    return (
      <p>
        Set up the round first: <Link href="/quiz">quick form</Link> or <Link href="/intake">coach</Link>.
      </p>
    );
  }
  const cards = AVATAR_CARDS.filter((c) => c.kinds.includes(kind));
  return (
    <div className="grid gap-6">
      <div>
        <p className="eyebrow m-0">Counterpart</p>
        <h1 className="h-title m-0 mt-2">Who will you practise against?</h1>
        <p className="m-0 mt-2 text-[14px] text-muted">Each one says no differently. The numbers come from your range either way.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Counterparts">
        {cards.map((card) => {
          const selected = state.avatarId === card.avatarId;
          return (
            <button
              key={card.avatarId}
              type="button"
              role="radio"
              aria-checked={selected}
              className="option items-start gap-4 p-4"
              onClick={() => setState({ ...state, avatarId: card.avatarId })}
            >
              <Avatar avatarId={card.avatarId} size={64} />
              <span className="grid gap-1">
                <span className="text-[16px] font-semibold">{card.name}</span>
                <span className="text-[14px] text-muted">
                  {card.role} · {card.tenure}
                </span>
                <span className="label mt-1">{ARCHETYPE_LABELS[card.archetype].title}</span>
                <span className="text-[14px] font-normal leading-5">{card.style}</span>
              </span>
            </button>
          );
        })}
      </div>
      <button type="button" className="btn btn-primary btn-xl" disabled={!state.avatarId} onClick={() => router.push('/calibration')}>
        Continue
      </button>
    </div>
  );
}
