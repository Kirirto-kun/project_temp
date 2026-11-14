import 'server-only';
import { NextResponse } from 'next/server';
import { ZodError, type z } from 'zod';
import type { ErrorCode, ErrorEnvelope } from '@/contracts/api';
import { newId } from './ids';
import { logEvent } from './observability';

const STATUS: Record<ErrorCode, number> = {
  INVALID_INPUT: 400,
  PROFILE_INCOMPLETE: 400,
  UNAUTHORIZED: 401,
  ENTITLEMENT_REQUIRED: 403,
  FORBIDDEN_ORIGIN: 403,
  NOT_FOUND: 404,
  VERSION_CONFLICT: 409,
  IDEMPOTENCY_CONFLICT: 409,
  TURN_IN_PROGRESS: 409,
  SESSION_ENDED: 409,
  PROFILE_STALE: 409,
  EXPIRED: 410,
  UPLOAD_TOO_LARGE: 413,
  RATE_LIMITED: 429,
  BUDGET_EXHAUSTED: 503,
  UPSTREAM_UNAVAILABLE: 503,
  FEATURE_DISABLED: 503,
  INTERNAL: 500,
};

const RETRYABLE: ReadonlySet<ErrorCode> = new Set(['TURN_IN_PROGRESS', 'RATE_LIMITED', 'UPSTREAM_UNAVAILABLE', 'BUDGET_EXHAUSTED', 'INTERNAL']);

export class ApiError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly retryable: boolean;
  readonly extra: Omit<ErrorEnvelope['error'], 'code' | 'message' | 'retryable' | 'requestId'>;
  readonly retryAfterSeconds: number | null;
  constructor(code: ErrorCode, message: string, extra: ApiError['extra'] = {}, retryAfterSeconds: number | null = null) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = STATUS[code];
    this.retryable = RETRYABLE.has(code);
    this.extra = extra;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export const NO_STORE = { 'Cache-Control': 'no-store' } as const;

export function json(body: unknown, init: { status?: number; headers?: Record<string, string> } = {}): NextResponse {
  return NextResponse.json(body, { status: init.status ?? 200, headers: { ...NO_STORE, ...init.headers } });
}

export function errorResponse(error: unknown, requestId: string): NextResponse {
  if (error instanceof ApiError) {
    const headers: Record<string, string> = {};
    if (error.retryAfterSeconds !== null) headers['Retry-After'] = String(error.retryAfterSeconds);
    return json({ error: { code: error.code, message: error.message, retryable: error.retryable, requestId, ...error.extra } }, { status: error.status, headers });
  }
  if (error instanceof ZodError) {
    const fields = error.issues.slice(0, 20).map((issue) => ({ field: issue.path.join('.') || '_form', message: issue.message }));
    return json({ error: { code: 'INVALID_INPUT', message: fields[0]?.message ?? 'Invalid input.', retryable: false, requestId, fields } }, { status: 400 });
  }
  logEvent('error', 'unhandled_error', { requestId, message: error instanceof Error ? error.message : 'unknown' });
  return json({ error: { code: 'INTERNAL', message: 'Something went wrong on our side. Please try again.', retryable: true, requestId } }, { status: 500 });
}

export interface RouteContext {
  requestId: string;
}

type Handler<P> = (request: Request, ctx: RouteContext & { params: P }) => Promise<Response>;

/** Wraps a route handler: request id, error envelope, no-store and timing log. */
export function route<P = Record<string, never>>(name: string, handler: Handler<P>) {
  return async (request: Request, context: { params: Promise<P> }): Promise<Response> => {
    const requestId = newId('req');
    const started = Date.now();
    try {
      const params = context?.params ? await context.params : ({} as P);
      const response = await handler(request, { requestId, params });
      logEvent('info', 'request', { route: name, requestId, status: response.status, ms: Date.now() - started });
      return response;
    } catch (error) {
      const response = errorResponse(error, requestId);
      logEvent(response.status >= 500 ? 'error' : 'info', 'request', { route: name, requestId, status: response.status, ms: Date.now() - started, code: error instanceof ApiError ? error.code : undefined });
      return response;
    }
  };
}

export async function readBody<T>(request: Request, schema: z.ZodType<T>, maxBytes = 64 * 1024): Promise<T> {
  const text = await request.text();
  if (text.length > maxBytes) throw new ApiError('UPLOAD_TOO_LARGE', 'Request body is too large.');
  let parsed: unknown;
  try {
    parsed = text ? JSON.parse(text) : {};
  } catch {
    throw new ApiError('INVALID_INPUT', 'Body must be JSON.');
  }
  return schema.parse(parsed);
}

export function idempotencyKey(request: Request, required = true): string | null {
  const key = request.headers.get('idempotency-key')?.trim() ?? null;
  if (!key && required) throw new ApiError('INVALID_INPUT', 'Idempotency-Key header is required.');
  if (key && (key.length < 8 || key.length > 120 || !/^[\w.:-]+$/.test(key))) throw new ApiError('INVALID_INPUT', 'Idempotency-Key is malformed.');
  return key;
}
