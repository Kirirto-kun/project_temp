// tests/intake/avatar-call.test.ts
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { ApiClientError } from '@/client/api/client';
import { AvatarCall, CONNECT_TIMEOUT_MS, GOODBYE_MS, type AvatarCallApi, type AvatarSession, type AvatarSessionCallbacks } from '@/onboarding/client/avatar-call';
import type { IntakeView } from '@/onboarding/contracts';

const view = (revision: number) => ({ id: 'int_x', revision }) as unknown as IntakeView;

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
    sendToolResult: vi.fn(),
    stop: vi.fn(async () => undefined),
  };
  let cb!: AvatarSessionCallbacks;
  const factory = vi.fn(async (_token: string, callbacks: AvatarSessionCallbacks) => {
    cb = callbacks;
    return session;
  });
  const api: { [K in keyof AvatarCallApi]: Mock<AvatarCallApi[K]> } = {
    connect: vi.fn(async () => ({ intake: view(2), sessionToken: 'tok', providerEpoch: 1 })),
    transcript: vi.fn(async () => view(3)),
    tool: vi.fn(async () => ({ output: { ok: true } })),
    stop: vi.fn(async () => view(9)),
    ...(overrides as Partial<{ [K in keyof AvatarCallApi]: Mock<AvatarCallApi[K]> }>),
  };
  const events = { state: vi.fn(), view: vi.fn(), speaking: vi.fn(), failed: vi.fn() };
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
    expect(events.view).toHaveBeenCalledWith(view(2));
  });

  it('starts only once', async () => {
    const { call, api } = setup();
    await call.start();
    await call.start();
    expect(api.connect).toHaveBeenCalledOnce();
  });

  it('sends captions before a later tool call reaches the server (quotes must be on record first)', async () => {
    const gate = deferred<IntakeView>();
    const { call, api, callbacks } = setup({ transcript: vi.fn(() => gate.promise) });
    await call.start();
    callbacks().caption('user', ' I make ninety-five ', 'e1');
    callbacks().tool('c1', 'propose_profile_patch', '{"field":"currentMoney","quote":"ninety-five"}');
    await flush();
    expect(api.transcript).toHaveBeenCalledWith(1, 'e1', 'user', 'I make ninety-five');
    expect(api.tool).not.toHaveBeenCalled();
    gate.resolve(view(3));
    await flush();
    expect(api.tool).toHaveBeenCalledWith(1, 'c1', 'propose_profile_patch', '{"field":"currentMoney","quote":"ninety-five"}');
  });

  it('returns the server result to the agent, or an error result if the relay fails', async () => {
    const { call, api, session, callbacks } = setup();
    await call.start();
    callbacks().tool('c1', 'get_missing_fields', '{}');
    await flush();
    expect(session.sendToolResult).toHaveBeenCalledWith('c1', '{"ok":true}');
    api.tool.mockRejectedValueOnce(new Error('network'));
    callbacks().tool('c2', 'get_missing_fields', '{}');
    await flush();
    expect(JSON.parse(session.sendToolResult.mock.calls[1]![1] as string)).toMatchObject({ ok: false });
  });

  it('logs a failed tool relay for live debugging', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const { call, api, callbacks } = setup();
      await call.start();
      api.tool.mockRejectedValueOnce(new Error('network'));
      callbacks().tool('c1', 'get_missing_fields', '{}');
      await flush();
      expect(warn).toHaveBeenCalledWith('avatar call: tool relay failed', expect.any(Error));
    } finally {
      warn.mockRestore();
    }
  });

  describe('with fake timers', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('request_end lets Alex finish, then ends the call', async () => {
      const { call, api, session, callbacks } = setup();
      await call.start();
      callbacks().tool('c9', 'request_end', '{}');
      await drain();
      expect(session.sendToolResult).toHaveBeenCalledWith('c9', '{"ok":true}');
      await vi.advanceTimersByTimeAsync(GOODBYE_MS - 1);
      expect(api.stop).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1);
      expect(session.stop).toHaveBeenCalled();
      expect(api.stop).toHaveBeenCalledWith('end');
      expect(call.state).toBe('ended');
    });

    it('gives up after the connect timeout and reports a fallback', async () => {
      const never = deferred<{ intake: IntakeView; sessionToken: string; providerEpoch: number }>();
      const { call, api, events, factory } = setup({ connect: vi.fn(() => never.promise) });
      void call.start();
      await vi.advanceTimersByTimeAsync(CONNECT_TIMEOUT_MS);
      expect(api.stop).toHaveBeenCalledWith('fallback');
      expect(events.failed).toHaveBeenCalledWith(expect.stringMatching(/too long/));
      never.resolve({ intake: view(2), sessionToken: 'late', providerEpoch: 1 });
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
    callbacks().caption('user', 'late words', 'e9');
    callbacks().disconnected();
    callbacks().speaking(true);
    await flush();
    expect(api.transcript).not.toHaveBeenCalled();
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

  it('does not show a transcript view that arrives after the call ended', async () => {
    const gate = deferred<IntakeView>();
    const { call, events, callbacks } = setup({ transcript: vi.fn(() => gate.promise) });
    await call.start();
    callbacks().caption('user', 'hello there', 'e1');
    await flush();
    await call.end('end');
    gate.resolve(view(3));
    await flush();
    expect(events.view).toHaveBeenLastCalledWith(view(9));
    expect(events.view).not.toHaveBeenCalledWith(view(3));
  });

  it('logs a failed relay and keeps relaying', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const { call, api, callbacks } = setup();
      api.transcript.mockRejectedValueOnce(new Error('network'));
      await call.start();
      callbacks().caption('user', 'hello', 'e1');
      callbacks().tool('c1', 'get_missing_fields', '{}');
      await flush();
      expect(warn).toHaveBeenCalledWith('avatar call: relay failed', expect.any(Error));
      expect(api.tool).toHaveBeenCalledWith(1, 'c1', 'get_missing_fields', '{}');
    } finally {
      warn.mockRestore();
    }
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
    gate.resolve({ intake: view(2), sessionToken: 'late', providerEpoch: 1 });
    await started;
    expect(api.stop).toHaveBeenCalledTimes(2);
    expect(api.stop).toHaveBeenNthCalledWith(2, 'end');
  });
});
