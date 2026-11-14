/**
 * Model port owned by the engine (A). The platform (B) implements the provider adapter; every
 * caller passes its own JSON Schema and re-validates the result before using it.
 */
export type ModelPurpose =
  | 'scenario'
  | 'classify'
  | 'actor'
  | 'debrief'
  | 'offer'
  | 'custom_scenario'
  | 'intake_evaluate'
  | 'intake_extract'
  | 'intake_coach';

export interface ModelRequest {
  purpose: ModelPurpose;
  system: string;
  input: unknown;
  jsonSchema: Record<string, unknown>;
  signal: AbortSignal;
}

export interface ModelPorts {
  /** False when no provider is configured; callers then use deterministic paths. */
  readonly available: boolean;
  completeStructured(request: ModelRequest): Promise<unknown>;
}

/** Provider not configured, unreachable, timed out, refused or over budget. */
export class ModelUnavailableError extends Error {
  readonly reason: string;
  constructor(reason: string) {
    super(`Model unavailable: ${reason}`);
    this.name = 'ModelUnavailableError';
    this.reason = reason;
  }
}

export const NO_MODEL: ModelPorts = {
  available: false,
  async completeStructured() {
    throw new ModelUnavailableError('not configured');
  },
};
