import { AnalyzeRequestSchema } from '@/contracts/api';
import { mutationContext } from '@/server/api-context';
import { idempotencyKey, json, readBody, route } from '@/server/http';
import { startAnalysis } from '@/server/voice/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const maxDuration = 120;

export const POST = route('voice.analyze', async (request) => {
  const { deps, visitor } = mutationContext(request);
  idempotencyKey(request);
  const body = await readBody(request, AnalyzeRequestSchema);
  return json(await startAnalysis(deps, visitor.ownerId, visitor.ipHash, body), { status: 202, headers: visitor.headers });
});
