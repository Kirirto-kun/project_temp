import { COACH_INSTRUCTIONS, COACH_TOOLS } from '@/onboarding/coach-script';
import { GREETING } from '@/onboarding/domain/interviewer';

export const COACH_LLM = 'claude-sonnet-5-5';
export const OUTPUT_FORMAT = 'pcm_24000';

export interface ClientToolConfig {
  type: 'client';
  name: string;
  description: string;
  expects_response: true;
  response_timeout_secs: number;
  parameters?: { type: 'object'; properties: Record<string, unknown>; required: string[] };
}

export interface AgentSnapshot {
  conversation_config?: {
    agent?: { first_message?: string; prompt?: { prompt?: string; llm?: string; tool_ids?: string[] } };
    tts?: { agent_output_audio_format?: string };
  };
}

/** ElevenLabs client tools from the coach's OpenAI-style function tools (no additionalProperties; no empty schemas). */
export function clientToolConfigs(): ClientToolConfig[] {
  return COACH_TOOLS.map((tool) => {
    const params = tool.parameters as { properties: Record<string, unknown>; required?: readonly string[] };
    const hasParams = Object.keys(params.properties).length > 0;
    return {
      type: 'client',
      name: tool.name,
      description: tool.description,
      expects_response: true,
      response_timeout_secs: 20,
      ...(hasParams ? { parameters: { type: 'object' as const, properties: params.properties, required: [...(params.required ?? [])] } } : {}),
    };
  });
}

export function agentPatch(toolIds: string[]) {
  return {
    conversation_config: {
      agent: { first_message: GREETING, prompt: { prompt: COACH_INSTRUCTIONS, llm: COACH_LLM, tool_ids: toolIds } },
      tts: { agent_output_audio_format: OUTPUT_FORMAT },
    },
  };
}

const short = (s: string | undefined) => (s === undefined ? '(none)' : s.length > 60 ? `${s.slice(0, 57)}…` : s);

/** Human-readable differences between the live agent and what the code expects. */
export function describeDrift(agent: AgentSnapshot, attachedToolNames: string[]): string[] {
  const a = agent.conversation_config?.agent;
  const lines: string[] = [];
  if (a?.prompt?.prompt !== COACH_INSTRUCTIONS) lines.push('prompt: will be replaced with the audio coach instructions');
  if (a?.prompt?.llm !== COACH_LLM) lines.push(`llm: ${a?.prompt?.llm ?? '(none)'} → ${COACH_LLM}`);
  if (a?.first_message !== GREETING) lines.push(`first message: "${short(a?.first_message)}" → "${short(GREETING)}"`);
  const format = agent.conversation_config?.tts?.agent_output_audio_format;
  if (format !== OUTPUT_FORMAT) lines.push(`output format: ${format ?? '(default)'} → ${OUTPUT_FORMAT}`);
  const missing = COACH_TOOLS.map((t) => t.name).filter((n) => !attachedToolNames.includes(n));
  if (missing.length) lines.push(`client tools to attach: ${missing.join(', ')}`);
  return lines;
}
