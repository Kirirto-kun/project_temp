'use client';

import { ConversationProvider, useConversation } from '@elevenlabs/react';
import { Mic, MicOff, PhoneOff } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { SessionBinding } from '@/contracts/api';
import type { SessionView } from '@/contracts/domain';
import { ApiClientError } from '@/client/api/client';
import { getSession, getVoiceToken, setMode, startAnalysis } from '@/client/api/session';
import { createUserCapture, openMicrophone, stopStream, type UserCapture } from '@/client/voice/capture';
import { TurnTimeline } from '@/client/voice/timeline';
import { uploadRecording } from '@/client/voice/upload';

export interface VoicePanelProps {
  session: SessionView;
  onSession: (view: SessionView) => void;
  onTentative: (text: string | null) => void;
  onFallback: (reason: string) => void;
  onAnalysis: (status: 'uploading' | 'started' | 'skipped' | 'failed', analysisId?: string) => void;
}

type VoiceState = 'idle' | 'requesting_permission' | 'connecting' | 'active' | 'ending' | 'ended';

export default function VoicePanel(props: VoicePanelProps) {
  return (
    <ConversationProvider>
      <VoiceInner {...props} />
    </ConversationProvider>
  );
}

async function switchToText(id: string, onSession: (v: SessionView) => void) {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    try {
      const fresh = await getSession(id);
      if (fresh.ended || fresh.activeMode === 'text') return onSession(fresh);
      onSession(await setMode(id, fresh.version, 'text'));
      return;
    } catch (error) {
      if (error instanceof ApiClientError && (error.code === 'TURN_IN_PROGRESS' || error.code === 'VERSION_CONFLICT')) {
        await new Promise((r) => setTimeout(r, 800));
        continue;
      }
      return;
    }
  }
}

