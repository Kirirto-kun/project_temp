import 'server-only';

export interface ElevenLabsAgentClient {
  conversationToken(signal?: AbortSignal): Promise<string>;
  signedUrl(signal?: AbortSignal): Promise<string>;
}

export class ElevenLabsError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
    this.name = 'ElevenLabsError';
  }
}

/** Short-lived client credentials for the negotiation agent. The API key never leaves the server. */
export class ElevenLabsAgentCredentials implements ElevenLabsAgentClient {
  constructor(
    private readonly apiKey: string,
    private readonly agentId: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  private async get<T>(path: string, signal?: AbortSignal): Promise<T> {
    const response = await this.fetchImpl(`https://api.elevenlabs.io${path}`, { headers: { 'xi-api-key': this.apiKey }, signal, cache: 'no-store' });
    if (!response.ok) throw new ElevenLabsError(response.status, `ElevenLabs credential request failed with ${response.status}`);
    return (await response.json()) as T;
  }

  async conversationToken(signal?: AbortSignal) {
    const body = await this.get<{ token?: string }>(`/v1/convai/conversation/token?agent_id=${encodeURIComponent(this.agentId)}`, signal);
    if (!body.token) throw new ElevenLabsError(502, 'No conversation token returned');
    return body.token;
  }

  async signedUrl(signal?: AbortSignal) {
    const body = await this.get<{ signed_url?: string }>(`/v1/convai/conversation/get-signed-url?agent_id=${encodeURIComponent(this.agentId)}`, signal);
    if (!body.signed_url) throw new ElevenLabsError(502, 'No signed URL returned');
    return body.signed_url;
  }
}
