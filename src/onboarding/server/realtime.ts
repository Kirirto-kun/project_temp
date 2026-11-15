import 'server-only';

import { COACH_INSTRUCTIONS, COACH_TOOLS } from '../coach-script';

export { COACH_INSTRUCTIONS, COACH_TOOLS };

export interface RealtimeSecret {
  value: string;
  expiresAt: string;
}

/**
 * Mints a short-lived client secret for a browser WebRTC connection to the Realtime API.
 * The API key stays on the server; the secret only allows creating this one session.
 */
export async function mintRealtimeSecret(input: { apiKey: string; model: string; voice: string; transcribeModel: string; fetchImpl?: typeof fetch }): Promise<RealtimeSecret> {
  const response = await (input.fetchImpl ?? fetch)('https://api.openai.com/v1/realtime/client_secrets', {
    method: 'POST',
    headers: { Authorization: `Bearer ${input.apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      expires_after: { anchor: 'created_at', seconds: 120 },
      session: {
        type: 'realtime',
        model: input.model,
        instructions: COACH_INSTRUCTIONS,
        audio: {
          input: { transcription: { model: input.transcribeModel, language: 'en' }, turn_detection: { type: 'semantic_vad', eagerness: 'low' } },
          output: { voice: input.voice },
        },
        tools: COACH_TOOLS,
        tool_choice: 'auto',
      },
    }),
    cache: 'no-store',
  });
  if (!response.ok) throw new Error(`Realtime secret request failed with ${response.status}`);
  const body = (await response.json()) as { value?: string; expires_at?: number };
  if (!body.value) throw new Error('Realtime secret missing in response');
  return { value: body.value, expiresAt: new Date((body.expires_at ?? Math.floor(Date.now() / 1000) + 120) * 1000).toISOString() };
}
