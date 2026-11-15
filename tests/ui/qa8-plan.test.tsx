import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Debrief } from '@/contracts/voice';
import { buildDebrief } from '@/intelligence/debrief';
import { NO_MODEL } from '@/intelligence/ports';
import { finishSession } from '@/engine';
import { loadPlan, savePlan } from '@/client/storage/plan';
import { RAISE_CONFIG, move, playSession } from '@/testing/fixtures';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
const api = vi.hoisted(() => ({ getDebrief: vi.fn(), getConfig: vi.fn(), replay: vi.fn() }));
vi.mock('@/client/api/session', () => api);

import { DebriefScreen } from '@/features/debrief/DebriefScreen';
import { PlanScreen } from '@/features/plan/PlanScreen';

async function stoppedDebrief(): Promise<Debrief> {
  const session = playSession(RAISE_CONFIG, [move('state_number', 11_000_000, true)]);
  return buildDebrief({ ...session, state: finishSession(session.state, 'stopped') }, null, NO_MODEL);
}
async function dealDebrief(): Promise<Debrief> {
  const config = { ...RAISE_CONFIG, objections: [] };
  const session = playSession(config, [move('state_number', 11_200_000, true), move('state_number', 11_200_000, true), move('state_number', 11_200_000, true), move('concede', 10_400_000)]);
  return buildDebrief(session, null, NO_MODEL);
}

async function openDebriefAndAdd(debrief: Debrief) {
  api.getDebrief.mockResolvedValue(debrief);
  const view = render(<DebriefScreen sessionId={debrief.sessionId} />);
  const add = await screen.findByText('Add to my plan');
  // jsdom does not navigate; the click must still leave the entry in storage.
  add.addEventListener('click', (e) => e.preventDefault());
  fireEvent.click(add);
  await waitFor(() => expect(loadPlan().results.length).toBeGreaterThan(0));
  return view;
}

describe('QA-8: Add to my plan', () => {
  beforeEach(() => {
    window.localStorage.clear();
    savePlan({ conversations: [], results: [] });
    push.mockReset();
    api.getConfig.mockResolvedValue({ capabilities: {} });
  });

  it.each([
    ['no agreement', stoppedDebrief],
    ['a deal', dealDebrief],
  ])('adds the practised conversation to the plan after %s', async (_name, make) => {
    const debrief = await make();
    const view = await openDebriefAndAdd(debrief);
    const stored = loadPlan();
    expect(stored.conversations).toHaveLength(1);
    expect(stored.conversations[0]).toMatchObject({ kind: 'raise', lastSessionId: debrief.sessionId, status: 'planned' });
    // storage shape unchanged: still { v: 1, data: { conversations, results } } under hl-plan
    const raw = JSON.parse(window.localStorage.getItem('hl-plan')!);
    expect(raw.v).toBe(1);
    expect(Object.keys(raw.data).sort()).toEqual(['conversations', 'results']);
    view.unmount();

    render(<PlanScreen />);
    expect(screen.queryByText(/No finished rounds yet/)).toBeNull();
    expect(screen.queryByText(/Nothing planned yet/)).toBeNull();
    const queue = screen.getByRole('heading', { name: 'Coming up' }).closest('section')!;
    expect(within(queue).getByText(/with your manager/i)).toBeInTheDocument();
  });

  it('does not add the same round twice, also after a replay of it', async () => {
    const debrief = await stoppedDebrief();
    const first = await openDebriefAndAdd(debrief);
    fireEvent.click(screen.getByText('Add to my plan'));
    expect(loadPlan().conversations).toHaveLength(1);
    first.unmount();
    const replayed = { ...debrief, sessionId: 'ses_replay', replayOf: debrief.sessionId };
    await openDebriefAndAdd(replayed);
    await waitFor(() => expect(loadPlan().results).toHaveLength(2));
    const stored = loadPlan();
    expect(stored.conversations).toHaveLength(1);
    expect(stored.conversations[0]!.lastSessionId).toBe('ses_replay');
  });

  it('plan with only a no-agreement round does not claim there are no finished rounds', async () => {
    const debrief = await stoppedDebrief();
    savePlan({ conversations: [], results: [{ sessionId: debrief.sessionId, replayRootId: debrief.replayRootId, kind: 'raise', period: 'year', outcome: 'stopped', gainMinor: null, leftOnTableMinor: null, finishedAt: '2026-11-15T03:03:15.429Z' }] });
    render(<PlanScreen />);
    expect(screen.queryByText(/No finished rounds yet/)).toBeNull();
    expect(screen.getByText('No agreement')).toBeInTheDocument();
  });

  it('an empty plan still shows the first-run panel', () => {
    render(<PlanScreen />);
    expect(screen.getByText(/No finished rounds yet/)).toBeInTheDocument();
    expect(screen.getByText(/Nothing planned yet/)).toBeInTheDocument();
  });
});
