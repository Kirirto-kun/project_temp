import { describe, expect, it } from 'vitest';
import { computeCapabilities } from '@/server/capabilities';
import { readEnv } from '@/server/env';

const VALUES = {
  LIVEAVATAR_API_KEY: 'la-key',
  LIVEAVATAR_AVATAR_ID: 'dd73ea75-1218-4ef3-92ce-606d5f7fbc0a',
  LIVEAVATAR_VOICE_ID: 'voice-1',
};
const env = (extra: Record<string, string>) => readEnv({ NODE_ENV: 'development', ...VALUES, ...extra } as NodeJS.ProcessEnv);

describe('avatar call flag', () => {
  it('is off unless asked for', () => {
    expect(readEnv({ NODE_ENV: 'development', ...VALUES } as NodeJS.ProcessEnv).liveAvatar).toBeNull();
    expect(env({ AVATAR_CALL: 'off' }).liveAvatar).toBeNull();
  });

  it('dev runs in the sandbox by default and can opt out for full-length calls', () => {
    expect(env({ AVATAR_CALL: 'dev' }).liveAvatar).toEqual({ mode: 'dev', apiKey: 'la-key', avatarId: VALUES.LIVEAVATAR_AVATAR_ID, voiceId: 'voice-1', sandbox: true });
    expect(env({ AVATAR_CALL: 'dev', LIVEAVATAR_SANDBOX: 'false' }).liveAvatar?.sandbox).toBe(false);
  });

  it('dev is refused in production', () => {
    expect(env({ AVATAR_CALL: 'dev', NODE_ENV: 'production' }).liveAvatar).toBeNull();
  });

  it('on needs the approved custom avatar and never uses the sandbox', () => {
    expect(env({ AVATAR_CALL: 'on' }).liveAvatar).toBeNull();
    expect(env({ AVATAR_CALL: 'on', LIVEAVATAR_AVATAR_APPROVED: 'true', LIVEAVATAR_SANDBOX: 'true' }).liveAvatar).toMatchObject({ mode: 'on', sandbox: false });
  });

  it.each(Object.keys(VALUES))('is off when %s is missing', (name) => {
    expect(env({ AVATAR_CALL: 'dev', [name]: '' }).liveAvatar).toBeNull();
  });

  it('advertises avatarIntake only when configured and spend is allowed', () => {
    const storage = { durable: true, audio: true };
    expect(computeCapabilities(env({ AVATAR_CALL: 'dev' }), storage).avatarIntake).toBe(true);
    expect(computeCapabilities(env({}), storage).avatarIntake).toBe(false);
    const prodNoCeiling = readEnv({ NODE_ENV: 'production', AVATAR_CALL: 'on', LIVEAVATAR_AVATAR_APPROVED: 'true', ...VALUES } as NodeJS.ProcessEnv);
    expect(computeCapabilities(prodNoCeiling, storage).avatarIntake).toBe(false);
  });
});
