import { ApiClientError } from '@/client/api/client';
import type { IntakeView } from '../contracts';

export interface AvatarSessionCallbacks {
  caption(role: 'user' | 'coach', text: string, itemId: string): void;
  tool(callId: string, name: string, args: string): void;
  speaking(on: boolean): void;
  disconnected(): void;
}

export interface AvatarSession {
  start(): Promise<void>;
  attach(element: HTMLVideoElement): void;
  setMuted(muted: boolean): Promise<void>;
  sendToolResult(callId: string, result: string): void;
  stop(): Promise<void>;
}

export type AvatarSessionFactory = (token: string, callbacks: AvatarSessionCallbacks) => Promise<AvatarSession>;

export type AvatarStopReason = 'end' | 'timeout' | 'error' | 'fallback';
export type AvatarCallState = 'idle' | 'connecting' | 'active' | 'ending' | 'ended';

export interface AvatarCallApi {
  connect(): Promise<{ intake: IntakeView; sessionToken: string; providerEpoch: number }>;
  transcript(providerEpoch: number, itemId: string, role: 'user' | 'coach', text: string): Promise<IntakeView>;
  tool(providerEpoch: number, callId: string, name: string, args: string): Promise<{ output: Record<string, unknown> }>;
  stop(reason: AvatarStopReason): Promise<IntakeView>;
}

export interface AvatarCallEvents {
  state(state: AvatarCallState): void;
  view(view: IntakeView): void;
  speaking(on: boolean): void;
  /** The call could not start or dropped; the screen continues with the next coach. */
  failed(message: string): void;
}

export const CONNECT_TIMEOUT_MS = 15_000;
export const GOODBYE_MS = 2_500;

/**
 * One video call attempt per instance. After `end`, every late SDK event is ignored, so nothing
 * from a closed call reaches the server or the screen. Captions and tool calls share one queue in
 * arrival order: the server accepts a tool's quote only once the user's words are on record.
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
    this.setState('ending');
    const session = this.session;
    this.session = null;
    this.ending = (async () => {
      await session?.stop().catch(() => undefined);
      try {
        this.events.view(await this.api.stop(reason));
      } catch {
        // The screen re-reads the intake on fallback or review.
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
        console.warn('avatar call: relay failed', error);
      });
  }

  private callbacks(): AvatarSessionCallbacks {
    return {
      caption: (role, text, itemId) => {
        const clean = text.trim().slice(0, 4_000);
        if (!clean || this.closed) return;
        this.enqueue(async () => {
          const next = await this.api.transcript(this.epoch, itemId, role, clean);
          if (!this.closed) this.events.view(next);
        });
      },
      tool: (callId, name, args) => {
        if (this.closed) return;
        this.enqueue(async () => {
          let output: Record<string, unknown>;
          try {
            output = (await this.api.tool(this.epoch, callId, name, args)).output;
          } catch (error) {
            console.warn('avatar call: tool relay failed', error);
            output = { ok: false, error: 'The server did not accept this call.' };
          }
          if (this.closed) return;
          this.session?.sendToolResult(callId, JSON.stringify(output));
          if (name === 'request_end') setTimeout(() => void this.end('end'), GOODBYE_MS);
        });
      },
      speaking: (on) => {
        if (!this.closed) this.events.speaking(on);
      },
      disconnected: () => {
        if (!this.closed) void this.fail('The call dropped. Your answers are kept.');
      },
    };
  }
}
