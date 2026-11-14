import type { Inference, InferenceOptions } from './inference'

/**
 * Re-initialise for new options, reusing `current` when only the pose tier changes: tier
 * benchmarking then reloads one model instead of all of them (seconds of lost frames otherwise).
 */
export async function retarget(
  current: Inference | null,
  o: InferenceOptions,
  create: (o: InferenceOptions) => Promise<Inference>,
): Promise<Inference> {
  if (current && current.options.enableHands === o.enableHands && current.options.assetBase === o.assetBase) {
    if (current.options.tier !== o.tier) await current.setTier(o.tier)
    return current
  }
  current?.close()
  return create(o)
}
