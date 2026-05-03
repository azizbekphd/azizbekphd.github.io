import type { LevelMap } from '../types';
import {
  createPortalTile,
  TILE_FLOOR as FLOOR,
  TILE_START as START,
  TILE_TRAP as TRAP,
  TILE_WALL as WALL,
} from './maze/tileConstants';

// Simple seeded random number generator
class SquirrelRandom {
  private seed: number;
  constructor(seed: number) {
    this.seed = seed;
  }
  next() {
    this.seed = (this.seed * 16807) % 2147483647;
    return (this.seed - 1) / 2147483646;
  }
}

export function generateMaze(seedStr: string, size = 21): LevelMap {
  let seedNum = 0;
  for (let i = 0; i < seedStr.length; i++) {
    seedNum = (seedNum << 5) - seedNum + seedStr.charCodeAt(i);
    seedNum |= 0;
  }
  const rng = new SquirrelRandom(Math.abs(seedNum) || 1);

  const maze: LevelMap = Array(size).fill(0).map(() => Array(size).fill(WALL));
  const stack: [number, number][] = [];
  const startX = 1;
  const startZ = 1;
  maze[startZ][startX] = FLOOR;
  stack.push([startX, startZ]);

  while (stack.length > 0) {
    const [currX, currZ] = stack[stack.length - 1];
    const neighbors: [number, number, number, number][] = [];
    [[0, -2], [0, 2], [-2, 0], [2, 0]].forEach(([dx, dz]) => {
      const nx = currX + dx;
      const nz = currZ + dz;
      if (nx > 0 && nx < size - 1 && nz > 0 && nz < size - 1 && maze[nz][nx] === WALL) {
        neighbors.push([nx, nz, dx, dz]);
      }
    });
    if (neighbors.length > 0) {
      const idx = Math.floor(rng.next() * neighbors.length);
      const [nx, nz, dx, dz] = neighbors[idx];
      maze[nz][nx] = FLOOR;
      maze[currZ + dz / 2][currX + dx / 2] = FLOOR; 
      stack.push([nx, nz]);
    } else {
      stack.pop();
    }
  }

  maze[1][1] = START;

  let nextPos: [number, number] | null = null;
  for (let z = size - 2; z > size / 2 && !nextPos; z--) {
    for (let x = size - 2; x > size / 2 && !nextPos; x--) {
      if (maze[z][x] === FLOOR) {
        maze[z][x] = createPortalTile('endless', 'NEXT', '#00ff88');
        nextPos = [x, z];
      }
    }
  }

  const pathList: [number, number][] = [];
  const pathVisited = new Uint8Array(size * size);
  if (nextPos) {
    const toIndex = (x: number, z: number) => z * size + x;
    const startIdx = toIndex(1, 1);
    const targetIdx = toIndex(nextPos[0], nextPos[1]);
    const parent = new Int32Array(size * size);
    parent.fill(-1);
    const queue = new Int32Array(size * size);
    let head = 0;
    let tail = 0;
    queue[tail++] = startIdx;
    pathVisited[startIdx] = 1;

    while (head < tail) {
      const idx = queue[head++];
      if (idx === targetIdx) break;
      const x = idx % size;
      const z = Math.floor(idx / size);
      const neighbors: [number, number][] = [
        [x, z + 1],
        [x, z - 1],
        [x + 1, z],
        [x - 1, z],
      ];
      for (const [nx, nz] of neighbors) {
        if (nx < 0 || nx >= size || nz < 0 || nz >= size) continue;
        if (maze[nz][nx] === WALL) continue;
        const nextIdx = toIndex(nx, nz);
        if (pathVisited[nextIdx]) continue;
        pathVisited[nextIdx] = 1;
        parent[nextIdx] = idx;
        queue[tail++] = nextIdx;
      }
    }

    if (pathVisited[targetIdx]) {
      let idx = targetIdx;
      while (idx !== -1) {
        const x = idx % size;
        const z = Math.floor(idx / size);
        pathList.push([x, z]);
        idx = parent[idx];
      }
      pathList.reverse();
    }
  }
  const pathSet = new Uint8Array(size * size);
  for (const [x, z] of pathList) {
    pathSet[z * size + x] = 1;
  }

  // Place traps on the main path with uneven spacing (seeded random partition of the path)
  if (pathList.length > 30) {
    const targetTraps = 20;
    const pathLo = 2;
    const pathHi = pathList.length - 2;
    const span = pathHi - pathLo;
    if (span > targetTraps) {
      const weights = Array.from({ length: targetTraps + 1 }, () => rng.next() + 0.01);
      const totalW = weights.reduce((a, b) => a + b, 0);
      let wPrefix = 0;
      let lastIndex = pathLo - 1;
      for (let i = 0; i < targetTraps; i++) {
        wPrefix += weights[i];
        let index = pathLo + Math.floor((wPrefix / totalW) * span);
        index = Math.min(pathHi - 1, index);
        if (index <= lastIndex) {
          index = Math.min(pathHi - 1, lastIndex + 1);
        }
        if (index > pathHi - 1) break;
        lastIndex = index;
        const [tx, tz] = pathList[index];
        if (maze[tz][tx] === FLOOR) {
          maze[tz][tx] = TRAP;
        }
      }
    }
  }

  // Place "Back Home" hole (2) - Ensure it's NOT on the path
  let placedHome = false;
  for (let z = 1; z < size - 1 && !placedHome; z++) {
    for (let x = size - 2; x > 1 && !placedHome; x--) {
      if (maze[z][x] === FLOOR && pathSet[z * size + x] === 0) {
        maze[z][x] = createPortalTile('home', 'HOME', '#ffffff');
        placedHome = true;
      }
    }
  }

  return maze;
}
