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

export function generateMaze(seedStr: string, size = 15): number[][] {
  let seedNum = 0;
  for (let i = 0; i < seedStr.length; i++) {
    seedNum = (seedNum << 5) - seedNum + seedStr.charCodeAt(i);
    seedNum |= 0;
  }
  const rng = new SquirrelRandom(Math.abs(seedNum) || 1);

  const maze: number[][] = Array(size).fill(0).map(() => Array(size).fill(1));
  const stack: [number, number][] = [];
  const startX = 1;
  const startZ = 1;
  maze[startZ][startX] = 0;
  stack.push([startX, startZ]);

  while (stack.length > 0) {
    const [currX, currZ] = stack[stack.length - 1];
    const neighbors: [number, number, number, number][] = [];
    [[0, -2], [0, 2], [-2, 0], [2, 0]].forEach(([dx, dz]) => {
      const nx = currX + dx;
      const nz = currZ + dz;
      if (nx > 0 && nx < size - 1 && nz > 0 && nz < size - 1 && maze[nz][nx] === 1) {
        neighbors.push([nx, nz, dx, dz]);
      }
    });
    if (neighbors.length > 0) {
      const idx = Math.floor(rng.next() * neighbors.length);
      const [nx, nz, dx, dz] = neighbors[idx];
      maze[nz][nx] = 0;
      maze[currZ + dz / 2][currX + dx / 2] = 0; 
      stack.push([nx, nz]);
    } else {
      stack.pop();
    }
  }

  maze[1][1] = 9;

  let nextPos: [number, number] | null = null;
  for (let z = size - 2; z > size / 2 && !nextPos; z--) {
    for (let x = size - 2; x > size / 2 && !nextPos; x--) {
      if (maze[z][x] === 0) {
        maze[z][x] = 5;
        nextPos = [x, z];
      }
    }
  }

  const pathList: [number, number][] = [];
  if (nextPos) {
      const findPath = (cx: number, cz: number, targetX: number, targetZ: number, visited: Set<string>): [number, number][] | null => {
          const key = `${cx},${cz}`;
          if (cx === targetX && cz === targetZ) return [[cx, cz]];
          visited.add(key);
          const directions = [[0, 1], [0, -1], [1, 0], [-1, 0]];
          for (const [dx, dz] of directions) {
              const nx = cx + dx;
              const nz = cz + dz;
              if (nx >= 0 && nx < size && nz >= 0 && nz < size && maze[nz][nx] !== 1 && !visited.has(`${nx},${nz}`)) {
                  const res = findPath(nx, nz, targetX, targetZ, visited);
                  if (res) return [[cx, cz], ...res];
              }
          }
          return null;
      };
      const path = findPath(1, 1, nextPos[0], nextPos[1], new Set());
      if (path) path.forEach(p => pathList.push(p));
  }

  const pathSet = new Set(pathList.map(p => `${p[0]},${p[1]}`));

  // Place "Back Home" hole (2) - Ensure it's NOT on the path
  let placedHome = false;
  for (let z = 1; z < size - 1 && !placedHome; z++) {
    for (let x = size - 2; x > 1 && !placedHome; x--) {
      if (maze[z][x] === 0 && maze[z][x] !== 9 && maze[z][x] !== 5 && !pathSet.has(`${x},${z}`)) {
        maze[z][x] = 2;
        placedHome = true;
      }
    }
  }

  return maze;
}
