import type { SpeakRequest } from '@/contracts/api';
import type { AvatarSessionFactory } from '@/onboarding/client/avatar-call';
import { browserSynthesisAvailable, fetchSpeech, playbackElement } from './speech';

/**
 * Plays a server-owned line (Alex or a counterpart) through our own text-to-speech.
 * Used by the avatar calls so the user always hears the line, whatever the avatar provider's
 * audio does. One line at a time; a newer line or `stop()` cancels the previous one.
 */
export interface LineVoice {
  say(target: SpeakRequest, text: string): void;
  stop(): void;
}

export function createLineVoice(onSpeaking: (on: boolean) => void, audio: HTMLAudioElement = playbackElement()): LineVoice {
  let generation = 0;
  let abort: AbortController | null = null;
  let objectUrl: string | null = null;

  const release = () => {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = null;
  };
  const stopPlayback = () => {
    abort?.abort();
    abort = null;
    audio.onended = null;
    audio.onerror = null;
    audio.pause();
    release();
    if (browserSynthesisAvailable()) window.speechSynthesis.cancel();
    onSpeaking(false);
  };

  const speakInBrowser = (text: string, mine: number) => {
    if (!browserSynthesisAvailable() || mine !== generation) return;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'en-US';
    utterance.onstart = () => mine === generation && onSpeaking(true);
    utterance.onend = () => mine === generation && onSpeaking(false);
    window.speechSynthesis.speak(utterance);
  };

  return {
    say(target, text) {
      stopPlayback();
      const mine = ++generation;
      const controller = new AbortController();
      abort = controller;
      void (async () => {
        try {
          const blob = await fetchSpeech(target, controller.signal);
          if (mine !== generation) return;
          objectUrl = URL.createObjectURL(blob);
          audio.src = objectUrl;
          audio.onended = () => {
            if (mine === generation) {
              onSpeaking(false);
              release();
            }
          };
          audio.onerror = () => mine === generation && onSpeaking(false);
          onSpeaking(true);
          await audio.play();
        } catch {
          if (mine !== generation || controller.signal.aborted) return;
          onSpeaking(false);
          speakInBrowser(text, mine);
        }
      })();
    },
    stop() {
      generation += 1;
      stopPlayback();
    },
  };
}

/** Quiet time after the last recognised fragment before the user's words go to the server as one turn. */
export const MERGE_QUIET_MS = 1_800;
/** How long after a line ends a recognised copy of it still counts as the avatar's echo. */
const ECHO_TAIL_MS = 2_000;

const words = (text: string) => text.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(Boolean);

/** True when most of the heard words are words of the line just spoken: the speakers leaking into the mic. */
export function looksLikeEcho(heard: string, spoken: string): boolean {
  const said = new Set(words(spoken));
  const got = words(heard);
  if (got.length === 0 || said.size === 0) return false;
  return got.filter((w) => said.has(w)).length / got.length >= 0.7;
}

/**
 * Wraps an avatar session factory so every spoken line is also played through our own voice.
 * The avatar still receives the line (for lip movement), but its own audio is muted: if the
 * provider's speech comes back later, the user never hears the line twice.
 *
 * It also shapes what the user said: recognised fragments are merged into one turn after a short
 * quiet, and while a line plays (plus a short tail) the user's speech neither interrupts it nor
 * counts when it only repeats that line, so speakers leaking into the microphone are not answers.
 */
export function withServerVoice(factory: AvatarSessionFactory, targetFor: (lineId: string) => SpeakRequest | null, makeVoice: (onSpeaking: (on: boolean) => void) => LineVoice = createLineVoice): AvatarSessionFactory {
  return async (token, callbacks) => {
    let playing = false;
    let lastLine = '';
    let lineEndedAt = 0;
    const lineVoice = makeVoice((on) => {
      if (playing && !on) lineEndedAt = Date.now();
      playing = on;
      callbacks.speaking(on);
    });
    const inEchoWindow = () => playing || Date.now() - lineEndedAt < ECHO_TAIL_MS;

    let pending: { parts: string[]; id: string } | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const flush = () => {
      timer = null;
      const turn = pending;
      pending = null;
      if (turn) callbacks.userSaid(turn.parts.join(' '), turn.id);
    };
    const schedule = (ms: number) => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(flush, ms);
    };

    let media: HTMLVideoElement | null = null;
    const muteMedia = () => {
      if (media) media.muted = true;
    };
    const session = await factory(token, {
      ...callbacks,
      userSaid(text, itemId) {
        const clean = text.trim();
        if (!clean) return;
        if (inEchoWindow() && looksLikeEcho(clean, lastLine)) return;
        if (!pending) pending = { parts: [], id: itemId };
        pending.parts.push(clean);
        schedule(MERGE_QUIET_MS);
      },
      userSpeaking() {
        // Still talking: hold the merged turn a little longer.
        if (pending) schedule(MERGE_QUIET_MS * 2);
        if (!inEchoWindow()) callbacks.userSpeaking();
      },
      // Provider speech events are ignored: our own playback drives "is speaking".
      speaking: () => undefined,
      streamReady: () => {
        muteMedia();
        callbacks.streamReady();
      },
    });
    return {
      ...session,
      attach(element) {
        media = element;
        session.attach(element);
        muteMedia();
      },
      speak(text, lineId) {
        session.speak(text, lineId);
        lastLine = text;
        const target = lineId ? targetFor(lineId) : null;
        if (target) lineVoice.say(target, text);
      },
      interrupt() {
        session.interrupt();
        lineVoice.stop();
      },
      async stop() {
        if (timer) clearTimeout(timer);
        pending = null;
        lineVoice.stop();
        await session.stop();
      },
    };
  };
}
