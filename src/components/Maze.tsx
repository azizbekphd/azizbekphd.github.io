import { RigidBody, CuboidCollider } from '@react-three/rapier';
import { Hole } from './Hole';
import { Trap } from './Trap';
import { useMemo, useRef, useLayoutEffect, memo, useCallback } from 'react';
import * as THREE from 'three';
import type { LevelMap } from '../types';
import { buildMazeLayoutData } from '../utils/maze/layout';
import { markDuration, withPerfMeasure } from '../utils/perf';

interface MazeProps {
  map: LevelMap;
  onPortalEnter: (destinationId: string, entryPosition: [number, number, number]) => void;
  onFail?: (entryPosition: [number, number, number]) => void;
  isInteractive?: boolean;
  revealCenter?: [number, number];
  revealRadius?: number;
}

const CELL_SIZE = 1;
const WALL_HEIGHT = 1.0;
const NOOP_ON_FAIL = () => {};

export const Maze = memo(function Maze({
  map,
  onPortalEnter,
  onFail = NOOP_ON_FAIL,
  isInteractive = true,
  revealCenter,
  revealRadius,
}: MazeProps) {
  const wallMeshRef = useRef<THREE.InstancedMesh>(null);
  const floorMeshRef = useRef<THREE.InstancedMesh>(null);
  const shouldUseReveal = !isInteractive && revealCenter !== undefined && revealRadius !== undefined;

  const withinRevealRadius = useCallback((x: number, z: number) => {
    if (!shouldUseReveal || !revealCenter || revealRadius === undefined) return true;
    const dx = x - revealCenter[0];
    const dz = z - revealCenter[1];
    return (dx * dx) + (dz * dz) <= revealRadius * revealRadius;
  }, [revealCenter, revealRadius, shouldUseReveal]);

  const { wallVisuals, floorVisuals, collidersJSX, holesJSX, trapsJSX } = useMemo(() => {
    const layout = withPerfMeasure('maze.component.buildLayoutMemo', () => buildMazeLayoutData(map, CELL_SIZE, WALL_HEIGHT));
    const wallCollidersData = layout.wallColliders;
    const floorCollidersData = layout.floorColliders;
    const filteredWallVisuals = shouldUseReveal
      ? layout.wallVisuals.filter(([x, _y, z]) => withinRevealRadius(x, z))
      : layout.wallVisuals;
    const filteredFloorVisuals = shouldUseReveal
      ? layout.floorVisuals.filter(([x, _y, z]) => withinRevealRadius(x, z))
      : layout.floorVisuals;
    const filteredPortals = shouldUseReveal
      ? layout.portals.filter(({ position }) => withinRevealRadius(position[0], position[2]))
      : layout.portals;
    const filteredTraps = shouldUseReveal
      ? layout.traps.filter(({ position }) => withinRevealRadius(position[0], position[2]))
      : layout.traps;

    const colliders = isInteractive ? (
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
    ) : null;

    const holes = filteredPortals.map(({ key, position, portal }) => (
      <Hole
        key={key}
        position={position}
        destinationId={portal.destination}
        onEnter={onPortalEnter}
        label={portal.label}
        color={portal.color}
        interactive={isInteractive}
      />
    ));

    const traps = filteredTraps.map(({ key, position, slideDirection }) => (
      <Trap key={key} position={position} onFail={onFail} slideDirection={slideDirection} interactive={isInteractive} />
    ));

    return {
      wallVisuals: filteredWallVisuals,
      floorVisuals: filteredFloorVisuals,
      collidersJSX: colliders,
      holesJSX: holes,
      trapsJSX: traps,
    };
  }, [isInteractive, map, onPortalEnter, onFail, shouldUseReveal, withinRevealRadius]);

  useLayoutEffect(() => {
    const start = performance.now();
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
    markDuration('maze.component.updateInstanceMatrices', performance.now() - start);
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
