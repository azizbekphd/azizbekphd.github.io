import { describe, expect, it } from 'vitest';
import { getStartPosition } from './spawn';

describe('spawn helpers', () => {
  it('maps start tile to world coordinates', () => {
    const map = [
      [1, 1, 1],
      [1, 9, 1],
      [1, 1, 1],
    ];

    expect(getStartPosition(map)).toEqual([0, 0.5, 0]);
  });

  it('falls back safely when start tile does not exist', () => {
    const map = [
      [1, 1, 1],
      [1, 0, 1],
      [1, 1, 1],
    ];

    expect(getStartPosition(map, 2)).toEqual([0, 2.5, 0]);
  });
});
