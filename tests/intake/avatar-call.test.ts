// tests/intake/avatar-call.test.ts
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { ApiClientError } from '@/client/api/client';
import { AvatarCall, CONNECT_TIMEOUT_MS, goodbyeMs, type AvatarCallApi, type AvatarSession, type AvatarSessionCallbacks } from '@/onboarding/client/avatar-call';
import type { IntakeView } from '@/onboarding/contracts';

const view = (revision: number, extra: Partial<IntakeView> = {}) => ({ id: 'int_x', revision, phase: 'interviewing', committedTranscript: [], ...extra }) as unknown as IntakeView;
const greeted = view(2, { committedTranscript: [{ turnId: 't1', role: 'coach', text: 'Hi, I am Alex.' }] });

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

function setup(overrides: Partial<AvatarCallApi> = {}) {
  const session: { [K in keyof AvatarSession]: Mock<AvatarSession[K]> } = {
    start: vi.fn(async () => undefined),
    attach: vi.fn(),
    setMuted: vi.fn(async () => undefined),
    speak: vi.fn(),
    interrupt: vi.fn(),
    stop: vi.fn(async () => undefined),
  };
  let cb!: AvatarSessionCallbacks;
  const factory = vi.fn(async (_token: string, callbacks: AvatarSessionCallbacks) => {
    cb = callbacks;
    return session;
  });
  const api: { [K in keyof AvatarCallApi]: Mock<AvatarCallApi[K]> } = {
    connect: vi.fn(async () => ({ intake: greeted, sessionToken: 'tok', providerEpoch: 1 })),
    turn: vi.fn(async () => ({ intake: view(3), reply: 'What do you do?' })),
    stop: vi.fn(async () => view(9)),
    ...(overrides as Partial<{ [K in keyof AvatarCallApi]: Mock<AvatarCallApi[K]> }>),
  };
  const events = { state: vi.fn(), view: vi.fn(), speaking: vi.fn(), live: vi.fn(), failed: vi.fn() };
  const call = new AvatarCall(api, factory, events);
  return { call, api, session, factory, events, callbacks: () => cb };
}

const flush = () => new Promise((r) => setTimeout(r, 0));
/** Drains queued promise callbacks without touching (possibly fake) timers. */
const drain = async () => {
  for (let i = 0; i < 20; i += 1) await Promise.resolve();
};

