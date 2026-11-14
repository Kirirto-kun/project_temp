/**
 * Keeps the ElevenLabs "Holdline Coach" agent identical to the audio coach: prompt, first
 * message, client tools, LLM and PCM 24K output. Dry run by default; writes only with --apply.
 */
import { agentPatch, clientToolConfigs, describeDrift, type AgentSnapshot } from './avatar/elevenlabs-agent';

const API = 'https://api.elevenlabs.io/v1/convai';
const key = process.env.ELEVENLABS_API_KEY?.trim();
const agentId = process.env.ELEVENLABS_COACH_AGENT_ID?.trim();
const apply = process.argv.includes('--apply');

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API}${path}`, { ...init, headers: { 'xi-api-key': key!, 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(20_000) });
  const body = (await response.json().catch(() => null)) as T;
  if (!response.ok) throw new Error(`${init.method ?? 'GET'} ${path} failed with ${response.status}: ${JSON.stringify(body).slice(0, 500)}`);
  return body;
}

interface ToolRecord { id: string; tool_config?: { name?: string } }

async function main() {
  if (!key) throw new Error('Add ELEVENLABS_API_KEY to .env.local first.');
  if (!agentId) {
    const { agents } = await call<{ agents: { agent_id: string; name: string }[] }>('/agents?search=Holdline');
    console.log('ELEVENLABS_COACH_AGENT_ID is not set. Agents matching "Holdline":');
    for (const a of agents) console.log(`  ${a.agent_id}  ${a.name}`);
    process.exitCode = 1;
    return;
  }
  const agent = await call<AgentSnapshot>(`/agents/${encodeURIComponent(agentId)}`);
  const { tools } = await call<{ tools: ToolRecord[] }>('/tools');
  const attached = new Set(agent.conversation_config?.agent?.prompt?.tool_ids ?? []);
  const attachedNames = tools.filter((t) => attached.has(t.id)).map((t) => t.tool_config?.name ?? '');
  const drift = describeDrift(agent, attachedNames);
  if (!drift.length) {
    console.log('The agent already matches the coach.');
    return;
  }
  console.log('Changes for the agent:');
  for (const line of drift) console.log(`  - ${line}`);
  if (!apply) {
    console.log('\nDry run. Re-run with --apply to write these settings.');
    return;
  }
  const ids: string[] = [];
  for (const config of clientToolConfigs()) {
    const existing = tools.find((t) => t.tool_config?.name === config.name);
    if (existing) {
      await call(`/tools/${encodeURIComponent(existing.id)}`, { method: 'PATCH', body: JSON.stringify({ tool_config: config }) });
      ids.push(existing.id);
    } else {
      const created = await call<{ id: string }>('/tools', { method: 'POST', body: JSON.stringify({ tool_config: config }) });
      ids.push(created.id);
    }
  }
  await call(`/agents/${encodeURIComponent(agentId)}`, { method: 'PATCH', body: JSON.stringify(agentPatch(ids)) });
  console.log('Agent updated.');
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
