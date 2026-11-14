type Level = 'info' | 'warn' | 'error';

const FORBIDDEN_KEYS = /(key|secret|token|authorization|password|text|transcript|audio|salary|cookie)/i;

/**
 * Structured log line. Values under keys that could carry secrets or personal content are
 * dropped, so request text, transcripts and amounts never reach ordinary logs.
 */
export function logEvent(level: Level, event: string, fields: Record<string, unknown> = {}): void {
  if (process.env.NODE_ENV === 'test' || process.env.VITEST) return;
  const safe: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined) continue;
    if (FORBIDDEN_KEYS.test(key)) continue;
    safe[key] = typeof value === 'string' ? value.slice(0, 200) : value;
  }
  const line = JSON.stringify({ level, event, at: new Date().toISOString(), ...safe });
  if (level === 'error') console.error(line);
  else console.log(line);
}
