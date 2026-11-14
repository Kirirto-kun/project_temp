import 'server-only';
import type { Capabilities } from '@/contracts/api';
import type { IntakeHandoff } from '@/contracts/intake';
import type { ModelPorts } from '@/intelligence/ports';
import type { Budget } from './limits/budget';
import type { Quota } from './limits/quota';
import type { KeyValueStore } from './storage/kv';
import type { AudioStore } from './voice/audio-store';
import type { ScribeClient } from './voice/scribe';
import type { ElevenLabsAgentClient } from './elevenlabs/credentials';
import type { PolarClient } from './payments/polar';
import type { LiveAvatarClient } from '@/onboarding/server/liveavatar';

/** Port the first-call vertical (D) implements for the platform. */
export interface IntakePort {
  getConfirmedHandoff(intakeId: string, ownerId: string): Promise<IntakeHandoff>;
  ensureMediaClosed(intakeId: string, ownerId: string): Promise<void>;
  /** Throws unless the owner gave audio-analysis consent; optionally checks turn ids. */
  ensureAudioAllowed(intakeId: string, ownerId: string, turnIds?: string[]): Promise<void>;
}

/** Everything the platform services need, injected so tests can run without providers. */
export interface PlatformDeps {
  kv: KeyValueStore;
  models: ModelPorts;
  quota: Quota;
  budget: Budget;
  now: () => Date;
  signingSecret: string;
  appUrl: string | null;
  capabilities: Capabilities;
  intake: IntakePort | null;
  audio: AudioStore | null;
  scribe: ScribeClient | null;
  elevenlabs: ElevenLabsAgentClient | null;
  polar: PolarClient | null;
  liveAvatar: LiveAvatarClient | null;
  /** Runs work after the response is sent (Next.js after()); tests run it inline. */
  schedule: (task: () => Promise<void>) => void;
}
