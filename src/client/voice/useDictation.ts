'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiClientError } from '@/client/api/client';
import { getConfig } from '@/client/api/session';
import { SPEECH_LIMITS, type SpeechContext } from '@/contracts/api';
import { openMicrophone, stopStream } from './capture';
import { pickRecorderMime, startRecorder, type Recorder } from './recorder';
import { markTextInteraction, microphoneBlocked, recognitionConstructor, stopAllSpeech, transcribeClip, type BrowserRecognition } from './speech';

export type DictationMode = 'server' | 'browser';
export type DictationState = 'idle' | 'recording' | 'transcribing';

const BLOCKED = 'Microphone access is blocked. You can still type your reply.';
const NO_MIC = 'No microphone is available here. You can still type your reply.';
const NOTHING = 'Didn’t catch that. Try again, or type your reply.';

/** Server speech-to-text when the deployment has it and this browser can record; otherwise the browser recognizer. */
export function pickDictationMode(serverAvailable: boolean): DictationMode | null {
  const canRecord = typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia) && pickRecorderMime() !== null;
  if (serverAvailable && canRecord) return 'server';
  return recognitionConstructor() ? 'browser' : null;
}

/**
 * Dictation for a chat composer: press to record, stop to get text. The text goes to `onText`
 * (the composer puts it in the box for the user to edit and send). Recorded audio is sent once
 * for transcription and not kept anywhere. Without a conversation context dictation is off.
 */
export function useDictation({ context, onText }: { context: SpeechContext | null; onText: (text: string) => void }) {
  const [mode, setMode] = useState<DictationMode | null>(null);
  const [state, setState] = useState<DictationState>('idle');
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const live = useRef<{
    stream: MediaStream | null;
    recorder: Recorder | null;
    recognition: BrowserRecognition | null;
    timer: ReturnType<typeof setInterval> | null;
    abort: AbortController | null;
  }>({
    stream: null,
    recorder: null,
    recognition: null,
    timer: null,
    abort: null,
  });
  const onTextRef = useRef(onText);
  useEffect(() => {
    onTextRef.current = onText;
  }, [onText]);
  const contextKey = context ? JSON.stringify(context) : null;
  const contextRef = useRef(context);
  useEffect(() => {
    contextRef.current = context;
  }, [context]);

  useEffect(() => {
    if (contextKey === null) return;
    let alive = true;
    getConfig()
      .then((config) => config.capabilities.speechInput === true)
      .catch(() => false)
      .then((server) => {
        if (alive) setMode(pickDictationMode(server));
      });
    return () => {
      alive = false;
    };
  }, [contextKey]);

  const release = useCallback(() => {
    const l = live.current;
    if (l.timer) clearInterval(l.timer);
    l.timer = null;
    stopStream(l.stream);
    l.stream = null;
    l.recorder = null;
    l.recognition = null;
  }, []);

  useEffect(
    () => () => {
      const l = live.current;
      l.recorder?.discard();
      l.recognition?.abort();
      l.abort?.abort();
      release();
    },
    [release],
  );

  const deliver = useCallback((text: string) => {
    const clean = text.replace(/\s+/g, ' ').trim();
    if (clean) onTextRef.current(clean);
    else setError(NOTHING);
  }, []);

  const stop = useCallback(async () => {
    const l = live.current;
    if (l.recognition) {
      l.recognition.stop();
      return;
    }
    const recorder = l.recorder;
    if (!recorder) return;
    const ctx = contextRef.current;
    const clip = await recorder.stop();
    release();
    if (!ctx || clip.size === 0) {
      setState('idle');
      setError(NOTHING);
      return;
    }
    setState('transcribing');
    const abort = new AbortController();
    l.abort = abort;
    try {
      deliver(await transcribeClip(clip, ctx, abort.signal));
    } catch (err) {
      if (!(err instanceof DOMException && err.name === 'AbortError'))
        setError(err instanceof ApiClientError ? err.message : 'Could not transcribe that. Try again or type your reply.');
    } finally {
      l.abort = null;
      setState('idle');
    }
  }, [deliver, release]);

  const tick = useCallback(
    (startedAt: number) => {
      const elapsed = Math.floor((Date.now() - startedAt) / 1_000);
      setSeconds(elapsed);
      if (elapsed >= SPEECH_LIMITS.maxClipSeconds) void stop();
    },
    [stop],
  );

  const start = useCallback(async () => {
    if (state !== 'idle' || !mode) return;
    markTextInteraction();
    stopAllSpeech();
    setError(null);
    setSeconds(0);
    const l = live.current;
    if (mode === 'browser') {
      const Recognition = recognitionConstructor();
      if (!Recognition) return setError(NO_MIC);
      const recognition = new Recognition();
      recognition.lang = 'en-US';
      recognition.continuous = true;
      recognition.interimResults = false;
      const finals: string[] = [];
      let failed = false;
      recognition.onresult = (event) => {
        for (let i = event.resultIndex; i < event.results.length; i += 1) {
          const result = event.results[i]!;
          if (result.isFinal) finals.push(result[0]?.transcript ?? '');
        }
      };
      recognition.onerror = (event) => {
        failed = true;
        setError(
          event.error === 'not-allowed' || event.error === 'service-not-allowed'
            ? BLOCKED
            : event.error === 'no-speech'
              ? NOTHING
              : event.error === 'aborted'
                ? null
                : 'Dictation stopped. You can still type your reply.',
        );
      };
      recognition.onend = () => {
        release();
        setState('idle');
        if (!failed) deliver(finals.join(' '));
      };
      l.recognition = recognition;
      const startedAt = Date.now();
      l.timer = setInterval(() => tick(startedAt), 250);
      try {
        recognition.start();
        setState('recording');
      } catch {
        release();
        setError(NO_MIC);
      }
      return;
    }
    const mime = pickRecorderMime();
    if (!mime) return setError(NO_MIC);
    try {
      l.stream = await openMicrophone();
    } catch (err) {
      return setError(microphoneBlocked(err) ? BLOCKED : NO_MIC);
    }
    l.recorder = startRecorder(l.stream, mime, SPEECH_LIMITS.maxClipBytes);
    const startedAt = Date.now();
    l.timer = setInterval(() => tick(startedAt), 250);
    setState('recording');
  }, [deliver, mode, release, state, tick]);

  const cancel = useCallback(() => {
    const l = live.current;
    l.recorder?.discard();
    l.recognition?.abort();
    l.abort?.abort();
    release();
    setState('idle');
  }, [release]);

  return {
    available: mode !== null && contextKey !== null,
    mode,
    state,
    seconds,
    error,
    start,
    stop,
    cancel,
    clearError: () => setError(null),
  };
}
