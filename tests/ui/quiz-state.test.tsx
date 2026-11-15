import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, replace: vi.fn(), back: vi.fn() }) }));
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import { EMPTY_DRAFT, loadDraft, saveDraft, type DraftState } from '@/client/storage/draft';
import { QuizFlow } from '@/features/quiz/QuizFlow';
import { ResultView } from '@/features/setup/ResultView';
import { startRound } from '@/features/setup/start-round';

/** What Review.tsx stores after "Confirm and start my practice" (copied from a real browser run). */
const COACH_DRAFT: DraftState = {
  ...EMPTY_DRAFT,
  draft: {
    kind: 'raise',
    counterpartRole: 'Manager',
    userRole: 'backend engineer',
    description: "I don't know the market, but I took over the payments team.",
    fear: 'They will say the budget is frozen.',
    conversationDate: null,
    inputMode: 'personal',
    currency: 'USD',
    period: 'year',
    currentMinor: 9_500_000,
    targetMinor: 11_000_000,
    moneyBasis: 'gross',
    marketLowMinor: 9_500_000,
    marketHighMinor: 11_000_000,
    rangeSource: 'practice_assumption',
    sourceIntakeId: 'int_OLD',
  },
  intake: { intakeId: 'int_OLD', profileRevision: 10, missingFields: ['avatarId'] },
};

const live = <T extends Element>(els: T[]): T => {
  const visible = els.filter((el) => !el.closest('[inert]'));
  if (visible.length !== 1) throw new Error(`expected one live element, found ${visible.length}`);
  return visible[0]!;
};
const button = (name: string | RegExp) => live(screen.getAllByRole('button', { name }));
const field = (label: string) => live(screen.getAllByLabelText(label)) as HTMLInputElement;
const type = (label: string, value: string) => fireEvent.change(field(label), { target: { value } });
const next = () => fireEvent.click(button('Continue'));
const stepShown = async (n: number) => waitFor(() => expect(screen.getByText(`${n}/7`)).toBeInTheDocument());

async function fillFrom(kindTile: string, amounts: { current: string; target: string; low: string; high: string } | null) {
  await waitFor(() => expect(screen.getByText('What are you negotiating?')).toBeInTheDocument());
  fireEvent.click(button(new RegExp(`^${kindTile}`)));
  await stepShown(2);
  next();
  await stepShown(3);
  if (amounts) type('Amount in US dollars', amounts.current);
  next();
  await stepShown(4);
  if (amounts) type('Your target in US dollars', amounts.target);
  next();
  await stepShown(5);
  type('Low end', amounts?.low ?? '90000');
  type('High end', amounts?.high ?? '120000');
  next();
  await stepShown(6);
  next(); // the worry step is optional and left untouched
  await stepShown(7);
  next();
}

async function postedBody(state: DraftState) {
  const fetchMock = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify({ session: { id: 'ses_1' } }), { status: 201 }));
  vi.stubGlobal('fetch', fetchMock);
  await startRound(state, null);
  vi.unstubAllGlobals();
  expect(fetchMock.mock.calls[0]![0]).toBe('/api/session');
  return JSON.parse(String(fetchMock.mock.calls[0]![1]!.body)) as Record<string, unknown> & { quiz?: Record<string, unknown> };
}

beforeEach(() => {
  sessionStorage.clear();
  push.mockReset();
  window.scrollTo = vi.fn() as never;
});

describe('QA-3: quick form after a confirmed coach intake', () => {
  it('coach only: the round is still created from the confirmed intake', async () => {
    saveDraft(COACH_DRAFT);
    const body = await postedBody({ ...loadDraft(), avatarId: 'tom-becker' });
    expect(body).toEqual({ intakeId: 'int_OLD', profileRevision: 10, avatarId: 'tom-becker', baselineId: null });
  });

  it('coach, then quick form as Rent: the round is created from the quick form', async () => {
    saveDraft(COACH_DRAFT);
    render(<QuizFlow />);
    await fillFrom('Rent', { current: '2000', target: '1800', low: '1700', high: '2100' });
    await waitFor(() => expect(push).toHaveBeenCalledWith('/result'));
    const stored = loadDraft();
    expect(stored.intake).toBeNull();
    const body = await postedBody({ ...stored, avatarId: 'linda-park' });
    expect(body.intakeId).toBeUndefined();
    expect(body.quiz).toMatchObject({ kind: 'rent', period: 'month', currentMinor: 200_000, targetMinor: 180_000, marketLowMinor: 170_000, marketHighMinor: 210_000, avatarId: 'linda-park' });
  });

  it('coach, then quick form as a raise with other numbers: the new numbers are sent', async () => {
    saveDraft(COACH_DRAFT);
    render(<QuizFlow />);
    await fillFrom('A raise', { current: '120000', target: '140000', low: '125000', high: '150000' });
    await waitFor(() => expect(push).toHaveBeenCalledWith('/result'));
    const body = await postedBody({ ...loadDraft(), avatarId: 'maya-chen' });
    expect(body.intakeId).toBeUndefined();
    expect(body.quiz).toMatchObject({ kind: 'raise', currentMinor: 12_000_000, targetMinor: 14_000_000, rangeSource: 'user_provided' });
  });
});

