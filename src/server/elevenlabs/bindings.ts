import 'server-only';
import { z } from 'zod';
import type { ElevenLabsTokenResponse, SessionBinding } from '@/contracts/api';
import { ApiError } from '../http';
import { hmac, newId, safeEqual } from '../ids';
import { COST_ESTIMATES } from '../limits/budget';
import type { PlatformDeps } from '../platform';
import { enforceDeadline, loadOwnedSession, sessionRepo } from '../session/service';
import { toSessionView } from '../session/view';

export const SessionBindingSchema = z.object({
  bindingId: z.string(),
  sessionId: z.string(),
  epoch: z.number().int(),
  signature: z.string(),
  expiresAt: z.string(),
});

function signBinding(secret: string, b: Omit<SessionBinding, 'signature'>): string {
  return hmac(secret, `binding:${b.sessionId}:${b.bindingId}:${b.epoch}:${b.expiresAt}`);
}

export function verifyBindingSignature(secret: string, binding: SessionBinding, now: Date): boolean {
  if (new Date(binding.expiresAt).getTime() < now.getTime()) return false;
  return safeEqual(binding.signature, signBinding(secret, binding));
}

/**
 * Issues one-time agent credentials for a session in voice mode and rotates the session's
 * single active binding. The previous binding stops working immediately.
 */
export async function issueVoiceCredentials(
  deps: PlatformDeps,
  input: { ownerId: string; ipHash: string; sessionId: string; connectionType: 'webrtc' | 'websocket'; voiceMap: Record<string, string> },
): Promise<ElevenLabsTokenResponse> {
  if (!deps.capabilities.voice || !deps.elevenlabs) throw new ApiError('FEATURE_DISABLED', 'Voice practice is not available right now. Continue in text.');
  let session = await loadOwnedSession(deps, input.sessionId, input.ownerId);
  session = await enforceDeadline(deps, session);
  if (session.state.ended) throw new ApiError('SESSION_ENDED', 'This round has ended.', { currentVersion: session.version });
  if (session.activeMode !== 'voice') throw new ApiError('VERSION_CONFLICT', 'Switch the round to voice first.', { currentVersion: session.version });
  if (session.scenarioSnapshot.sourceIntakeId && deps.intake) await deps.intake.ensureMediaClosed(session.scenarioSnapshot.sourceIntakeId, input.ownerId);
  await deps.quota.consume('voice_token', input.ipHash, input.ownerId);
  const remainingMinutes = Math.max(1, Math.ceil((new Date(session.deadlineAt).getTime() - deps.now().getTime()) / 60_000));
  await deps.budget.reserve('agents', remainingMinutes * COST_ESTIMATES.agentPerMinute);

  const credential =
    input.connectionType === 'webrtc'
      ? { conversationToken: await deps.elevenlabs.conversationToken().catch(() => null) }
      : { signedUrl: await deps.elevenlabs.signedUrl().catch(() => null) };
  if (('conversationToken' in credential && !credential.conversationToken) || ('signedUrl' in credential && !credential.signedUrl)) {
    throw new ApiError('UPSTREAM_UNAVAILABLE', 'The voice service did not respond. Continue in text.', {}, 5);
  }

  const bindingId = newId('vb');
  const { session: updated, written } = await sessionRepo(deps).update(session.id, (current) =>
    current.state.ended || current.activeMode !== 'voice' ? null : { ...current, voiceBindingId: bindingId },
  );
  if (!written) throw new ApiError('VERSION_CONFLICT', 'The round changed. Refresh and try again.', { currentVersion: updated.version });
  const unsigned = { bindingId, sessionId: session.id, epoch: updated.transportEpoch, expiresAt: updated.deadlineAt };
  const sessionBinding: SessionBinding = { ...unsigned, signature: signBinding(deps.signingSecret, unsigned) };
  const voiceId = input.voiceMap[updated.scenarioSnapshot.persona.voiceKey] ?? null;
  const firstMessage = updated.turns.length === 0 ? updated.openingLine : 'Let’s pick up where we left off.';
  const view = toSessionView(updated);
  return 'conversationToken' in credential
    ? { connectionType: 'webrtc', conversationToken: credential.conversationToken!, voiceId, firstMessage, sessionBinding, session: view }
    : { connectionType: 'websocket', signedUrl: credential.signedUrl!, voiceId, firstMessage, sessionBinding, session: view };
}
