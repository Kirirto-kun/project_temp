// @vitest-environment jsdom
// tests/intake/call-stage.test.tsx
import { act, cleanup, render, screen } from '@testing-library/react';
import { createRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CallStage, type CallStageProps } from '@/components/holdline/CallStage';

afterEach(cleanup);

function stage(overrides: Partial<CallStageProps> = {}) {
  const props: CallStageProps = {
    videoRef: createRef<HTMLVideoElement>(),
    live: false,
    state: 'idle',
    name: 'Alex',
    subtitle: 'AI practice coach',
    placeholder: <span>avatar</span>,
    speaking: false,
    status: 'Ready when you are.',
    timeLeft: null,
    caption: null,
    muted: false,
    startLabel: 'Start the video call',
    onStart: vi.fn(),
    onMute: vi.fn(),
    endLabel: 'End and review',
    onEnd: vi.fn(),
    ...overrides,
  };
  render(<CallStage {...props} />);
  return props;
}

describe('CallStage', () => {
  it('the lobby shows the start button and no call controls', () => {
    const props = stage({ secondary: { label: 'Type instead', onClick: vi.fn() } });
    act(() => screen.getByRole('button', { name: 'Start the video call' }).click());
    expect(props.onStart).toHaveBeenCalledOnce();
    expect(screen.getByRole('button', { name: 'Type instead' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'End and review' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Mute' })).toBeNull();
    expect(screen.getByRole('status').textContent).toBe('Ready when you are.');
  });

  it('an active call shows mute and end, with the timer', () => {
    const props = stage({ state: 'active', live: true, muted: true, timeLeft: 45 });
    const mute = screen.getByRole('button', { name: 'Mute' });
    expect(mute.getAttribute('aria-pressed')).toBe('true');
    act(() => mute.click());
    act(() => screen.getByRole('button', { name: 'End and review' }).click());
    expect(props.onMute).toHaveBeenCalledOnce();
    expect(props.onEnd).toHaveBeenCalledOnce();
    expect(screen.getByText('0:45')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Start the video call' })).toBeNull();
  });

  it('the CC toggle hides and shows the caption', () => {
    stage({ state: 'active', live: true, caption: { speaker: 'Alex', text: 'What role are you going for?' } });
    expect(screen.getByText('What role are you going for?')).toBeTruthy();
    const cc = screen.getByRole('button', { name: 'Captions' });
    expect(cc.getAttribute('aria-pressed')).toBe('true');
    act(() => cc.click());
    expect(screen.queryByText('What role are you going for?')).toBeNull();
    expect(cc.getAttribute('aria-pressed')).toBe('false');
    act(() => cc.click());
    expect(screen.getByText('What role are you going for?')).toBeTruthy();
  });

  it('ending disables the controls', () => {
    stage({ state: 'ending', status: 'Call ended' });
    expect((screen.getByRole('button', { name: 'End and review' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Mute' }) as HTMLButtonElement).disabled).toBe(true);
  });
});
