import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/** Unpredictable identifier: prefix + 22 url-safe characters (128 bits). */
export function newId(prefix: string): string {
  return `${prefix}_${randomBytes(16).toString('base64url')}`;
}

export function sha256(input: string | Uint8Array): string {
  return createHash('sha256').update(input).digest('hex');
}

export function hmac(secret: string, message: string): string {
  return createHmac('sha256', secret).update(message).digest('base64url');
}

export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

/** Stable short hash for idempotency body comparison. */
export function bodyHash(value: unknown): string {
  return sha256(JSON.stringify(value)).slice(0, 32);
}

export function utcDay(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}
