/** One-time: stores the ElevenLabs key in LiveAvatar's secret store and prints its reference id. Never prints the key. */
import { z } from 'zod';

async function main() {
  const liveAvatarKey = process.env.LIVEAVATAR_API_KEY?.trim();
  const elevenLabsKey = process.env.ELEVENLABS_API_KEY?.trim();
  if (!liveAvatarKey) throw new Error('Add LIVEAVATAR_API_KEY to .env.local first.');
  if (!elevenLabsKey) throw new Error('Add ELEVENLABS_API_KEY to .env.local first.');
  const path = '/v1/secrets';
  let response: Response;
  try {
    response = await fetch(`https://api.liveavatar.com${path}`, {
      method: 'POST',
      headers: { 'X-API-KEY': liveAvatarKey, 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(15_000),
      body: JSON.stringify({ secret_type: 'ELEVENLABS_API_KEY', secret_name: 'Holdline Coach', secret_value: elevenLabsKey }),
    });
  } catch (err) {
    throw new Error(`POST ${path}: ${(err as Error).message}`);
  }
  if (!response.ok) throw new Error(`LiveAvatar rejected the secret (${response.status}). Check the account, key permissions and plan. No secret value is logged.`);
  const result = z.object({ code: z.literal(1000), data: z.object({ id: z.string().min(1) }) }).parse(await response.json());
  console.log('Secret registered. Add this reference id (not a key) to .env.local:');
  console.log(`LIVEAVATAR_ELEVENLABS_SECRET_ID=${result.data.id}`);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
