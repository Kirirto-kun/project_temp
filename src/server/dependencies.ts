import { existsSync } from 'node:fs';
import path from 'node:path';
import 'server-only';
import { after } from 'next/server';
import { NO_MODEL } from '@/intelligence/ports';
import { createIntakePort } from '@/onboarding/server/port';
import { computeCapabilities } from './capabilities';
import { ElevenLabsAgentCredentials } from './elevenlabs/credentials';
import { serverEnv, type ServerEnv } from './env';
import { ApiError } from './http';
import { hmac } from './ids';
import { Budget, tokenCostMicros } from './limits/budget';
import { DEFAULT_LIMITS, Quota } from './limits/quota';
import { modelPortsFromEnv } from './llm/provider';
import { logEvent } from './observability';
import { PolarApi } from './payments/polar';
import type { PlatformDeps } from './platform';
import { MemoryKV, UpstashKV, type KeyValueStore } from './storage/kv';
import { MemoryAudioStore, S3AudioStore, type AudioStore } from './voice/audio-store';
import { ElevenLabsScribe } from './voice/scribe';

interface Singletons {
  kv: KeyValueStore | null;
  audio: AudioStore | null;
  deps: PlatformDeps | null;
}

const globalStore = globalThis as unknown as { __holdline?: Singletons };
const singletons: Singletons = (globalStore.__holdline ??= { kv: null, audio: null, deps: null });

export function memoryUploadToken(secret: string, key: string): string {
  return hmac(secret, `upload:${key}`);
}

function buildKv(env: ServerEnv): KeyValueStore {
  if (env.storageDriver === 'redis' && env.redis) return new UpstashKV(env.redis.url, env.redis.token);
  if (env.storageDriver === 'memory') return new MemoryKV();
  throw new ApiError('FEATURE_DISABLED', 'Storage is not configured. Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN.');
}

function buildAudio(env: ServerEnv): AudioStore | null {
  if (env.s3) return new S3AudioStore(env.s3);
  if (env.storageDriver === 'memory') {
    return new MemoryAudioStore((key) => `/api/audio/blob?key=${encodeURIComponent(key)}&token=${memoryUploadToken(env.signingSecret, key)}`);
  }
  return null;
}

function schedule(task: () => Promise<void>) {
  const run = () =>
    task().catch((error: unknown) => logEvent('error', 'background_task_failed', { message: error instanceof Error ? error.message : 'unknown' }));
  try {
    after(run);
  } catch {
    void run();
  }
}

/** The on-device body-language models and wasm are fetched by `npm run vision:assets` and are not in git. */
function visionAssetsPresent(): boolean {
  const base = path.join(process.cwd(), 'public', 'intake');
  return ['models/pose_landmarker_lite.task', 'models/face_landmarker.task', 'wasm/vision_wasm_internal.js'].every((file) => existsSync(path.join(base, file)));
}

/** Composition root: the only place that reads the environment and picks implementations. */
export function getDeps(): PlatformDeps {
  if (singletons.deps) return singletons.deps;
  const env = serverEnv();
  if (!env.signingSecret) throw new ApiError('FEATURE_DISABLED', 'HOLDLINE_SIGNING_SECRET is missing or shorter than 32 characters.');
  const kv = (singletons.kv ??= buildKv(env));
  const audio = (singletons.audio ??= buildAudio(env));
  const budget = new Budget(kv, env.dailyBudgetMicros);
  const capabilities = computeCapabilities(env, { durable: kv.durable, audio: audio !== null, visionAssets: env.visualIntake && visionAssetsPresent() });
  const spend = {
    reserve: async (micros: number) => {
      const reservation = await budget.reserve('llm', micros);
      return { settle: (actual: number) => budget.reconcile(reservation, actual) };
    },
    cost: tokenCostMicros,
  };
  const models = capabilities.modelAssist ? modelPortsFromEnv(process.env, undefined, spend) : NO_MODEL;
  const quota = new Quota({
    kv,
    limits: { ...DEFAULT_LIMITS, session: env.sessionsPerIpPerDay, intake: env.intakeAttemptsPerIpPerDay },
    demoPool: env.demoPool ? { isMember: async (ownerId) => (await kv.get(`demo:${ownerId}`)) === '1', size: env.demoPool.sessions } : null,
  });
  const deps: PlatformDeps = {
    kv,
    models,
    quota,
    budget,
    now: () => new Date(),
    signingSecret: env.signingSecret,
    appUrl: env.appUrl,
    capabilities,
    intake: null,
    audio,
    scribe: env.elevenlabs && capabilities.voiceAnalysis ? new ElevenLabsScribe(env.elevenlabs.apiKey, env.elevenlabs.sttModel) : null,
    elevenlabs: env.elevenlabs?.agentId && capabilities.voice ? new ElevenLabsAgentCredentials(env.elevenlabs.apiKey, env.elevenlabs.agentId) : null,
    polar: env.polar && capabilities.payments ? new PolarApi(env.polar.accessToken, env.polar.server) : null,
    schedule,
  };
  deps.intake = createIntakePort(deps);
  singletons.deps = deps;
  return deps;
}

export function visitorOptions() {
  const env = serverEnv();
  return { secret: env.signingSecret, insecureCookies: env.allowInsecureCookies };
}
