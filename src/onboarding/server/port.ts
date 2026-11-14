import 'server-only';
import type { IntakePort, PlatformDeps } from '@/server/platform';
import { ApiError } from '@/server/http';

/** Facade until the intake vertical is wired: every call reports the feature as unavailable. */
export function createIntakePort(_deps: PlatformDeps): IntakePort {
  const unavailable = async (): Promise<never> => {
    throw new ApiError('FEATURE_DISABLED', 'The coach intake is not available.');
  };
  return { getConfirmedHandoff: unavailable, ensureMediaClosed: async () => undefined, ensureAudioAllowed: unavailable };
}
