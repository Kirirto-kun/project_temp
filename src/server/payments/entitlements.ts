import 'server-only';
import type { EntitlementResponse } from '@/contracts/api';
import { ApiError } from '../http';
import type { PlatformDeps } from '../platform';
import { readJson, updateJson } from '../storage/kv';
import { verifyWebhook, type WebhookHeaders } from './webhooks';

export interface EntitlementRecord {
  ownerId: string;
  status: EntitlementResponse['status'];
  customScenariosRemaining: number;
  offerAnalysesRemaining: number;
  orders: { orderId: string; refunded: boolean; paidAt: string }[];
}

export type Credit = 'customScenariosRemaining' | 'offerAnalysesRemaining';

const PACK = { customScenariosRemaining: 1, offerAnalysesRemaining: 1 } as const;
const entKey = (ownerId: string) => `ent:${ownerId}`;

const EMPTY = (ownerId: string): EntitlementRecord => ({ ownerId, status: 'none', customScenariosRemaining: 0, offerAnalysesRemaining: 0, orders: [] });

export async function getEntitlement(deps: PlatformDeps, ownerId: string): Promise<EntitlementResponse> {
  const record = (await readJson<EntitlementRecord>(deps.kv, entKey(ownerId))) ?? EMPTY(ownerId);
  return { status: record.status, customScenariosRemaining: record.customScenariosRemaining, offerAnalysesRemaining: record.offerAnalysesRemaining };
}

export async function createCheckout(deps: PlatformDeps, ownerId: string, ipHash: string, productId: string) {
  if (!deps.capabilities.payments || !deps.polar || !deps.appUrl) throw new ApiError('FEATURE_DISABLED', 'Payments are not enabled.');
  await deps.quota.consume('checkout', ipHash, ownerId);
  const checkout = await deps.polar.createCheckout({ productId, ownerId, successUrl: `${deps.appUrl}/pricing?checkout=success` }).catch(() => {
    throw new ApiError('UPSTREAM_UNAVAILABLE', 'Checkout is not reachable right now.', {}, 30);
  });
  await deps.kv.set(`chk:${checkout.id}`, JSON.stringify({ ownerId, createdAt: deps.now().toISOString() }), { ttlSeconds: 7 * 86_400 });
  await updateJson<EntitlementRecord>(deps.kv, entKey(ownerId), (current) => {
    const record = current ?? EMPTY(ownerId);
    return record.status === 'active' ? null : { ...record, status: 'pending' };
  });
  return { checkoutUrl: checkout.url, checkoutId: checkout.id };
}

interface PolarEvent {
  type?: string;
  data?: { id?: string; status?: string; product_id?: string; metadata?: Record<string, unknown>; checkout_id?: string | null };
}

/**
 * Handles a Polar webhook: signature first, then event-id and order-id deduplication; grants
 * one pack per paid order of a configured product for the owner bound at checkout.
 */
export async function handlePolarWebhook(deps: PlatformDeps, rawBody: string, headers: WebhookHeaders, secret: string, productId: string | readonly string[]): Promise<'ok' | 'duplicate' | 'ignored'> {
  const products = typeof productId === 'string' ? [productId] : productId;
  if (!verifyWebhook(rawBody, headers, secret, deps.now())) throw new ApiError('UNAUTHORIZED', 'Invalid webhook signature.');
  const eventKey = `whk:${headers.id}`;
  if (!(await deps.kv.set(eventKey, '1', { nx: true, ttlSeconds: 30 * 86_400 }))) return 'duplicate';
  let event: PolarEvent;
  try {
    event = JSON.parse(rawBody) as PolarEvent;
  } catch {
    return 'ignored';
  }
  const order = event.data;
  if (!order?.id) return 'ignored';
  let ownerId = typeof order.metadata?.owner_id === 'string' ? (order.metadata.owner_id as string) : null;
  if (!ownerId && order.checkout_id) ownerId = (await readJson<{ ownerId: string }>(deps.kv, `chk:${order.checkout_id}`))?.ownerId ?? null;
  if (!ownerId || !/^own_[\w-]{22}$/.test(ownerId)) return 'ignored';

  if (event.type === 'order.paid' || (event.type === 'order.updated' && order.status === 'paid')) {
    if (!order.product_id || !products.includes(order.product_id)) return 'ignored';
    if (!(await deps.kv.set(`ord:${order.id}`, ownerId, { nx: true }))) return 'duplicate';
    await updateJson<EntitlementRecord>(deps.kv, entKey(ownerId), (current) => {
      const record = current ?? EMPTY(ownerId!);
      return {
        ...record,
        status: 'active',
        customScenariosRemaining: record.customScenariosRemaining + PACK.customScenariosRemaining,
        offerAnalysesRemaining: record.offerAnalysesRemaining + PACK.offerAnalysesRemaining,
        orders: [...record.orders, { orderId: order.id!, refunded: false, paidAt: deps.now().toISOString() }],
      };
    });
    return 'ok';
  }
  if (event.type === 'order.refunded' || (event.type === 'order.updated' && order.status === 'refunded')) {
    await updateJson<EntitlementRecord>(deps.kv, entKey(ownerId), (current) => {
      if (!current) return null;
      const target = current.orders.find((o) => o.orderId === order.id && !o.refunded);
      if (!target) return null;
      const orders = current.orders.map((o) => (o === target ? { ...o, refunded: true } : o));
      const live = orders.filter((o) => !o.refunded).length;
      return {
        ...current,
        orders,
        status: live > 0 ? 'active' : 'revoked',
        customScenariosRemaining: Math.max(0, current.customScenariosRemaining - PACK.customScenariosRemaining),
        offerAnalysesRemaining: Math.max(0, current.offerAnalysesRemaining - PACK.offerAnalysesRemaining),
      };
    });
    return 'ok';
  }
  return 'ignored';
}

/**
 * Reserves one credit before a paid operation; `restore` gives it back if the operation fails.
 * Server state is the only source of truth: no browser flag can grant access.
 */
export async function reserveCredit(deps: PlatformDeps, ownerId: string, credit: Credit): Promise<{ restore: () => Promise<void> }> {
  const { written } = await updateJson<EntitlementRecord>(deps.kv, entKey(ownerId), (current) => {
    if (!current || current.status !== 'active' || current[credit] <= 0) return null;
    return { ...current, [credit]: current[credit] - 1 };
  });
  if (!written) throw new ApiError('ENTITLEMENT_REQUIRED', 'This uses a conversation pack. See pricing for details.');
  return {
    restore: async () => {
      await updateJson<EntitlementRecord>(deps.kv, entKey(ownerId), (current) => (current ? { ...current, [credit]: current[credit] + 1 } : null));
    },
  };
}
