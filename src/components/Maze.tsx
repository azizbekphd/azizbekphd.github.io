import { RigidBody, CuboidCollider } from '@react-three/rapier';
import { useFrame } from '@react-three/fiber';
import { Hole } from './Hole';
import { Trap } from './Trap';
import { useMemo, useRef, useLayoutEffect, memo, useCallback } from 'react';
import type { MutableRefObject } from 'react';
import * as THREE from 'three';
import type { LevelMap } from '../types';
import { buildMazeLayoutData } from '../utils/maze/layout';
import { markDuration, withPerfMeasure } from '../utils/perf';
import {
  applyRadialRevealToInstancedStandardMaterial,
  syncRadialRevealUniforms,
} from './mazeRadialRevealMaterial';

interface MazeProps {
  map: LevelMap;
  onPortalEnter: (destinationId: string, entryPosition: [number, number, number]) => void;
  onFail?: (entryPosition: [number, number, number]) => void;
  isInteractive?: boolean;
  /**
   * When `isInteractive` is false (e.g. preview maze during a portal drop), still mount floor/wall
   * colliders so the ball can land physically instead of falling through visuals only.
   */
  includeStaticColliders?: boolean;
  /** When false, walls/traps do not cast shadows (avoids old level shadows on the board below during portal fall). */
  castsStaticShadows?: boolean;
  /** Landing-centered reveal in maze-local XZ; pair with `revealRadiusRef` for GPU-smooth expansion. */
  revealCenter?: [number, number];
  /** Current reveal radius (updated every frame from the scene). */
  revealRadiusRef?: MutableRefObject<number>;
  /** Edge softness for the radial mask (maze units). */
  revealSoftness?: number;
}

const CELL_SIZE = 1;
const WALL_HEIGHT = 1.0;
const NOOP_ON_FAIL = () => {};
/** Holes/traps stay CPU-culled to this radius; instanced walls/floors use a smooth shader mask. */
const PREVIEW_HOLE_TRAP_RADIUS_SQ = 22 * 22;
const DEFAULT_REVEAL_SOFTNESS = 3.25;

export const Maze = memo(function Maze({
  map,
  onPortalEnter,
  onFail = NOOP_ON_FAIL,
  isInteractive = true,
  includeStaticColliders = false,
  castsStaticShadows = true,
  revealCenter,
  revealRadiusRef,
  revealSoftness = DEFAULT_REVEAL_SOFTNESS,
}: MazeProps) {
  const wallMeshRef = useRef<THREE.InstancedMesh>(null);
  const floorMeshRef = useRef<THREE.InstancedMesh>(null);
  const wallMatRef = useRef<THREE.MeshStandardMaterial>(null);
  const floorMatRef = useRef<THREE.MeshStandardMaterial>(null);
  const revealShaderMode =
    !isInteractive && revealCenter !== undefined && revealRadiusRef !== undefined;

  const withinPreviewHoleTrapRadius = useCallback(
    (x: number, z: number) => {
      if (!revealShaderMode || !revealCenter) return true;
      const dx = x - revealCenter[0];
      const dz = z - revealCenter[1];
      return dx * dx + dz * dz <= PREVIEW_HOLE_TRAP_RADIUS_SQ;
    },
    [revealCenter, revealShaderMode],
  );

  const { wallVisuals, floorVisuals, collidersJSX, holesJSX, trapsJSX } = useMemo(() => {
    const layout = withPerfMeasure('maze.component.buildLayoutMemo', () =>
      buildMazeLayoutData(map, CELL_SIZE, WALL_HEIGHT),
    );
    const wallCollidersData = layout.wallColliders;
    const floorCollidersData = layout.floorColliders;

    const wallV = layout.wallVisuals;
    const floorV = layout.floorVisuals;
    const filteredPortals = revealShaderMode
      ? layout.portals.filter(({ position }) => withinPreviewHoleTrapRadius(position[0], position[2]))
      : layout.portals;
    const filteredTraps = revealShaderMode
      ? layout.traps.filter(({ position }) => withinPreviewHoleTrapRadius(position[0], position[2]))
      : layout.traps;

    const mountStaticColliders = isInteractive || includeStaticColliders;
    const colliders = mountStaticColliders ? (
      <>
        <RigidBody type="fixed" friction={0.1} restitution={0.2}>
          {wallCollidersData.map((c, i) => (
            <CuboidCollider
              key={`w-${i}`}
              args={[c.args[0], WALL_HEIGHT / 2, c.args[2]]}
              position={[c.pos[0], WALL_HEIGHT / 2, c.pos[2]]}
            />
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
      <Trap
        key={key}
        position={position}
        onFail={onFail}
        slideDirection={slideDirection}
        interactive={isInteractive}
        castsShadow={castsStaticShadows}
      />
    ));

    return {
      wallVisuals: wallV,
      floorVisuals: floorV,
      collidersJSX: colliders,
      holesJSX: holes,
      trapsJSX: traps,
    };
  }, [
    castsStaticShadows,
    includeStaticColliders,
    isInteractive,
    map,
    onPortalEnter,
    onFail,
    revealShaderMode,
    withinPreviewHoleTrapRadius,
  ]);

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

  useLayoutEffect(() => {
    if (!revealShaderMode || !revealCenter || !revealRadiusRef) return;
    const w = wallMatRef.current;
    const f = floorMatRef.current;
    if (!w || !f) return;
    const r0 = revealRadiusRef.current;
    applyRadialRevealToInstancedStandardMaterial(w, revealCenter, r0, revealSoftness);
    applyRadialRevealToInstancedStandardMaterial(f, revealCenter, r0, revealSoftness);
  }, [revealShaderMode, revealCenter, revealRadiusRef, revealSoftness, map, wallVisuals.length, floorVisuals.length]);

  useFrame(() => {
    if (!revealShaderMode || !revealCenter || !revealRadiusRef) return;
    const w = wallMatRef.current;
    const f = floorMatRef.current;
    if (!w || !f) return;
    const r = revealRadiusRef.current;
    syncRadialRevealUniforms(w, revealCenter, r);
    syncRadialRevealUniforms(f, revealCenter, r);
  });

  return (
    <group>
      <instancedMesh
        ref={wallMeshRef}
        args={[
          undefined as unknown as THREE.BufferGeometry,
          undefined as unknown as THREE.Material,
          wallVisuals.length,
        ]}
        castShadow={castsStaticShadows}
        receiveShadow
        userData={{ staticLevelShadowCaster: true }}
      >
        <boxGeometry args={[CELL_SIZE, WALL_HEIGHT, CELL_SIZE]} />
        <meshStandardMaterial
          ref={wallMatRef}
          color="#444444"
          metalness={0.2}
          roughness={0.8}
          transparent
        />
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
        <meshStandardMaterial
          ref={floorMatRef}
          color="#ffffff"
          metalness={0.1}
          roughness={0.9}
          transparent
        />
      </instancedMesh>

      {collidersJSX}
      {holesJSX}
      {trapsJSX}
    </group>
  );
});
