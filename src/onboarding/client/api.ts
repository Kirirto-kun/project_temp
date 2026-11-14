import type { IntakeHandoff, MoneyAnswer } from '@/contracts/intake';
import { apiFetch, newClientId } from '@/client/api/client';
import type { IntakeAssessment, IntakeView, RangeValue } from '../contracts';

export async function createIntake(mode: 'text' | 'audio', audioAnalysis: boolean): Promise<IntakeView> {
  return (await apiFetch<{ intake: IntakeView }>('/api/intake', { body: { mode, locale: 'en', consents: { audioAnalysis, visualAnalysis: false }, consentVersion: 1 }, idempotencyKey: newClientId('intake') })).intake;
}

export async function getIntake(id: string): Promise<IntakeView> {
  return (await apiFetch<{ intake: IntakeView }>(`/api/intake/${encodeURIComponent(id)}`)).intake;
}

export async function sendMessage(id: string, text: string, practice = false): Promise<IntakeView> {
  return (await apiFetch<{ intake: IntakeView }>(`/api/intake/${encodeURIComponent(id)}/message`, { body: { turnId: newClientId('it'), text, practice } })).intake;
}

export interface Corrections {
  kind?: 'raise' | 'offer' | 'rent' | 'bill';
  userRole?: string;
  counterpartRole?: string;
  currentMoney?: MoneyAnswer;
  targetMoney?: MoneyAnswer;
  marketRange?: RangeValue | null;
  reasons?: string;
  fear?: string;
  conversationDate?: string | null;
  usePracticeRange?: boolean;
  useExample?: boolean;
}

export async function patchProfile(id: string, expectedRevision: number, corrections: Corrections): Promise<IntakeView> {
  return (await apiFetch<{ intake: IntakeView }>(`/api/intake/${encodeURIComponent(id)}/profile`, { method: 'PATCH', body: { expectedRevision, corrections } })).intake;
}

export async function confirmIntake(id: string, expectedRevision: number, confirmedFields: string[]): Promise<{ intake: IntakeView; handoff: IntakeHandoff | null }> {
  return apiFetch(`/api/intake/${encodeURIComponent(id)}/confirm`, { body: { expectedRevision, confirmedFields } });
}

export async function stopIntake(id: string, reason: 'end' | 'review' | 'error' | 'timeout' | 'fallback' | 'unload'): Promise<IntakeView> {
  return (await apiFetch<{ intake: IntakeView }>(`/api/intake/${encodeURIComponent(id)}/stop`, { body: { reason } })).intake;
}

export async function skipPractice(id: string): Promise<IntakeView> {
  return (await apiFetch<{ intake: IntakeView }>(`/api/intake/${encodeURIComponent(id)}/skip-practice`, { body: {} })).intake;
}

export async function setAudioConsent(id: string, audioAnalysis: boolean, expectedRevision: number | null): Promise<IntakeView> {
  return (await apiFetch<{ intake: IntakeView }>(`/api/intake/${encodeURIComponent(id)}/consent`, { body: { consents: { audioAnalysis }, expectedRevision } })).intake;
}

export async function getAssessment(id: string): Promise<IntakeAssessment | null> {
  return (await apiFetch<{ assessment: IntakeAssessment | null }>(`/api/intake/${encodeURIComponent(id)}/assessment`)).assessment;
}

export async function deleteIntake(id: string): Promise<void> {
  await apiFetch(`/api/intake/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export async function connectAudio(id: string, expectedRevision: number) {
  return apiFetch<{ intake: IntakeView; clientSecret: string; expiresAt: string; model: string; providerEpoch: number; deadlineAt: string }>(`/api/intake/${encodeURIComponent(id)}/connect`, { body: { expectedRevision } });
}

export async function postTranscript(id: string, providerEpoch: number, itemId: string, role: 'user' | 'coach', text: string): Promise<IntakeView> {
  return (await apiFetch<{ intake: IntakeView }>(`/api/intake/${encodeURIComponent(id)}/transcript`, { body: { providerEpoch, itemId, role, text } })).intake;
}

export async function relayTool(id: string, providerEpoch: number, callId: string, name: string, args: string): Promise<{ output: Record<string, unknown> }> {
  return apiFetch(`/api/intake/${encodeURIComponent(id)}/tool`, { body: { providerEpoch, callId, name, arguments: args } });
}

export async function submitPracticeAudio(id: string, audioId: string, turnId: string): Promise<IntakeView> {
  return (await apiFetch<{ intake: IntakeView }>(`/api/intake/${encodeURIComponent(id)}/practice`, { body: { audioId, turnId } })).intake;
}
