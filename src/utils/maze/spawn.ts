import { isStart } from '../../types';
import type { LevelMap, MazeDescriptor } from '../../types';

export function getStartPosition(map: LevelMap, yOffset = 0): [number, number, number] {
  const width = map[0].length;
  const height = map.length;

  for (let z = 0; z < height; z++) {
    for (let x = 0; x < width; x++) {
      if (isStart(map[z][x])) {
        return [(x - width / 2) + 0.5, yOffset + 0.5, (z - height / 2) + 0.5];
      }
    }
  }

  return [0, yOffset + 0.5, 0];
}

export function getDescriptorStartPosition(descriptor: MazeDescriptor, yOffset = 0): [number, number, number] {
  if (!descriptor.startPosition) return getStartPosition(descriptor.map, yOffset);
  return [descriptor.startPosition[0], descriptor.startPosition[1] + yOffset, descriptor.startPosition[2]];
}
