import type { Capabilities } from '@/contracts/api';
import type { IntakeSession, IntakeView } from '../contracts';
import { buildDraftFromProfile } from '../domain/handoff';
import { INTAKE_TTL_SECONDS } from './store';

export function toIntakeView(session: IntakeSession, capabilities: Capabilities): IntakeView {
  const build = buildDraftFromProfile(session);
  return {
    id: session.id,
    revision: session.revision,
    profileRevision: session.profileRevision,
    phase: session.phase,
    mode: session.mode,
    mediaStatus: session.mediaStatus,
    publicProfile: session.profile,
    committedTranscript: session.transcript.map((t) => ({ turnId: t.turnId, role: t.role, text: t.text })),
    availability: { coachVoice: capabilities.coachVoice, avatarIntake: capabilities.avatarIntake, audioAnalysis: capabilities.voiceAnalysis },
    consents: session.consents,
    consentVersion: session.consentVersion,
    missingFields: build.missingFields,
    pendingQuestion: session.pending?.question ?? null,
    expiresAt: new Date(new Date(session.createdAt).getTime() + INTAKE_TTL_SECONDS * 1_000).toISOString(),
    deadlineAt: session.deadlineAt,
    inputMode: session.inputMode,
    assessmentStatus: session.assessment?.status ?? null,
    handoff: session.handoff,
    supportedCurrency: build.supportedCurrency,
  };
}
