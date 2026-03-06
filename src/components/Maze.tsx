import { RigidBody, CuboidCollider } from '@react-three/rapier';
import { Hole } from './Hole';
import { Trap } from './Trap';
import { useMemo, useRef, useLayoutEffect, memo } from 'react';
import type { ReactElement } from 'react';
import * as THREE from 'three';
import { getTileType, isWall, isFloor, isStart } from '../types';
import type { LevelMap } from '../types';

interface MazeProps {
  map: LevelMap;
  mazeId: string;
  onPortalEnter: (destinationId: string, entryPosition: [number, number, number]) => void;
  onFail?: (entryPosition: [number, number, number]) => void;
}

const CELL_SIZE = 1;
const WALL_HEIGHT = 1.0;

export const Maze = memo(function Maze({ map, mazeId, onPortalEnter, onFail = () => {} }: MazeProps) {
  const wallMeshRef = useRef<THREE.InstancedMesh>(null);
  const floorMeshRef = useRef<THREE.InstancedMesh>(null);

  const width = map[0].length;
  const height = map.length;

  const { wallVisuals, floorVisuals, collidersJSX, holesJSX, trapsJSX } = useMemo(() => {
    const wallV: [number, number, number][] = [];
    const floorV: [number, number, number][] = [];
    
    map.forEach((row, z) => {
      row.forEach((cell, x) => {
        const cx = (x - width / 2) * CELL_SIZE + CELL_SIZE / 2;
        const cz = (z - height / 2) * CELL_SIZE + CELL_SIZE / 2;
        
        if (isWall(cell)) {
          wallV.push([cx, WALL_HEIGHT / 2, cz]);
        } else if (isFloor(cell)) {
          // Check if it's a "simple" floor or start (needs explicit floor mesh)
          // Interactive tiles like Hole and Trap might handle their own floor visual
          const type = getTileType(cell);
          if (type === 'floor' || type === 'start') {
            floorV.push([cx, -0.05, cz]);
          }
        }
      });
    });

    const getMergedColliders = (isTargetType: (cell: any) => boolean) => {
      const colliders: { pos: [number, number, number]; args: [number, number, number] }[] = [];
      const visited = Array(height).fill(0).map(() => Array(width).fill(false));
      for (let z = 0; z < height; z++) {
        for (let x = 0; x < width; x++) {
          if (isTargetType(map[z][x]) && !visited[z][x]) {
            let w = 1;
            while (x + w < width && isTargetType(map[z][x + w]) && !visited[z][x + w]) w++;
            let h = 1;
            while (z + h < height) {
              let possible = true;
              for (let i = 0; i < w; i++) if (!isTargetType(map[z + h][x + i]) || visited[z + h][x + i]) { possible = false; break; }
              if (possible) h++; else break;
            }
            for (let i = 0; i < h; i++) for (let j = 0; j < w; j++) visited[z + i][x + j] = true;
            const midX = x + (w - 1) / 2;
            const midZ = z + (h - 1) / 2;
            const cx = (midX - width / 2) * CELL_SIZE + CELL_SIZE / 2;
            const cz = (midZ - height / 2) * CELL_SIZE + CELL_SIZE / 2;
            colliders.push({ pos: [cx, 0, cz], args: [(w * CELL_SIZE) / 2, 0, (h * CELL_SIZE) / 2] });
          }
        }
      }
      return colliders;
    };

    const wallCollidersData = getMergedColliders(isWall);
    // Everything that's not a wall has a floor collider, but Hole and Trap manage their own complex physics
    const floorCollidersData = getMergedColliders((cell) => {
        const type = getTileType(cell);
        return type === 'floor' || type === 'start';
    });

    const colliders = (
      <>
        <RigidBody type="fixed" friction={0.1} restitution={0.2}>
          {wallCollidersData.map((c, i) => (
            <CuboidCollider key={`w-${i}`} args={[c.args[0], WALL_HEIGHT / 2, c.args[2]]} position={[c.pos[0], WALL_HEIGHT / 2, c.pos[2]]} />
          ))}
        </RigidBody>
        <RigidBody type="fixed" friction={0.1} restitution={0.2}>
          {floorCollidersData.map((c, i) => (
            <CuboidCollider key={`f-${i}`} args={[c.args[0], 0.5, c.args[2]]} position={[c.pos[0], -0.5, c.pos[2]]} />
          ))}
        </RigidBody>
      </>
    );

    const holes: ReactElement[] = [];
    const traps: ReactElement[] = [];
    map.forEach((row, z) => {
      row.forEach((cell, x) => {
        const cx = (x - width / 2) * CELL_SIZE + CELL_SIZE / 2;
        const cz = (z - height / 2) * CELL_SIZE + CELL_SIZE / 2;
        const type = getTileType(cell);

        if (type === 'trap') {
          // Find closest wall for sliding direction
          const neighbors = [
            { dx: 0, dz: -1 }, // North
            { dx: 0, dz: 1 },  // South
            { dx: 1, dz: 0 },  // East
            { dx: -1, dz: 0 }  // West
          ];
          let slideDir = { x: 0, z: -1 };
          for (const { dx, dz } of neighbors) {
            const nx = x + dx;
            const nz = z + dz;
            if (nz >= 0 && nz < map.length && nx >= 0 && nx < map[0].length) {
              if (isWall(map[nz][nx])) {
                slideDir = { x: dx, z: dz };
                break;
              }
            }
          }
          traps.push(<Trap key={`t-${x}-${z}`} position={[cx, 0, cz]} onFail={onFail} slideDirection={slideDir} />);
        } else if (type === 'portal') {
          const portal = cell as any;
          holes.push(
            <Hole 
                key={`h-${x}-${z}`} 
                position={[cx, 0, cz]} 
                destinationId={portal.destination} 
                onEnter={onPortalEnter} 
                label={portal.label} 
                color={portal.color}
            />
          );
        }
      });
    });

    return { wallVisuals: wallV, floorVisuals: floorV, collidersJSX: colliders, holesJSX: holes, trapsJSX: traps };
  }, [map, width, height, onPortalEnter, onFail]);

  useLayoutEffect(() => {
    const temp = new THREE.Object3D();
    if (wallMeshRef.current) {
      wallVisuals.forEach((pos, i) => {
        temp.position.set(...pos);
        temp.updateMatrix();
        wallMeshRef.current!.setMatrixAt(i, temp.matrix);
      });
      wallMeshRef.current.instanceMatrix.needsUpdate = true;
    }
    if (floorMeshRef.current) {
      floorVisuals.forEach((pos, i) => {
        temp.position.set(...pos);
        temp.rotation.x = -Math.PI / 2;
        temp.updateMatrix();
        floorMeshRef.current!.setMatrixAt(i, temp.matrix);
      });
      floorMeshRef.current.instanceMatrix.needsUpdate = true;
    }
  }, [wallVisuals, floorVisuals]);

  return (
    <group>
      <instancedMesh
        ref={wallMeshRef}
        args={[
          undefined as unknown as THREE.BufferGeometry,
          undefined as unknown as THREE.Material,
          wallVisuals.length,
        ]}
        castShadow
        receiveShadow
      >
        <boxGeometry args={[CELL_SIZE, WALL_HEIGHT, CELL_SIZE]} />
        <meshStandardMaterial color="#444444" metalness={0.2} roughness={0.8} transparent />
      </instancedMesh>

      <instancedMesh
        ref={floorMeshRef}
        args={[
          undefined as unknown as THREE.BufferGeometry,
          undefined as unknown as THREE.Material,
          floorVisuals.length,
        ]}
        receiveShadow
      >
        <planeGeometry args={[CELL_SIZE, CELL_SIZE]} />
        <meshStandardMaterial color="#ffffff" metalness={0.1} roughness={0.9} transparent />
      </instancedMesh>

      {collidersJSX}
      {holesJSX}
      {trapsJSX}
    </group>
  );
});
