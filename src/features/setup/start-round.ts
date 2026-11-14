import type { CreateSessionRequest } from '@/contracts/api';
import { buildQuizAnswers } from '@/domain/intake-handoff';
import { createSession } from '@/client/api/session';
import type { DraftState } from '@/client/storage/draft';

/** Creates the practice session from the confirmed intake profile or from the quick form. */
export async function startRound(state: DraftState, baselineId: string | null) {
  if (!state.avatarId) throw new Error('Choose a counterpart first.');
  const request: CreateSessionRequest = state.intake
    ? { intakeId: state.intake.intakeId, profileRevision: state.intake.profileRevision, avatarId: state.avatarId, baselineId }
    : { quiz: buildQuizAnswers(state.draft, state.avatarId), baselineId };
  return createSession(request);
}
