'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ApiClientError } from '@/client/api/client';
import type { IntakeView } from '../contracts';
import { getIntake } from '../client/api';
import { AudioCoach } from './AudioCoach';
import { Review } from './Review';
import { TextCoach } from './TextCoach';

export function IntakeScreen({ id }: { id: string }) {
  const [view, setView] = useState<IntakeView | null>(null);
  const [typing, setTyping] = useState(false);
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
        <h1 className="h-title m-0">Session not found</h1>
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
  return (
    <div className="grid gap-4">
      {notice && (
        <p className="m-0 rounded-[8px] bg-hold-tint p-3 text-[14px]" role="status">
          {notice}
        </p>
      )}
      {reviewing ? (
        <Review view={view} onView={setView} />
      ) : view.mode === 'audio' && !typing && view.availability.coachVoice ? (
        <AudioCoach
          view={view}
          onView={setView}
          onFallback={(reason) => {
            setNotice(reason);
            setTyping(true);
            void getIntake(id).then(setView);
          }}
        />
      ) : (
        <TextCoach view={view} onView={setView} />
      )}
    </div>
  );
}
