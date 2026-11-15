'use client';

import { Mic, MicOff, PhoneOff } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { ApiClientError } from '@/client/api/client';
import { openMicrophone, stopStream } from '@/client/voice/capture';
import { CoachMark } from '@/components/holdline/Avatar';
import { formatClock, useCountdown } from '@/features/session/useCountdown';
import type { IntakeView } from '../contracts';
import { connectAudio, getIntake, postTranscript, relayTool, stopIntake } from '../client/api';
import { connectRealtime, type RealtimeConnection, type RealtimeEvent } from '../client/realtime';
import { Captions } from './TextCoach';
import { ProfileSoFar } from './ProfileSoFar';

type CallState = 'lobby' | 'requesting' | 'connecting' | 'active' | 'ended';

/**
 * Audio call with the AI coach: one voice (the coach's audio track), captions from committed
 * transcripts, and a server that only ever reads amounts from the user's own transcribed words.
 */
export function AudioCoach({ view, onView, onFallback }: { view: IntakeView; onView: (v: IntakeView) => void; onFallback: (reason: string) => void }) {
  const [state, setState] = useState<CallState>('lobby');
  const [muted, setMuted] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const micRef = useRef<MediaStream | null>(null);
  const connRef = useRef<RealtimeConnection | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const epochRef = useRef(0);
  const endingRef = useRef(false);
  const left = useCountdown(view.deadlineAt);

  useEffect(
    () => () => {
      abortRef.current?.abort();
      stopStream(micRef.current);
    },
    [],
  );

  useEffect(() => {
    micRef.current?.getAudioTracks().forEach((t) => (t.enabled = !muted));
  }, [muted]);

  useEffect(() => {
    if (left === 0 && state === 'active') void end('timeout');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [left]);

  async function end(reason: 'end' | 'timeout' | 'error' | 'fallback') {
    if (endingRef.current) return;
    endingRef.current = true;
    connRef.current?.close();
    connRef.current = null;
    stopStream(micRef.current);
    micRef.current = null;
    setState('ended');
    try {
      onView(await stopIntake(view.id, reason));
    } catch {
      onView(await getIntake(view.id));
    }
  }

  async function handleEvent(event: RealtimeEvent) {
    const epoch = epochRef.current;
    switch (event.type) {
      case 'conversation.item.input_audio_transcription.completed': {
        const text = String(event.transcript ?? '').trim();
        if (text) onView(await postTranscript(view.id, epoch, String(event.item_id), 'user', text).catch(() => view));
        break;
      }
      case 'response.output_audio_transcript.done':
      case 'response.audio_transcript.done': {
        const text = String(event.transcript ?? '').trim();
        if (text) onView(await postTranscript(view.id, epoch, String(event.item_id ?? event.response_id), 'coach', text).catch(() => view));
        break;
      }
      case 'output_audio_buffer.started':
        setSpeaking(true);
        break;
      case 'output_audio_buffer.stopped':
      case 'output_audio_buffer.cleared':
        setSpeaking(false);
        break;
      case 'response.function_call_arguments.done': {
        const callId = String(event.call_id);
        const name = String(event.name);
        let output: Record<string, unknown> = { ok: false };
        try {
          output = (await relayTool(view.id, epoch, callId, name, String(event.arguments ?? '{}'))).output;
        } catch {
          output = { ok: false, error: 'The server did not accept this call.' };
        }
        connRef.current?.send({ type: 'conversation.item.create', item: { type: 'function_call_output', call_id: callId, output: JSON.stringify(output) } });
        if (name === 'request_end') {
          setTimeout(() => void end('end'), 2_500);
        } else {
          connRef.current?.send({ type: 'response.create' });
        }
        break;
      }
      case 'error':
        setError('The voice service reported an error.');
        break;
    }
  }

  async function start() {
    setError(null);
    endingRef.current = false;
    setState('requesting');
    try {
      micRef.current = await openMicrophone();
    } catch {
      setState('lobby');
      onFallback('The microphone is not available. Let’s continue by typing; nothing you said is lost.');
      return;
    }
    setState('connecting');
    const controller = new AbortController();
    abortRef.current = controller;
    const timeout = setTimeout(() => controller.abort(), 15_000);
    try {
      const credentials = await connectAudio(view.id, view.revision);
      epochRef.current = credentials.providerEpoch;
      onView(credentials.intake);
      connRef.current = await connectRealtime({
        clientSecret: credentials.clientSecret,
        model: credentials.model,
        mic: micRef.current,
        audio: audioRef.current!,
        onEvent: (e) => void handleEvent(e),
        onClosed: () => {
          if (!endingRef.current) {
            void end('error');
            onFallback('The call dropped. You can continue by typing; your answers are kept.');
          }
        },
        signal: controller.signal,
      });
      clearTimeout(timeout);
      setState('active');
    } catch (err) {
      clearTimeout(timeout);
      stopStream(micRef.current);
      micRef.current = null;
      setState('lobby');
      await stopIntake(view.id, 'fallback').catch(() => undefined);
      onFallback(err instanceof ApiClientError ? err.message : 'Connecting to Alex took too long. Let’s continue by typing; nothing is lost.');
    }
  }

  const status =
    state === 'lobby'
      ? 'Ready when you are.'
      : state === 'requesting'
        ? 'Waiting for the microphone…'
        : state === 'connecting'
          ? 'Connecting to Alex…'
          : state === 'active'
            ? speaking
              ? 'Alex is speaking'
              : 'Listening'
            : 'Call ended';

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px] lg:items-start">
      <div className="grid gap-5">
        <section className="on-violet relative grid justify-items-center gap-4 overflow-hidden rounded-[32px] px-6 pb-7 pt-9 text-center" aria-label="Call with Alex">
          <div className="pointer-events-none absolute inset-x-0 -top-24 mx-auto h-64 w-64 rounded-full bg-violet-400/40 blur-3xl" aria-hidden />
          <CoachMark size={112} speaking={speaking} idle={state === 'lobby' || state === 'active'} className="relative" />
          <div className="relative grid gap-1">
            <div className="flex items-center justify-center gap-2">
              <span className="text-[19px] font-semibold tracking-[-0.02em]">Alex</span>
              <span className="badge bg-white/15 text-white">AI coach</span>
            </div>
            <div className="text-[14px] text-white/80" role="status">
              {status}
            </div>
          </div>
          {view.deadlineAt && state === 'active' && <span className="mono relative rounded-full bg-white/15 px-3 py-1 text-[13px]">{left === null ? '' : formatClock(left)}</span>}
          {state === 'lobby' || state === 'requesting' ? (
            <div className="relative mt-2 grid w-full max-w-[360px] gap-2">
              <button type="button" className="btn btn-white btn-xl !max-w-none" onClick={() => void start()} disabled={state === 'requesting'}>
                <Mic size={18} strokeWidth={2} aria-hidden /> Start the call
              </button>
              <button type="button" className="btn hero-ghost" onClick={() => onFallback('Typing instead.')}>
                Type instead
              </button>
            </div>
          ) : (
            <div className="relative mt-2 flex items-start justify-center gap-6">
              <div className="grid justify-items-center gap-1.5">
                <button
                  type="button"
                  className={`btn btn-icon !min-h-14 !w-14 ${muted ? 'btn-white' : 'hero-ghost'}`}
                  onClick={() => setMuted((m) => !m)}
                  aria-pressed={muted}
                  disabled={state !== 'active'}
                  aria-label={muted ? 'Unmute' : 'Mute'}
                >
                  {muted ? <MicOff size={22} strokeWidth={1.75} aria-hidden /> : <Mic size={22} strokeWidth={1.75} aria-hidden />}
                </button>
                <span className="text-[12px] text-white/75">{muted ? 'Unmute' : 'Mute'}</span>
              </div>
              <div className="grid justify-items-center gap-1.5">
                <button type="button" className="btn btn-icon call-end !min-h-14 !w-14" onClick={() => void end('end')} disabled={state === 'ended'} aria-label="End and review">
                  <PhoneOff size={22} strokeWidth={1.75} aria-hidden />
                </button>
                <span className="text-[12px] text-white/75">End and review</span>
              </div>
            </div>
          )}
        </section>
        <audio ref={audioRef} autoPlay className="hidden" />
        {(state === 'lobby' || state === 'requesting') && (
          <p className="m-0 text-center text-[14px] leading-6 text-muted">Use headphones if you can. Your microphone goes to the speech provider so Alex can answer. You can mute, skip or end at any time.</p>
        )}
        {error && (
          <p className="callout callout-warn m-0 text-ink" role="alert">
            {error}
          </p>
        )}
        <Captions view={view} />
      </div>
      <ProfileSoFar profile={view.publicProfile} />
    </div>
  );
}
