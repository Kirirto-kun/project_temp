import { ApiClientError } from '@/client/api/client';
import type { IntakeView } from '../contracts';

export interface AvatarSessionCallbacks {
  /** A final transcript of what the user said (LiveAvatar's speech recognition). */
  userSaid(text: string, itemId: string): void;
  userSpeaking(): void;
  speaking(on: boolean): void;
  streamReady(): void;
  disconnected(): void;
}

export interface AvatarSession {
  start(): Promise<void>;
  attach(element: HTMLVideoElement): void;
  setMuted(muted: boolean): Promise<void>;
  speak(text: string): void;
  interrupt(): void;
  stop(): Promise<void>;
}

export type AvatarSessionFactory = (token: string, callbacks: AvatarSessionCallbacks) => Promise<AvatarSession>;

export type AvatarStopReason = 'end' | 'review' | 'timeout' | 'error' | 'fallback';
export type AvatarCallState = 'idle' | 'connecting' | 'active' | 'ending' | 'ended';

export interface AvatarCallApi {
  connect(): Promise<{ intake: IntakeView; sessionToken: string; providerEpoch: number }>;
  turn(providerEpoch: number, itemId: string, text: string): Promise<{ intake: IntakeView; reply: string | null }>;
  stop(reason: AvatarStopReason): Promise<IntakeView>;
}

export interface AvatarCallEvents {
  state(state: AvatarCallState): void;
  view(view: IntakeView): void;
  speaking(on: boolean): void;
  live(on: boolean): void;
  /** The call could not start or dropped; the screen continues with the next coach. */
  failed(message: string): void;
}

export const CONNECT_TIMEOUT_MS = 20_000;
/** After the last line, give Alex time to finish speaking before the review opens. */
export function goodbyeMs(text: string): number {
  return Math.min(12_000, Math.max(2_500, text.length * 65));
}

/** The last thing Alex said in a view (the greeting on a fresh call, or the last question on a reconnect). */
export function lastCoachLine(view: IntakeView): string | null {
  const last = view.committedTranscript.at(-1);
  return last?.role === 'coach' ? last.text : null;
}

/**
 * One video call attempt per instance. After `end`, every late SDK event is ignored, so nothing
 * from a closed call reaches the server or the screen. User turns go through one queue in arrival
 * order; each returns the coach's next line, which Alex then says.
 */
export class AvatarCall {
  state: AvatarCallState = 'idle';
  private closed = false;
  private session: AvatarSession | null = null;
  private video: HTMLVideoElement | null = null;
  private epoch = 0;
  private queue: Promise<void> = Promise.resolve();
  private ending: Promise<void> | null = null;
  private stopReason: AvatarStopReason = 'fallback';
  private goodbye: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly api: AvatarCallApi,
    private readonly factory: AvatarSessionFactory,
    private readonly events: AvatarCallEvents,
  ) {}

  async start(): Promise<void> {
    if (this.state !== 'idle') return;
    this.setState('connecting');
    const timeout = setTimeout(() => {
      if (this.state === 'connecting') void this.fail('Connecting to Alex took too long. Your answers are kept.');
    }, CONNECT_TIMEOUT_MS);
    try {
      const credentials = await this.api.connect();
      if (this.closed) {
        // Abandoned while the server was minting: close the session it just opened.
        await this.api.stop(this.stopReason).catch(() => undefined);
        return;
      }
      this.epoch = credentials.providerEpoch;
      this.events.view(credentials.intake);
      const session = await this.factory(credentials.sessionToken, this.callbacks());
      if (this.closed) {
        await session.stop();
        return;
      }
      this.session = session;
      if (this.video) session.attach(this.video);
      await session.start();
      if (this.closed) {
        await session.stop().catch(() => undefined);
        return;
      }
      await session.setMuted(false);
      if (this.closed) {
        await session.stop().catch(() => undefined);
        return;
      }
      this.setState('active');
      const opening = lastCoachLine(credentials.intake);
      if (opening) session.speak(opening);
    } catch (err) {
      if (!this.closed) await this.fail(err instanceof ApiClientError ? err.message : 'Alex could not connect. Check your microphone; your answers are kept.');
    } finally {
      clearTimeout(timeout);
    }
  }

  attach(element: HTMLVideoElement): void {
    this.video = element;
    this.session?.attach(element);
  }

  async mute(muted: boolean): Promise<void> {
    if (this.state !== 'active') return;
    await this.session?.setMuted(muted);
  }

  /** Releases the microphone locally first, then closes the intake's media on the server. */
  end(reason: AvatarStopReason): Promise<void> {
    if (this.ending) return this.ending;
    this.closed = true;
    this.stopReason = reason;
    if (this.goodbye) clearTimeout(this.goodbye);
    this.setState('ending');
    this.events.live(false);
    const session = this.session;
    this.session = null;
    this.ending = (async () => {
      await session?.stop().catch(() => undefined);
      try {
        this.events.view(await this.api.stop(reason));
      } catch {
        // The screen re-reads the intake once the call has ended.
      }
      this.setState('ended');
    })();
    return this.ending;
  }

  private async fail(message: string): Promise<void> {
    await this.end('fallback');
    this.events.failed(message);
  }

  private setState(state: AvatarCallState) {
    this.state = state;
    this.events.state(state);
  }

  private enqueue(task: () => Promise<void>) {
    this.queue = this.queue
      .then(async () => {
        if (!this.closed) await task();
      })
      .catch((error: unknown) => {
        console.warn('avatar call: turn failed', error);
      });
  }

  private callbacks(): AvatarSessionCallbacks {
    return {
      userSaid: (text, itemId) => {
        const clean = text.trim().slice(0, 4_000);
        if (!clean || this.closed || this.goodbye) return;
        this.enqueue(async () => {
          const { intake, reply } = await this.api.turn(this.epoch, itemId, clean);
          if (this.closed) return;
          this.events.view(intake);
          if (reply) this.session?.speak(reply);
          // The coach moved on to review: let Alex finish the line, then open the review.
          if (intake.phase === 'review' || intake.phase === 'completed') this.goodbye = setTimeout(() => void this.end('review'), goodbyeMs(reply ?? ''));
        });
      },
      userSpeaking: () => {
        // The user talks over Alex: stop the current line so the turn feels natural.
        if (!this.closed && !this.goodbye) this.session?.interrupt();
      },
      speaking: (on) => {
        if (!this.closed) this.events.speaking(on);
      },
      streamReady: () => {
        if (!this.closed) this.events.live(true);
      },
      disconnected: () => {
        if (!this.closed) void this.fail('The video call dropped. Your answers are kept.');
      },
    };
  }
}
