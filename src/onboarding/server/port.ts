import 'server-only';
import type { IntakePort, PlatformDeps } from '@/server/platform';
import { ApiError } from '@/server/http';
import { intakeStore, stopMedia } from './service';

/** The platform's view of the first-call vertical. Only confirmed, owner-bound handoffs leave it. */
export function createIntakePort(deps: PlatformDeps): IntakePort {
  return {
    async getConfirmedHandoff(intakeId, ownerId) {
      const session = await intakeStore(deps).readOwned(intakeId, ownerId);
      if (!session.handoff) throw new ApiError('PROFILE_INCOMPLETE', 'Confirm your brief before starting the practice.', { missingFields: [] });
      if (session.handoff.profileRevision !== session.profileRevision) throw new ApiError('PROFILE_STALE', 'Your brief changed after you confirmed it. Check it again.', { currentVersion: session.profileRevision });
      return session.handoff;
    },
    async ensureMediaClosed(intakeId, ownerId) {
      const session = await intakeStore(deps).read(intakeId);
      if (!session || session.ownerId !== ownerId) return;
      if (session.mediaStatus === 'active' || session.mediaStatus === 'connecting' || session.mediaStatus === 'stopping') await stopMedia(deps, ownerId, intakeId, 'handoff');
    },
    async ensureAudioAllowed(intakeId, ownerId) {
      const session = await intakeStore(deps).readOwned(intakeId, ownerId);
      if (!session.consents.audioAnalysis) throw new ApiError('INVALID_INPUT', 'Audio analysis is turned off for this coach session.');
    },
  };
}
