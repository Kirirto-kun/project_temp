import 'server-only';
import type { PlanKey } from '@/content/plans';

export interface ServerEnv {
  nodeEnv: string;
  isProduction: boolean;
  appUrl: string | null;
  signingSecret: string;
  storageDriver: 'redis' | 'memory' | 'unconfigured';
  redis: { url: string; token: string } | null;
  allowInsecureCookies: boolean;
  anthropicKey: string | null;
  llmProvider: string;
  elevenlabs: { apiKey: string; agentId: string | null; customLlmSecret: string | null; sttModel: string; voiceMap: Record<string, string> } | null;
  openaiRealtime: { apiKey: string; model: string; voice: string } | null;
  s3: { endpoint: string; region: string; bucket: string; accessKeyId: string; secretAccessKey: string } | null;
  /** `products` maps each plan on /pricing to its Polar product; a plan without one cannot be bought. */
  polar: { accessToken: string; webhookSecret: string; products: Partial<Record<PlanKey, string>>; server: 'sandbox' | 'production'; priceMinor: number } | null;
  dailyBudgetMicros: number | null;
  sessionsPerIpPerDay: number;
  intakeAttemptsPerIpPerDay: number;
  intakeMessagesPerIpPerDay: number;
  voiceBaselinesPerIpPerDay: number;
  audioUploadsPerIpPerDay: number;
  demoPool: { token: string; sessions: number } | null;
}

function str(value: string | undefined): string | null {
  const v = value?.trim();
  return v ? v : null;
}

function int(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : fallback;
}

function parseVoiceMap(raw: string | null): Record<string, string> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return {};
    return Object.fromEntries(Object.entries(parsed as Record<string, unknown>).filter((e): e is [string, string] => typeof e[1] === 'string'));
  } catch {
    return {};
  }
}

let cached: ServerEnv | null = null;

export function readEnv(env: NodeJS.ProcessEnv = process.env): ServerEnv {
  const nodeEnv = env.NODE_ENV ?? 'development';
  const isProduction = nodeEnv === 'production';
  const redisUrl = str(env.UPSTASH_REDIS_REST_URL);
  const redisToken = str(env.UPSTASH_REDIS_REST_TOKEN);
  const redis = redisUrl && redisToken ? { url: redisUrl.replace(/\/$/, ''), token: redisToken } : null;
  const driverSetting = str(env.STORAGE_DRIVER)?.toLowerCase();
  const storageDriver: ServerEnv['storageDriver'] =
    driverSetting === 'memory' ? 'memory' : redis ? 'redis' : isProduction ? 'unconfigured' : 'memory';

  const secret = str(env.HOLDLINE_SIGNING_SECRET);
  const signingSecret = secret && secret.length >= 32 ? secret : isProduction ? '' : 'dev-only-signing-secret-change-me-0000000000';

  const elevenKey = str(env.ELEVENLABS_API_KEY);
  const s3Endpoint = str(env.S3_ENDPOINT);
  const s3Bucket = str(env.S3_BUCKET);
  const s3Key = str(env.S3_ACCESS_KEY_ID);
  const s3Secret = str(env.S3_SECRET_ACCESS_KEY);
  const polarToken = str(env.POLAR_ACCESS_TOKEN);
  const polarSecret = str(env.POLAR_WEBHOOK_SECRET);
  // POLAR_PRODUCT_PASS is the one-time 7-day trial, POLAR_PRODUCT_MEMBERSHIP the monthly plan, POLAR_PRODUCT_ANNUAL the annual plan.
  const polarProducts: Partial<Record<PlanKey, string>> = {};
  for (const [plan, value] of [['trial', env.POLAR_PRODUCT_PASS], ['monthly', env.POLAR_PRODUCT_MEMBERSHIP], ['annual', env.POLAR_PRODUCT_ANNUAL]] as const) {
    const id = str(value);
    if (id) polarProducts[plan] = id;
  }
  const openaiKey = str(env.OPENAI_API_KEY);
  const realtimeModel = str(env.OPENAI_REALTIME_MODEL);
  const budgetUsd = Number(env.DAILY_BUDGET_USD);
  const demoToken = str(env.DEMO_POOL_TOKEN);

  return {
    nodeEnv,
    isProduction,
    appUrl: str(env.APP_URL)?.replace(/\/$/, '') ?? null,
    signingSecret,
    storageDriver,
    redis,
    allowInsecureCookies: env.HOLDLINE_ALLOW_INSECURE_COOKIES === '1' || !isProduction,
    anthropicKey: str(env.ANTHROPIC_API_KEY),
    llmProvider: (str(env.LLM_PROVIDER) ?? 'anthropic').toLowerCase(),
    elevenlabs: elevenKey
      ? {
          apiKey: elevenKey,
          agentId: str(env.ELEVENLABS_AGENT_ID),
          customLlmSecret: str(env.ELEVENLABS_CUSTOM_LLM_SECRET),
          sttModel: str(env.ELEVENLABS_STT_MODEL) ?? 'scribe_v3',
          voiceMap: parseVoiceMap(str(env.ELEVENLABS_VOICE_MAP)),
        }
      : null,
    openaiRealtime: openaiKey && realtimeModel ? { apiKey: openaiKey, model: realtimeModel, voice: str(env.OPENAI_REALTIME_VOICE) ?? 'marin' } : null,
    s3:
      s3Endpoint && s3Bucket && s3Key && s3Secret
        ? { endpoint: s3Endpoint.replace(/\/$/, ''), region: str(env.S3_REGION) ?? 'auto', bucket: s3Bucket, accessKeyId: s3Key, secretAccessKey: s3Secret }
        : null,
    polar:
      polarToken && polarSecret && Object.keys(polarProducts).length > 0
        ? { accessToken: polarToken, webhookSecret: polarSecret, products: polarProducts, server: env.POLAR_SERVER === 'production' ? 'production' : 'sandbox', priceMinor: int(env.POLAR_PRICE_MINOR, 1_500) }
        : null,
    dailyBudgetMicros: Number.isFinite(budgetUsd) && budgetUsd > 0 ? Math.round(budgetUsd * 1_000_000) : null,
    sessionsPerIpPerDay: int(env.SESSIONS_PER_IP_PER_DAY, 3),
    intakeAttemptsPerIpPerDay: int(env.INTAKE_ATTEMPTS_PER_IP_PER_DAY, 3),
    intakeMessagesPerIpPerDay: int(env.INTAKE_MESSAGES_PER_IP_PER_DAY, 2000),
    voiceBaselinesPerIpPerDay: int(env.VOICE_BASELINES_PER_IP_PER_DAY, 6),
    audioUploadsPerIpPerDay: int(env.AUDIO_UPLOADS_PER_IP_PER_DAY, 20),
    demoPool: demoToken && demoToken.length >= 12 ? { token: demoToken, sessions: int(env.DEMO_POOL_SESSIONS, 10) } : null,
  };
}

export function serverEnv(): ServerEnv {
  if (!cached) cached = readEnv();
  return cached;
}

/** Tests only. */
export function resetServerEnvCache(): void {
  cached = null;
}
