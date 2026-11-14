import { describe, expect, it, vi } from 'vitest';
import { createLiveAvatar, LiveAvatarError } from '@/onboarding/server/liveavatar';

const settings = { apiKey: 'la-key', avatarId: 'avatar-1', secretId: 'secret-1', agentId: 'agent_1', sandbox: true };
const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('LiveAvatar client', () => {
  it('mints a LITE token bound to the coach agent, with the key only in the header', async () => {
    const fetchImpl = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => reply(200, { code: 1000, data: { session_id: 'sess-1', session_token: 'tok-1' } }));
    const client = createLiveAvatar(settings, fetchImpl as unknown as typeof fetch);
    await expect(client.mintToken({ maxSeconds: 250.7 })).resolves.toEqual({ sessionId: 'sess-1', sessionToken: 'tok-1' });
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe('https://api.liveavatar.com/v1/sessions/token');
    expect(init?.method).toBe('POST');
    expect((init?.headers as Record<string, string>)['X-API-KEY']).toBe('la-key');
    expect(JSON.parse(String(init?.body))).toEqual({
      mode: 'LITE',
      avatar_id: 'avatar-1',
      is_sandbox: true,
      max_session_duration: 250,
      video_settings: { quality: 'high', encoding: 'H264' },
      elevenlabs_agent_config: { secret_id: 'secret-1', agent_id: 'agent_1' },
    });
  });

  it('clamps the session length to 1..300 seconds', async () => {
    const fetchImpl = vi.fn(async () => reply(200, { code: 1000, data: { session_id: 's', session_token: 't' } }));
    const client = createLiveAvatar(settings, fetchImpl as unknown as typeof fetch);
    await client.mintToken({ maxSeconds: 9_999 });
    await client.mintToken({ maxSeconds: 0.2 });
    const bodies = fetchImpl.mock.calls.map((c) => JSON.parse(String((c as unknown as [string, RequestInit])[1].body)));
    expect(bodies.map((b) => b.max_session_duration)).toEqual([300, 1]);
  });

  it('rejects provider errors and unexpected bodies', async () => {
    await expect(createLiveAvatar(settings, (async () => reply(402, { code: 4002 })) as unknown as typeof fetch).mintToken({ maxSeconds: 60 })).rejects.toBeInstanceOf(LiveAvatarError);
    await expect(createLiveAvatar(settings, (async () => reply(200, { code: 1000, data: {} })) as unknown as typeof fetch).mintToken({ maxSeconds: 60 })).rejects.toBeInstanceOf(LiveAvatarError);
  });

  it('stops a session; unknown or already-ended sessions count as stopped', async () => {
    for (const status of [200, 400, 404, 409]) {
      const fetchImpl = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => reply(status, {}));
      await expect(createLiveAvatar(settings, fetchImpl as unknown as typeof fetch).stopSession('sess-1')).resolves.toBeUndefined();
      const [url, init] = fetchImpl.mock.calls[0]!;
      expect(url).toBe('https://api.liveavatar.com/v1/sessions/stop');
      expect(JSON.parse(String(init?.body))).toEqual({ session_id: 'sess-1', reason: 'USER_CLOSED' });
    }
    await expect(createLiveAvatar(settings, (async () => reply(500, {})) as unknown as typeof fetch).stopSession('sess-1')).rejects.toBeInstanceOf(LiveAvatarError);
  });
});
