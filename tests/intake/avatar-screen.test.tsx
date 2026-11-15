// @vitest-environment jsdom
// tests/intake/avatar-screen.test.tsx
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { IntakeView } from '@/onboarding/contracts';

const mocks = vi.hoisted(() => ({
  getIntake: vi.fn(),
  calls: [] as { events: { failed(message: string): void } }[],
  audioRevisions: [] as number[],
}));

vi.mock('@/onboarding/client/api', () => ({
  getIntake: mocks.getIntake,
  connectVideo: vi.fn(),
  postVideoTurn: vi.fn(),
  stopIntake: vi.fn(),
}));

vi.mock('@/onboarding/client/avatar-call', () => ({
  AvatarCall: class {
    constructor(_api: unknown, _factory: unknown, readonly events: { failed(message: string): void }) {
      mocks.calls.push(this);
    }
    attach() {}
    start = vi.fn(async () => undefined);
    end = vi.fn(async () => undefined);
  },
}));

vi.mock('@/onboarding/client/avatar-session', () => ({ createAvatarSession: vi.fn() }));
vi.mock('@/onboarding/ui/TextCoach', () => ({ TextCoach: () => <div>text coach</div>, Captions: () => null }));
vi.mock('@/onboarding/ui/ProfileSoFar', () => ({ ProfileSoFar: () => null }));
vi.mock('@/onboarding/ui/Review', () => ({ Review: () => <div>review</div> }));
vi.mock('@/onboarding/ui/AudioCoach', () => ({
  AudioCoach: ({ view }: { view: IntakeView }) => {
    mocks.audioRevisions.push(view.revision);
    return <div>audio coach r{view.revision}</div>;
  },
}));

import { AvatarCoach } from '@/onboarding/ui/AvatarCoach';
import { IntakeScreen } from '@/onboarding/ui/IntakeScreen';

const videoView = (revision: number) => ({ id: 'int_x', revision, mode: 'video', phase: 'lobby', deadlineAt: null, availability: { avatarIntake: true, coachVoice: true, audioAnalysis: false }, publicProfile: {}, committedTranscript: [] }) as unknown as IntakeView;

afterEach(() => {
  cleanup();
  mocks.calls.length = 0;
  mocks.audioRevisions.length = 0;
  mocks.getIntake.mockReset();
});

describe('AvatarCoach', () => {
  it('a double click on Start opens only one call', () => {
    render(<AvatarCoach view={videoView(1)} onView={() => {}} onFallback={() => {}} onTypeInstead={() => {}} />);
    const button = screen.getByRole('button', { name: 'Start the video call' });
    act(() => {
      button.click();
      button.click();
    });
    expect(mocks.calls).toHaveLength(1);
  });
});

describe('IntakeScreen fallback', () => {
  it('shows the next coach only with the re-read intake, and the notice at once', async () => {
    let reread!: (v: IntakeView) => void;
    mocks.getIntake.mockResolvedValueOnce(videoView(1)).mockImplementationOnce(() => new Promise<IntakeView>((r) => (reread = r)));
    render(<IntakeScreen id="int_x" />);
    const start = await screen.findByRole('button', { name: 'Start the video call' });
    act(() => start.click());
    act(() => mocks.calls[0]!.events.failed('The call dropped.'));
    expect(screen.getByText('The call dropped.')).toBeTruthy();
    expect(screen.queryByText(/audio coach/)).toBeNull();
    await act(async () => reread(videoView(4)));
    expect(await screen.findByText('audio coach r4')).toBeTruthy();
    expect(mocks.audioRevisions).not.toContain(1);
  });
});
