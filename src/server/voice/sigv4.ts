import { createHash, createHmac } from 'node:crypto';

function rfc3986(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

function hmacRaw(key: Buffer | string, data: string): Buffer {
  return createHmac('sha256', key).update(data).digest();
}

export interface PresignInput {
  method: 'GET' | 'PUT' | 'HEAD' | 'DELETE';
  protocol?: 'https:' | 'http:';
  host: string;
  /** Path already split into raw segments, e.g. "/bucket/key". */
  path: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  expiresSeconds: number;
  now: Date;
}

/** AWS Signature V4 query-string presigning for S3-compatible storage (UNSIGNED-PAYLOAD). */
export function presignUrl(input: PresignInput): string {
  const amzDate = input.now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const date = amzDate.slice(0, 8);
  const scope = `${date}/${input.region}/s3/aws4_request`;
  const canonicalUri = input.path
    .split('/')
    .map((segment) => rfc3986(segment))
    .join('/');
  const query: Record<string, string> = {
    'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
    'X-Amz-Credential': `${input.accessKeyId}/${scope}`,
    'X-Amz-Date': amzDate,
    'X-Amz-Expires': String(input.expiresSeconds),
    'X-Amz-SignedHeaders': 'host',
  };
  const canonicalQuery = Object.keys(query)
    .sort()
    .map((k) => `${rfc3986(k)}=${rfc3986(query[k]!)}`)
    .join('&');
  const canonicalRequest = [input.method, canonicalUri, canonicalQuery, `host:${input.host}`, '', 'host', 'UNSIGNED-PAYLOAD'].join('\n');
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, createHash('sha256').update(canonicalRequest).digest('hex')].join('\n');
  const kDate = hmacRaw(`AWS4${input.secretAccessKey}`, date);
  const kRegion = hmacRaw(kDate, input.region);
  const kService = hmacRaw(kRegion, 's3');
  const kSigning = hmacRaw(kService, 'aws4_request');
  const signature = createHmac('sha256', kSigning).update(stringToSign).digest('hex');
  return `${input.protocol ?? 'https:'}//${input.host}${canonicalUri}?${canonicalQuery}&X-Amz-Signature=${signature}`;
}
