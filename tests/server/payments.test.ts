import { describe, expect, it } from 'vitest';
import { createCheckout, getEntitlement, handlePolarWebhook, reserveCredit } from '@/server/payments/entitlements';
import { signWebhookForTest, verifyWebhook } from '@/server/payments/webhooks';
import { IP, OWNER, makeDeps } from './helpers';

const SECRET = 'polar_whs_test_secret';
const PRODUCT = 'prod_123';

function event(deps: ReturnType<typeof makeDeps>, id: string, body: object) {
  const raw = JSON.stringify(body);
  const timestamp = String(Math.floor(deps.now().getTime() / 1000));
  return { raw, headers: { id, timestamp, signature: signWebhookForTest(raw, id, timestamp, SECRET) } };
}

const paid = (orderId: string, ownerId = OWNER, productId = PRODUCT) => ({ type: 'order.paid', data: { id: orderId, status: 'paid', product_id: productId, metadata: { owner_id: ownerId } } });

describe('webhook verification', () => {
  it('rejects bad signatures and stale timestamps', () => {
    const now = new Date();
    const ts = String(Math.floor(now.getTime() / 1000));
    const sig = signWebhookForTest('{}', 'evt_1', ts, SECRET);
    expect(verifyWebhook('{}', { id: 'evt_1', timestamp: ts, signature: sig }, SECRET, now)).toBe(true);
    expect(verifyWebhook('{"a":1}', { id: 'evt_1', timestamp: ts, signature: sig }, SECRET, now)).toBe(false);
    expect(verifyWebhook('{}', { id: 'evt_1', timestamp: String(Number(ts) - 3600), signature: sig }, SECRET, now)).toBe(false);
  });
});

describe('entitlements', () => {
  it('checkout leaves access pending; a paid event grants one pack once', async () => {
    const deps = makeDeps();
    await createCheckout(deps, OWNER, IP, PRODUCT);
    expect((await getEntitlement(deps, OWNER)).status).toBe('pending');
    await expect(reserveCredit(deps, OWNER, 'customScenariosRemaining')).rejects.toMatchObject({ code: 'ENTITLEMENT_REQUIRED' });
    const e = event(deps, 'evt_1', paid('ord_1'));
    expect(await handlePolarWebhook(deps, e.raw, e.headers, SECRET, PRODUCT)).toBe('ok');
    expect(await handlePolarWebhook(deps, e.raw, e.headers, SECRET, PRODUCT)).toBe('duplicate');
    const replayed = event(deps, 'evt_2', paid('ord_1'));
    expect(await handlePolarWebhook(deps, replayed.raw, replayed.headers, SECRET, PRODUCT)).toBe('duplicate');
    expect(await getEntitlement(deps, OWNER)).toEqual({ status: 'active', customScenariosRemaining: 1, offerAnalysesRemaining: 1 });
  });
  it('ignores another product, rejects an invalid signature and revokes on refund', async () => {
    const deps = makeDeps();
    const other = event(deps, 'evt_3', paid('ord_2', OWNER, 'prod_other'));
    expect(await handlePolarWebhook(deps, other.raw, other.headers, SECRET, PRODUCT)).toBe('ignored');
    await expect(handlePolarWebhook(deps, other.raw, { ...other.headers, signature: 'v1,bad' }, SECRET, PRODUCT)).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    const ok = event(deps, 'evt_4', paid('ord_3'));
    await handlePolarWebhook(deps, ok.raw, ok.headers, SECRET, PRODUCT);
    const refund = event(deps, 'evt_5', { type: 'order.refunded', data: { id: 'ord_3', metadata: { owner_id: OWNER } } });
    await handlePolarWebhook(deps, refund.raw, refund.headers, SECRET, PRODUCT);
    expect((await getEntitlement(deps, OWNER)).status).toBe('revoked');
  });
  it('a credit is consumed once and restored on failure', async () => {
    const deps = makeDeps();
    const ok = event(deps, 'evt_6', paid('ord_4'));
    await handlePolarWebhook(deps, ok.raw, ok.headers, SECRET, PRODUCT);
    const hold = await reserveCredit(deps, OWNER, 'offerAnalysesRemaining');
    await expect(reserveCredit(deps, OWNER, 'offerAnalysesRemaining')).rejects.toMatchObject({ code: 'ENTITLEMENT_REQUIRED' });
    await hold.restore();
    expect((await getEntitlement(deps, OWNER)).offerAnalysesRemaining).toBe(1);
  });
});
