import { describe, expect, it } from 'vitest';
import { computeTrapDoorProgress } from './Trap';

describe('computeTrapDoorProgress', () => {
  it('is closed at cold start (matches legacy initial progress 0)', () => {
    expect(computeTrapDoorProgress(0)).toBe(0);
    expect(computeTrapDoorProgress(0.1)).toBe(0);
  });

  it('ramps open during the first open segment', () => {
    const dur = 0.25;
    expect(computeTrapDoorProgress(4)).toBe(0);
    expect(computeTrapDoorProgress(4 + dur / 2)).toBeCloseTo(0.5, 5);
    expect(computeTrapDoorProgress(4 + dur)).toBe(1);
  });

  it('stays fully open until the wrap, then closes after a full cycle has elapsed', () => {
    const dur = 0.25;
    expect(computeTrapDoorProgress(5)).toBe(1);
    expect(computeTrapDoorProgress(8)).toBe(1);
    expect(computeTrapDoorProgress(8 + dur / 2)).toBeCloseTo(0.5, 5);
    expect(computeTrapDoorProgress(8 + dur)).toBe(0);
  });
});
