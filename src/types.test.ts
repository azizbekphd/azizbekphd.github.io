import { describe, expect, it } from 'vitest';
import { getTileType, isFloor, isStart, isWall } from './types';

describe('tile helpers', () => {
  it('resolves numeric tile types', () => {
    expect(getTileType(0)).toBe('floor');
    expect(getTileType(1)).toBe('wall');
    expect(getTileType(6)).toBe('trap');
    expect(getTileType(9)).toBe('start');
    expect(getTileType(123)).toBe('unknown');
  });

  it('resolves object tile types', () => {
    expect(getTileType({ type: 'portal', destination: 'home' })).toBe('portal');
    expect(getTileType({ type: 'trap' })).toBe('trap');
  });

  it('identifies wall, floor-like and start tiles', () => {
    expect(isWall(1)).toBe(true);
    expect(isWall(0)).toBe(false);

    expect(isFloor(0)).toBe(true);
    expect(isFloor(9)).toBe(true);
    expect(isFloor({ type: 'portal', destination: 'home' })).toBe(true);
    expect(isFloor({ type: 'trap' })).toBe(true);
    expect(isFloor(1)).toBe(false);

    expect(isStart(9)).toBe(true);
    expect(isStart({ type: 'start' })).toBe(true);
    expect(isStart(0)).toBe(false);
  });
});
