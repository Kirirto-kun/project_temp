import 'server-only';
import { z } from 'zod';
import { ApiError } from '../http';
import { COST_ESTIMATES, type Reservation } from '../limits/budget';
import { logEvent } from '../observability';
import type { PlatformDeps } from '../platform';
import { updateJson } from '../storage/kv';
import { roundAvatarFor } from './round-avatars';
import { closeRoundVideo, ROUND_VIDEO_TTL_SECONDS, roundVideoKey, type RoundVideoRecord } from './round-video-store';
import { enforceDeadline, loadOwnedSession } from './service';

/** The call ends this many seconds before the round deadline, so the local countdown closes it first. */
const DEADLINE_MARGIN_SECONDS = 5;
/** Below this, a paid call is not worth starting. */
const MIN_CALL_SECONDS = 15;

export const RoundVideoStopSchema = z.object({ providerEpoch: z.number().int().nonnegative().optional() });

export interface RoundVideoCredentials {
  sessionToken: string;
  providerEpoch: number;
}

/**
 * Starts the avatar video call for a practice round: LiveAvatar FULL hears the user, and every
 * line the counterpart says comes from the round engine. One paid attempt per connect (quota
 * `round_video`), a budget hold for the minutes left in the round, and at most one open call per
 * round. Returns only a short-lived session token; provider ids and keys stay on the server.
 */
export async function connectRoundVideo(deps: PlatformDeps, ownerId: string, ipHash: string, sessionId: string): Promise<RoundVideoCredentials> {
  const liveAvatar = deps.liveAvatar;
  if (!deps.capabilities.avatarIntake || !liveAvatar) throw new ApiError('FEATURE_DISABLED', 'The video call is not available right now. Continue by typing.');
  const session = await enforceDeadline(deps, await loadOwnedSession(deps, sessionId, ownerId));
  if (session.state.ended) throw new ApiError('SESSION_ENDED', 'This round has ended.', { currentVersion: session.version });
  // Video turns are typed turns spoken aloud; an ElevenLabs voice round drives its own turns.
  if (session.activeMode !== 'text') throw new ApiError('VERSION_CONFLICT', `This round is in ${session.activeMode} mode now.`, { currentVersion: session.version });
  const now = deps.now();
  const seconds = Math.floor((new Date(session.deadlineAt).getTime() - now.getTime()) / 1_000) - DEADLINE_MARGIN_SECONDS;
  if (seconds < MIN_CALL_SECONDS) throw new ApiError('INVALID_INPUT', 'Too little time is left for a video call. Continue by typing.');

  // One call per round: a reconnect closes (and settles) the previous attempt first.
  await closeRoundVideo(deps, sessionId);
  await deps.quota.consume('round_video', ipHash, ownerId);
  const heldMinutes = Math.min(5, Math.ceil(seconds / 60));
  let reservation: Reservation;
  try {
    reservation = await deps.budget.reserve('avatar', heldMinutes * COST_ESTIMATES.avatarPerMinute);
  } catch (error) {
    await deps.quota.refund('round_video', ipHash);
    throw error;
  }
  const release = async () => {
    await deps.budget.reconcile(reservation, 0).catch(() => undefined);
    await deps.quota.refund('round_video', ipHash).catch(() => undefined);
  };

  let token: { sessionId: string; sessionToken: string };
  try {
    token = await liveAvatar.mintToken({ maxSeconds: seconds, ...roundAvatarFor(session.scenarioSnapshot.persona.avatarId) });
  } catch (error) {
    // Status only: provider bodies are never logged.
    logEvent('warn', 'liveavatar.round_token_failed', { reason: error instanceof Error ? error.message : 'unknown' });
    await release();
    throw new ApiError('UPSTREAM_UNAVAILABLE', 'The video call could not start. Continue by typing.', {}, 10);
  }

  let stored: { value: RoundVideoRecord | null; written: boolean };
  try {
    stored = await updateJson<RoundVideoRecord>(
      deps.kv,
      roundVideoKey(sessionId),
      (current) =>
        current?.providerSessionId
          ? null
          : { epoch: (current?.epoch ?? 0) + 1, providerSessionId: token.sessionId, reservation, heldMinutes, startedAt: now.toISOString() },
      { ttlSeconds: ROUND_VIDEO_TTL_SECONDS },
    );
  } catch (error) {
    await release();
    await liveAvatar.stopSession(token.sessionId).catch(() => undefined);
    throw error;
  }
  if (!stored.written || !stored.value) {
    // A concurrent connect won the race; keep that call and close this one.
    await release();
    await liveAvatar.stopSession(token.sessionId).catch(() => undefined);
    throw new ApiError('VERSION_CONFLICT', 'Another video call for this round just started.', { currentVersion: session.version });
  }
  return { sessionToken: token.sessionToken, providerEpoch: stored.value.epoch };
}

/**
 * Closes the round's video call. Never blocked by the round's version or state; provider errors
 * never block. With `providerEpoch`, a late stop from an older attempt leaves a newer call open.
 */
export async function stopRoundVideo(deps: PlatformDeps, ownerId: string, sessionId: string, providerEpoch?: number): Promise<{ stopped: boolean }> {
  await loadOwnedSession(deps, sessionId, ownerId);
  return { stopped: await closeRoundVideo(deps, sessionId, providerEpoch) };
}
