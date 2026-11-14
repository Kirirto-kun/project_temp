import { boxCenter, dist, mid } from './geometry'
import type { Thresholds } from './thresholds'
import type { LandmarkSample, UnavailableReason } from './types'

export type Qualified = { s: LandmarkSample; durMs: number; valid: boolean; reason: UnavailableReason | null; segment: number }

/**
 * Per-sample validity. Samples must be sorted by tMs. A camera move starts a new
 * segment so that body references are rebuilt for the new framing.
 */
export function qualify(samples: readonly LandmarkSample[], t: Thresholds): Qualified[] {
  const crowded = sustainedCrowding(samples, t)
  const out: Qualified[] = []
  let segment = 0
  let movedUntil = -Infinity
  samples.forEach((s, i) => {
    const prev = samples[i - 1]
    const next = samples[i + 1]
    if (prev && cameraJumped(prev, s, t)) {
      movedUntil = s.tMs + t.cameraMovedInvalidMs
      segment++
    }
    const reason: UnavailableReason | null =
      s.luma < t.minLuma ? 'too_dark'
      : s.faces === 0 || !s.face ? 'no_face'
      : crowded[i] ? 'multiple_people'
      : s.tMs < movedUntil ? 'camera_moved'
      : null
    const durMs = next ? Math.min(next.tMs - s.tMs, t.maxSampleGapMs) : 0
    out.push({ s, durMs, valid: reason === null, reason, segment })
  })
  return out
}

/** More than one face or pose, kept only where it lasts at least multiplePeopleMinMs. */
function sustainedCrowding(samples: readonly LandmarkSample[], t: Thresholds): boolean[] {
  const flags = samples.map((s) => s.faces > 1 || s.poses > 1)
  for (let i = 0; i < flags.length; ) {
    if (!flags[i]) { i++; continue }
    let j = i
    while (j + 1 < flags.length && flags[j + 1]) j++
    const endMs = samples[j + 1]?.tMs ?? samples[j]!.tMs
    if (endMs - samples[i]!.tMs < t.multiplePeopleMinMs) for (let k = i; k <= j; k++) flags[k] = false
    i = j + 1
  }
  return flags
}

function cameraJumped(a: LandmarkSample, b: LandmarkSample, t: Thresholds): boolean {
  if (b.tMs - a.tMs > t.cameraJumpWindowMs || !a.face || !b.face) return false
  if (dist(boxCenter(a.face.box), boxCenter(b.face.box)) <= t.cameraJumpFrac) return false
  if (!a.pose || !b.pose) return true
  return dist(mid(a.pose.lShoulder, a.pose.rShoulder), mid(b.pose.lShoulder, b.pose.rShoulder)) > t.cameraJumpFrac
}

export type Coverage = { validMs: number; observedMs: number; dominantReason: UnavailableReason | null }

export function coverage(q: readonly Qualified[]): Coverage {
  let validMs = 0
  let observedMs = 0
  const byReason = new Map<UnavailableReason, number>()
  for (const x of q) {
    observedMs += x.durMs
    if (x.valid) validMs += x.durMs
    else if (x.reason) byReason.set(x.reason, (byReason.get(x.reason) ?? 0) + x.durMs)
  }
  let dominantReason: UnavailableReason | null = null
  let best = 0
  for (const [reason, ms] of byReason) if (ms > best) [best, dominantReason] = [ms, reason]
  return { validMs, observedMs, dominantReason }
}
