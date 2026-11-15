import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseEnv } from 'node:util';
import { expect, test } from 'vitest';

test('configure imports the documented voice_id response and reuses references without further requests', () => {
  const directory = mkdtempSync(join(tmpdir(), 'holdline-provider-'));
  try {
    const envPath = join(directory, '.env.local');
    writeFileSync(envPath, [
      'LIVEAVATAR_API_KEY=test-local-avatar-key',
      'ELEVENLABS_API_KEY=test-local-eleven-key',
      'LIVEAVATAR_ELEVENLABS_SECRET_ID=',
      'ELEVENLABS_VOICE_ID=',
      'LIVEAVATAR_VOICE_ID=',
      'LIVEAVATAR_VOICE_SOURCE=liveavatar-test',
    ].join('\n') + '\n');
    const mock = join(directory, 'provider.mjs');
    writeFileSync(mock, `globalThis.fetch = async (input, options) => {
      const url = new URL(String(input));
      console.log('MOCK_REQUEST:' + url.pathname);
      if (url.hostname === 'api.liveavatar.com' && url.pathname === '/v1/secrets')
        return Response.json({code:1000,data:{id:'stored-secret'}});
      if (url.hostname === 'api.elevenlabs.io' && url.pathname === '/v1/voices')
        return Response.json({voices:[{voice_id:'source-voice',name:'George',category:'premade'}]});
      if (url.hostname === 'api.liveavatar.com' && url.pathname === '/v1/voices/third_party') {
        const body = JSON.parse(options.body);
        if (body.secret_id !== 'stored-secret' || body.provider_voice_id !== 'source-voice')
          throw new Error('Incorrect voice binding request');
        return Response.json({code:100,data:{voice_id:'imported-voice'}});
      }
      throw new Error('Unexpected external request blocked by test');
    };`);
    const script = fileURLToPath(new URL('../../scripts/configure-liveavatar.ts', import.meta.url));
    const run = () => spawnSync(process.execPath, ['--import', 'tsx', '--import', pathToFileURL(mock).href, script, '--env-file', envPath], { encoding: 'utf8', timeout: 15000 });
    const first = run();
    expect(first.status, first.stderr).toBe(0);
    expect(parseEnv(readFileSync(envPath, 'utf8'))).toMatchObject({
      LIVEAVATAR_ELEVENLABS_SECRET_ID: 'stored-secret',
      ELEVENLABS_VOICE_ID: 'source-voice',
      LIVEAVATAR_VOICE_ID: 'imported-voice',
      LIVEAVATAR_VOICE_SOURCE: 'elevenlabs',
    });
    expect(first.stdout).not.toContain('test-local-eleven-key');
    const second = run();
    expect(second.status, second.stderr).toBe(0);
    expect(second.stdout).not.toContain('MOCK_REQUEST:');
  } finally {
    if (dirname(resolve(directory)) !== resolve(tmpdir()) || !basename(directory).startsWith('holdline-provider-')) throw new Error('Unexpected test cleanup path');
    rmSync(directory, { recursive: true, force: true });
  }
});
