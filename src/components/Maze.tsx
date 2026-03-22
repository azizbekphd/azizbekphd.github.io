import { RigidBody, CuboidCollider } from '@react-three/rapier';
import { Hole } from './Hole';
import { Trap } from './Trap';
import { useMemo, useRef, useLayoutEffect, memo, useCallback, useState } from 'react';
import { useFrame } from '@react-three/fiber';
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
const INITIAL_BATCH_SIZE = 4;
const FRAME_BATCH_SIZE = 2;
const COLLIDER_BATCH_SIZE = 10;

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

  const [renderedCount, setRenderedCount] = useState(INITIAL_BATCH_SIZE);
  const [renderedColliders, setRenderedColliders] = useState(0);

  // Reset staggered loading when map or interactivity changes
  const lastMapRef = useRef(map);
  const lastInteractiveRef = useRef(isInteractive);
  if (lastMapRef.current !== map || lastInteractiveRef.current !== isInteractive) {
    lastMapRef.current = map;
    lastInteractiveRef.current = isInteractive;
    setRenderedCount(INITIAL_BATCH_SIZE);
    setRenderedColliders(0);
  }

  const layout = useMemo(
    () => withPerfMeasure('maze.component.buildLayoutMemo', () => buildMazeLayoutData(map, CELL_SIZE, WALL_HEIGHT)),
    [map],
  );

  const withinRevealRadius = useCallback(
    (x: number, z: number) => {
      if (!shouldUseReveal || !revealCenter || revealRadius === undefined) return true;
      const dx = x - revealCenter[0];
      const dz = z - revealCenter[1];
      return dx * dx + dz * dz <= revealRadius * revealRadius;
    },
    [revealCenter, revealRadius, shouldUseReveal],
  );

  const { filteredWallVisuals, filteredFloorVisuals, wallColliders, floorColliders, allDynamicTiles } = useMemo(() => {
    const wallCollidersData = layout.wallColliders;
    const floorCollidersData = layout.floorColliders;

    const walls = shouldUseReveal
      ? layout.wallVisuals.filter(([x, _y, z]) => withinRevealRadius(x, z))
      : layout.wallVisuals;
    const floors = shouldUseReveal
      ? layout.floorVisuals.filter(([x, _y, z]) => withinRevealRadius(x, z))
      : layout.floorVisuals;

    const wallCollidersJSX = wallCollidersData.map((c, i) => (
      <CuboidCollider
        key={`w-${i}`}
        args={[c.args[0], WALL_HEIGHT / 2, c.args[2]]}
        position={[c.pos[0], WALL_HEIGHT / 2, c.pos[2]]}
      />
    ));

    const floorCollidersJSX = floorCollidersData.map((c, i) => (
      <CuboidCollider
        key={`f-${i}`}
        args={[c.args[0], 0.5, c.args[2]]}
        position={[c.pos[0], -0.5, c.pos[2]]}
      />
    ));

    const holes = layout.portals.map(({ key, position, portal }) => (
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

    const traps = layout.traps.map(({ key, position, slideDirection }) => (
      <Trap key={key} position={position} onFail={onFail} slideDirection={slideDirection} interactive={isInteractive} />
    ));

    return {
      filteredWallVisuals: walls,
      filteredFloorVisuals: floors,
      wallColliders: wallCollidersJSX,
      floorColliders: floorCollidersJSX,
      allDynamicTiles: [...holes, ...traps],
    };
  }, [layout, isInteractive, onPortalEnter, onFail, shouldUseReveal, withinRevealRadius]);

  const totalCollidersCount = wallColliders.length + floorColliders.length;

  const visibleDynamicTiles = useMemo(() => {
    if (!shouldUseReveal) return allDynamicTiles;
    return allDynamicTiles.filter((tile) => {
      const pos = tile.props.position;
      return withinRevealRadius(pos[0], pos[2]);
    });
  }, [allDynamicTiles, shouldUseReveal, withinRevealRadius]);

  useFrame(() => {
    if (renderedCount < visibleDynamicTiles.length) {
      setRenderedCount((prev) => Math.min(visibleDynamicTiles.length, prev + FRAME_BATCH_SIZE));
    }
    if (isInteractive && renderedColliders < totalCollidersCount) {
      setRenderedColliders((prev) => Math.min(totalCollidersCount, prev + COLLIDER_BATCH_SIZE));
    }
  });

  useLayoutEffect(() => {
    const start = performance.now();
    const temp = new THREE.Object3D();

    if (wallMeshRef.current) {
      const mesh = wallMeshRef.current;
      mesh.count = filteredWallVisuals.length;
      filteredWallVisuals.forEach((pos, i) => {
        temp.position.set(...pos);
        temp.updateMatrix();
        mesh.setMatrixAt(i, temp.matrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
    }

    if (floorMeshRef.current) {
      const mesh = floorMeshRef.current;
      mesh.count = filteredFloorVisuals.length;
      filteredFloorVisuals.forEach((pos, i) => {
        temp.position.set(...pos);
        temp.rotation.x = -Math.PI / 2;
        temp.updateMatrix();
        mesh.setMatrixAt(i, temp.matrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
    }

    markDuration('maze.component.updateInstanceMatrices', performance.now() - start);
  }, [filteredWallVisuals, filteredFloorVisuals]);

  const activeWallColliders = wallColliders.slice(0, renderedColliders);
  const activeFloorColliders = floorColliders.slice(
    0,
    Math.max(0, renderedColliders - wallColliders.length),
  );

  return (
    <group>
      <instancedMesh
        ref={wallMeshRef}
        args={[null as unknown as THREE.BufferGeometry, null as unknown as THREE.Material, layout.wallVisuals.length]}
        castShadow
        receiveShadow
      >
        <boxGeometry args={[CELL_SIZE, WALL_HEIGHT, CELL_SIZE]} />
        <meshStandardMaterial color="#444444" metalness={0.2} roughness={0.8} transparent />
      </instancedMesh>

      <instancedMesh
        ref={floorMeshRef}
        args={[null as unknown as THREE.BufferGeometry, null as unknown as THREE.Material, layout.floorVisuals.length]}
        receiveShadow
      >
        <planeGeometry args={[CELL_SIZE, CELL_SIZE]} />
        <meshStandardMaterial color="#ffffff" metalness={0.1} roughness={0.9} transparent />
      </instancedMesh>

      {isInteractive && (
        <>
          <RigidBody type="fixed" friction={0.1} restitution={0.2}>
            {activeWallColliders}
          </RigidBody>
          <RigidBody type="fixed" friction={0.1} restitution={0.2}>
            {activeFloorColliders}
          </RigidBody>
        </>
      )}
      {visibleDynamicTiles.slice(0, renderedCount)}
    </group>
  );
});
