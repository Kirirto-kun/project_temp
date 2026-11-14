import { VOICE_CONSTANTS, type AcousticSample, type ManifestTurn } from '@/contracts/voice';

export interface PendingUserTurn {
  sourceTurnKey: string;
  windowStartMs: number;
  windowEndMs: number;
}

/**
 * Tracks when the user could have been speaking: from the end of the counterpart's speech to
 * the final transcript event. The spoken interval is trimmed to voiced samples, so silence
 * before speaking is not counted as part of the turn.
 */
export class TurnTimeline {
  private windowStart = 0;
  readonly pending: PendingUserTurn[] = [];

  agentStoppedSpeaking(tMs: number) {
    this.windowStart = tMs;
  }

  userTurnFinal(sourceTurnKey: string, tMs: number) {
    this.pending.push({ sourceTurnKey, windowStartMs: this.windowStart, windowEndMs: tMs });
    this.windowStart = tMs;
  }

  /** Maps windows to committed turn ids; turns without a reliable key are left out. */
  toManifestTurns(samples: AcousticSample[], turnIdByKey: Map<string, string>, durationMs: number): ManifestTurn[] {
    const out: ManifestTurn[] = [];
    for (const p of this.pending) {
      const turnId = turnIdByKey.get(p.sourceTurnKey);
      if (!turnId) continue;
      const voiced = samples.filter((s) => s.tMs >= p.windowStartMs && s.tMs <= p.windowEndMs && s.rms >= VOICE_CONSTANTS.pauseRmsThreshold);
      const t0 = voiced.length ? voiced[0]!.tMs : p.windowStartMs;
      const t1 = Math.min(durationMs, voiced.length ? voiced[voiced.length - 1]!.tMs + VOICE_CONSTANTS.sampleIntervalMs : p.windowEndMs);
      if (t1 > t0) out.push({ turnId, t0Ms: Math.round(t0), t1Ms: Math.round(t1) });
    }
    return out;
  }
}
