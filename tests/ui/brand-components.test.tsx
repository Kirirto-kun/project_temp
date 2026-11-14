import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Meter } from '@/components/holdline/Meter';
import { Money } from '@/components/holdline/Money';
import { OfferBar } from '@/components/holdline/OfferBar';
import { AVATAR_CARDS, ILLUSTRATIONS } from '@/content/avatars';
import { PERSONAS } from '@/scenarios/personas';

describe('Money', () => {
  it('formats cents with periods and shows unknown for null', () => {
    const { rerender } = render(<Money amountMinor={10_400_000} />);
    expect(screen.getByText('$104,000')).toBeInTheDocument();
    rerender(<Money amountMinor={20_000} period="month" />);
    expect(screen.getByText('$200/month')).toBeInTheDocument();
    rerender(<Money amountMinor={null} />);
    expect(screen.getByText('Unknown')).toBeInTheDocument();
  });
});

describe('Meter', () => {
  it('turns amber and says low at 24, not at 25', () => {
    const { rerender } = render(<Meter label="Patience" value={24} />);
    expect(screen.getByRole('meter', { name: 'Patience' })).toHaveAttribute('aria-valuetext', '24, low');
    expect(screen.getByText('low')).toBeInTheDocument();
    rerender(<Meter label="Patience" value={25} />);
    expect(screen.getByRole('meter', { name: 'Patience' })).toHaveAttribute('aria-valuetext', '25');
    expect(screen.queryByText('low')).toBeNull();
  });
});

describe('OfferBar', () => {
  it('shows the ceiling only when it is provided', () => {
    const { rerender } = render(<OfferBar objective="maximize" period="year" currentMinor={9_500_000} offerMinor={9_800_000} targetMinor={11_000_000} />);
    expect(screen.queryByText('Scenario ceiling')).toBeNull();
    rerender(<OfferBar objective="maximize" period="year" currentMinor={9_500_000} offerMinor={10_400_000} targetMinor={11_000_000} reservationAmountMinor={11_200_000} agreedMinor={10_400_000} />);
    expect(screen.getByText('Scenario ceiling')).toBeInTheDocument();
    expect(screen.getByText('$8,000/year left')).toBeInTheDocument();
  });
  it('labels a rent floor', () => {
    render(<OfferBar objective="minimize" period="month" currentMinor={200_000} offerMinor={200_000} targetMinor={180_000} reservationAmountMinor={180_000} agreedMinor={200_000} />);
    expect(screen.getByText('Scenario floor')).toBeInTheDocument();
    expect(screen.getByText('$200/month left')).toBeInTheDocument();
  });
});

describe('catalog cards', () => {
  it('match the server personas one to one with an illustration each', () => {
    expect(AVATAR_CARDS.map((c) => c.avatarId)).toEqual(PERSONAS.map((p) => p.avatarId));
    for (const card of AVATAR_CARDS) expect(ILLUSTRATIONS[card.avatarId]).toBeDefined();
  });
});
