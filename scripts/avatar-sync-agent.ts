/**
 * Keeps the ElevenLabs "Holdline Coach" agent identical to the audio coach: prompt, first
 * message, client tools, LLM and PCM 24K output. Dry run by default; writes only with --apply.
 */
import { agentPatch, clientToolConfigs, describeDrift, findCoachTool, planToolSync, type AgentSnapshot, type ToolRecord } from './avatar/elevenlabs-agent';

const API = 'https://api.elevenlabs.io/v1/convai';
const key = process.env.ELEVENLABS_API_KEY?.trim();
const agentId = process.env.ELEVENLABS_COACH_AGENT_ID?.trim();
const apply = process.argv.includes('--apply');

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const method = init.method ?? 'GET';
  let response: Response;
  try {
    response = await fetch(`${API}${path}`, { ...init, headers: { 'xi-api-key': key!, 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(20_000) });
  } catch (err) {
    throw new Error(`${method} ${path}: ${(err as Error).message}`);
  }
  const body = (await response.json().catch(() => null)) as T;
  if (!response.ok) throw new Error(`${method} ${path} failed with ${response.status}: ${JSON.stringify(body).slice(0, 500)}`);
  return body;
}

async function main() {
  if (!key) throw new Error('Add ELEVENLABS_API_KEY to .env.local first.');
  if (!agentId) {
    const { agents } = await call<{ agents: { agent_id: string; name: string }[] }>('/agents?search=Holdline');
    console.log('ELEVENLABS_COACH_AGENT_ID is not set. Agents matching "Holdline":');
    for (const a of agents) console.log(`  ${a.agent_id}  ${a.name}`);
    return;
  }
  const agent = await call<AgentSnapshot>(`/agents/${encodeURIComponent(agentId)}`);
  const { tools } = await call<{ tools: ToolRecord[] }>('/tools');
  const drift = describeDrift(agent, tools);
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
  const updated: string[] = [];
  const created: string[] = [];
  let step = '';
  try {
    const plan = planToolSync(tools);
    const createdIds = new Map<string, string>();
    for (const { id, config } of plan.update) {
      step = `update tool ${config.name}`;
      await call(`/tools/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify({ tool_config: config }) });
      updated.push(config.name);
    }
    for (const config of plan.create) {
      step = `create tool ${config.name}`;
      const result = await call<{ id: string }>('/tools', { method: 'POST', body: JSON.stringify({ tool_config: config }) });
      createdIds.set(config.name, result.id);
      created.push(config.name);
    }
    const ids = clientToolConfigs().map((c) => (findCoachTool(tools, c.name)?.id ?? createdIds.get(c.name))!);
    step = 'patch agent';
    await call(`/agents/${encodeURIComponent(agentId)}`, { method: 'PATCH', body: JSON.stringify(agentPatch(ids)) });
  } catch (err) {
    const summary = `updated tools: ${updated.join(', ') || 'none'}; created: ${created.join(', ') || 'none'}; agent not yet patched`;
    console.error(`Step "${step}" failed: ${err instanceof Error ? err.message : String(err)}`);
    console.error(`Completed so far: ${summary}.`);
    console.error('Re-running `npm run avatar:sync-agent -- --apply` is safe.');
    process.exitCode = 1;
    return;
  }
  console.log('Agent updated.');
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
