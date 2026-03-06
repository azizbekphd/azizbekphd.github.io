export type TileType = 'wall' | 'floor' | 'portal' | 'trap' | 'start';

export interface PortalTile {
  type: 'portal';
  destination: string;
  label?: string;
  color?: string;
}

export interface TrapTile {
  type: 'trap';
  [key: string]: any;
}

export interface StartTile {
  type: 'start';
}

export type Tile = 
  | number 
  | PortalTile 
  | TrapTile 
  | StartTile 
  | { type: string; [key: string]: any };

export type LevelMap = Tile[][];

export interface MazeDescriptor {
  id: string;
  path: string;
  map: LevelMap;
}

// Helper to get tile type
export function getTileType(tile: Tile): string {
  if (typeof tile === 'number') {
    switch (tile) {
      case 0: return 'floor';
      case 1: return 'wall';
      case 6: return 'trap';
      case 9: return 'start';
      default: return 'unknown';
    }
  }
  return tile.type;
}

export function isWall(tile: Tile): boolean {
  return getTileType(tile) === 'wall';
}

export function isFloor(tile: Tile): boolean {
  const type = getTileType(tile);
  return type === 'floor' || type === 'start' || type === 'portal' || type === 'trap';
}

export function isStart(tile: Tile): boolean {
  return getTileType(tile) === 'start';
}
