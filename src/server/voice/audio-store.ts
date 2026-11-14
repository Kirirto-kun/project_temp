import 'server-only';
import { presignUrl } from './sigv4';

export interface UploadTarget {
  url: string;
  method: 'PUT';
  headers: Record<string, string>;
}

/** Private, temporary audio storage. Objects are never public and are deleted within 24 hours. */
export interface AudioStore {
  readonly kind: 's3' | 'memory';
  createUpload(key: string, mimeType: string, expiresSeconds: number): Promise<UploadTarget>;
  head(key: string): Promise<{ bytes: number } | null>;
  get(key: string): Promise<Uint8Array | null>;
  delete(key: string): Promise<void>;
}

export interface S3Config {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
}

export class S3AudioStore implements AudioStore {
  readonly kind = 's3' as const;
  private readonly host: string;
  private readonly protocol: 'https:' | 'http:';
  constructor(
    private readonly config: S3Config,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly now: () => Date = () => new Date(),
  ) {
    const url = new URL(config.endpoint);
    this.host = url.host;
    this.protocol = url.protocol === 'http:' ? 'http:' : 'https:';
  }

  private sign(method: 'GET' | 'PUT' | 'HEAD' | 'DELETE', key: string, expiresSeconds: number): string {
    return presignUrl({
      method,
      protocol: this.protocol,
      host: this.host,
      path: `/${this.config.bucket}/${key}`,
      region: this.config.region,
      accessKeyId: this.config.accessKeyId,
      secretAccessKey: this.config.secretAccessKey,
      expiresSeconds,
      now: this.now(),
    });
  }

  async createUpload(key: string, mimeType: string, expiresSeconds: number): Promise<UploadTarget> {
    return { url: this.sign('PUT', key, expiresSeconds), method: 'PUT', headers: { 'Content-Type': mimeType } };
  }

  async head(key: string) {
    const response = await this.fetchImpl(this.sign('HEAD', key, 60), { method: 'HEAD', cache: 'no-store' });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`Storage HEAD failed: ${response.status}`);
    return { bytes: Number(response.headers.get('content-length') ?? 0) };
  }

  async get(key: string) {
    const response = await this.fetchImpl(this.sign('GET', key, 120), { cache: 'no-store' });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`Storage GET failed: ${response.status}`);
    return new Uint8Array(await response.arrayBuffer());
  }

  async delete(key: string) {
    const response = await this.fetchImpl(this.sign('DELETE', key, 60), { method: 'DELETE', cache: 'no-store' });
    if (!response.ok && response.status !== 404) throw new Error(`Storage DELETE failed: ${response.status}`);
  }
}

interface MemoryBlob {
  bytes: Uint8Array;
  expiresAt: number;
}

/** Single-process store for development and tests; uploads go through /api/audio/:id/blob. */
export class MemoryAudioStore implements AudioStore {
  readonly kind = 'memory' as const;
  readonly blobs = new Map<string, MemoryBlob>();
  constructor(
    private readonly uploadUrl: (key: string) => string,
    private readonly now: () => number = Date.now,
  ) {}

  async createUpload(key: string, mimeType: string): Promise<UploadTarget> {
    return { url: this.uploadUrl(key), method: 'PUT', headers: { 'Content-Type': mimeType } };
  }

  put(key: string, bytes: Uint8Array, ttlSeconds = 86_400) {
    this.blobs.set(key, { bytes, expiresAt: this.now() + ttlSeconds * 1_000 });
  }

  private live(key: string) {
    const blob = this.blobs.get(key);
    if (!blob) return null;
    if (blob.expiresAt <= this.now()) {
      this.blobs.delete(key);
      return null;
    }
    return blob;
  }

  async head(key: string) {
    const blob = this.live(key);
    return blob ? { bytes: blob.bytes.byteLength } : null;
  }

  async get(key: string) {
    return this.live(key)?.bytes ?? null;
  }

  async delete(key: string) {
    this.blobs.delete(key);
  }
}
