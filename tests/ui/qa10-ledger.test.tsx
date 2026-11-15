import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { buildDebrief } from '@/intelligence/debrief';
import { NO_MODEL } from '@/intelligence/ports';
import { buildBaseScenario } from '@/scenarios';
import { DebriefReport } from '@/features/debrief/DebriefReport';
import { RAISE_CONFIG, RENT_QUIZ, move, playSession } from '@/testing/fixtures';

const RENT = buildBaseScenario({ ...RENT_QUIZ, currentMinor: 230_000, targetMinor: 210_000, marketLowMinor: 205_000, marketHighMinor: 240_000 });

describe('QA-10: debrief ledger badge and footer', () => {
  it('rent: a landlord price cut is not shown with a plus sign, and the footer does not say the landlord pays', async () => {
    const session = playSession(RENT, [move('state_number', 210_000, false), move('justify'), move('concede', 215_000), move('concede', 220_000)]);
    const debrief = await buildDebrief(session, null, NO_MODEL);
    expect(debrief.rows[1]!.offerDeltaMinor).toBe(6_300);
    const { container } = render(<DebriefReport debrief={debrief} />);
    const badges = [...container.querySelectorAll('ol[aria-label="Moves ledger"] > li > span.badge')].map((b) => b.textContent ?? '');
    expect(badges).toHaveLength(4);
    for (const badge of badges) expect(badge).not.toMatch(/^\+\$/);
    expect(badges[1]).toContain('$63/month');
    expect(screen.queryByText(/landlord would pay/)).toBeNull();
  });
  it('raise: the badge stays "+$… offer"', async () => {
    const config = { ...RAISE_CONFIG, objections: [] };
    const session = playSession(config, [move('state_number', 11_200_000, true), move('state_number', 11_200_000, true), move('state_number', 11_200_000, true), move('concede', 10_400_000)]);
    const debrief = await buildDebrief(session, null, NO_MODEL);
    const { container } = render(<DebriefReport debrief={debrief} />);
    const badges = [...container.querySelectorAll('ol[aria-label="Moves ledger"] > li > span.badge')].map((b) => b.textContent ?? '');
    expect(badges[0]).toBe('+$3,400/year offer');
    expect(screen.getByText(/It says nothing about what a real manager would pay\./)).toBeInTheDocument();
  });
});
