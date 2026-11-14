import Anthropic from '@anthropic-ai/sdk';
import { ModelUnavailableError, NO_MODEL, type ModelPorts, type ModelPurpose, type ModelRequest } from '@/intelligence/ports';

/** Spend guard used by the provider: reserve an upper bound, then reconcile with real usage. */
export interface SpendGuard {
  reserve(micros: number): Promise<{ settle(actualMicros: number): Promise<void> }>;
  cost(model: string, inputTokens: number, outputTokens: number): number;
}

export interface ModelUsage {
  purpose: ModelPurpose;
  model: string;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
}

export interface AnthropicPortsOptions {
  apiKey: string;
  fastModel?: string;
  mainModel?: string;
  timeoutMs?: number;
  onUsage?: (usage: ModelUsage) => void;
  spend?: SpendGuard;
  /** Injected for tests. */
  client?: Pick<Anthropic, 'messages' | 'beta'>;
}

export const DEFAULT_FAST_MODEL = 'claude-haiku-5-5';
export const DEFAULT_MAIN_MODEL = 'claude-opus-5-5';

type Effort = 'low' | 'medium' | 'high';

const PURPOSE_SETTINGS: Record<ModelPurpose, { tier: 'fast' | 'main'; effort: Effort; maxTokens: number; reserveMicros: number }> = {
  classify: { tier: 'fast', effort: 'low', maxTokens: 2_048, reserveMicros: 2_000 },
  actor: { tier: 'main', effort: 'low', maxTokens: 2_048, reserveMicros: 60_000 },
  scenario: { tier: 'main', effort: 'low', maxTokens: 4_096, reserveMicros: 100_000 },
  debrief: { tier: 'main', effort: 'medium', maxTokens: 8_192, reserveMicros: 200_000 },
  offer: { tier: 'main', effort: 'low', maxTokens: 4_096, reserveMicros: 150_000 },
  custom_scenario: { tier: 'main', effort: 'medium', maxTokens: 8_192, reserveMicros: 200_000 },
  intake_evaluate: { tier: 'main', effort: 'low', maxTokens: 4_096, reserveMicros: 100_000 },
  intake_extract: { tier: 'fast', effort: 'low', maxTokens: 2_048, reserveMicros: 2_000 },
  intake_coach: { tier: 'main', effort: 'low', maxTokens: 2_048, reserveMicros: 60_000 },
};

function textOf(content: ReadonlyArray<{ type: string }>): string {
  return content
    .filter((block): block is { type: 'text'; text: string } => block.type === 'text' && typeof (block as { text?: unknown }).text === 'string')
    .map((block) => block.text)
    .join('');
}

function toUnavailable(error: unknown): ModelUnavailableError {
  if (error instanceof ModelUnavailableError) return error;
  if (error instanceof Anthropic.APIUserAbortError) return new ModelUnavailableError('timeout');
  if (error instanceof Anthropic.RateLimitError) return new ModelUnavailableError('rate_limited');
  if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) return new ModelUnavailableError('not_authorized');
  if (error instanceof Anthropic.BadRequestError) return new ModelUnavailableError('bad_request');
  if (error instanceof Anthropic.APIConnectionError) return new ModelUnavailableError('network');
  if (error instanceof Anthropic.APIError) return new ModelUnavailableError(`provider_error_${error.status ?? 'unknown'}`);
  return new ModelUnavailableError(error instanceof Error ? error.message : 'unknown');
}

/**
 * Claude adapter for the engine's ModelPorts: JSON-schema structured outputs, a fast model
 * for per-turn classification and the main model elsewhere. Every failure is converted to
 * ModelUnavailableError so callers can take their deterministic path.
 */
export function createAnthropicModelPorts(options: AnthropicPortsOptions): ModelPorts {
  const client = options.client ?? new Anthropic({ apiKey: options.apiKey, maxRetries: 1, timeout: options.timeoutMs ?? 20_000 });
  const models = { fast: options.fastModel || DEFAULT_FAST_MODEL, main: options.mainModel || DEFAULT_MAIN_MODEL };

  async function completeStructured(request: ModelRequest): Promise<unknown> {
    const settings = PURPOSE_SETTINGS[request.purpose];
    const model = models[settings.tier];
    const started = Date.now();
    const userContent = typeof request.input === 'string' ? request.input : JSON.stringify(request.input);
    let hold: { settle(actualMicros: number): Promise<void> } | null = null;
    if (options.spend) {
      try {
        hold = await options.spend.reserve(settings.reserveMicros);
      } catch {
        throw new ModelUnavailableError('budget');
      }
    }
    let settled = false;
    try {
      const common = {
        model,
        max_tokens: settings.maxTokens,
        system: request.system,
        messages: [{ role: 'user' as const, content: userContent }],
        output_config: { effort: settings.effort, format: { type: 'json_schema' as const, schema: request.jsonSchema } },
      };
      // Server-side refusal fallbacks are available on the main model; the fast model has none.
      const response =
        settings.tier === 'main'
          ? await client.beta.messages.create(
              { ...common, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' },
              { signal: request.signal },
            )
          : await client.messages.create(common, { signal: request.signal });
      if (hold) {
        settled = true;
        await hold.settle(options.spend!.cost(response.model, response.usage.input_tokens, response.usage.output_tokens));
      }
      options.onUsage?.({
        purpose: request.purpose,
        model: response.model,
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        latencyMs: Date.now() - started,
      });
      if (response.stop_reason === 'refusal') throw new ModelUnavailableError('refusal');
      if (response.stop_reason === 'max_tokens') throw new ModelUnavailableError('truncated');
      const text = textOf(response.content as ReadonlyArray<{ type: string }>);
      try {
        return JSON.parse(text);
      } catch {
        return text;
      }
    } catch (error) {
      const failure = toUnavailable(error);
      // A rejected or unauthorised request is not billed; timeouts and network errors keep the reservation.
      if (hold && !settled && (failure.reason === 'bad_request' || failure.reason === 'not_authorized' || failure.reason === 'rate_limited')) await hold.settle(0);
      throw failure;
    }
  }

  return { available: true, completeStructured };
}

export function modelPortsFromEnv(env: NodeJS.ProcessEnv = process.env, onUsage?: (usage: ModelUsage) => void, spend?: SpendGuard): ModelPorts {
  const provider = (env.LLM_PROVIDER ?? 'anthropic').trim().toLowerCase();
  const apiKey = env.ANTHROPIC_API_KEY?.trim();
  if (provider === 'none' || !apiKey) return NO_MODEL;
  return createAnthropicModelPorts({
    apiKey,
    fastModel: env.LLM_MODEL_FAST?.trim() || undefined,
    mainModel: env.LLM_MODEL_MAIN?.trim() || undefined,
    timeoutMs: env.LLM_TIMEOUT_MS ? Number(env.LLM_TIMEOUT_MS) : undefined,
    onUsage,
    spend,
  });
}
