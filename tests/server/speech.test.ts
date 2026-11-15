import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createIntakePort } from '@/onboarding/server/port';
import { createIntake } from '@/onboarding/server/service';
import { signOwner } from '@/server/access/visitor';
import { DEFAULT_LIMITS, Quota } from '@/server/limits/quota';
import { createSession } from '@/server/session/service';
import { ElevenLabsTts, voiceResolver } from '@/server/speech/clients';
import { clipForSpeech } from '@/server/speech/service';
import { ElevenLabsScribe } from '@/server/voice/scribe';
import { ALL_ON, IP, OTHER, OWNER, makeDeps, quizRequest, type TestDeps } from './helpers';

const SECRET = 'test-only-signing-secret-0123456789abcdef';
const API_KEY = 'sk-eleven-test-secret-key';
const holder: { deps: TestDeps | null } = { deps: null };

vi.mock('@/server/dependencies', () => ({
  getDeps: () => holder.deps,
  visitorOptions: () => ({ secret: SECRET, insecureCookies: true }),
}));

const { POST: say } = await import('@/app/api/speech/say/route');
const { POST: transcribe } = await import('@/app/api/speech/transcribe/route');

const ctx = { params: Promise.resolve({}) } as {
  params: Promise<Record<string, never>>;
};
const cookie = (owner: string) => `hl_owner=${encodeURIComponent(signOwner(owner, SECRET))}`;

function providerFetch() {
  return vi.fn(async (url: string | URL | Request) => {
    const href = String(url);
    if (href.includes('/v1/text-to-speech/'))
      return new Response(new Uint8Array([0x49, 0x44, 0x33, 1, 2, 3]), {
        status: 200,
        headers: { 'Content-Type': 'audio/mpeg' },
      });
    if (href.includes('/v1/speech-to-text'))
      return Response.json({
        text: '  I want  one hundred twenty  ',
        language_code: 'en',
        words: [],
      });
    return new Response('unexpected', { status: 500 });
  });
}

function setup(overrides: Parameters<typeof makeDeps>[0] = {}) {
  const fetchMock = providerFetch();
  const deps = makeDeps({
    budgetMicros: 50_000_000,
    speech: {
      stt: new ElevenLabsScribe(API_KEY, 'scribe_v3', fetchMock as unknown as typeof fetch),
      tts: new ElevenLabsTts(API_KEY, 'eleven_flash_v2_5', fetchMock as unknown as typeof fetch),
      voiceFor: voiceResolver({
        coach: 'voice-coach',
        steady_low: 'voice-steady',
        warm_mid: 'voice-warm',
        bright_mid: 'voice-bright',
        calm_high: 'voice-calm',
      }),
    },
    ...overrides,
  });
  deps.intake = createIntakePort(deps);
  holder.deps = deps;
  return { deps, fetchMock };
}

