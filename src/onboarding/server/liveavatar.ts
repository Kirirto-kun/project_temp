import 'server-only';
import { z } from 'zod';

const API = 'https://api.liveavatar.com/v1';
const TokenResponse = z.object({
  code: z.literal(1000),
  data: z.object({ session_id: z.string().min(1).max(120), session_token: z.string().min(1).max(16_384) }),
});

export interface LiveAvatarSettings {
  apiKey: string;
  avatarId: string;
  secretId: string;
  agentId: string;
  sandbox: boolean;
}

export interface LiveAvatarClient {
  /** LITE session bound to the ElevenLabs coach agent. The API key and agent secret never leave the server. */
  mintToken(input: { maxSeconds: number }): Promise<{ sessionId: string; sessionToken: string }>;
  /** An unknown or already-ended session (the browser SDK often stops first) counts as stopped. */
  stopSession(sessionId: string): Promise<void>;
}

export class LiveAvatarError extends Error {}

export function createLiveAvatar(settings: LiveAvatarSettings, fetchImpl: typeof fetch = fetch): LiveAvatarClient {
  const headers = { 'X-API-KEY': settings.apiKey, 'Content-Type': 'application/json' };
  return {
    async mintToken({ maxSeconds }) {
      const seconds = Math.max(1, Math.min(300, Math.floor(maxSeconds)));
      const response = await fetchImpl(`${API}/sessions/token`, {
        method: 'POST',
        headers,
        cache: 'no-store',
        signal: AbortSignal.timeout(15_000),
        body: JSON.stringify({
          mode: 'LITE',
          avatar_id: settings.avatarId,
          is_sandbox: settings.sandbox,
          max_session_duration: seconds,
          video_settings: { quality: 'high', encoding: 'H264' },
          elevenlabs_agent_config: { secret_id: settings.secretId, agent_id: settings.agentId },
        }),
      });
      if (!response.ok) throw new LiveAvatarError(`LiveAvatar token request failed with ${response.status}`);
      const parsed = TokenResponse.safeParse(await response.json().catch(() => null));
      if (!parsed.success) throw new LiveAvatarError('LiveAvatar token response was not understood');
      return { sessionId: parsed.data.data.session_id, sessionToken: parsed.data.data.session_token };
    },
    async stopSession(sessionId) {
      const response = await fetchImpl(`${API}/sessions/stop`, {
        method: 'POST',
        headers,
        cache: 'no-store',
        signal: AbortSignal.timeout(8_000),
        body: JSON.stringify({ session_id: sessionId, reason: 'USER_CLOSED' }),
      });
      if (response.ok || response.status === 400 || response.status === 404 || response.status === 409) return;
      throw new LiveAvatarError(`LiveAvatar stop failed with ${response.status}`);
    },
  };
}
