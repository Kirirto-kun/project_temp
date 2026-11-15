import { ApiClientError } from '@/client/api/client';
import type { SessionView } from '@/contracts/domain';
import { CONNECT_TIMEOUT_MS, goodbyeMs, type AvatarCallState, type AvatarSession, type AvatarSessionCallbacks, type AvatarSessionFactory } from '@/onboarding/client/avatar-call';

export type RoundCallState = AvatarCallState;

export interface RoundAvatarCallApi {
  connect(): Promise<{ sessionToken: string; providerEpoch: number }>;
  /** The latest round view the screen holds. */
  current(): SessionView | null;
  /**
   * One round turn through the normal pipeline (the screen's retrying send). Resolves with the
   * committed view and the turn id, or null when the turn was not committed (the screen shows why).
   */
  turn(text: string): Promise<{ view: SessionView; turnId: string } | null>;
  /** Closes this attempt on the server (budget settle, provider stop). Must never block the UI. */
  stop(providerEpoch: number | undefined): Promise<void>;
}

export interface RoundAvatarCallEvents {
  state(state: RoundCallState): void;
  speaking(on: boolean): void;
  live(on: boolean): void;
  /** The call could not start or dropped; the round continues in text. */
  failed(message: string): void;
}

/** The counterpart's newest line: the opening on a fresh round, or the last reply. */
export function lastCounterpartLine(view: SessionView | null): { text: string; id: string } | null {
  const last = view?.messages.at(-1);
  return last?.role === 'counterpart' ? { text: last.text, id: last.id } : null;
}

/** The counterpart's reply to one committed turn. */
export function replyTo(view: SessionView, turnId: string): { text: string; id: string } | null {
  const line = view.messages.find((m) => m.turnId === turnId && m.role === 'counterpart');
  return line ? { text: line.text, id: line.id } : null;
}

/**
 * The video call with a negotiation counterpart: one attempt per instance. LiveAvatar hears the
 * user; each final transcript is a normal round turn, and the avatar says the engine's reply.
 * Every number comes from the engine. After `end`, late SDK events are ignored.
 */
export class RoundAvatarCall {
  state: RoundCallState = 'idle';
  private closed = false;
  private session: AvatarSession | null = null;
  private video: HTMLVideoElement | null = null;
  private epoch: number | undefined;
  private queue: Promise<void> = Promise.resolve();
  private ending: Promise<void> | null = null;
  private goodbye: ReturnType<typeof setTimeout> | null = null;
  private turnsInFlight = 0;

  constructor(
    private readonly api: RoundAvatarCallApi,
    private readonly factory: AvatarSessionFactory,
    private readonly events: RoundAvatarCallEvents,
  ) {}

  async start(): Promise<void> {
    if (this.state !== 'idle') return;
    this.setState('connecting');
    const timeout = setTimeout(() => {
      if (this.state === 'connecting') void this.fail('Connecting the video call took too long. Continue by typing.');
    }, CONNECT_TIMEOUT_MS);
    try {
      const credentials = await this.api.connect();
      this.epoch = credentials.providerEpoch;
      if (this.closed) {
        // Abandoned while the server was minting: close the session it just opened.
        await this.api.stop(this.epoch).catch(() => undefined);
        return;
      }
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
      const opening = lastCounterpartLine(this.api.current());
      if (opening) session.speak(opening.text, opening.id);
    } catch (err) {
      if (!this.closed) await this.fail(err instanceof ApiClientError ? err.message : 'The video call could not connect. Check your microphone, or continue by typing.');
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

  /**
   * The round ended outside a spoken turn (End the round, timeout): hang up now. A turn in flight
   * or a goodbye already playing finishes first; the turn schedules its own goodbye.
   */
  roundEnded(): void {
    if (this.closed || this.goodbye || this.turnsInFlight > 0) return;
    void this.end();
  }

  /** Releases the microphone locally first, then closes the call on the server. */
  end(): Promise<void> {
    if (this.ending) return this.ending;
    this.closed = true;
    if (this.goodbye) clearTimeout(this.goodbye);
    this.setState('ending');
    this.events.live(false);
    const session = this.session;
    this.session = null;
    this.ending = (async () => {
      await session?.stop().catch(() => undefined);
      // Without an epoch the server never opened this attempt (or start() closes it once minted).
      if (this.epoch !== undefined) await this.api.stop(this.epoch).catch(() => undefined);
      this.setState('ended');
    })();
    return this.ending;
  }

  private async fail(message: string): Promise<void> {
    await this.end();
    this.events.failed(message);
  }

  private setState(state: RoundCallState) {
    this.state = state;
    this.events.state(state);
  }

  private enqueue(task: () => Promise<void>) {
    this.queue = this.queue
      .then(async () => {
        if (!this.closed) await task();
      })
      .catch((error: unknown) => {
        console.warn('round video call: turn failed', error);
      });
  }

  private callbacks(): AvatarSessionCallbacks {
    return {
      userSaid: (text) => {
        const clean = text.trim().slice(0, 4_000);
        if (!clean || this.closed || this.goodbye) return;
        this.turnsInFlight += 1;
        this.enqueue(async () => {
          let reply: string | null = null;
          let over = false;
          try {
            if (this.api.current()?.ended) return;
            const result = await this.api.turn(clean);
            if (this.closed || !result) return;
            const line = replyTo(result.view, result.turnId);
            reply = line?.text ?? null;
            over = result.view.ended !== null;
            if (line) this.session?.speak(line.text, line.id);
          } finally {
            this.turnsInFlight -= 1;
            // The round is over: let the counterpart finish the line, then hang up.
            if ((over || this.api.current()?.ended) && !this.closed && !this.goodbye) this.goodbye = setTimeout(() => void this.end(), goodbyeMs(reply ?? ''));
          }
        });
      },
      userSpeaking: () => {
        // The user talks over the counterpart: stop the current line so the turn feels natural.
        if (!this.closed && !this.goodbye) this.session?.interrupt();
      },
      speaking: (on) => {
        if (!this.closed) this.events.speaking(on);
      },
      streamReady: () => {
        if (!this.closed) this.events.live(true);
      },
      disconnected: () => {
        if (!this.closed) void this.fail('The video call dropped. The round continues; reply by typing.');
      },
    };
  }
}
