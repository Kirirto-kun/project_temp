import type { ConfigResponse, CreateSessionRequest, ElevenLabsTokenResponse, EntitlementResponse, OfferAnalysis } from '@/contracts/api';
import type { QuizAnswers, SessionView, TransportMode } from '@/contracts/domain';
import type { Debrief, VoiceBaseline, VoiceMetrics, AudioManifest } from '@/contracts/voice';
import { apiFetch, newClientId } from './client';

let configPromise: Promise<ConfigResponse> | null = null;
export function getConfig(): Promise<ConfigResponse> {
  configPromise ??= apiFetch<ConfigResponse>('/api/config').catch((error) => {
    configPromise = null;
    throw error;
  });
  return configPromise;
}

export async function createSession(request: CreateSessionRequest, idempotencyKey = newClientId('create')): Promise<SessionView> {
  return (await apiFetch<{ session: SessionView }>('/api/session', { body: request, idempotencyKey })).session;
}

export async function getSession(id: string, signal?: AbortSignal): Promise<SessionView> {
  return (await apiFetch<{ session: SessionView }>(`/api/session/${encodeURIComponent(id)}`, { signal })).session;
}

export async function sendTurn(input: { sessionId: string; turnId: string; expectedVersion: number; text: string }, signal?: AbortSignal) {
  return apiFetch<{ session: SessionView; committedTurnId: string }>('/api/turn', { body: input, idempotencyKey: input.turnId, signal });
}

export async function finishSession(id: string, expectedVersion: number): Promise<SessionView> {
  return (await apiFetch<{ session: SessionView }>(`/api/session/${encodeURIComponent(id)}/finish`, { body: { expectedVersion, reason: 'stopped' } })).session;
}

export async function setMode(id: string, expectedVersion: number, mode: TransportMode): Promise<SessionView> {
  return (await apiFetch<{ session: SessionView }>(`/api/session/${encodeURIComponent(id)}/mode`, { body: { expectedVersion, mode } })).session;
}

export async function replay(id: string, baselineId: string | null): Promise<SessionView> {
  return (await apiFetch<{ session: SessionView }>(`/api/session/${encodeURIComponent(id)}/replay`, { body: { baselineId }, idempotencyKey: newClientId('replay') })).session;
}

export async function getDebrief(sessionId: string): Promise<Debrief> {
  return (await apiFetch<{ debrief: Debrief }>('/api/debrief', { body: { sessionId } })).debrief;
}

export async function getVoiceToken(sessionId: string, connectionType: 'webrtc' | 'websocket'): Promise<ElevenLabsTokenResponse> {
  return apiFetch<ElevenLabsTokenResponse>('/api/elevenlabs/token', { body: { sessionId, connectionType } });
}

export async function requestUpload(input: { purpose: AudioManifest['purpose']; mimeType: string; bytes: number; sessionId: string | null; intakeId: string | null }) {
  return apiFetch<{ audioId: string; uploadUrl: string; uploadMethod: 'PUT'; uploadHeaders: Record<string, string>; expiresAt: string }>('/api/audio/uploads', { body: input });
}

export async function completeUpload(audioId: string, manifest: AudioManifest) {
  return apiFetch<{ audioId: string; status: 'uploaded' }>(`/api/audio/${encodeURIComponent(audioId)}/complete`, { body: { manifest } });
}

export async function createBaseline(audioId: string): Promise<VoiceBaseline> {
  return (await apiFetch<{ baseline: VoiceBaseline }>('/api/voice/baseline', { body: { audioId } })).baseline;
}

export async function startAnalysis(input: { sessionId: string; audioId: string; baselineId: string | null }) {
  return apiFetch<{ analysisId: string; status: 'pending' }>('/api/voice/analyze', { body: input, idempotencyKey: newClientId('analyze') });
}

export async function getAnalysis(analysisId: string): Promise<VoiceMetrics> {
  return (await apiFetch<{ analysisId: string; metrics: VoiceMetrics }>(`/api/voice/analyses/${encodeURIComponent(analysisId)}`)).metrics;
}

export async function getEntitlement(): Promise<EntitlementResponse> {
  return apiFetch<EntitlementResponse>('/api/entitlement');
}

export async function startCheckout(): Promise<{ checkoutUrl: string; checkoutId: string }> {
  return apiFetch('/api/polar/checkout', { body: { productKey: 'conversation_pack' }, idempotencyKey: newClientId('checkout') });
}

export async function createCustomScenario(quiz: QuizAnswers, description: string): Promise<{ scenarioId: string }> {
  return apiFetch('/api/scenarios/custom', { body: { quiz, description }, idempotencyKey: newClientId('custom') });
}

export async function analyzeOffer(text: string): Promise<OfferAnalysis> {
  return (await apiFetch<{ analysis: OfferAnalysis }>('/api/offers/analyze', { body: { text, currency: 'USD', period: 'year' }, idempotencyKey: newClientId('offer') })).analysis;
}
