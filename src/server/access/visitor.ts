import 'server-only';
import { ApiError } from '../http';
import { hmac, newId, safeEqual, sha256 } from '../ids';

export const OWNER_COOKIE = 'hl_owner';
const OWNER_MAX_AGE = 60 * 60 * 24 * 30;

export interface Visitor {
  ownerId: string;
  /** Set-Cookie header to add to the response when a new owner was issued. */
  headers: Record<string, string>;
  ipHash: string;
}

function readCookie(header: string | null, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(';')) {
    const [k, ...rest] = part.trim().split('=');
    if (k === name) return decodeURIComponent(rest.join('='));
  }
  return null;
}

export function signOwner(ownerId: string, secret: string): string {
  return `${ownerId}.${hmac(secret, `owner:${ownerId}`)}`;
}

export function verifyOwner(cookieValue: string | null, secret: string): string | null {
  if (!cookieValue) return null;
  const dot = cookieValue.lastIndexOf('.');
  if (dot <= 0) return null;
  const ownerId = cookieValue.slice(0, dot);
  const signature = cookieValue.slice(dot + 1);
  if (!/^own_[\w-]{22}$/.test(ownerId)) return null;
  return safeEqual(signature, hmac(secret, `owner:${ownerId}`)) ? ownerId : null;
}

export function clientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0]!.trim();
  return request.headers.get('x-real-ip')?.trim() || 'unknown';
}

export interface VisitorOptions {
  secret: string;
  insecureCookies: boolean;
}

/**
 * Guest visitor identity: a random owner id in an HttpOnly signed cookie. A session id alone
 * never grants access; every resource stores its owner and is checked against this.
 */
export function resolveVisitor(request: Request, options: VisitorOptions, create = true): Visitor {
  if (!options.secret) throw new ApiError('FEATURE_DISABLED', 'The server is missing its signing secret.');
  const ipHash = sha256(`${options.secret}:${clientIp(request)}`).slice(0, 24);
  const existing = verifyOwner(readCookie(request.headers.get('cookie'), OWNER_COOKIE), options.secret);
  if (existing) return { ownerId: existing, headers: {}, ipHash };
  if (!create) throw new ApiError('NOT_FOUND', 'Not found.');
  const ownerId = newId('own');
  const attributes = [`${OWNER_COOKIE}=${encodeURIComponent(signOwner(ownerId, options.secret))}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${OWNER_MAX_AGE}`];
  if (!options.insecureCookies) attributes.push('Secure');
  return { ownerId, headers: { 'Set-Cookie': attributes.join('; ') }, ipHash };
}

/**
 * Mutations must come from our own origin. Browsers always send Origin on POST; a mismatch or
 * a cross-site fetch is rejected.
 */
export function assertSameOrigin(request: Request, appUrl: string | null): void {
  const origin = request.headers.get('origin');
  const site = request.headers.get('sec-fetch-site');
  if (site === 'cross-site') throw new ApiError('FORBIDDEN_ORIGIN', 'Cross-site requests are not allowed.');
  if (!origin) return;
  const requestOrigin = new URL(request.url).origin;
  const forwardedHost = request.headers.get('x-forwarded-host');
  const forwardedProto = request.headers.get('x-forwarded-proto') ?? 'https';
  const allowed = new Set([requestOrigin]);
  if (appUrl) allowed.add(new URL(appUrl).origin);
  if (forwardedHost) allowed.add(`${forwardedProto}://${forwardedHost}`);
  const host = request.headers.get('host');
  if (host) {
    allowed.add(`http://${host}`);
    allowed.add(`https://${host}`);
  }
  if (!allowed.has(origin)) throw new ApiError('FORBIDDEN_ORIGIN', 'Requests must come from this site.');
}
