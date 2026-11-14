import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';
import { afterEach, expect, test } from 'vitest';

const script = fileURLToPath(new URL('../../scripts/setup-local.mjs', import.meta.url));
const template = readFileSync(new URL('../../.env.example', import.meta.url), 'utf8');
const directories: string[] = [];
function workspace() {
  const path = mkdtempSync(join(tmpdir(), 'holdline-setup-'));
  directories.push(path);
  return path;
}
function run(cwd: string) {
  const result = spawnSync(process.execPath, [script], { cwd, encoding: 'utf8' });
  expect(result.status, result.stderr).toBe(0);
  return result.stdout;
}
afterEach(() => {
  for (const path of directories.splice(0)) {
    if (dirname(resolve(path)) !== resolve(tmpdir()) || !basename(path).startsWith('holdline-setup-')) throw new Error('Unexpected test cleanup path');
    rmSync(path, { recursive: true, force: true });
  }
});

test('fresh setup includes all template fields and generates matching local database credentials', () => {
  const cwd = workspace();
  const output = run(cwd);
  const env = parseEnv(readFileSync(join(cwd, '.env.local'), 'utf8'));
  expect(env).toHaveProperty('ELEVENLABS_API_KEY', '');
  for (const key of Object.keys(parseEnv(template))) expect(env).toHaveProperty(key);
  expect(env.DEV_DB_PASSWORD).toMatch(/^[a-f0-9]{48}$/);
  expect(new URL(env.DATABASE_URL ?? '').password).toBe(env.DEV_DB_PASSWORD);
  expect(new URL(env.TEST_DATABASE_URL ?? '').password).toBe(env.DEV_DB_PASSWORD);
  for (const key of ['OWNER_SECRET', 'TOKEN_ENCRYPTION_KEY', 'MAINTENANCE_SECRET']) {
    expect(env[key]).toMatch(/^[a-f0-9]{64}$/);
    expect(output).not.toContain(env[key]);
  }
  expect(output).not.toContain(env.DEV_DB_PASSWORD);
});

test('existing setup adds missing fields once and preserves credentials, comments and custom settings', () => {
  const cwd = workspace();
  const path = join(cwd, '.env.local');
  const existing = '# Keep my settings\r\nLIVEAVATAR_API_KEY=local-test-key\r\nLIVEAVATAR_AVATAR_ID=local-test-avatar\r\nOWNER_SECRET=existing-test-secret\r\nCUSTOM_SETTING="do not replace"\r\n';
  writeFileSync(path, existing);
  const output = run(cwd);
  const updated = readFileSync(path, 'utf8');
  expect(updated.startsWith(existing)).toBe(true);
  const env = parseEnv(updated);
  expect(env).toMatchObject({ LIVEAVATAR_API_KEY: 'local-test-key', LIVEAVATAR_AVATAR_ID: 'local-test-avatar', OWNER_SECRET: 'existing-test-secret', CUSTOM_SETTING: 'do not replace', ELEVENLABS_API_KEY: '' });
  expect(output).not.toContain('local-test-key');
  run(cwd);
  expect(readFileSync(path, 'utf8')).toBe(updated);
});
