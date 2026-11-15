import { afterEach, describe, expect, it } from 'vitest';
import { getDeps } from '@/server/dependencies';
import { readEnv, resetServerEnvCache } from '@/server/env';

const BASE = { STORAGE_DRIVER: 'memory', HOLDLINE_SIGNING_SECRET: 'test-only-signing-secret-0123456789abcdef' } as unknown as NodeJS.ProcessEnv;
const VARS = ['SESSIONS_PER_IP_PER_DAY', 'INTAKE_ATTEMPTS_PER_IP_PER_DAY', 'INTAKE_MESSAGES_PER_IP_PER_DAY', 'VOICE_BASELINES_PER_IP_PER_DAY', 'AUDIO_UPLOADS_PER_IP_PER_DAY'];

/** Builds the real composition root from the given environment, as a fresh process would. */
function depsWith(vars: Record<string, string>) {
  for (const name of VARS) delete process.env[name];
  Object.assign(process.env, vars);
  resetServerEnvCache();
  (globalThis as unknown as { __holdline?: { kv: unknown; audio: unknown; deps: unknown } }).__holdline!.deps = null;
  return getDeps();
}

async function accepted(consume: () => Promise<void>, attempts: number): Promise<number> {
  let ok = 0;
  for (let i = 0; i < attempts; i += 1) {
    try {
      await consume();
      ok += 1;
    } catch (error) {
      expect(error).toMatchObject({ code: 'RATE_LIMITED' });
    }
  }
  return ok;
}

afterEach(() => {
  for (const name of VARS) delete process.env[name];
  resetServerEnvCache();
});

describe('per-IP daily limits from the environment', () => {
  it('keeps the documented defaults when nothing is set', () => {
    const env = readEnv(BASE);
    expect([env.sessionsPerIpPerDay, env.intakeAttemptsPerIpPerDay, env.intakeMessagesPerIpPerDay, env.voiceBaselinesPerIpPerDay, env.audioUploadsPerIpPerDay]).toEqual([3, 3, 2000, 6, 20]);
  });

  it('the coach message limit follows INTAKE_MESSAGES_PER_IP_PER_DAY', async () => {
    const byDefault = depsWith({});
    expect(await accepted(() => byDefault.quota.consume('intake_message', 'ip-default'), 2005)).toBe(2000);
    const raised = depsWith({ INTAKE_MESSAGES_PER_IP_PER_DAY: '2000', SESSIONS_PER_IP_PER_DAY: '1000' });
    expect(await accepted(() => raised.quota.consume('intake_message', 'ip-raised'), 200)).toBe(200);
    expect(await accepted(() => raised.quota.consume('session', 'ip-raised'), 10)).toBe(10);
  });

  it('calibration and upload limits follow their variables; the others stay as they were', async () => {
    const deps = depsWith({ VOICE_BASELINES_PER_IP_PER_DAY: '9', AUDIO_UPLOADS_PER_IP_PER_DAY: '25' });
    expect(await accepted(() => deps.quota.consume('baseline', 'ip'), 30)).toBe(9);
    expect(await accepted(() => deps.quota.consume('upload', 'ip'), 30)).toBe(25);
    expect(await accepted(() => deps.quota.consume('analysis', 'ip'), 30)).toBe(6);
    expect(await accepted(() => deps.quota.consume('session', 'ip'), 30)).toBe(3);
  });
});
