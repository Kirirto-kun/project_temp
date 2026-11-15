'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getConfig } from '@/client/api/session';
import type { SpeakRequest } from '@/contracts/api';
import { browserSynthesisAvailable, claimSpeech, fetchSpeech, playbackElement, readSpeakerMuted, releaseSpeech, stopSpeechOf, takeAutoReadTurn, writeSpeakerMuted } from './speech';

export type SpeakerMode = 'server' | 'browser';

/** One of the other side's lines. `target` lets the server find its own text; null means browser voice only. */
export interface SpokenLine {
  id: string;
  text: string;
  target: SpeakRequest | null;
}

export function pickSpeakerMode(serverAvailable: boolean): SpeakerMode | null {
  if (serverAvailable && typeof Audio !== 'undefined') return 'server';
  return browserSynthesisAvailable() ? 'browser' : null;
}

function speakInBrowser(text: string, onEnd: () => void): () => void {
  const synth = window.speechSynthesis;
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'en-US';
  utterance.onend = onEnd;
  utterance.onerror = onEnd;
  synth.cancel();
  synth.speak(utterance);
  return () => synth.cancel();
}

/**
 * Read-aloud for a text chat. New lines from the other side are read automatically only right
 * after the user sent something (autoplay policy) and only when not muted; any line can be
 * replayed. The mute choice is remembered in this browser.
 */
export function useSpeaker(lines: SpokenLine[]) {
  const [mode, setMode] = useState<SpeakerMode | null>(null);
  const [muted, setMuted] = useState(false);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [owner] = useState(() => Symbol('speaker'));
  const seen = useRef<Set<string> | null>(null);
  const request = useRef<AbortController | null>(null);

  useEffect(() => {
    let alive = true;
    getConfig()
      .then((config) => config.capabilities.speechOutput === true)
      .catch(() => false)
      .then((server) => {
        if (!alive) return;
        // Controls stay hidden until here, so the remembered choice is applied before anyone sees them.
        setMuted(readSpeakerMuted());
        setMode(pickSpeakerMode(server));
      });
    return () => {
      alive = false;
    };
  }, []);

  const stop = useCallback(() => {
    request.current?.abort();
    request.current = null;
    stopSpeechOf(owner);
    setPlayingId(null);
  }, [owner]);

  useEffect(() => () => stop(), [stop]);

  const play = useCallback(
    async (line: SpokenLine) => {
      if (!mode) return;
      request.current?.abort();
      const done = () => {
        releaseSpeech(owner);
        setPlayingId((id) => (id === line.id ? null : id));
      };
      setPlayingId(line.id);
      if (mode === 'server' && line.target) {
        const abort = new AbortController();
        request.current = abort;
        claimSpeech(owner, () => abort.abort());
        try {
          const blob = await fetchSpeech(line.target, abort.signal);
          if (abort.signal.aborted) return;
          const url = URL.createObjectURL(blob);
          const audio = playbackElement();
          const finish = () => {
            URL.revokeObjectURL(url);
            audio.onended = null;
            audio.onerror = null;
            done();
          };
          claimSpeech(owner, () => {
            audio.pause();
            finish();
          });
          audio.onended = finish;
          audio.onerror = finish;
          audio.src = url;
          const started = audio.play();
          if (started && typeof started.catch === 'function') await started.catch(finish);
          return;
        } catch (error) {
          if (abort.signal.aborted || (error instanceof DOMException && error.name === 'AbortError')) return;
          // The server voice failed: fall back to the browser voice when there is one.
          if (!browserSynthesisAvailable()) return done();
        } finally {
          if (request.current === abort) request.current = null;
        }
      }
      if (!browserSynthesisAvailable()) return done();
      claimSpeech(owner, () => {
        window.speechSynthesis.cancel();
        setPlayingId((id) => (id === line.id ? null : id));
      });
      speakInBrowser(line.text, done);
    },
    [mode, owner],
  );

  // Read the newest line from the other side when it arrives right after the user's send.
  const latest = lines.at(-1);
  useEffect(() => {
    const ids = lines.map((l) => l.id);
    if (seen.current === null) {
      seen.current = new Set(ids);
      return;
    }
    const fresh = lines.filter((l) => !seen.current!.has(l.id));
    ids.forEach((id) => seen.current!.add(id));
    if (!fresh.length || !mode) return;
    if (takeAutoReadTurn() && !muted) void play(fresh.at(-1)!);
    // `lines` changes identity on every render; the newest id is what matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [latest?.id, lines.length, mode]);

  const toggleMuted = useCallback(() => {
    const next = !muted;
    writeSpeakerMuted(next);
    setMuted(next);
    if (next) stop();
  }, [muted, stop]);

  return {
    available: mode !== null,
    mode,
    muted,
    playingId,
    play,
    stop,
    toggleMuted,
  };
}
