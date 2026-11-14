/**
 * Live classifier evaluation against the 30 labelled replies. Paid: it calls the configured
 * model once or twice per reply. Run before a release and whenever the model or prompt changes:
 *   ANTHROPIC_API_KEY=... npm run test:classifier:live
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import type { CoreState } from '@/contracts/domain';
import { createInitialState } from '@/engine';
import { classifyMove } from '@/intelligence/classifier';
import { modelPortsFromEnv, type ModelUsage } from '@/server/llm/provider';
import { RAISE_CONFIG, playSession } from '@/testing/fixtures';

interface Item {
  id: string;
  text: string;
  state: Partial<CoreState>;
  expected: { type: string; amountMinor: number | null };
}

async function main() {
  const usage: ModelUsage[] = [];
  const deps = modelPortsFromEnv(process.env, (u) => usage.push(u));
  if (!deps.available) {
    console.error('No model configured. Set ANTHROPIC_API_KEY (and optionally LLM_MODEL_FAST).');
    process.exit(2);
  }
  const fixtures = JSON.parse(readFileSync('tests/intelligence/fixtures/classifier-30.json', 'utf8')) as { items: Item[] };
  const rows: { id: string; ok: boolean; typeOk: boolean; amountOk: boolean; got: unknown; ms: number }[] = [];
  for (const item of fixtures.items) {
    const base = playSession(RAISE_CONFIG, []);
    const session = { ...base, state: { ...createInitialState(RAISE_CONFIG), ...item.state } };
    const started = Date.now();
    const move = await classifyMove({ turnId: `eval-${item.id}-0000`, expectedVersion: 1, text: item.text, mode: 'text', sourceTurnKey: null }, session, deps);
    const typeOk = move.type === item.expected.type;
    const amountOk = move.amountMinor === item.expected.amountMinor;
    rows.push({ id: item.id, ok: typeOk && amountOk, typeOk, amountOk, got: { type: move.type, amountMinor: move.amountMinor }, ms: Date.now() - started });
    console.log(`${typeOk && amountOk ? 'PASS' : 'FAIL'} ${item.id} ${JSON.stringify(item.text)} -> ${move.type} ${move.amountMinor ?? ''}`);
  }
  const report = {
    ranAt: new Date().toISOString(),
    models: [...new Set(usage.map((u) => u.model))],
    typeAccuracy: rows.filter((r) => r.typeOk).length / rows.length,
    amountAccuracy: rows.filter((r) => r.amountOk).length / rows.length,
    passed: rows.filter((r) => r.ok).length,
    total: rows.length,
    inputTokens: usage.reduce((s, u) => s + u.inputTokens, 0),
    outputTokens: usage.reduce((s, u) => s + u.outputTokens, 0),
    meanLatencyMs: Math.round(rows.reduce((s, r) => s + r.ms, 0) / rows.length),
    rows,
  };
  mkdirSync('docs/operations/reports', { recursive: true });
  writeFileSync('docs/operations/reports/classifier-live.json', JSON.stringify(report, null, 2));
  console.log(`\n${report.passed}/${report.total} passed. Types ${(report.typeAccuracy * 100).toFixed(0)}%, amounts ${(report.amountAccuracy * 100).toFixed(0)}%, mean ${report.meanLatencyMs} ms.`);
  process.exit(report.passed === report.total ? 0 : 1);
}

void main();
