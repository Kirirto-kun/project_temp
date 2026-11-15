import 'server-only';
import { ElevenLabsScribe, type ScribeClient } from '../voice/scribe';

export interface TtsClient {
  /** MP3 audio of `text` spoken in `voiceId`, streamed from the provider. */
  synthesize(text: string, voiceId: string, signal?: AbortSignal): Promise<ReadableStream<Uint8Array>>;
}

export class TtsError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'TtsError';
  }
}

/** ElevenLabs text-to-speech. The API key stays on the server; only audio bytes reach the browser. */
export class ElevenLabsTts implements TtsClient {
  constructor(
    private readonly apiKey: string,
    private readonly modelId: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async synthesize(text: string, voiceId: string, signal?: AbortSignal): Promise<ReadableStream<Uint8Array>> {
    const response = await this.fetchImpl(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}/stream?output_format=mp3_44100_64`, {
      method: 'POST',
      headers: {
        'xi-api-key': this.apiKey,
        'Content-Type': 'application/json',
        Accept: 'audio/mpeg',
      },
      body: JSON.stringify({ text, model_id: this.modelId }),
      signal,
      cache: 'no-store',
    });
    if (!response.ok || !response.body) throw new TtsError(response.status, `Text-to-speech failed with ${response.status}`);
    return response.body;
  }
}

/**
 * Premade ElevenLabs voices used when ELEVENLABS_VOICE_MAP has no entry. The map is the same
 * JSON object the voice agent uses ({"warm_mid":"<voice id>", ...}); the key "coach" sets Alex's voice.
 */
export const DEFAULT_VOICES: Readonly<Record<string, string>> = {
  coach: 'EXAVITQu4vr4xnSDxMaL',
  warm_mid: 'XrExE9yKIg1WjnnlVkGX',
  steady_low: 'JBFqnCBsd6RMkjVDRZzb',
  bright_mid: 'TX3LPaxmHKxFdv7VOQHJ',
  calm_high: 'XB0fDUnXU5powFXDhCwa',
};
const FALLBACK_VOICE = 'JBFqnCBsd6RMkjVDRZzb';

export interface SpeechClients {
  stt: ScribeClient;
  tts: TtsClient;
  /** ElevenLabs voice id for 'coach' or a persona voiceKey. */
  voiceFor(key: string): string;
}

export function voiceResolver(voiceMap: Record<string, string>): (key: string) => string {
  return (key) => voiceMap[key] ?? DEFAULT_VOICES[key] ?? FALLBACK_VOICE;
}

export function createSpeechClients(config: { apiKey: string; sttModel: string; ttsModel: string; voiceMap: Record<string, string> }): SpeechClients {
  return {
    stt: new ElevenLabsScribe(config.apiKey, config.sttModel),
    tts: new ElevenLabsTts(config.apiKey, config.ttsModel),
    voiceFor: voiceResolver(config.voiceMap),
  };
}
