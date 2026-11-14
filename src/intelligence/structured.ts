import type { z } from 'zod';
import { ModelUnavailableError, type ModelPorts, type ModelPurpose } from './ports';

export type StructuredResult<T> =
  | { ok: true; value: T; attempts: number }
  | { ok: false; reason: 'unavailable' | 'invalid'; attempts: number; detail: string };

export interface StructuredCall<T> {
  purpose: ModelPurpose;
  system: string;
  input: unknown;
  jsonSchema: Record<string, unknown>;
  schema: z.ZodType<T>;
  signal?: AbortSignal;
  /** Extra semantic validation after the schema; return an error message to reject. */
  check?: (value: T) => string | null;
  /** Number of retries after an invalid answer. Defaults to one. */
  retries?: number;
  timeoutMs?: number;
}

/**
 * Calls the model, validates the answer with Zod and an optional semantic check, and retries
 * once on an invalid answer. Provider failures are reported as `unavailable`, never thrown,
 * so every caller can fall back to its deterministic path.
 */
export async function callStructured<T>(deps: ModelPorts, call: StructuredCall<T>): Promise<StructuredResult<T>> {
  if (!deps.available) return { ok: false, reason: 'unavailable', attempts: 0, detail: 'not configured' };
  const retries = call.retries ?? 1;
  let lastDetail = '';
  for (let attempt = 1; attempt <= retries + 1; attempt += 1) {
    const controller = new AbortController();
    const onAbort = () => controller.abort();
    call.signal?.addEventListener('abort', onAbort, { once: true });
    const timer = setTimeout(() => controller.abort(), call.timeoutMs ?? 12_000);
    try {
      const raw = await deps.completeStructured({
        purpose: call.purpose,
        system: call.system,
        input: attempt === 1 ? call.input : { ...(call.input as object), previousAnswerWasInvalid: lastDetail.slice(0, 200) },
        jsonSchema: call.jsonSchema,
        signal: controller.signal,
      });
      const parsed = call.schema.safeParse(raw);
      if (!parsed.success) {
        lastDetail = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
        continue;
      }
      const problem = call.check?.(parsed.data) ?? null;
      if (problem) {
        lastDetail = problem;
        continue;
      }
      return { ok: true, value: parsed.data, attempts: attempt };
    } catch (error) {
      const detail = error instanceof ModelUnavailableError ? error.reason : error instanceof Error ? error.message : 'unknown error';
      return { ok: false, reason: 'unavailable', attempts: attempt, detail };
    } finally {
      clearTimeout(timer);
      call.signal?.removeEventListener('abort', onAbort);
    }
  }
  return { ok: false, reason: 'invalid', attempts: retries + 1, detail: lastDetail };
}
