import { describe, expect, it } from 'vitest';
import { COACH_INSTRUCTIONS, COACH_TOOLS } from '@/onboarding/coach-script';
import { GREETING } from '@/onboarding/domain/interviewer';
import { agentPatch, clientToolConfigs, COACH_LLM, describeDrift, OUTPUT_FORMAT, planToolSync } from '../../scripts/avatar/elevenlabs-agent';

describe('ElevenLabs coach agent config', () => {
  it('turns every coach tool into a client tool the agent waits on', () => {
    const tools = clientToolConfigs();
    expect(tools.map((t) => t.name)).toEqual(COACH_TOOLS.map((t) => t.name));
    for (const t of tools) {
      expect(t).toMatchObject({ type: 'client', expects_response: true, response_timeout_secs: 20 });
      expect(JSON.stringify(t)).not.toContain('additionalProperties');
    }
    const patch = tools.find((t) => t.name === 'propose_profile_patch')!;
    expect(patch.parameters?.required).toEqual(['field', 'quote']);
    for (const p of Object.values(patch.parameters!.properties)) expect((p as { description?: string }).description).toBeTruthy();
    expect(tools.find((t) => t.name === 'request_end')!.parameters).toBeUndefined();
  });

  it('patches prompt, first message, LLM, tools and audio format', () => {
    expect(agentPatch(['t1', 't2'])).toEqual({
      conversation_config: {
        agent: { first_message: GREETING, prompt: { prompt: COACH_INSTRUCTIONS, llm: COACH_LLM, tool_ids: ['t1', 't2'] } },
        tts: { agent_output_audio_format: OUTPUT_FORMAT },
      },
    });
  });

  const coach = clientToolConfigs();
  const workspace = coach.map((config, i) => ({ id: `t${i}`, tool_config: { ...config, extra_server_field: 'x' } as Record<string, unknown> }));
  const syncedAgent = (toolIds: string[]) => ({ conversation_config: { agent: { first_message: GREETING, prompt: { prompt: COACH_INSTRUCTIONS, llm: COACH_LLM, tool_ids: toolIds } }, tts: { agent_output_audio_format: OUTPUT_FORMAT } } });

  it('reports drift, and nothing once in sync', () => {
    expect(describeDrift(syncedAgent(workspace.map((t) => t.id)), workspace)).toEqual([]);
    const drift = describeDrift({ conversation_config: { agent: { prompt: { llm: 'eleven-realtime-v1-mini', tool_ids: ['x1'] } } } }, [{ id: 'x1', tool_config: { type: 'client', name: 'request_end' } }]);
    expect(drift.join('\n')).toMatch(/prompt/);
    expect(drift.join('\n')).toMatch(/eleven-realtime-v1-mini → claude-sonnet-5-5/);
    expect(drift.join('\n')).toMatch(/first message/);
    expect(drift.join('\n')).toMatch(/pcm_24000/);
    expect(drift.join('\n')).toMatch(/client tools to attach: .*propose_profile_patch/);
  });

  it('reports a stale tool config', () => {
    const stale = workspace.map((t, i) => (i === 0 ? { ...t, tool_config: { ...t.tool_config, description: 'old' } } : t));
    expect(describeDrift(syncedAgent(stale.map((t) => t.id)), stale)).toEqual([`tool ${coach[0]!.name}: config will be updated`]);
  });

  it('reports attached tools that are not coach tools', () => {
    const withExtra = [...workspace, { id: 'zz', tool_config: { type: 'client', name: 'legacy_tool' } }];
    expect(describeDrift(syncedAgent(withExtra.map((t) => t.id)), withExtra)).toEqual(['tools to detach: legacy_tool']);
    expect(describeDrift(syncedAgent([...workspace.map((t) => t.id), 'unknown']), workspace)).toEqual(['tools to detach: unknown']);
  });

  it('plans tool updates and creates, ignoring same-named non-client tools', () => {
    const [first, ...rest] = coach as [(typeof coach)[number], ...typeof coach];
    const plan = planToolSync([
      { id: 'a', tool_config: { type: 'client', name: first.name, description: 'old' } },
      { id: 'b', tool_config: { type: 'webhook', name: rest[0]!.name } },
    ]);
    expect(plan.update).toEqual([{ id: 'a', config: first }]);
    expect(plan.create.map((c) => c.name)).toEqual(rest.map((c) => c.name));
  });
});
