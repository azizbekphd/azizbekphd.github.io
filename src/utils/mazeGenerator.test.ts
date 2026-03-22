import { describe, expect, it } from 'vitest';
import { generateMaze } from './mazeGenerator';
import type { PortalTile } from '../types';

function isPortalTile(value: unknown): value is PortalTile {
  return typeof value === 'object' && value !== null && (value as { type?: string }).type === 'portal';
}

describe('generateMaze', () => {
  it('produces deterministic output for the same seed', () => {
    const seed = 'deterministic-seed';
    const first = generateMaze(seed, 21);
    const second = generateMaze(seed, 21);
    expect(second).toEqual(first);
  });

  it('creates a square grid with border walls', () => {
    const size = 21;
    const maze = generateMaze('shape-check', size);

    expect(maze).toHaveLength(size);
    expect(maze.every((row) => row.length === size)).toBe(true);

    for (let x = 0; x < size; x++) {
      expect(maze[0][x]).toBe(1);
      expect(maze[size - 1][x]).toBe(1);
    }
    for (let z = 0; z < size; z++) {
      expect(maze[z][0]).toBe(1);
      expect(maze[z][size - 1]).toBe(1);
    }
  });

  it('keeps exactly one start tile at the expected origin', () => {
    const maze = generateMaze('start-check');
    const starts: [number, number][] = [];

    maze.forEach((row, z) => {
      row.forEach((cell, x) => {
        if (cell === 9) {
          starts.push([x, z]);
        }
      });
    });

    expect(starts).toHaveLength(1);
    expect(starts[0]).toEqual([1, 1]);
  });

  it('places both NEXT and HOME portals', () => {
    const maze = generateMaze('portal-check');
    let hasNext = false;
    let hasHome = false;

    maze.forEach((row) => {
      row.forEach((cell) => {
        if (!isPortalTile(cell)) return;
        if (cell.destination === 'endless' && cell.label === 'NEXT') hasNext = true;
        if (cell.destination === 'home' && cell.label === 'HOME') hasHome = true;
      });
    });

    expect(hasNext).toBe(true);
    expect(hasHome).toBe(true);
  });
});
