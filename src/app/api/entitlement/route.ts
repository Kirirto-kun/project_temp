import { readContext } from '@/server/api-context';
import { json, route } from '@/server/http';
import { getEntitlement } from '@/server/payments/entitlements';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = route('entitlement', async (request) => {
  const { deps, visitor } = readContext(request);
  return json(await getEntitlement(deps, visitor.ownerId), { headers: visitor.headers });
});
