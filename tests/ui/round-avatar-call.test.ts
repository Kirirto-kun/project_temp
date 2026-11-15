import { afterEach, describe, expect, it, vi, type Mock } from 'vitest';
import type { SessionView } from '@/contracts/domain';
import { RoundAvatarCall, type RoundAvatarCallApi } from '@/features/session/RoundAvatarCall';
import { goodbyeMs, type AvatarSession, type AvatarSessionCallbacks } from '@/onboarding/client/avatar-call';

type Msg = { role: 'user' | 'counterpart'; text: string; turnId: string | null };
const view = (messages: Msg[], ended: SessionView['ended'] = null) =>
  ({ id: 'ses_x', version: messages.length, ended, messages: messages.map((m, i) => ({ id: `m${i}`, sourceTurnKey: null, status: 'committed', ...m })) }) as unknown as SessionView;
const opening: Msg = { role: 'counterpart', text: 'Thanks for making time. What did you want to discuss?', turnId: null };

function setup() {
  let current: SessionView | null = view([opening]);
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
  const reply = (text: string, answer: string, ended: SessionView['ended'] = null) => {
    current = view([opening, { role: 'user', text, turnId: 't1' }, { role: 'counterpart', text: answer, turnId: 't1' }], ended);
    return { view: current, turnId: 't1' };
  };
  const api: { [K in keyof RoundAvatarCallApi]: Mock<RoundAvatarCallApi[K]> } = {
    connect: vi.fn(async () => ({ sessionToken: 'tok', providerEpoch: 3 })),
    current: vi.fn(() => current),
    turn: vi.fn(async (text: string) => reply(text, 'I can offer $104,000.')),
    stop: vi.fn(async () => undefined),
  };
  const events = { state: vi.fn(), speaking: vi.fn(), live: vi.fn(), failed: vi.fn() };
  const call = new RoundAvatarCall(api, factory, events);
  return { call, api, session, events, reply, callbacks: () => cb, setCurrent: (v: SessionView) => (current = v) };
}

const drain = async () => {
  for (let i = 0; i < 20; i += 1) await Promise.resolve();
};

afterEach(() => {
  vi.useRealTimers();
});

describe('RoundAvatarCall', () => {
  it('connects, unmutes, goes active and says the opening line', async () => {
    const { call, session, events } = setup();
    await call.start();
    expect(events.state.mock.calls.map((c) => c[0])).toEqual(['connecting', 'active']);
    expect(session.setMuted).toHaveBeenCalledWith(false);
    expect(session.speak).toHaveBeenCalledWith(opening.text);
    expect(session.setMuted.mock.invocationCallOrder[0]!).toBeLessThan(session.speak.mock.invocationCallOrder[0]!);
  });

  it('runs each final transcript as a round turn and speaks the engine reply', async () => {
    const { call, api, session, callbacks } = setup();
    await call.start();
    session.speak.mockClear();
    callbacks().userSaid('  I would like $110,000 ', 'e1');
    await drain();
    expect(api.turn).toHaveBeenCalledWith('I would like $110,000');
    expect(session.speak).toHaveBeenCalledWith('I can offer $104,000.');
  });

  it('a turn that does not commit speaks nothing', async () => {
    const { call, api, session, callbacks } = setup();
    await call.start();
    session.speak.mockClear();
    api.turn.mockResolvedValueOnce(null);
    callbacks().userSaid('hello', 'e1');
    await drain();
    expect(session.speak).not.toHaveBeenCalled();
    expect(call.state).toBe('active');
  });

  it('when the round ends on a turn, the last line plays, then the call closes', async () => {
    vi.useFakeTimers();
    const { call, api, session, callbacks, reply } = setup();
    await call.start();
    const last = 'Then we have a deal at $108,000.';
    api.turn.mockImplementationOnce(async (text) => reply(text, last, 'accepted'));
    callbacks().userSaid('Deal', 'e1');
    await drain();
    expect(session.speak).toHaveBeenLastCalledWith(last);
    // Barge-in is ignored during the goodbye, and so is new speech.
    callbacks().userSpeaking();
    callbacks().userSaid('one more thing', 'e2');
    await drain();
    expect(session.interrupt).not.toHaveBeenCalled();
    expect(api.turn).toHaveBeenCalledOnce();
    expect(api.stop).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(goodbyeMs(last));
    expect(session.stop).toHaveBeenCalledOnce();
    expect(api.stop).toHaveBeenCalledWith(3);
    expect(call.state).toBe('ended');
  });

  it('roundEnded hangs up at once when no turn or goodbye is pending', async () => {
    const { call, api } = setup();
    await call.start();
    call.roundEnded();
    await drain();
    expect(api.stop).toHaveBeenCalledWith(3);
    expect(call.state).toBe('ended');
  });

  it('ignores late SDK events after the call ended', async () => {
    const { call, api, session, events, callbacks } = setup();
    await call.start();
    await call.end();
    session.speak.mockClear();
    events.speaking.mockClear();
    callbacks().userSaid('late words', 'e9');
    callbacks().speaking(true);
    callbacks().streamReady();
    callbacks().disconnected();
    await drain();
    expect(api.turn).not.toHaveBeenCalled();
    expect(session.speak).not.toHaveBeenCalled();
    expect(events.speaking).not.toHaveBeenCalled();
    expect(events.failed).not.toHaveBeenCalled();
    expect(api.stop).toHaveBeenCalledOnce();
  });

  it('a reply that arrives after the call ended is not spoken', async () => {
    const { call, api, session, callbacks, reply } = setup();
    let release!: () => void;
    api.turn.mockImplementationOnce((text) => new Promise((r) => (release = () => r(reply(text, 'Too late.')))));
    await call.start();
    callbacks().userSaid('hello', 'e1');
    await drain();
    await call.end();
    release();
    await drain();
    expect(session.speak).not.toHaveBeenCalledWith('Too late.');
  });

  it('a provider drop ends the call and reports the fallback', async () => {
    const { call, api, events, callbacks } = setup();
    await call.start();
    callbacks().disconnected();
    await drain();
    expect(api.stop).toHaveBeenCalledOnce();
    expect(events.failed).toHaveBeenCalledWith(expect.stringContaining('typing'));
  });

  it('a failed connect reports the fallback without a provider session', async () => {
    const { call, api, events } = setup();
    api.connect.mockRejectedValueOnce(new Error('boom'));
    await call.start();
    expect(events.failed).toHaveBeenCalledOnce();
    expect(api.stop).not.toHaveBeenCalled();
    expect(call.state).toBe('ended');
  });

  it('an abandoned connect closes the session the server just opened', async () => {
    const { call, api } = setup();
    let resolve!: (v: { sessionToken: string; providerEpoch: number }) => void;
    api.connect.mockImplementationOnce(() => new Promise((r) => (resolve = r)));
    const started = call.start();
    const ended = call.end();
    resolve({ sessionToken: 'tok', providerEpoch: 7 });
    await started;
    await ended;
    expect(api.stop).toHaveBeenCalledWith(7);
  });
});
