import { describe, expect, it } from 'vitest';
import { buildMazeLayoutData } from './layout';

describe('maze layout data', () => {
  it('merges contiguous wall colliders', () => {
    const map = [
      [1, 1],
      [1, 1],
    ];
    const layout = buildMazeLayoutData(map);
    expect(layout.wallColliders).toHaveLength(1);
    expect(layout.wallColliders[0].args).toEqual([1, 0, 1]);
  });

  it('extracts traps and portals with stable metadata', () => {
    const map = [
      [1, 1, 1],
      [1, 9, { type: 'portal', destination: 'home', label: 'HOME' }],
      [1, 6, 1],
    ];
    const layout = buildMazeLayoutData(map);

    expect(layout.floorColliders).toHaveLength(1);
    expect(layout.traps).toHaveLength(1);
    expect(layout.portals).toHaveLength(1);
    expect(layout.portals[0].portal.destination).toBe('home');
    expect(layout.traps[0].slideDirection).toEqual({ x: 1, z: 0 });
  });
});
