import { describe, expect, it } from 'vitest';
import { COACH_INSTRUCTIONS, COACH_TOOLS } from '@/onboarding/coach-script';
import { GREETING } from '@/onboarding/domain/interviewer';
import { agentPatch, clientToolConfigs, COACH_LLM, describeDrift, OUTPUT_FORMAT } from '../../scripts/avatar/elevenlabs-agent';

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

  it('reports drift, and nothing once in sync', () => {
    const synced = { conversation_config: { agent: { first_message: GREETING, prompt: { prompt: COACH_INSTRUCTIONS, llm: COACH_LLM } }, tts: { agent_output_audio_format: OUTPUT_FORMAT } } };
    expect(describeDrift(synced, COACH_TOOLS.map((t) => t.name))).toEqual([]);
    const drift = describeDrift({ conversation_config: { agent: { prompt: { llm: 'eleven-realtime-v1-mini' } } } }, ['request_end']);
    expect(drift.join('\n')).toMatch(/prompt/);
    expect(drift.join('\n')).toMatch(/eleven-realtime-v1-mini → claude-sonnet-5-5/);
    expect(drift.join('\n')).toMatch(/first message/);
    expect(drift.join('\n')).toMatch(/pcm_24000/);
    expect(drift.join('\n')).toMatch(/propose_profile_patch/);
  });
});
