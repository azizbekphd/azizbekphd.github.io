import { describe, expect, it } from 'vitest';
import { getTransitionVisualIntensity } from './frameControllers';

describe('getTransitionVisualIntensity', () => {
  it('returns 0 when startY is null', () => {
    expect(getTransitionVisualIntensity(0, -30, null)).toBe(0);
  });

  it('returns 0 when drop range is non-positive', () => {
    expect(getTransitionVisualIntensity(0, 5, 5)).toBe(0);
    expect(getTransitionVisualIntensity(0, 10, 5)).toBe(0);
  });

  it('returns 0 at the top of the fall and 1 at the target (ease-in squared)', () => {
    const targetY = -30;
    const startY = 0;
    expect(getTransitionVisualIntensity(startY, targetY, startY)).toBe(0);
    expect(getTransitionVisualIntensity(targetY, targetY, startY)).toBe(1);
  });

  it('clamps when the ball is above start or below target', () => {
    const targetY = -10;
    const startY = 10;
    expect(getTransitionVisualIntensity(20, targetY, startY)).toBe(0);
    expect(getTransitionVisualIntensity(-20, targetY, startY)).toBe(1);
  });

  it('uses ease-in: midpoint linear progress 0.5 yields 0.25', () => {
    const startY = 10;
    const targetY = 0;
    const midY = 5;
    expect(getTransitionVisualIntensity(midY, targetY, startY)).toBeCloseTo(0.25, 5);
  });
});
