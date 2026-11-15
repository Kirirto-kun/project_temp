'use client';

import { CircleAlert, FastForward, Flag } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { ApiClientError } from '@/client/api/client';
import { CoachMark } from '@/components/holdline/Avatar';
import { cn } from '@/components/ui/cn';
import { TextComposer } from '@/features/session/TextComposer';
import type { IntakeView } from '../contracts';
import { sendMessage, skipPractice, stopIntake } from '../client/api';
import { PracticeRecorder } from './PracticeRecorder';
import { ProfileSoFar } from './ProfileSoFar';

/** The conversation with Alex. Lines already on screen at load stay still; only new ones animate in. */
export function Captions({ view, typing = false }: { view: IntakeView; typing?: boolean }) {
  const endRef = useRef<HTMLLIElement | null>(null);
  const [initial] = useState(() => new Set(view.committedTranscript.map((t) => t.turnId)));
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [view.committedTranscript.length, typing]);
  return (
    <div className="grid gap-3">
      <ol className="m-0 flex list-none flex-col gap-3 p-0" aria-label="Conversation with Alex">
        {view.committedTranscript.map((t) => {
          const you = t.role === 'user';
          return (
            <li key={t.turnId} className={cn('flex max-w-[86%] flex-col gap-1.5', you ? 'items-end self-end' : 'items-start', !initial.has(t.turnId) && (you ? 'msg-in msg-in-you' : 'msg-in'))}>
              <span className="label px-1">{you ? 'You' : 'Alex · AI coach'}</span>
              <div className={cn('px-4 py-3 text-[15.5px] leading-[1.5]', you ? 'bubble-you' : 'bubble-them')}>{t.text}</div>
            </li>
          );
        })}
        <li ref={endRef} aria-hidden />
      </ol>
      {typing && (
        <div className="msg-in flex flex-col items-start gap-1.5" aria-hidden>
          <span className="label px-1">Alex · AI coach</span>
          <div className="bubble-them dots px-4 py-3.5">
            <span />
            <span />
            <span />
          </div>
        </div>
      )}
    </div>
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
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px] lg:items-start">
      <div className="grid gap-5">
        <div className="card flex items-center gap-3 p-3 pr-4">
          <CoachMark size={48} speaking={busy} />
          <div className="mr-auto leading-tight">
            <div className="flex items-center gap-2">
              <span className="text-[16px] font-semibold tracking-[-0.01em]">Alex</span>
              <span className="badge badge-hold">AI</span>
            </div>
            <div className="mt-1 text-[13px] text-muted">{busy ? 'Thinking…' : practising ? 'Practise your opening line' : 'AI practice coach'}</div>
          </div>
          <span className="badge hidden sm:inline-flex">Text call</span>
        </div>
        <Captions view={view} typing={busy} />
        <div aria-live="polite" className="sr-only">
          {view.committedTranscript.at(-1)?.role === 'coach' ? view.committedTranscript.at(-1)!.text : ''}
        </div>
        {error && (
          <p className="callout callout-warn m-0 flex items-start gap-2 text-ink" role="alert">
            <CircleAlert size={18} strokeWidth={2} className="mt-px shrink-0 text-gap" aria-hidden />
            {error}
          </p>
        )}
        <div className="sticky bottom-0 z-10 -mx-4 grid gap-2 bg-[linear-gradient(to_top,var(--paper)_75%,transparent)] px-4 pb-[calc(12px+env(safe-area-inset-bottom,0px))] pt-4 sm:static sm:mx-0 sm:bg-none sm:p-0">
          <TextComposer disabled={busy} onSend={send} placeholder={practising ? 'Say your opening line, with the number.' : 'Type your answer'} />
          <div className="flex flex-wrap gap-1">
            {practising ? (
              <>
                {view.consents.audioAnalysis && view.availability.audioAnalysis && <PracticeRecorder intakeId={view.id} onDone={onView} onError={setError} />}
                <button type="button" className="btn btn-ghost btn-sm" onClick={async () => onView(await skipPractice(view.id))}>
                  <FastForward size={15} strokeWidth={2} aria-hidden /> Skip the practice
                </button>
              </>
            ) : (
              <>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => void send('skip')} disabled={busy}>
                  <FastForward size={15} strokeWidth={2} aria-hidden /> Skip this question
                </button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={async () => onView(await stopIntake(view.id, 'end'))}>
                  <Flag size={15} strokeWidth={2} aria-hidden /> Finish and review
                </button>
              </>
            )}
          </div>
        </div>
      </div>
      <ProfileSoFar profile={view.publicProfile} />
    </div>
  );
}
