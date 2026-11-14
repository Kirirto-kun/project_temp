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

  return (
    <div className="grid gap-6 min-[900px]:grid-cols-[minmax(0,1fr)_280px]">
      <div className="grid gap-4">
        <div className="card flex flex-wrap items-center gap-4 p-4">
          <CoachMark size={72} speaking={speaking} />
          <div className="mr-auto">
            <div className="text-[16px] font-semibold">Alex</div>
            <div className="label">AI practice coach</div>
            <div className="mt-1 text-[14px] text-muted" role="status">
              {state === 'lobby' && 'Ready when you are.'}
              {state === 'requesting' && 'Waiting for the microphone…'}
              {state === 'connecting' && 'Connecting to Alex…'}
              {state === 'active' && (speaking ? 'Alex is speaking' : 'Listening')}
              {state === 'ended' && 'Call ended'}
            </div>
          </div>
          {view.deadlineAt && state === 'active' && <span className="mono text-[14px]">{left === null ? '' : formatClock(left)}</span>}
        </div>
        <audio ref={audioRef} autoPlay className="hidden" />
        {state === 'lobby' || state === 'requesting' ? (
          <div className="grid gap-3">
            <p className="m-0 text-[14px] leading-5 text-muted">Use headphones if you can. Your microphone goes to the speech provider so Alex can answer. You can mute, skip or end at any time.</p>
            <button type="button" className="btn btn-primary btn-xl" onClick={() => void start()} disabled={state === 'requesting'}>
              Start the call
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => onFallback('Typing instead.')}>
              Type instead
            </button>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn btn-secondary" onClick={() => setMuted((m) => !m)} aria-pressed={muted} disabled={state !== 'active'}>
              {muted ? <MicOff size={20} strokeWidth={1.5} aria-hidden /> : <Mic size={20} strokeWidth={1.5} aria-hidden />}
              {muted ? 'Unmute' : 'Mute'}
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => void end('end')} disabled={state === 'ended'}>
              <PhoneOff size={20} strokeWidth={1.5} aria-hidden /> End and review
            </button>
          </div>
        )}
        {error && (
          <p className="m-0 text-gap" role="alert">
            {error}
          </p>
        )}
        <Captions view={view} />
      </div>
      <ProfileSoFar profile={view.publicProfile} />
    </div>
  );
}
