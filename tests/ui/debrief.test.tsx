import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { buildDebrief } from '@/intelligence/debrief';
import { NO_MODEL } from '@/intelligence/ports';
import { finishSession } from '@/engine';
import { DebriefReport } from '@/features/debrief/DebriefReport';
import { RAISE_CONFIG, RENT_CONFIG, move, playSession } from '@/testing/fixtures';

describe('DebriefReport', () => {
  it('shows left on the table with its formula for an accepted raise', async () => {
    const config = { ...RAISE_CONFIG, objections: [] };
    const session = playSession(config, [move('state_number', 11_200_000, true), move('state_number', 11_200_000, true), move('state_number', 11_200_000, false), move('concede', 10_400_000)]);
    render(<DebriefReport debrief={await buildDebrief(session, null, NO_MODEL)} />);
    expect(screen.getByText('$8,000/year')).toBeInTheDocument();
    expect(screen.getByText(/\$112,000\/year ceiling − \$104,000\/year agreed/)).toBeInTheDocument();
    expect(screen.queryByText(/Model assessment · persuasion/)).toBeNull();
  });
  it('rent: shows the monthly gap and the yearly equivalent', async () => {
    const config = { ...RENT_CONFIG, objections: [] };
    const session = playSession(config, [move('accept')]);
    render(<DebriefReport debrief={await buildDebrief(session, null, NO_MODEL)} />);
    expect(screen.getByText('$200/month')).toBeInTheDocument();
    expect(screen.getByText(/About \$2,400 per year/)).toBeInTheDocument();
  });
  it('no agreement is not shown as zero or as a loss', async () => {
    const session = playSession(RAISE_CONFIG, [move('offtopic')]);
    const stopped = { ...session, state: finishSession(session.state, 'stopped') };
    render(<DebriefReport debrief={await buildDebrief(stopped, null, NO_MODEL)} />);
    expect(screen.getAllByText(/No agreement/).length).toBeGreaterThan(0);
    expect(screen.queryByText('Left on the table')).toBeNull();
  });
  it('marks voice pending without hiding the money', async () => {
    const config = { ...RAISE_CONFIG, objections: [] };
    const session = playSession(config, [move('accept')]);
    const debrief = await buildDebrief(session, { status: 'pending', baselineId: null, turns: [], formulaVersion: 1, reason: null }, NO_MODEL);
    render(<DebriefReport debrief={debrief} />);
    expect(screen.getByText(/still being analysed/)).toBeInTheDocument();
    expect(screen.getByText('Left on the table')).toBeInTheDocument();
  });
});
