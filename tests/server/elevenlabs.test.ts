import { describe, expect, it } from 'vitest';
import { issueVoiceCredentials, verifyBindingSignature } from '@/server/elevenlabs/bindings';
import { completionStream, lastUserTurn, parseChatRequest, resolveCompletion } from '@/server/elevenlabs/custom-llm';
import { changeMode, createSession, loadOwnedSession } from '@/server/session/service';
import { IP, OWNER, makeDeps, quizRequest } from './helpers';

async function voiceSession() {
  const deps = makeDeps();
  const view = await createSession(deps, quizRequest(), { ownerId: OWNER, ipHash: IP, idempotencyKey: null });
  const voice = await changeMode(deps, view.id, OWNER, 'voice', view.version);
  const token = await issueVoiceCredentials(deps, { ownerId: OWNER, ipHash: IP, sessionId: voice.id, connectionType: 'webrtc', voiceMap: { steady_low: 'voice-123' } });
  return { deps, sessionId: view.id, token };
}

const chat = (binding: unknown, users: string[]) =>
  parseChatRequest({
    stream: true,
    messages: [{ role: 'system', content: 'x' }, ...users.flatMap((u) => [{ role: 'user', content: u }, { role: 'assistant', content: 'ok' }]).slice(0, users.length * 2 - 1)],
    elevenlabs_extra_body: { binding },
  });

describe('voice credentials', () => {
  it('require voice mode and return a signed binding and the persona voice', async () => {
    const deps = makeDeps();
    const view = await createSession(deps, quizRequest(), { ownerId: OWNER, ipHash: IP, idempotencyKey: null });
    await expect(issueVoiceCredentials(deps, { ownerId: OWNER, ipHash: IP, sessionId: view.id, connectionType: 'webrtc', voiceMap: {} })).rejects.toMatchObject({ code: 'VERSION_CONFLICT' });
    const { token } = await voiceSession();
    expect(token.connectionType).toBe('webrtc');
    expect(token.voiceId).toBe('voice-123');
    expect(verifyBindingSignature('test-only-signing-secret-0123456789abcdef', token.sessionBinding, new Date(Date.UTC(2026, 10, 15, 10, 1)))).toBe(true);
    expect(JSON.stringify(token)).not.toContain('xi-api-key');
  });
  it('a new token rotates the binding', async () => {
    const { deps, sessionId, token } = await voiceSession();
    const second = await issueVoiceCredentials(deps, { ownerId: OWNER, ipHash: IP, sessionId, connectionType: 'websocket', voiceMap: {} });
    expect(second.sessionBinding.bindingId).not.toBe(token.sessionBinding.bindingId);
    const stale = await resolveCompletion(deps, chat(token.sessionBinding, ['I want 110k']));
    expect(stale.committed).toBe(false);
  });
});

describe('custom LLM callback', () => {
  it('a greeting request does not move the engine', async () => {
    const { deps, token } = await voiceSession();
    const result = await resolveCompletion(deps, parseChatRequest({ messages: [{ role: 'system', content: 'x' }], elevenlabs_extra_body: { binding: token.sessionBinding } }));
    expect(result.committed).toBe(false);
  });
  it('a retried callback commits exactly once; the same words on a later turn are a new turn', async () => {
    const { deps, sessionId, token } = await voiceSession();
    const request = chat(token.sessionBinding, ["I'm asking for $110,000 because I lead the team."]);
    const a = await resolveCompletion(deps, request);
    const b = await resolveCompletion(deps, request);
    expect(a.committed && b.committed).toBe(true);
    expect(b.text).toBe(a.text);
    expect((await loadOwnedSession(deps, sessionId, OWNER)).turns).toHaveLength(1);
    await resolveCompletion(deps, chat(token.sessionBinding, ["I'm asking for $110,000 because I lead the team.", "I'm asking for $110,000 because I lead the team."]));
    const session = await loadOwnedSession(deps, sessionId, OWNER);
    expect(session.turns).toHaveLength(2);
    expect(session.turns.map((t) => t.input.sourceTurnKey)).toEqual([`${token.sessionBinding.bindingId}:1`, `${token.sessionBinding.bindingId}:2`]);
  });
  it('rejects a forged binding', async () => {
    const { deps, token } = await voiceSession();
    const result = await resolveCompletion(deps, chat({ ...token.sessionBinding, signature: 'forged' }, ['I want 110k']));
    expect(result.committed).toBe(false);
  });
  it('reads the last user message from string or part content', () => {
    const request = parseChatRequest({ messages: [{ role: 'user', content: [{ type: 'text', text: 'hello there' }] }] });
    expect(lastUserTurn(request)).toEqual({ text: 'hello there', ordinal: 1 });
  });
});

describe('SSE', () => {
  it('streams OpenAI chunks with a buffer word first and ends with [DONE]', async () => {
    const { deps, token } = await voiceSession();
    const stream = completionStream(deps, chat(token.sessionBinding, ['Why is the budget fixed?']));
    const text = await new Response(stream).text();
    const events = text.trim().split('\n\n');
    expect(events[0]).toContain('"object":"chat.completion.chunk"');
    expect(events[0]).toContain('Hm');
    expect(events.at(-1)).toBe('data: [DONE]');
    expect(events.at(-2)).toContain('"finish_reason":"stop"');
  });
});
