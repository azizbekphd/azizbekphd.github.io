import type { PortalTile } from '../../types';

export const TILE_FLOOR = 0;
export const TILE_WALL = 1;
export const TILE_TRAP = 6;
export const TILE_START = 9;

export function createPortalTile(destination: string, label: string, color?: string): PortalTile {
  return {
    type: 'portal',
    destination,
    label,
    color,
  };
}
