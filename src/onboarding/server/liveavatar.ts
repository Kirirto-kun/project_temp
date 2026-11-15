import 'server-only';
import { z } from 'zod';

const API = 'https://api.liveavatar.com/v1';
const TokenResponse = z.object({
  code: z.union([z.literal(1000), z.literal(100)]),
  data: z.object({ session_id: z.string().min(1).max(120), session_token: z.string().min(1).max(16_384) }),
});

export interface LiveAvatarSettings {
  apiKey: string;
  avatarId: string;
  voiceId: string;
  sandbox: boolean;
}

export interface LiveAvatarClient {
  /** FULL session: LiveAvatar runs speech recognition and lip sync; our server writes every line Alex says. The API key never leaves the server. */
  mintToken(input: { maxSeconds: number } & AvatarOverride): Promise<{ sessionId: string; sessionToken: string }>;
  /** An unknown or already-ended session (the browser SDK often stops first) counts as stopped. */
  stopSession(sessionId: string): Promise<void>;
}

/**
 * A per-call avatar and voice (e.g. a negotiation counterpart). Ignored in the sandbox, which
 * only accepts its one stock avatar, so the configured avatar and voice are used there.
 */
export interface AvatarOverride {
  avatarId?: string;
  voiceId?: string;
}

export class LiveAvatarError extends Error {}

export function createLiveAvatar(settings: LiveAvatarSettings, fetchImpl: typeof fetch = fetch): LiveAvatarClient {
  const headers = { 'X-API-KEY': settings.apiKey, 'Content-Type': 'application/json' };
  return {
    async mintToken({ maxSeconds, avatarId, voiceId }) {
      // The free sandbox rejects sessions longer than a minute.
      const seconds = Math.max(1, Math.min(settings.sandbox ? 60 : 300, Math.floor(maxSeconds)));
      const response = await fetchImpl(`${API}/sessions/token`, {
        method: 'POST',
        headers,
        cache: 'no-store',
        signal: AbortSignal.timeout(15_000),
        body: JSON.stringify({
          mode: 'FULL',
          avatar_id: (!settings.sandbox && avatarId) || settings.avatarId,
          is_sandbox: settings.sandbox,
          max_session_duration: seconds,
          video_settings: { quality: 'high', encoding: 'H264' },
          avatar_persona: { voice_id: (!settings.sandbox && voiceId) || settings.voiceId, language: 'en' },
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
