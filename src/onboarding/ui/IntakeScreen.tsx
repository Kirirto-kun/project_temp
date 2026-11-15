'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ApiClientError } from '@/client/api/client';
import type { IntakeView } from '../contracts';
import { getIntake } from '../client/api';
import { AudioCoach } from './AudioCoach';
import { AvatarCoach } from './AvatarCoach';
import { coachFor, nextFallback, type CoachKind } from './coach-choice';
import { Review } from './Review';
import { TextCoach } from './TextCoach';

export function IntakeScreen({ id }: { id: string }) {
  const [view, setView] = useState<IntakeView | null>(null);
  const [fallback, setFallback] = useState<CoachKind | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getIntake(id)
      .then(setView)
      .catch((err) => setError(err instanceof ApiClientError && err.status === 404 ? 'This coach session is not available. It may have expired after 24 hours, or it was started in another browser.' : 'Could not load the coach session.'));
  }, [id]);

  if (error) {
    return (
      <div className="grid gap-4">
        <h1 className="h-screen m-0">Session not found</h1>
        <p className="m-0 text-muted">{error}</p>
        <div className="flex gap-3">
          <Link href="/intake" className="btn btn-primary">
            Start again
          </Link>
          <Link href="/quiz" className="btn btn-secondary">
            Use the quick form
          </Link>
        </div>
      </div>
    );
  }
  if (!view) return <p className="text-muted">Loading…</p>;

  const reviewing = view.phase === 'review' || view.phase === 'completed';
  const coach = coachFor(view, fallback);
  const fallBack = (from: CoachKind, reason: string) => {
    // Show the next coach only with the re-read intake, so it never starts from a stale revision.
    const next = nextFallback(view, from);
    setNotice(reason);
    void getIntake(id)
      .then(setView, () => undefined)
      .finally(() => setFallback(next));
  };
  return (
    <div className="grid gap-4">
      {notice && (
        <p className="m-0 rounded-[8px] bg-hold-tint p-3 text-[14px]" role="status">
          {notice}
        </p>
      )}
      {reviewing ? (
        <Review view={view} onView={setView} />
      ) : coach === 'video' ? (
        <AvatarCoach view={view} onView={setView} onFallback={(reason) => fallBack('video', reason)} onTypeInstead={() => setFallback('text')} />
      ) : coach === 'audio' ? (
        <AudioCoach view={view} onView={setView} onFallback={(reason) => fallBack('audio', reason)} />
      ) : (
        <TextCoach view={view} onView={setView} />
      )}
    </div>
  );
}
