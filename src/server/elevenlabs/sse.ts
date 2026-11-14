/** OpenAI-compatible chat.completion.chunk SSE framing for the agent's custom LLM. */
export function sseChunk(id: string, created: number, content: string | null, finish: 'stop' | null = null): string {
  const delta = content === null ? {} : { role: 'assistant', content };
  return `data: ${JSON.stringify({ id, object: 'chat.completion.chunk', created, model: 'holdline-engine', choices: [{ index: 0, delta, finish_reason: finish }] })}\n\n`;
}

export const SSE_DONE = 'data: [DONE]\n\n';

export const SSE_HEADERS = {
  'Content-Type': 'text/event-stream; charset=utf-8',
  'Cache-Control': 'no-cache, no-transform',
  Connection: 'keep-alive',
  'X-Accel-Buffering': 'no',
} as const;

/** Splits a checked reply into short sentence chunks so speech can start early. */
export function chunkReply(text: string): string[] {
  const parts = text.match(/[^.?!]+[.?!]*\s*/g) ?? [text];
  return parts.map((p) => p).filter((p) => p.trim().length > 0);
}
