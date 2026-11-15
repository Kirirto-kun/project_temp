import type { Capabilities } from '@/contracts/api';
import type { ServerEnv } from './env';

/**
 * Only capabilities whose whole vertical is configured are advertised. In production, paid
 * providers stay off without a global daily spending ceiling.
 */
export function computeCapabilities(env: ServerEnv, storage: { durable: boolean; audio: boolean; visionAssets?: boolean }): Capabilities {
  const spendOk = !env.isProduction || env.dailyBudgetMicros !== null;
  const model = spendOk && env.llmProvider !== 'none' && env.anthropicKey !== null;
  const eleven = env.elevenlabs;
  const voice = spendOk && Boolean(eleven?.agentId && eleven.customLlmSecret);
  const voiceAnalysis = spendOk && Boolean(eleven) && storage.audio;
  // Entitlements live in the KV. An explicitly chosen memory driver is accepted for a demo deployment:
  // access granted by a webhook is then lost on restart.
  const payments = Boolean(env.polar) && (storage.durable || env.storageDriver === 'memory') && Boolean(env.appUrl);
  return {
    voice,
    voiceAnalysis,
    rent: true,
    offer: true,
    bill: true,
    plan: true,
    customScenario: payments && model,
    offerAnalysis: payments,
    voiceClone: false,
    payments,
    avatarIntake: spendOk && env.liveAvatar !== null,
    coachIntake: true,
    coachVoice: spendOk && env.openaiRealtime !== null,
    // Runs only in the browser; advertised only when switched on and the model files are deployed.
    visualIntake: env.visualIntake && storage.visionAssets === true,
    modelAssist: model,
  };
}