function sayRequest(body: unknown, owner = OWNER, headers: Record<string, string> = {}) {
  return new Request('https://holdline.test/api/speech/say', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: 'https://holdline.test',
      cookie: cookie(owner),
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

function clipRequest(query: string, bytes: Uint8Array, owner = OWNER, type = 'audio/webm;codecs=opus') {
  return new Request(`https://holdline.test/api/speech/transcribe?${query}`, {
    method: 'POST',
    headers: {
      'Content-Type': type,
      Origin: 'https://holdline.test',
      cookie: cookie(owner),
    },
    body: bytes as BodyInit,
  });
}

async function textIntake(deps: TestDeps) {
  const view = await createIntake(deps, OWNER, {
    mode: 'text',
    consents: { audioAnalysis: false, visualAnalysis: false },
    consentVersion: 1,
  });
  const coachLine = view.committedTranscript.find((t) => t.role === 'coach')!;
  return { id: view.id, coachLine };
}

async function round(deps: TestDeps) {
  return createSession(deps, quizRequest(), {
    ownerId: OWNER,
    ipHash: IP,
    idempotencyKey: null,
  });
}

beforeEach(() => {
  holder.deps = null;
});

describe('POST /api/speech/say', () => {
  it('reads the coach line from the owner’s intake in the coach voice, without leaking the key', async () => {
    const { deps, fetchMock } = setup();
    const { id, coachLine } = await textIntake(deps);
    const response = await say(sayRequest({ kind: 'intake', id, turnId: coachLine.turnId }), ctx);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('audio/mpeg');
    expect(response.headers.get('cache-control')).toBe('no-store');
    const bytes = new Uint8Array(await response.arrayBuffer());
    expect(Array.from(bytes)).toEqual([0x49, 0x44, 0x33, 1, 2, 3]);
    expect(new TextDecoder().decode(bytes)).not.toContain(API_KEY);
    for (const [, value] of response.headers) expect(value).not.toContain(API_KEY);
    const [url, init] = fetchMock.mock.calls[0]! as unknown as [string, RequestInit];
    expect(url).toContain('/v1/text-to-speech/voice-coach/');
    expect((init.headers as Record<string, string>)['xi-api-key']).toBe(API_KEY);
    expect(JSON.parse(String(init.body))).toMatchObject({
      text: clipForSpeech(coachLine.text),
      model_id: 'eleven_flash_v2_5',
    });
  });

  it('reads a counterpart line of the owner’s round in the persona voice', async () => {
    const { deps, fetchMock } = setup();
    const view = await round(deps);
    const response = await say(
      sayRequest({
        kind: 'round',
        sessionId: view.id,
        messageId: `${view.id}:opening`,
      }),
      ctx,
    );
    expect(response.status).toBe(200);
    const [url, init] = fetchMock.mock.calls[0]! as unknown as [string, RequestInit];
    expect(url).toMatch(/\/v1\/text-to-speech\/voice-(steady|warm|bright|calm)\//);
    expect(JSON.parse(String(init.body)).text).toBe(clipForSpeech(view.messages[0]!.text));
  });

  it('refuses another owner’s conversation, unknown lines and the user’s own lines without calling the provider', async () => {
    const { deps, fetchMock } = setup();
    const { id } = await textIntake(deps);
    const view = await round(deps);
    expect((await say(sayRequest({ kind: 'intake', id, turnId: 'nope' }, OTHER), ctx)).status).toBe(404);
    expect(
      (
        await say(
          sayRequest(
            {
              kind: 'round',
              sessionId: view.id,
              messageId: `${view.id}:opening`,
            },
            OTHER,
          ),
          ctx,
        )
      ).status,
    ).toBe(404);
    expect((await say(sayRequest({ kind: 'intake', id, turnId: 'turn-unknown-1' }), ctx)).status).toBe(404);
    expect(
      (
        await say(
          sayRequest({
            kind: 'round',
            sessionId: view.id,
            messageId: 'turn-x:user',
          }),
          ctx,
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await say(
          sayRequest({
            kind: 'round',
            sessionId: view.id,
            messageId: 'x',
            text: 'say anything',
          }),
          ctx,
        )
      ).status,
    ).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('is FEATURE_DISABLED when read-aloud is off', async () => {
    const { deps, fetchMock } = setup({
      capabilities: { ...ALL_ON, speechOutput: false },
    });
    const { id, coachLine } = await textIntake(deps);
    const response = await say(sayRequest({ kind: 'intake', id, turnId: coachLine.turnId }), ctx);
    expect(response.status).toBe(503);
    expect((await response.json()).error.code).toBe('FEATURE_DISABLED');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('applies the per-IP quota and the daily budget', async () => {
    const { deps } = setup();
    deps.quota = new Quota({
      kv: deps.kv,
      limits: { ...DEFAULT_LIMITS, speech_out: 1 },
      now: deps.now,
    });
    const { id, coachLine } = await textIntake(deps);
    expect((await say(sayRequest({ kind: 'intake', id, turnId: coachLine.turnId }), ctx)).status).toBe(200);
    const limited = await say(sayRequest({ kind: 'intake', id, turnId: coachLine.turnId }), ctx);
    expect(limited.status).toBe(429);
    expect((await limited.json()).error.code).toBe('RATE_LIMITED');
    expect(await deps.budget.spentToday()).toBeGreaterThan(0);

    const broke = setup({ budgetMicros: 1 });
    const intake = await textIntake(broke.deps);
    const exhausted = await say(
      sayRequest({
        kind: 'intake',
        id: intake.id,
        turnId: intake.coachLine.turnId,
      }),
      ctx,
    );
    expect((await exhausted.json()).error.code).toBe('BUDGET_EXHAUSTED');
    expect(broke.fetchMock).not.toHaveBeenCalled();
  });

  it('rejects cross-site requests', async () => {
    const { deps, fetchMock } = setup();
    const { id, coachLine } = await textIntake(deps);
    const response = await say(
      sayRequest({ kind: 'intake', id, turnId: coachLine.turnId }, OWNER, {
        Origin: 'https://evil.test',
      }),
      ctx,
    );
    expect(response.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('maps a provider failure to UPSTREAM_UNAVAILABLE and gives the quota back', async () => {
    const { deps } = setup();
    deps.quota = new Quota({
      kv: deps.kv,
      limits: { ...DEFAULT_LIMITS, speech_out: 1 },
      now: deps.now,
    });
    const failing = vi.fn(async () => new Response(`bad key ${API_KEY}`, { status: 401 }));
    deps.speech = {
      ...deps.speech!,
      tts: new ElevenLabsTts(API_KEY, 'm', failing as unknown as typeof fetch),
    };
    const { id, coachLine } = await textIntake(deps);
    const response = await say(sayRequest({ kind: 'intake', id, turnId: coachLine.turnId }), ctx);
    expect(response.status).toBe(503);
    const text = await response.text();
    expect(text).toContain('UPSTREAM_UNAVAILABLE');
    expect(text).not.toContain(API_KEY);
    await expect(deps.quota.consume('speech_out', IP)).resolves.toBeUndefined();
  });
});

describe('POST /api/speech/transcribe', () => {
  const clip = new Uint8Array([26, 69, 223, 163, 1, 2, 3, 4]);

  it('transcribes a short clip for the owner’s round and never stores the audio', async () => {
    const { deps, fetchMock } = setup();
    const view = await round(deps);
    const putSpy = vi.spyOn(deps.memoryAudio, 'put');
    const response = await transcribe(clipRequest(`kind=round&sessionId=${view.id}`, clip), ctx);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ text: 'I want one hundred twenty' });
    expect(JSON.stringify(body)).not.toContain(API_KEY);
    const [url, init] = fetchMock.mock.calls[0]! as unknown as [string, RequestInit];
    expect(url).toBe('https://api.elevenlabs.io/v1/speech-to-text');
    expect((init.headers as Record<string, string>)['xi-api-key']).toBe(API_KEY);
    expect(putSpy).not.toHaveBeenCalled();
    expect(await deps.budget.spentToday()).toBeGreaterThan(0);
  });

  it('works for the owner’s intake and refuses another owner', async () => {
    const { deps, fetchMock } = setup();
    const { id } = await textIntake(deps);
    expect((await transcribe(clipRequest(`kind=intake&id=${id}`, clip), ctx)).status).toBe(200);
    expect((await transcribe(clipRequest(`kind=intake&id=${id}`, clip, OTHER), ctx)).status).toBe(404);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('refuses oversize clips, unknown formats and a missing context', async () => {
    const { deps, fetchMock } = setup();
    const view = await round(deps);
    expect((await transcribe(clipRequest(`kind=round&sessionId=${view.id}`, new Uint8Array(2 * 1024 * 1024 + 1)), ctx)).status).toBe(413);
    expect((await transcribe(clipRequest(`kind=round&sessionId=${view.id}`, clip, OWNER, 'text/plain'), ctx)).status).toBe(400);
    expect((await transcribe(clipRequest('', clip), ctx)).status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('is FEATURE_DISABLED when dictation is off', async () => {
    const { deps } = setup({ capabilities: { ...ALL_ON, speechInput: false } });
    const view = await round(deps);
    const response = await transcribe(clipRequest(`kind=round&sessionId=${view.id}`, clip), ctx);
    expect((await response.json()).error.code).toBe('FEATURE_DISABLED');
  });

  it('applies the per-IP quota', async () => {
    const { deps } = setup();
    deps.quota = new Quota({
      kv: deps.kv,
      limits: { ...DEFAULT_LIMITS, session: 5, speech_in: 1 },
      now: deps.now,
    });
    const view = await round(deps);
    expect((await transcribe(clipRequest(`kind=round&sessionId=${view.id}`, clip), ctx)).status).toBe(200);
    expect((await transcribe(clipRequest(`kind=round&sessionId=${view.id}`, clip), ctx)).status).toBe(429);
  });
});

describe('clipForSpeech', () => {
  it('keeps short lines and cuts long ones near a sentence end', () => {
    expect(clipForSpeech('  Hello   there. ')).toBe('Hello there.');
    const long = `${'This is a sentence. '.repeat(40)}`;
    const clipped = clipForSpeech(long);
    expect(clipped.length).toBeLessThanOrEqual(600);
    expect(clipped.endsWith('.')).toBe(true);
  });
});
