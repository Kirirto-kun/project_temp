/**
 * Sets LIVEAVATAR_VOICE_ID in .env.local for the video coach (ported from the
 * codex/holdline-avatar-intake branch's configure-liveavatar script).
 *
 *   npm run avatar:setup-voice                  # import an ElevenLabs voice into LiveAvatar
 *   npm run avatar:setup-voice -- --sandbox     # use the sandbox avatar's built-in voice (no ElevenLabs)
 *
 * Writes to your LiveAvatar account (a secret and an imported voice) unless --sandbox is passed.
 * Prints only reference ids, never keys. Starts no session and buys nothing.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import { z } from 'zod';

const PATH = '.env.local';
const SANDBOX_AVATAR = 'dd73ea75-1218-4ef3-92ce-606d5f7fbc0a';
const Id = z.string().min(1).max(120).regex(/^[\w-]+$/);

async function main() {
  const env: Record<string, string | undefined> = { ...process.env, ...parseEnv(await readFile(PATH, 'utf8').catch(() => '')) };
  const sandbox = process.argv.includes('--sandbox');
  const need = sandbox ? ['LIVEAVATAR_API_KEY'] : ['LIVEAVATAR_API_KEY', 'ELEVENLABS_API_KEY'];
  for (const key of need) if (!env[key]?.trim()) throw new Error(`Fill ${key} in ${PATH} first.`);

  async function save(name: string, value: string) {
    let content = await readFile(PATH, 'utf8').catch(() => '');
    const line = new RegExp(`^${name}=.*$`, 'm');
    content = line.test(content) ? content.replace(line, () => `${name}=${value}`) : `${content}${content && !content.endsWith('\n') ? '\n' : ''}${name}=${value}\n`;
    await writeFile(PATH, content, { mode: 0o600 });
    env[name] = value;
  }

  async function liveAvatar(operation: string, path: string, init: { method?: string; body?: unknown } = {}): Promise<Record<string, unknown>> {
    const response = await fetch(`https://api.liveavatar.com${path}`, {
      method: init.method ?? 'POST',
      headers: { 'X-API-KEY': env.LIVEAVATAR_API_KEY!.trim(), 'Content-Type': 'application/json' },
      ...(init.body ? { body: JSON.stringify(init.body) } : {}),
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error(`${operation} failed (HTTP ${response.status}). Check the key's access; nothing secret was logged.`);
    const result = (await response.json()) as { code?: number; data?: Record<string, unknown> };
    if (result.code !== 1000 && result.code !== 100) throw new Error(`${operation} was not acknowledged by LiveAvatar.`);
    return result.data ?? {};
  }

  if (sandbox) {
    const avatar = await liveAvatar('Read the sandbox avatar', `/v1/avatars/${SANDBOX_AVATAR}`, { method: 'GET' });
    await save('LIVEAVATAR_VOICE_ID', Id.parse((avatar.default_voice as { id?: unknown } | undefined)?.id));
    console.log(`Using the sandbox avatar's built-in voice. LIVEAVATAR_VOICE_ID saved in ${PATH}.`);
  } else {
    let secretId = env.LIVEAVATAR_ELEVENLABS_SECRET_ID?.trim();
    if (!secretId) {
      const secret = await liveAvatar('Register the ElevenLabs key', '/v1/secrets', { body: { secret_type: 'ELEVENLABS_API_KEY', secret_name: 'Holdline coach voice', secret_value: env.ELEVENLABS_API_KEY!.trim() } });
      secretId = Id.parse(secret.id);
      await save('LIVEAVATAR_ELEVENLABS_SECRET_ID', secretId);
    }
    let voiceId = env.ELEVENLABS_VOICE_ID?.trim();
    if (!voiceId) {
      const response = await fetch('https://api.elevenlabs.io/v1/voices', { headers: { 'xi-api-key': env.ELEVENLABS_API_KEY!.trim() }, signal: AbortSignal.timeout(10_000) });
      if (!response.ok) throw new Error('Cannot list ElevenLabs voices. Give the key "Voices: Read" or set ELEVENLABS_VOICE_ID.');
      const { voices = [] } = (await response.json()) as { voices?: { voice_id: string; name: string; category?: string }[] };
      const premade = voices.filter((v) => v.category === 'premade');
      const pick = premade.find((v) => v.name === 'George') ?? premade[0];
      if (!pick) throw new Error('Set ELEVENLABS_VOICE_ID to a voice from your ElevenLabs account.');
      voiceId = Id.parse(pick.voice_id);
      await save('ELEVENLABS_VOICE_ID', voiceId);
      console.log(`Picked the premade ElevenLabs voice "${pick.name}".`);
    }
    const imported = await liveAvatar('Import the voice', '/v1/voices/third_party', { body: { secret_id: secretId, provider_voice_id: voiceId, name: 'Holdline Alex' } });
    await save('LIVEAVATAR_VOICE_ID', Id.parse(imported.voice_id));
    console.log(`Voice imported. LIVEAVATAR_VOICE_ID saved in ${PATH}.`);
  }
  console.log('Restart `npm run dev` to pick it up.');
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Voice setup failed.');
  process.exitCode = 1;
});