describe('QA-17: changing the kind inside the quick form', () => {
  const RAISE_DONE: DraftState = {
    ...EMPTY_DRAFT,
    draft: {
      kind: 'raise', period: 'year', counterpartRole: 'Director', currency: 'USD', inputMode: 'personal', moneyBasis: 'gross', userRole: 'Data analyst',
      currentMinor: 8_750_000, targetMinor: 10_130_000, marketLowMinor: 9_000_000, marketHighMinor: 10_470_000, rangeSource: 'user_provided',
      fear: 'They will say there is no budget until next year.', description: 'Promotion cycle', conversationDate: '2026-12-03',
    },
  };

  it('raise -> rent starts with empty amounts and no salary-only data', async () => {
    saveDraft(RAISE_DONE);
    render(<QuizFlow />);
    await waitFor(() => expect(screen.getByText('What are you negotiating?')).toBeInTheDocument());
    fireEvent.click(button(/^Rent/));
    await stepShown(2);
    next();
    await stepShown(3);
    expect(field('Amount in US dollars').value).toBe('');
    expect(screen.queryByText(/\$87,500\/month/)).toBeNull();
    const d = loadDraft().draft;
    expect(d.currentMinor).toBeUndefined();
    expect(d.targetMinor).toBeUndefined();
    expect(d.userRole).toBeUndefined();
    expect(d.fear ?? '').toBe('');
    expect(d.description ?? '').toBe('');
    expect(d.conversationDate ?? null).toBeNull();
    expect(d.moneyBasis).toBe('unspecified');
  });

  it('raise -> rent can be finished without typing a worry, and sends a clean rent quiz', async () => {
    saveDraft(RAISE_DONE);
    render(<QuizFlow />);
    await fillFrom('Rent', { current: '2350', target: '2180', low: '2100', high: '2400' });
    await waitFor(() => expect(push).toHaveBeenCalledWith('/result'));
    const body = await postedBody({ ...loadDraft(), avatarId: 'linda-park' });
    expect(body.quiz).toMatchObject({ kind: 'rent', currentMinor: 235_000, targetMinor: 218_000, fear: '', description: '', conversationDate: null, moneyBasis: 'unspecified' });
    expect(body.quiz).not.toHaveProperty('userRole');
  });

  it('re-selecting the same kind keeps the entered amounts and the worry', async () => {
    saveDraft(RAISE_DONE);
    render(<QuizFlow />);
    await waitFor(() => expect(screen.getByText('What are you negotiating?')).toBeInTheDocument());
    fireEvent.click(button(/^A raise/));
    await stepShown(2);
    const d = loadDraft().draft;
    expect(d).toMatchObject({ currentMinor: 8_750_000, targetMinor: 10_130_000, moneyBasis: 'gross', userRole: 'Data analyst', fear: 'They will say there is no budget until next year.' });
  });

  it('a first run (empty draft) can be finished without typing a worry', async () => {
    render(<QuizFlow />);
    await fillFrom('A raise', { current: '95000', target: '110000', low: '100000', high: '112000' });
    await waitFor(() => expect(push).toHaveBeenCalledWith('/result'));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('the rent result card does not print a tax basis; the raise card still does', async () => {
    saveDraft({ ...EMPTY_DRAFT, draft: { kind: 'rent', period: 'month', counterpartRole: 'Landlord', currentMinor: 235_000, targetMinor: 218_000, marketLowMinor: 218_000, marketHighMinor: 235_000, rangeSource: 'practice_assumption', moneyBasis: 'gross' } });
    const rent = render(<ResultView />);
    await waitFor(() => expect(screen.getByText('Gap to your own target')).toBeInTheDocument());
    expect(screen.queryByText(/Before tax|After tax|Not specified/)).toBeNull();
    expect(screen.getByText(/per month/)).toBeInTheDocument();
    rent.unmount();
    saveDraft(RAISE_DONE);
    render(<ResultView />);
    await waitFor(() => expect(screen.getByText(/Before tax · per year/)).toBeInTheDocument());
  });
});