describe('AvatarCall', () => {
  it('connects, starts muted, then unmutes and goes active', async () => {
    const { call, api, session, factory, events } = setup();
    await call.start();
    expect(api.connect).toHaveBeenCalledOnce();
    expect(factory).toHaveBeenCalledWith('tok', expect.any(Object));
    expect(session.start.mock.invocationCallOrder[0]!).toBeLessThan(session.setMuted.mock.invocationCallOrder[0]!);
    expect(session.setMuted).toHaveBeenCalledWith(false);
    expect(events.state.mock.calls.map((c) => c[0])).toEqual(['connecting', 'active']);
    expect(events.view).toHaveBeenCalledWith(greeted);
  });

  it('starts only once', async () => {
    const { call, api } = setup();
    await call.start();
    await call.start();
    expect(api.connect).toHaveBeenCalledOnce();
  });

  it('Alex says the greeting once the call is live', async () => {
    const { call, session } = setup();
    await call.start();
    expect(session.speak).toHaveBeenCalledWith('Hi, I am Alex.');
    expect(session.setMuted.mock.invocationCallOrder[0]!).toBeLessThan(session.speak.mock.invocationCallOrder[0]!);
  });

  it('sends each final user transcript to the coach in order and speaks the reply', async () => {
    const gate = deferred<{ intake: IntakeView; reply: string | null }>();
    const { call, api, session, events, callbacks } = setup();
    api.turn.mockImplementationOnce(() => gate.promise);
    await call.start();
    callbacks().userSaid(' I am a nurse ', 'e1');
    callbacks().userSaid('I want a raise', 'e2');
    await flush();
    expect(api.turn).toHaveBeenCalledTimes(1);
    expect(api.turn).toHaveBeenCalledWith(1, 'e1', 'I am a nurse');
    gate.resolve({ intake: view(3), reply: 'Got it. Who will you talk to?' });
    await flush();
    expect(api.turn).toHaveBeenNthCalledWith(2, 1, 'e2', 'I want a raise');
    expect(session.speak).toHaveBeenCalledWith('Got it. Who will you talk to?');
    expect(events.view).toHaveBeenCalledWith(view(3));
  });

  it('stops Alex mid-line when the user starts talking', async () => {
    const { call, session, callbacks } = setup();
    await call.start();
    callbacks().userSpeaking();
    expect(session.interrupt).toHaveBeenCalledOnce();
  });

  it('shows the video only once the stream is ready', async () => {
    const { call, events, callbacks } = setup();
    await call.start();
    expect(events.live).not.toHaveBeenCalledWith(true);
    callbacks().streamReady();
    expect(events.live).toHaveBeenCalledWith(true);
  });

  it('logs a failed turn and keeps listening', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const { call, api, callbacks } = setup();
      api.turn.mockRejectedValueOnce(new Error('network'));
      await call.start();
      callbacks().userSaid('hello', 'e1');
      callbacks().userSaid('hello again', 'e2');
      await flush();
      expect(warn).toHaveBeenCalledWith('avatar call: turn failed', expect.any(Error));
      expect(api.turn).toHaveBeenLastCalledWith(1, 'e2', 'hello again');
    } finally {
      warn.mockRestore();
    }
  });

  describe('with fake timers', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('when the coach moves to review, Alex finishes the last line and the call opens the review', async () => {
      const { call, api, session, callbacks } = setup();
      const last = 'Thank you. Here is what I heard.';
      api.turn.mockResolvedValueOnce({ intake: view(4, { phase: 'review' }), reply: last });
      await call.start();
      callbacks().userSaid('Can I just ask for more?', 'e5');
      await drain();
      expect(session.speak).toHaveBeenLastCalledWith(last);
      callbacks().userSpeaking();
      callbacks().userSaid('more words', 'e6');
      await drain();
      expect(session.interrupt).not.toHaveBeenCalled();
      expect(api.turn).toHaveBeenCalledOnce();
      await vi.advanceTimersByTimeAsync(goodbyeMs(last) - 1);
      expect(api.stop).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1);
      expect(session.stop).toHaveBeenCalled();
      expect(api.stop).toHaveBeenCalledWith('review');
      expect(call.state).toBe('ended');
    });

    it('gives up after the connect timeout and reports a fallback', async () => {
      const never = deferred<{ intake: IntakeView; sessionToken: string; providerEpoch: number }>();
      const { call, api, events, factory } = setup({ connect: vi.fn(() => never.promise) });
      void call.start();
      await vi.advanceTimersByTimeAsync(CONNECT_TIMEOUT_MS);
      expect(api.stop).toHaveBeenCalledWith('fallback');
      expect(events.failed).toHaveBeenCalledWith(expect.stringMatching(/too long/));
      never.resolve({ intake: greeted, sessionToken: 'late', providerEpoch: 1 });
      await vi.advanceTimersByTimeAsync(0);
      expect(factory).not.toHaveBeenCalled();
      expect(api.stop).toHaveBeenCalledTimes(2); // the late provider session is closed too
    });
  });

  it('a microphone failure stops everything and falls back', async () => {
    const { call, api, session, events } = setup();
    session.start.mockRejectedValueOnce(new Error('The microphone did not start.'));
    await call.start();
    expect(session.stop).toHaveBeenCalled();
    expect(api.stop).toHaveBeenCalledWith('fallback');
    expect(events.failed).toHaveBeenCalledWith(expect.stringMatching(/microphone/i));
    expect(call.state).toBe('ended');
  });

  it('shows the server’s own message when connect is refused', async () => {
    const refused = new ApiClientError({ code: 'BUDGET_EXHAUSTED', status: 429, message: 'Today’s spending limit is reached.', retryable: false });
    const { call, events } = setup({ connect: vi.fn(async () => Promise.reject(refused)) });
    await call.start();
    expect(events.failed).toHaveBeenCalledWith('Today’s spending limit is reached.');
  });

  it('a dropped connection while active falls back; events after the end are ignored', async () => {
    const { call, api, events, callbacks } = setup();
    await call.start();
    callbacks().disconnected();
    await flush();
    expect(api.stop).toHaveBeenCalledWith('fallback');
    expect(events.failed).toHaveBeenCalledOnce();
    callbacks().userSaid('late words', 'e9');
    callbacks().disconnected();
    callbacks().speaking(true);
    await flush();
    expect(api.turn).not.toHaveBeenCalled();
    expect(events.failed).toHaveBeenCalledOnce();
    expect(events.speaking).not.toHaveBeenCalled();
  });

  it('end is idempotent and releases the session before telling the server', async () => {
    const { call, api, session } = setup();
    await call.start();
    await Promise.all([call.end('end'), call.end('end')]);
    expect(session.stop).toHaveBeenCalledOnce();
    expect(api.stop).toHaveBeenCalledOnce();
    expect(session.stop.mock.invocationCallOrder[0]!).toBeLessThan(api.stop.mock.invocationCallOrder[0]!);
  });

  it('attaches the video element whenever the session appears', async () => {
    const { call, session } = setup();
    const video = {} as HTMLVideoElement;
    call.attach(video);
    await call.start();
    expect(session.attach).toHaveBeenCalledWith(video);
  });

  it('closes a session whose start finishes after the call ended, and never unmutes it', async () => {
    const gate = deferred<void>();
    const { call, session } = setup();
    session.start.mockImplementationOnce(() => gate.promise);
    const started = call.start();
    await flush();
    await call.end('end');
    expect(session.stop).toHaveBeenCalledTimes(1);
    gate.resolve();
    await started;
    expect(session.stop).toHaveBeenCalledTimes(2);
    expect(session.setMuted).not.toHaveBeenCalled();
  });

  it('closes a session that is still unmuting when the call ends', async () => {
    const gate = deferred<void>();
    const { call, session } = setup();
    session.setMuted.mockImplementationOnce(() => gate.promise);
    const started = call.start();
    await flush();
    await call.end('end');
    expect(session.stop).toHaveBeenCalledTimes(1);
    gate.resolve();
    await started;
    expect(session.stop).toHaveBeenCalledTimes(2);
  });

  it('does not show or speak a turn that arrives after the call ended', async () => {
    const gate = deferred<{ intake: IntakeView; reply: string | null }>();
    const { call, events, session, callbacks } = setup({ turn: vi.fn(() => gate.promise) });
    await call.start();
    callbacks().userSaid('hello there', 'e1');
    await flush();
    await call.end('end');
    gate.resolve({ intake: view(3), reply: 'late line' });
    await flush();
    expect(session.speak).not.toHaveBeenCalledWith('late line');
    expect(events.view).toHaveBeenLastCalledWith(view(9));
    expect(events.view).not.toHaveBeenCalledWith(view(3));
  });

  it('mute only reaches the session while the call is active', async () => {
    const gate = deferred<void>();
    const { call, session } = setup();
    session.start.mockImplementationOnce(() => gate.promise);
    const started = call.start();
    await flush();
    await call.mute(false);
    expect(session.setMuted).not.toHaveBeenCalled();
    gate.resolve();
    await started;
    await call.mute(true);
    expect(session.setMuted).toHaveBeenLastCalledWith(true);
  });

  it('records the real reason when a session abandoned mid-connect is closed late', async () => {
    const gate = deferred<{ intake: IntakeView; sessionToken: string; providerEpoch: number }>();
    const { call, api } = setup({ connect: vi.fn(() => gate.promise) });
    const started = call.start();
    await call.end('end');
    gate.resolve({ intake: greeted, sessionToken: 'late', providerEpoch: 1 });
    await started;
    expect(api.stop).toHaveBeenCalledTimes(2);
    expect(api.stop).toHaveBeenNthCalledWith(2, 'end');
  });
});
