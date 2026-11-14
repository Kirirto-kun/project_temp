import { describe, expect, it } from 'vitest';
import { assertSameOrigin, resolveVisitor, signOwner, verifyOwner } from '@/server/access/visitor';
import { ApiError } from '@/server/http';
import { createSession, loadOwnedSession } from '@/server/session/service';
import { toSessionView } from '@/server/session/view';
import { IP, OWNER, makeDeps, quizRequest } from './helpers';

const SECRET = 'test-only-signing-secret-0123456789abcdef';

describe('guest owner cookie', () => {
  it('issues a signed HttpOnly cookie and verifies it', () => {
    const visitor = resolveVisitor(new Request('https://holdline.test/api/x'), { secret: SECRET, insecureCookies: false });
    expect(visitor.headers['Set-Cookie']).toMatch(/HttpOnly/);
    expect(visitor.headers['Set-Cookie']).toMatch(/Secure/);
    expect(visitor.headers['Set-Cookie']).toMatch(/SameSite=Lax/);
    const cookie = visitor.headers['Set-Cookie']!.split(';')[0]!;
    const again = resolveVisitor(new Request('https://holdline.test/api/x', { headers: { cookie } }), { secret: SECRET, insecureCookies: false });
    expect(again.ownerId).toBe(visitor.ownerId);
    expect(again.headers).toEqual({});
  });
  it('rejects a forged cookie', () => {
    const forged = signOwner(OWNER, 'another-secret-another-secret-another');
    expect(verifyOwner(forged, SECRET)).toBeNull();
    expect(verifyOwner(`${OWNER}.abc`, SECRET)).toBeNull();
  });
});

describe('origin checks', () => {
  it('allows same origin and rejects others', () => {
    expect(() => assertSameOrigin(new Request('https://holdline.test/api/x', { method: 'POST', headers: { origin: 'https://holdline.test' } }), null)).not.toThrow();
    expect(() => assertSameOrigin(new Request('https://holdline.test/api/x', { method: 'POST', headers: { origin: 'https://evil.test' } }), null)).toThrow(ApiError);
    expect(() => assertSameOrigin(new Request('https://holdline.test/api/x', { method: 'POST', headers: { 'sec-fetch-site': 'cross-site' } }), null)).toThrow(ApiError);
  });
});

describe('public session view', () => {
  it('does not expose reservation, objection rules, owner or the snapshot', async () => {
    const deps = makeDeps();
    const view = await createSession(deps, quizRequest(), { ownerId: OWNER, ipHash: IP, idempotencyKey: null });
    const serialized = JSON.stringify(toSessionView(await loadOwnedSession(deps, view.id, OWNER)));
    for (const secret of ['reservationAmountMinor', 'clearedBy', 'ownerId', 'scenarioSnapshot', 'concessionStepMinor', OWNER]) {
      expect(serialized).not.toContain(secret);
    }
  });
});
