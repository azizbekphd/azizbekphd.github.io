import { describe, expect, it } from 'vitest';
import { levelHome, levelProjects, levelRetry } from '../../levels';
import { generateMaze } from '../mazeGenerator';
import { mazeFromPath } from './routing';

describe('maze routing helpers', () => {
  it('resolves static maze paths', () => {
    expect(mazeFromPath('/projects')).toEqual(
      expect.objectContaining({
        id: 'projects',
        path: '/projects',
        map: levelProjects,
      }),
    );
    expect(mazeFromPath('/')).toEqual(
      expect.objectContaining({
        id: 'home',
        path: '/',
        map: levelHome,
      }),
    );
  });

  it('resolves endless path with explicit seed deterministically', () => {
    const result = mazeFromPath('/endless/my-seed');
    expect(result.id).toBe('endless');
    expect(result.path).toBe('/endless/my-seed');
    expect(result.map).toEqual(generateMaze('my-seed'));
  });

  it('resolves retry path for endless mode', () => {
    expect(mazeFromPath('/endless/abc/retry')).toEqual(
      expect.objectContaining({
        id: 'retry',
        path: '/endless/abc/retry',
        map: levelRetry,
      }),
    );
  });
});
