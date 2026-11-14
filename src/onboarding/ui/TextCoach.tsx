'use client';

import { useEffect, useRef, useState } from 'react';
import { ApiClientError } from '@/client/api/client';
import { CoachMark } from '@/components/holdline/Avatar';
import { TextComposer } from '@/features/session/TextComposer';
import type { IntakeView } from '../contracts';
import { sendMessage, skipPractice, stopIntake } from '../client/api';
import { PracticeRecorder } from './PracticeRecorder';
import { ProfileSoFar } from './ProfileSoFar';

export function Captions({ view }: { view: IntakeView }) {
  const endRef = useRef<HTMLLIElement | null>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'nearest' });
  }, [view.committedTranscript.length]);
  return (
    <ol className="m-0 flex list-none flex-col gap-3 p-0" aria-label="Conversation with Alex">
      {view.committedTranscript.map((t) => (
        <li key={t.turnId} className={`flex max-w-[85%] flex-col gap-1 ${t.role === 'user' ? 'self-end items-end' : ''}`}>
          <span className="label">{t.role === 'user' ? 'You' : 'Alex · AI coach'}</span>
          <div className={`rounded-[8px] px-4 py-3 ${t.role === 'user' ? 'bubble-you' : 'bubble-them'}`}>{t.text}</div>
        </li>
      ))}
      <li ref={endRef} aria-hidden />
    </ol>
  );
}

/** The scripted text coach: works without any paid provider. */
export function TextCoach({ view, onView }: { view: IntakeView; onView: (v: IntakeView) => void }) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const practising = view.phase === 'mini_practice';

  async function send(text: string): Promise<boolean> {
    setError(null);
    setBusy(true);
    try {
      onView(await sendMessage(view.id, text));
      return true;
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Could not send. Try again.');
      return false;
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-6 min-[900px]:grid-cols-[minmax(0,1fr)_280px]">
      <div className="grid gap-4">
        <div className="flex items-center gap-3">
          <CoachMark size={48} speaking={busy} />
          <div>
            <div className="text-[15px] font-semibold">Alex</div>
            <div className="label">AI practice coach</div>
          </div>
        </div>
        <Captions view={view} />
        <div aria-live="polite" className="sr-only">
          {view.committedTranscript.at(-1)?.role === 'coach' ? view.committedTranscript.at(-1)!.text : ''}
        </div>
        {error && (
          <p className="m-0 text-gap" role="alert">
            {error}
          </p>
        )}
        <TextComposer disabled={busy} onSend={send} />
        <div className="flex flex-wrap gap-2">
          {practising ? (
            <>
              {view.consents.audioAnalysis && view.availability.audioAnalysis && <PracticeRecorder intakeId={view.id} onDone={onView} onError={setError} />}
              <button type="button" className="btn btn-ghost" onClick={async () => onView(await skipPractice(view.id))}>
                Skip the practice
              </button>
            </>
          ) : (
            <>
              <button type="button" className="btn btn-ghost" onClick={() => void send('skip')} disabled={busy}>
                Skip this question
              </button>
              <button type="button" className="btn btn-ghost" onClick={async () => onView(await stopIntake(view.id, 'end'))}>
                Finish and review
              </button>
            </>
          )}
        </div>
      </div>
      <ProfileSoFar profile={view.publicProfile} />
    </div>
  );
}
