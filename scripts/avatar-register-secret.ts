/** One-time: stores the ElevenLabs key in LiveAvatar's secret store and prints its reference id. Never prints the key. */
import { z } from 'zod';

async function main() {
  const env = z.object({ LIVEAVATAR_API_KEY: z.string().min(1), ELEVENLABS_API_KEY: z.string().min(1) }).safeParse(process.env);
  if (!env.success) throw new Error('Add LIVEAVATAR_API_KEY and ELEVENLABS_API_KEY to .env.local first.');
  const response = await fetch('https://api.liveavatar.com/v1/secrets', {
    method: 'POST',
    headers: { 'X-API-KEY': env.data.LIVEAVATAR_API_KEY, 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(15_000),
    body: JSON.stringify({ secret_type: 'ELEVENLABS_API_KEY', secret_name: 'Holdline Coach', secret_value: env.data.ELEVENLABS_API_KEY }),
  });
  if (!response.ok) throw new Error(`LiveAvatar rejected the secret (${response.status}). Check the account, key permissions and plan. No secret value is logged.`);
  const result = z.object({ code: z.literal(1000), data: z.object({ id: z.string().min(1) }) }).parse(await response.json());
  console.log('Secret registered. Add this reference id (not a key) to .env.local:');
  console.log(`LIVEAVATAR_ELEVENLABS_SECRET_ID=${result.data.id}`);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
