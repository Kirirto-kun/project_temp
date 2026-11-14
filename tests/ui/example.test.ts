import { describe, expect, it } from 'vitest';
import { exampleDebrief } from '@/content/example';

describe('example debrief', () => {
  it('runs through the real engine and ends in an $8,000 gap', async () => {
    const debrief = await exampleDebrief();
    expect(debrief.outcome).toBe('accepted');
    expect(debrief.agreedMinor).toBe(10_400_000);
    expect(debrief.leftOnTableMinor).toBe(800_000);
    expect(debrief.inputMode).toBe('example');
    expect(debrief.rows.at(-1)?.voice?.turnId).toBe('example-6');
  });
});
