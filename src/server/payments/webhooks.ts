import { createHmac } from 'node:crypto';
import { safeEqual } from '../ids';

export interface WebhookHeaders {
  id: string | null;
  timestamp: string | null;
  signature: string | null;
}

/**
 * Standard Webhooks verification as used by Polar: HMAC-SHA256 over "id.timestamp.body"
 * with the secret's UTF-8 bytes as key, base64 signatures prefixed "v1,", 5-minute tolerance.
 * Polar's own SDK keys the HMAC with the UTF-8 bytes of the whole secret, whatever its prefix; plain
 * Standard Webhooks base64-decodes what follows "whsec_". Both derivations are accepted for a "whsec_" secret.
 */
export function verifyWebhook(rawBody: string, headers: WebhookHeaders, secret: string, now: Date, toleranceSeconds = 300): boolean {
  if (!headers.id || !headers.timestamp || !headers.signature) return false;
  const ts = Number(headers.timestamp);
  if (!Number.isFinite(ts) || Math.abs(now.getTime() / 1_000 - ts) > toleranceSeconds) return false;
  const keys = [Buffer.from(secret, 'utf8'), ...(secret.startsWith('whsec_') ? [Buffer.from(secret.slice(6), 'base64')] : [])];
  const expected = keys.map((key) => createHmac('sha256', key).update(`${headers.id}.${headers.timestamp}.${rawBody}`).digest('base64'));
  return headers.signature.split(' ').some((part) => {
    const [version, sig] = part.split(',');
    return version === 'v1' && sig !== undefined && expected.some((value) => safeEqual(sig, value));
  });
}

export function signWebhookForTest(rawBody: string, id: string, timestamp: string, secret: string): string {
  const key = Buffer.from(secret, 'utf8');
  return `v1,${createHmac('sha256', key).update(`${id}.${timestamp}.${rawBody}`).digest('base64')}`;
}
