import { levelHome, levelProjects, levelSkills, levelContact, levelRetry } from '../../levels';
import type { MazeDescriptor } from '../../types';
import { generateMaze } from '../mazeGenerator';
import { getStartPosition } from './spawn';
import { withPerfMeasure } from '../perf';

const descriptorCache = new Map<string, MazeDescriptor>();

function withStartPosition(descriptor: Omit<MazeDescriptor, 'startPosition'>): MazeDescriptor {
  return {
    ...descriptor,
    startPosition: getStartPosition(descriptor.map),
  };
}

function getOrCreateCached(path: string, create: () => MazeDescriptor): MazeDescriptor {
  const cached = descriptorCache.get(path);
  if (cached) return cached;
  const descriptor = create();
  descriptorCache.set(path, descriptor);
  return descriptor;
}

export function randomSeed(): string {
  return Math.random().toString(36).substring(7);
}

export function mazeFromPath(path: string): MazeDescriptor {
  if (path === '/projects') return getOrCreateCached(path, () => withStartPosition({ id: 'projects', path, map: levelProjects }));
  if (path === '/skills') return getOrCreateCached(path, () => withStartPosition({ id: 'skills', path, map: levelSkills }));
  if (path === '/contact') return getOrCreateCached(path, () => withStartPosition({ id: 'contact', path, map: levelContact }));

  if (path === '/endless') {
    const seed = randomSeed();
    const map = withPerfMeasure('routing.generateMaze', () => generateMaze(seed));
    return {
      id: 'endless',
      path: `/endless/${seed}`,
      map,
      startPosition: getStartPosition(map),
    };
  }

  const retryMatch = path.match(/^\/endless\/([^/]+)\/retry$/);
  if (retryMatch) {
    return getOrCreateCached(path, () => withStartPosition({ id: 'retry', path, map: levelRetry }));
  }

  const endlessMatch = path.match(/^\/endless\/([^/]+)$/);
  if (endlessMatch) {
    const seed = endlessMatch[1];
    const endlessPath = `/endless/${seed}`;
    return getOrCreateCached(endlessPath, () =>
      withStartPosition({
        id: 'endless',
        path: endlessPath,
        map: withPerfMeasure('routing.generateMaze', () => generateMaze(seed)),
      }),
    );
  }

  return getOrCreateCached('/', () => withStartPosition({ id: 'home', path: '/', map: levelHome }));
}
