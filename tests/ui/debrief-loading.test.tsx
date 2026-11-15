import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Debrief } from '@/contracts/voice';
import { buildDebrief } from '@/intelligence/debrief';
import { NO_MODEL } from '@/intelligence/ports';
import { DebriefScreen } from '@/features/debrief/DebriefScreen';
import { RAISE_CONFIG, move, playSession } from '@/testing/fixtures';

const api = vi.hoisted(() => ({ getDebrief: vi.fn(), getConfig: vi.fn(), replay: vi.fn() }));
vi.mock('@/client/api/session', () => api);
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));

describe('DebriefScreen while the debrief is being written', () => {
  beforeEach(() => {
    api.getConfig.mockReturnValue(new Promise(() => undefined));
  });
  it('shows a visible waiting line, not only placeholders, and replaces it with the report', async () => {
    let deliver!: (d: Debrief) => void;
    api.getDebrief.mockReturnValue(new Promise<Debrief>((resolve) => (deliver = resolve)));
    render(<DebriefScreen sessionId="ses_test" />);

    const line = screen.getAllByText('Writing your debrief. This can take several seconds.').find((el) => !el.closest('.sr-only'));
    expect(line).toBeDefined();
    expect(screen.getByRole('status')).toHaveTextContent('Writing your debrief.');
    expect(screen.queryByText('Left on the table')).toBeNull();

    const session = playSession({ ...RAISE_CONFIG, objections: [] }, [move('accept')]);
    const debrief = await buildDebrief(session, null, NO_MODEL);
    await act(async () => deliver(debrief));
    expect(screen.getByText('Left on the table')).toBeInTheDocument();
    expect(screen.queryByText(/Writing your debrief/)).toBeNull();
  });
});
