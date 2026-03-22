import { getTileType, isFloor, isWall } from '../../types';
import type { LevelMap, PortalTile, Tile } from '../../types';
import { withPerfMeasure } from '../perf';

export interface ColliderData {
  pos: [number, number, number];
  args: [number, number, number];
}

export interface TrapPoint {
  key: string;
  position: [number, number, number];
  slideDirection: { x: number; z: number };
}

export interface PortalPoint {
  key: string;
  position: [number, number, number];
  portal: PortalTile;
}

export interface MazeLayoutData {
  wallVisuals: [number, number, number][];
  floorVisuals: [number, number, number][];
  wallColliders: ColliderData[];
  floorColliders: ColliderData[];
  traps: TrapPoint[];
  portals: PortalPoint[];
}

export function toWorldPosition(x: number, z: number, width: number, height: number, cellSize = 1): [number, number] {
  const cx = (x - width / 2) * cellSize + cellSize / 2;
  const cz = (z - height / 2) * cellSize + cellSize / 2;
  return [cx, cz];
}

const layoutCache = new WeakMap<LevelMap, Map<string, MazeLayoutData>>();

function getMergedColliders(
  map: LevelMap,
  width: number,
  height: number,
  isTargetType: (cell: Tile) => boolean,
  cellSize = 1,
): ColliderData[] {
  const colliders: ColliderData[] = [];
  const visited = new Uint8Array(width * height);
  const toIndex = (x: number, z: number) => z * width + x;

  for (let z = 0; z < height; z++) {
    for (let x = 0; x < width; x++) {
      if (!isTargetType(map[z][x]) || visited[toIndex(x, z)] !== 0) continue;

      let w = 1;
      while (x + w < width && isTargetType(map[z][x + w]) && visited[toIndex(x + w, z)] === 0) w++;

      let h = 1;
      while (z + h < height) {
        let possible = true;
        for (let i = 0; i < w; i++) {
          if (!isTargetType(map[z + h][x + i]) || visited[toIndex(x + i, z + h)] !== 0) {
            possible = false;
            break;
          }
        }
        if (!possible) break;
        h++;
      }

      for (let i = 0; i < h; i++) {
        for (let j = 0; j < w; j++) {
          visited[toIndex(x + j, z + i)] = 1;
        }
      }

      const midX = x + (w - 1) / 2;
      const midZ = z + (h - 1) / 2;
      const [cx, cz] = toWorldPosition(midX, midZ, width, height, cellSize);
      colliders.push({ pos: [cx, 0, cz], args: [(w * cellSize) / 2, 0, (h * cellSize) / 2] });
    }
  }

  return colliders;
}

function getTrapSlideDirection(map: LevelMap, x: number, z: number): { x: number; z: number } {
  const neighbors = [
    { dx: 0, dz: -1 },
    { dx: 0, dz: 1 },
    { dx: 1, dz: 0 },
    { dx: -1, dz: 0 },
  ];

  for (const { dx, dz } of neighbors) {
    const nx = x + dx;
    const nz = z + dz;
    if (nz < 0 || nz >= map.length || nx < 0 || nx >= map[0].length) continue;
    if (isWall(map[nz][nx])) return { x: dx, z: dz };
  }

  return { x: 0, z: -1 };
}

function isPortal(cell: Tile): cell is PortalTile {
  return getTileType(cell) === 'portal';
}

export function buildMazeLayoutData(map: LevelMap, cellSize = 1, wallHeight = 1): MazeLayoutData {
  const cacheKey = `${cellSize}:${wallHeight}`;
  const cachedByMap = layoutCache.get(map);
  if (cachedByMap?.has(cacheKey)) {
    return cachedByMap.get(cacheKey)!;
  }

  const result = withPerfMeasure('layout.buildMazeLayoutData', () => {
    const width = map[0].length;
    const height = map.length;
    const wallVisuals: [number, number, number][] = [];
    const floorVisuals: [number, number, number][] = [];
    const traps: TrapPoint[] = [];
    const portals: PortalPoint[] = [];

    for (let z = 0; z < height; z++) {
      const row = map[z];
      for (let x = 0; x < width; x++) {
        const cell = row[x];
        const [cx, cz] = toWorldPosition(x, z, width, height, cellSize);
        const type = getTileType(cell);
        if (type === 'wall') {
          wallVisuals.push([cx, wallHeight / 2, cz]);
          continue;
        }

        if (!isFloor(cell)) continue;
        if (type === 'floor' || type === 'start') {
          floorVisuals.push([cx, -0.05, cz]);
        } else if (type === 'trap') {
          traps.push({
            key: `t-${x}-${z}`,
            position: [cx, 0, cz],
            slideDirection: getTrapSlideDirection(map, x, z),
          });
        } else if (isPortal(cell)) {
          portals.push({
            key: `h-${x}-${z}`,
            position: [cx, 0, cz],
            portal: cell,
          });
        }
      }
    }

    return {
      wallVisuals,
      floorVisuals,
      wallColliders: getMergedColliders(map, width, height, isWall, cellSize),
      floorColliders: getMergedColliders(
        map,
        width,
        height,
        (cell) => {
          const type = getTileType(cell);
          return type === 'floor' || type === 'start';
        },
        cellSize,
      ),
      traps,
      portals,
    };
  });

  if (cachedByMap) {
    cachedByMap.set(cacheKey, result);
  } else {
    layoutCache.set(map, new Map([[cacheKey, result]]));
  }
  return result;
}