function VoiceInner({ session, onSession, onTentative, onFallback, onAnalysis }: VoicePanelProps) {
  const [state, setState] = useState<VoiceState>('idle');
  const [recordConsent, setRecordConsent] = useState(false);
  const [muted, setMuted] = useState(false);
  const [pace, setPace] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const captureRef = useRef<UserCapture | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const bindingRef = useRef<SessionBinding | null>(null);
  const timelineRef = useRef(new TurnTimeline());
  const userCountRef = useRef(0);
  const endingRef = useRef(false);
  const sessionRef = useRef(session);
  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  const conversation = useConversation({
    micMuted: muted,
    onMessage: (payload) => {
      const clock = captureRef.current?.clock() ?? 0;
      if (payload.source === 'user') {
        userCountRef.current += 1;
        const binding = bindingRef.current;
        if (binding) timelineRef.current.userTurnFinal(`${binding.bindingId}:${userCountRef.current}`, clock);
        const words = payload.message.trim().split(/\s+/).filter(Boolean).length;
        const window = timelineRef.current.pending.at(-1);
        if (window && window.windowEndMs - window.windowStartMs > 800) setPace(Math.round((words / (window.windowEndMs - window.windowStartMs)) * 60_000));
        onTentative(payload.message);
      } else {
        onTentative(null);
      }
      void getSession(sessionRef.current.id).then(onSession).catch(() => undefined);
    },
    onModeChange: ({ mode }) => {
      if (mode === 'listening') timelineRef.current.agentStoppedSpeaking(captureRef.current?.clock() ?? 0);
    },
    onDisconnect: () => {
      if (!endingRef.current) {
        void finalize(false).then(() => switchToText(sessionRef.current.id, onSession));
        onFallback('The voice connection dropped. You can continue by typing; your round is kept.');
      }
    },
    onError: () => {
      setError('The voice service reported an error.');
    },
  });

  async function finalize(fromEnd: boolean) {
    if (state === 'ended' && !fromEnd) return;
    endingRef.current = true;
    setState('ending');
    try {
      conversation.endSession();
    } catch {
      /* already closed */
    }
    const capture = captureRef.current;
    captureRef.current = null;
    stopStream(streamRef.current);
    streamRef.current = null;
    if (!capture) {
      setState('ended');
      return;
    }
    const result = await capture.stop();
    if (!result.blob || !result.mimeType) {
      onAnalysis('skipped');
      setState('ended');
      return;
    }
    try {
      onAnalysis('uploading');
      const fresh = await getSession(sessionRef.current.id);
      const turnIdByKey = new Map(fresh.messages.filter((m) => m.role === 'user' && m.sourceTurnKey && m.turnId).map((m) => [m.sourceTurnKey!, m.turnId!]));
      const turns = timelineRef.current.toManifestTurns(result.samples, turnIdByKey, result.durationMs);
      const audioId = await uploadRecording(result.blob, {
        recordingId: result.recordingId,
        purpose: 'session',
        sessionId: fresh.id,
        intakeId: null,
        durationMs: Math.max(1, result.durationMs),
        mimeType: result.mimeType,
        timebase: 'recording_ms',
        turns,
        samples: result.samples,
      });
      const started = await startAnalysis({ sessionId: fresh.id, audioId, baselineId: fresh.baselineId });
      onAnalysis('started', started.analysisId);
    } catch {
      onAnalysis('failed');
    }
    setState('ended');
  }

  useEffect(() => {
    if (session.ended && (state === 'active' || state === 'connecting')) void finalize(true);
    // finalize is stable for this purpose; re-run only when the round ends.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.ended]);

  useEffect(
    () => () => {
      captureRef.current?.dispose();
      stopStream(streamRef.current);
    },
    [],
  );

  async function start() {
    setError(null);
    endingRef.current = false;
    setState('requesting_permission');
    let stream: MediaStream;
    try {
      stream = await openMicrophone();
    } catch {
      setState('idle');
      setError('The microphone is not available. Continue by typing.');
      return;
    }
    streamRef.current = stream;
    captureRef.current = createUserCapture({ userStream: stream, purpose: 'session', recordAudio: recordConsent });
    setState('connecting');
    try {
      const view = await setMode(session.id, session.version, 'voice');
      onSession(view);
      const token = await getVoiceToken(session.id, 'webrtc');
      bindingRef.current = token.sessionBinding;
      userCountRef.current = 0;
      onSession(token.session);
      if (token.connectionType !== 'webrtc') throw new Error('Unexpected credential type');
      conversation.startSession({
        conversationToken: token.conversationToken,
        connectionType: 'webrtc',
        overrides: { agent: { firstMessage: token.firstMessage }, ...(token.voiceId ? { tts: { voiceId: token.voiceId } } : {}) },
        customLlmExtraBody: { binding: token.sessionBinding },
      });
      setState('active');
    } catch (err) {
      captureRef.current?.dispose();
      captureRef.current = null;
      stopStream(streamRef.current);
      streamRef.current = null;
      setState('idle');
      await switchToText(session.id, onSession);
      setError(err instanceof ApiClientError ? err.message : 'Voice could not start. Continue by typing.');
    }
  }

  async function backToText() {
    await finalize(false);
    await switchToText(session.id, onSession);
  }

  if (state === 'idle' || state === 'requesting_permission') {
    return (
      <div className="card grid gap-3 p-4">
        <div className="label">Speak instead of typing</div>
        <p className="m-0 text-[14px] leading-5 text-muted">Your microphone goes to the voice service for the conversation. Recording for the voice debrief is separate and off unless you tick it.</p>
        <label className="flex items-start gap-3 text-[14px] leading-5">
          <input type="checkbox" className="mt-0.5 h-5 w-5" checked={recordConsent} onChange={(e) => setRecordConsent(e.target.checked)} />
          Also record my microphone for the voice debrief. Audio is deleted after the analysis, within 24 hours.
        </label>
        <button type="button" className="btn btn-secondary" onClick={() => void start()} disabled={state === 'requesting_permission' || Boolean(session.ended)}>
          <Mic size={20} strokeWidth={1.5} aria-hidden /> {state === 'requesting_permission' ? 'Waiting for the microphone…' : 'Talk instead'}
        </button>
        {error && (
          <p className="m-0 text-[14px] text-gap" role="alert">
            {error}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="card grid gap-3 p-4" aria-live="polite">
      <div className="flex items-center justify-between gap-3">
        <span className="label">
          {state === 'connecting' ? 'Connecting…' : state === 'ending' ? 'Ending…' : state === 'ended' ? 'Voice ended' : conversation.isSpeaking ? 'Counterpart speaking' : 'Listening'}
        </span>
        {pace !== null && (
          <span className="mono text-[13px] text-muted" title="Approximate: words of your last reply divided by the time you were speaking. The debrief measures it precisely.">
            pace ≈ {pace} wpm
          </span>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn btn-secondary" onClick={() => setMuted((m) => !m)} disabled={state !== 'active'} aria-pressed={muted}>
          {muted ? <MicOff size={20} strokeWidth={1.5} aria-hidden /> : <Mic size={20} strokeWidth={1.5} aria-hidden />}
          {muted ? 'Unmute' : 'Mute'}
        </button>
        <button type="button" className="btn btn-secondary" onClick={() => void backToText()} disabled={state === 'ending' || state === 'ended'}>
          <PhoneOff size={20} strokeWidth={1.5} aria-hidden /> Switch to typing
        </button>
      </div>
      {error && (
        <p className="m-0 text-[14px] text-gap" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
