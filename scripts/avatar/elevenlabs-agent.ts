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

export interface ToolRecord {
  id: string;
  tool_config?: Record<string, unknown>;
}

const COMPARED_KEYS = ['name', 'description', 'expects_response', 'response_timeout_secs', 'parameters'] as const;

const sortKeys = (value: unknown): unknown =>
  Array.isArray(value)
    ? value.map(sortKeys)
    : value && typeof value === 'object'
      ? Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, sortKeys(v)]))
      : value;

/** Canonical form of only the fields we manage, so server-added fields do not count as drift. */
const comparable = (config: Record<string, unknown> | undefined) =>
  JSON.stringify(sortKeys(Object.fromEntries(COMPARED_KEYS.map((k) => [k, config?.[k] ?? undefined]))));

/** The workspace client tool that is the coach tool `name`, if any (same name AND type client). */
export function findCoachTool(tools: ToolRecord[], name: string): ToolRecord | undefined {
  return tools.find((t) => t.tool_config?.name === name && t.tool_config?.type === 'client');
}

/** Which coach tools need a PATCH (config differs) and which must be created. In-sync tools appear in neither. */
export function planToolSync(tools: ToolRecord[]): { update: { id: string; config: ClientToolConfig }[]; create: ClientToolConfig[] } {
  const update: { id: string; config: ClientToolConfig }[] = [];
  const create: ClientToolConfig[] = [];
  for (const config of clientToolConfigs()) {
    const existing = findCoachTool(tools, config.name);
    if (!existing) create.push(config);
    else if (comparable(existing.tool_config) !== comparable(config as unknown as Record<string, unknown>)) update.push({ id: existing.id, config });
  }
  return { update, create };
}

const short = (s: string | undefined) => (s === undefined ? '(none)' : s.length > 60 ? `${s.slice(0, 57)}…` : s);

/** Human-readable differences between the live agent (and workspace tools) and what the code expects. */
export function describeDrift(agent: AgentSnapshot, tools: ToolRecord[]): string[] {
  const a = agent.conversation_config?.agent;
  const lines: string[] = [];
  if (a?.prompt?.prompt !== COACH_INSTRUCTIONS) lines.push('prompt: will be replaced with the audio coach instructions');
  if (a?.prompt?.llm !== COACH_LLM) lines.push(`llm: ${a?.prompt?.llm ?? '(none)'} → ${COACH_LLM}`);
  if (a?.first_message !== GREETING) lines.push(`first message: "${short(a?.first_message)}" → "${short(GREETING)}"`);
  const format = agent.conversation_config?.tts?.agent_output_audio_format;
  if (format !== OUTPUT_FORMAT) lines.push(`output format: ${format ?? '(default)'} → ${OUTPUT_FORMAT}`);
  const attached = a?.prompt?.tool_ids ?? [];
  const coachTools = clientToolConfigs().map((config) => ({ config, record: findCoachTool(tools, config.name) }));
  const missing = coachTools.filter((c) => !c.record || !attached.includes(c.record.id)).map((c) => c.config.name);
  if (missing.length) lines.push(`client tools to attach: ${missing.join(', ')}`);
  for (const { config, record } of coachTools) {
    if (record && comparable(record.tool_config) !== comparable(config as unknown as Record<string, unknown>)) lines.push(`tool ${config.name}: config will be updated`);
  }
  const coachIds = new Set(coachTools.flatMap((c) => (c.record ? [c.record.id] : [])));
  const detach = attached.filter((id) => !coachIds.has(id)).map((id) => (tools.find((t) => t.id === id)?.tool_config?.name as string | undefined) ?? id);
  if (detach.length) lines.push(`tools to detach: ${detach.join(', ')}`);
  return lines;
}
