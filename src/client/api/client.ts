import type { ErrorCode } from '@/contracts/api';

export class ApiClientError extends Error {
  readonly code: ErrorCode | 'NETWORK';
  readonly status: number;
  readonly retryable: boolean;
  readonly currentVersion?: number;
  readonly missingFields?: string[];
  readonly fields?: { field: string; message: string }[];
  constructor(init: { code: ErrorCode | 'NETWORK'; status: number; message: string; retryable: boolean; currentVersion?: number; missingFields?: string[]; fields?: { field: string; message: string }[] }) {
    super(init.message);
    this.name = 'ApiClientError';
    this.code = init.code;
    this.status = init.status;
    this.retryable = init.retryable;
    this.currentVersion = init.currentVersion;
    this.missingFields = init.missingFields;
    this.fields = init.fields;
  }
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE' | 'PUT';
  body?: unknown;
  idempotencyKey?: string;
  signal?: AbortSignal;
}

export function newClientId(prefix: string): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return `${prefix}-${Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')}`;
}

/** Same-origin JSON request with the shared error envelope. */
export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  if (options.idempotencyKey) headers['Idempotency-Key'] = options.idempotencyKey;
  let response: Response;
  try {
    response = await fetch(path, {
      method: options.method ?? (options.body !== undefined ? 'POST' : 'GET'),
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      credentials: 'same-origin',
      cache: 'no-store',
      signal: options.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new ApiClientError({ code: 'NETWORK', status: 0, message: 'You seem to be offline. Check the connection and try again.', retryable: true });
  }
  const text = await response.text();
  const data = text ? (JSON.parse(text) as unknown) : null;
  if (!response.ok) {
    const envelope = (data as { error?: { code: ErrorCode; message: string; retryable: boolean; currentVersion?: number; missingFields?: string[]; fields?: { field: string; message: string }[] } } | null)?.error;
    throw new ApiClientError({
      code: envelope?.code ?? 'INTERNAL',
      status: response.status,
      message: envelope?.message ?? 'Something went wrong. Please try again.',
      retryable: envelope?.retryable ?? response.status >= 500,
      currentVersion: envelope?.currentVersion,
      missingFields: envelope?.missingFields,
      fields: envelope?.fields,
    });
  }
  return data as T;
}
