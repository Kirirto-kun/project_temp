import type { Capabilities } from '@/contracts/api';
import { NO_MODEL, type ModelPorts } from '@/intelligence/ports';
import { Budget } from '@/server/limits/budget';
import { DEFAULT_LIMITS, Quota } from '@/server/limits/quota';
import type { IntakePort, PlatformDeps } from '@/server/platform';
import { MemoryKV } from '@/server/storage/kv';
import { MemoryAudioStore } from '@/server/voice/audio-store';
import type { ScribeClient, ScribeTranscript } from '@/server/voice/scribe';
import { RAISE_QUIZ } from '@/testing/fixtures';

export const ALL_ON: Capabilities = {
  voice: true,
  voiceAnalysis: true,
  rent: true,
  offer: true,
  bill: true,
  plan: true,
  customScenario: true,
  offerAnalysis: true,
  voiceClone: false,
  payments: true,
  avatarIntake: false,
  coachIntake: true,
  coachVoice: false,
  visualIntake: false,
  modelAssist: false,
};

export interface TestDeps extends PlatformDeps {
  clock: { now: number };
  tasks: (() => Promise<void>)[];
  memoryAudio: MemoryAudioStore;
  runTasks(): Promise<void>;
}

export function makeDeps(overrides: Partial<PlatformDeps> & { scribeTranscript?: ScribeTranscript; models?: ModelPorts; budgetMicros?: number | null } = {}): TestDeps {
  const clock = { now: Date.UTC(2026, 10, 15, 10, 0, 0) };
  const kv = new MemoryKV(() => clock.now);
  const tasks: (() => Promise<void>)[] = [];
  const memoryAudio = new MemoryAudioStore((key) => `/upload/${key}`, () => clock.now);
  const scribe: ScribeClient | null = overrides.scribeTranscript
    ? { transcribe: async () => overrides.scribeTranscript! }
    : { transcribe: async () => ({ text: '', languageCode: 'en', words: [] }) };
  const deps: TestDeps = {
    kv,
    models: overrides.models ?? NO_MODEL,
    quota: new Quota({ kv, limits: { ...DEFAULT_LIMITS, session: 50 }, now: () => new Date(clock.now) }),
    budget: new Budget(kv, overrides.budgetMicros === undefined ? null : overrides.budgetMicros, () => new Date(clock.now)),
    now: () => new Date(clock.now),
    signingSecret: 'test-only-signing-secret-0123456789abcdef',
    appUrl: 'https://holdline.test',
    capabilities: ALL_ON,
    intake: null,
    audio: memoryAudio,
    scribe,
    elevenlabs: { conversationToken: async () => 'conv-token', signedUrl: async () => 'wss://signed' },
    polar: { createCheckout: async () => ({ id: 'chk_1', url: 'https://polar.test/checkout/chk_1' }) },
    liveAvatar: null,
    schedule: (task) => {
      tasks.push(task);
    },
    clock,
    tasks,
    memoryAudio,
    async runTasks() {
      while (tasks.length) await tasks.shift()!();
    },
    ...overrides,
  } as TestDeps;
  return deps;
}

export const OWNER = 'own_AAAAAAAAAAAAAAAAAAAAAA';
export const OTHER = 'own_BBBBBBBBBBBBBBBBBBBBBB';
export const IP = 'iphash-test';

export const quizRequest = (patch: Partial<typeof RAISE_QUIZ> = {}) => ({ quiz: { ...RAISE_QUIZ, ...patch }, baselineId: null });

export function fakeIntake(port: Partial<IntakePort>): IntakePort {
  return {
    getConfirmedHandoff: async () => {
      throw new Error('not configured');
    },
    ensureMediaClosed: async () => undefined,
    ensureAudioAllowed: async () => undefined,
    ...port,
  };
}
