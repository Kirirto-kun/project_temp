import { CONTRACT_VERSION, LIMITS } from '@/contracts/domain';
import { INTAKE_CONTRACT_VERSION } from '@/contracts/intake';
import type { ConfigResponse } from '@/contracts/api';
import { getDeps } from '@/server/dependencies';
import { serverEnv } from '@/server/env';
import { json, route } from '@/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = route('config', async () => {
  const deps = getDeps();
  const env = serverEnv();
  const body: ConfigResponse = {
    contractVersion: CONTRACT_VERSION,
    intakeContractVersion: INTAKE_CONTRACT_VERSION,
    capabilities: deps.capabilities,
    sessionLimitSeconds: LIMITS.sessionLimitSeconds,
    intakeLimitSeconds: LIMITS.intakeLimitSeconds,
    paidProduct: deps.capabilities.payments && env.polar ? { productKey: 'conversation_pack', priceMinor: env.polar.priceMinor, currency: 'USD', billing: 'one_time' } : null,
  };
  return json(body);
});
