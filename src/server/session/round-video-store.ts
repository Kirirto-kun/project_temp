import 'server-only';
import { COST_ESTIMATES, type Reservation } from '../limits/budget';
import type { PlatformDeps } from '../platform';
import { updateJson } from '../storage/kv';

/**
 * The avatar video call of one practice round, kept beside the session (not in it) so the round's
 * version and turn pipeline stay untouched. `epoch` only grows; a closed call keeps its epoch so a
 * late stop from an older attempt cannot close a newer one.
 */
export interface RoundVideoRecord {
  epoch: number;
  providerSessionId: string | null;
  reservation: Reservation | null;
  /** Minutes held in the budget reservation; settling never charges more. */
  heldMinutes: number;
  startedAt: string | null;
}

/** Rounds live 24 hours; the call record never outlives its round. */
export const ROUND_VIDEO_TTL_SECONDS = 86_400;

export function roundVideoKey(sessionId: string): string {
  return `rvid:${sessionId}`;
}

/**
 * Closes the round's open video call, if any: clears it atomically, then settles the budget by
 * elapsed minutes and stops the provider session. Provider and budget errors never block.
 * With `epoch`, only that attempt is closed. Returns whether a call was open.
 */
export async function closeRoundVideo(deps: PlatformDeps, sessionId: string, epoch?: number): Promise<boolean> {
  let closed: RoundVideoRecord | null = null;
  await updateJson<RoundVideoRecord>(
    deps.kv,
    roundVideoKey(sessionId),
    (current) => {
      closed = null;
      if (!current || current.providerSessionId === null) return null;
      if (epoch !== undefined && current.epoch !== epoch) return null;
      closed = current;
      return { epoch: current.epoch, providerSessionId: null, reservation: null, heldMinutes: 0, startedAt: null };
    },
    { ttlSeconds: ROUND_VIDEO_TTL_SECONDS },
  );
  const record = closed as RoundVideoRecord | null;
  if (!record) return false;
  if (record.reservation) {
    const startedMs = record.startedAt ? new Date(record.startedAt).getTime() : deps.now().getTime();
    const minutes = Math.max(1, Math.ceil((deps.now().getTime() - startedMs) / 60_000));
    await deps.budget.reconcile(record.reservation, Math.min(record.heldMinutes, minutes) * COST_ESTIMATES.avatarPerMinute).catch(() => undefined);
  }
  // Best effort: a missed stop is bounded by max_session_duration on LiveAvatar's side.
  if (record.providerSessionId) await deps.liveAvatar?.stopSession(record.providerSessionId).catch(() => undefined);
  return true;
}
