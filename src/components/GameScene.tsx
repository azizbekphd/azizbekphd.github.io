import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Physics, RapierRigidBody, useRapier } from '@react-three/rapier';
import { useState, useEffect, useLayoutEffect, useRef, Suspense, useCallback, useMemo } from 'react';
import type { MutableRefObject } from 'react';
import { Maze } from './Maze';
import { Ball } from './Ball';
import * as THREE from 'three';
import type { EffectComposer as PostEffectComposer } from 'postprocessing';
import { EffectComposer, Bloom, ChromaticAberration, Noise, Vignette } from '@react-three/postprocessing';
import type { MazeDescriptor } from '../types';
import { mazeFromPath, randomSeed } from '../utils/maze/routing';
import { getDescriptorStartPosition } from '../utils/maze/spawn';
import {
  DEFAULT_SCENE_CAMERA_FOV,
  getTransitionVisualIntensity,
  syncCameraAndLight,
  updateActiveBoardTilt,
  updateNextBoardRotation,
  updateTransitionState,
} from './scene/frameControllers';
import { applyTransitionFxEffects, collectTransitionFxEffects } from './scene/transitionPostFx';
import { useMobileMotionGravity } from './scene/useMobileMotionGravity';
import { isPerfEnabled, markDuration } from '../utils/perf';

/* eslint-disable react-hooks/immutability */

const isMobile = typeof window !== 'undefined' && /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
const DROP_DISTANCE = 30;
/** Fade speed FX in the last ~this many units before the landing height. */
const TRANSITION_LANDING_SOFT_RANGE = 4.5;
/** Smoothed fall visuals: faster when ramping up, slower when releasing (landing / idle). */
const FALL_VISUAL_DAMP_UP = 12;
const FALL_VISUAL_DAMP_DOWN = 4.25;
/** Consecutive frames in the handoff landing zone before maze swap. */
const HANDOFF_LANDING_HOLD_FRAMES = 5;
/** Next-maze radial reveal: min radius and span (GPU shader; no stepped layout rebuilds). */
const REVEAL_RADIUS_MIN = 2;
const REVEAL_RADIUS_SPAN = 16;
const SHADOW_MAP_SIZE: [number, number] = [2048, 2048];
const NOOP_PORTAL_ENTER = (_destinationId: string, _entryPosition: [number, number, number]) => {};
const NOOP_FAIL = (_entryPosition: [number, number, number]) => {};

/** Runs after Rapier's useFrame (registered last under Physics) so camera matches interpolated mesh. */
function BallCameraFollow({
  ballRef,
  activeBoardRef,
  camera,
  lookTargetRef,
  lightRef,
  fallIntensityRef,
}: {
  ballRef: MutableRefObject<RapierRigidBody | null>;
  activeBoardRef: MutableRefObject<THREE.Group | null>;
  camera: THREE.Camera;
  lookTargetRef: MutableRefObject<THREE.Vector3>;
  lightRef: MutableRefObject<THREE.DirectionalLight | null>;
  fallIntensityRef: MutableRefObject<number>;
}) {
  useFrame(() => {
    const ballObject = activeBoardRef.current?.getObjectByName('ball') ?? null;
    syncCameraAndLight({
      ball: ballRef.current,
      ballObject,
      camera,
      lookTarget: lookTargetRef.current,
      light: lightRef.current,
      fallIntensity: fallIntensityRef.current,
      baseFov: DEFAULT_SCENE_CAMERA_FOV,
    });
  });
  return null;
}

type TransitionPhase = 'idle' | 'falling' | 'handoff';
type MaterialOpacityData = { globalOpacity?: number; localOpacity?: number };
type TextOpacityNode = THREE.Object3D & { fillOpacity?: number; isText?: boolean; material?: THREE.Material };
type OpacityItem = { material: THREE.Material; text?: TextOpacityNode };

// Separate component to handle gravity updates directly on the physics world
function GravityController({
  targetGravity,
  isReady,
  controlsEnabled,
  transitionPhase,
}: {
  targetGravity: MutableRefObject<THREE.Vector3>;
  isReady: boolean;
  controlsEnabled: boolean;
  transitionPhase: TransitionPhase;
}) {
  const { world } = useRapier();
  
  useFrame(() => {
    if (!isReady) return;
    if (!controlsEnabled) {
      targetGravity.current.set(0, -30, 0);
    }
    const lerpFactor = transitionPhase === 'idle' ? 0.15 : 0.1;
    world.gravity.x = THREE.MathUtils.lerp(world.gravity.x, targetGravity.current.x, lerpFactor);
    world.gravity.y = THREE.MathUtils.lerp(world.gravity.y, targetGravity.current.y, lerpFactor);
    world.gravity.z = THREE.MathUtils.lerp(world.gravity.z, targetGravity.current.z, lerpFactor);
  });
  
  return null;
}

function SceneContent({
  activeMaze,
  nextMaze,
  transitionPhase,
  transitionTarget,
  ballSpawnPosition,
  isReady,
  controlsEnabled,
  isFailed,
  onPortalEnter,
  onFail,
  onEnterHandoff,
  onCompleteTransition,
  nextMazeOffset,
  ballRef,
}: {
  activeMaze: MazeDescriptor;
  nextMaze: MazeDescriptor | null;
  transitionPhase: TransitionPhase;
  transitionTarget: [number, number, number] | null;
  ballSpawnPosition: [number, number, number];
  isReady: boolean;
  controlsEnabled: boolean;
  isFailed: boolean;
  onPortalEnter: (destinationId: string, entryPosition: [number, number, number]) => void;
  onFail: (entryPosition: [number, number, number]) => void;
  onEnterHandoff: () => void;
  onCompleteTransition: () => void;
  nextMazeOffset: [number, number];
  ballRef: MutableRefObject<RapierRigidBody | null>;
}) {
  const { camera } = useThree();
  const targetGravity = useRef<THREE.Vector3>(new THREE.Vector3(0, -30, 0));
  const activeBoardRef = useRef<THREE.Group>(null);
  const nextBoardRef = useRef<THREE.Group>(null);
  const activeOpacityRef = useRef(1);
  const nextOpacityRef = useRef(0);
  const mobileRotation = useRef({ x: 0, z: 0 });
  const transitionHandledRef = useRef(false);
  const handoffStartedRef = useRef(false);
  const lastActiveMazePath = useRef(activeMaze.path);
  const lookTarget = useRef(new THREE.Vector3(0, 0, 0));
  const lightRef = useRef<THREE.DirectionalLight>(null);
  const fallStartYRef = useRef<number | null>(null);
  const smoothedFallVisualRef = useRef(0);
  const handoffLandingFrameCounterRef = useRef(0);
  const transitionFallIntensityRef = useRef(0);
  const composerRef = useRef<PostEffectComposer | null>(null);
  const transitionFxCacheRef = useRef<ReturnType<typeof collectTransitionFxEffects> | null>(null);
  const transitionFxLastAppliedIntensityRef = useRef<number>(NaN);

  // Cache for materials to avoid traversal in useFrame
  const activeMaterialsRef = useRef<OpacityItem[]>([]);
  const nextMaterialsRef = useRef<OpacityItem[]>([]);
  const [isNextMazeVisible, setIsNextMazeVisible] = useState(false);
  const nextRevealRadiusRef = useRef(REVEAL_RADIUS_MIN);
  const renderStatsRef = useRef({
    elapsed: 0,
    maxDeltaMs: 0,
    frameCount: 0,
  });

  const collectMaterials = useCallback((group: THREE.Group | null) => {
    const start = performance.now();
    const collected: OpacityItem[] = [];
    if (!group) return collected;
    group.traverse((node) => {
      if (node.userData.skipOpacity) return;
      if ((node as THREE.Mesh).isMesh) {
        const mesh = node as THREE.Mesh;
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        materials.forEach((mat) => {
          if (mat) {
            mat.transparent = true;
            collected.push({ material: mat });
          }
        });
      }
      const textNode = node as TextOpacityNode;
      if ((textNode.isText || textNode.fillOpacity !== undefined) && textNode.material) {
        collected.push({ material: textNode.material, text: textNode });
      }
    });
    markDuration('scene.collectMaterials', performance.now() - start);
    return collected;
  }, []);

  const updateOpacity = useCallback((items: OpacityItem[], opacity: number) => {
    items.forEach((item) => {
      if (item.text) {
        item.text.fillOpacity = opacity;
      } else {
        const mat = item.material as THREE.Material & { userData: MaterialOpacityData };
        mat.userData.globalOpacity = opacity;
        const local = mat.userData.localOpacity !== undefined ? mat.userData.localOpacity : 1;
        mat.opacity = local * opacity;
      }
    });
  }, []);

  // Use layout effect for immediate opacity application before paint
  useLayoutEffect(() => {
    if (activeBoardRef.current) {
      const start = performance.now();
      activeMaterialsRef.current = collectMaterials(activeBoardRef.current);
      updateOpacity(activeMaterialsRef.current, activeOpacityRef.current);
      markDuration('scene.activeMazeOpacitySetup', performance.now() - start);
    }
  }, [activeMaze.id, collectMaterials, updateOpacity]);

  useLayoutEffect(() => {
    if (nextMaze) {
        const start = performance.now();
        setIsNextMazeVisible(false);
        nextRevealRadiusRef.current = REVEAL_RADIUS_MIN;
        // Immediate collection and visibility setup to avoid lag
        if (nextBoardRef.current) {
            nextMaterialsRef.current = collectMaterials(nextBoardRef.current);
            updateOpacity(nextMaterialsRef.current, 0); 
            setIsNextMazeVisible(true);
        }
        markDuration('scene.nextMazeOpacitySetup', performance.now() - start);
    } else {
        nextMaterialsRef.current = [];
        setIsNextMazeVisible(false);
        nextRevealRadiusRef.current = REVEAL_RADIUS_MIN;
    }
  }, [nextMaze, collectMaterials, updateOpacity]);

  // Synchronize ball and camera teleportation with maze swap to prevent jiggles and tunneling
  useLayoutEffect(() => {
    if (ballRef.current && activeMaze.path !== lastActiveMazePath.current) {
        const targetStartLocal = getDescriptorStartPosition(activeMaze, 0);
        
        // Zero out velocities and teleport to prevent tunneling and preserved momentum from fall
        ballRef.current.setLinvel({ x: 0, y: 0, z: 0 }, true);
        ballRef.current.setAngvel({ x: 0, y: 0, z: 0 }, true);
        ballRef.current.setTranslation({ x: targetStartLocal[0], y: 0.5, z: targetStartLocal[2] }, true);

        // Teleport camera and its target to maintain relative position to the ball
        // This eliminates the "jiggle" by ensuring the jump happens in the same frame as the maze swap
        camera.position.x -= nextMazeOffset[0];
        camera.position.y += DROP_DISTANCE;
        camera.position.z -= nextMazeOffset[1];
        lookTarget.current.x -= nextMazeOffset[0];
        lookTarget.current.y += DROP_DISTANCE;
        lookTarget.current.z -= nextMazeOffset[1];
        camera.lookAt(lookTarget.current);

        lastActiveMazePath.current = activeMaze.path;
    }
  }, [activeMaze.path, activeMaze.map, camera, nextMazeOffset, ballRef]);

  useEffect(() => {
    camera.up.set(0, 0, -1);
  }, [camera]);

  useMobileMotionGravity({
    isMobile,
    isReady,
    targetGravity,
    mobileRotation,
  });

  useEffect(() => {
    if (transitionPhase === 'idle') {
      transitionHandledRef.current = false;
      handoffStartedRef.current = false;
      fallStartYRef.current = null;
      handoffLandingFrameCounterRef.current = 0;
      activeOpacityRef.current = 1;
      nextOpacityRef.current = 0;
      updateOpacity(activeMaterialsRef.current, 1);
      updateOpacity(nextMaterialsRef.current, 0);
    }
  }, [transitionPhase, updateOpacity]);

  useFrame((state, delta) => {
    const frameStart = performance.now();
    updateActiveBoardTilt({
      activeBoard: activeBoardRef.current,
      controlsEnabled,
      isFailed,
      isReady,
      isMobile,
      pointer: state.pointer,
      mobileRotation: mobileRotation.current,
      targetGravity: targetGravity.current,
    });

    updateNextBoardRotation(nextBoardRef.current);

    const transitionResult = updateTransitionState({
      ball: ballRef.current,
      transitionPhase,
      transitionTarget,
      activeOpacity: activeOpacityRef.current,
      nextOpacity: nextOpacityRef.current,
      onActiveOpacityChange: (opacity) => {
        activeOpacityRef.current = opacity;
        updateOpacity(activeMaterialsRef.current, opacity);
      },
      onNextOpacityChange: (opacity) => {
        nextOpacityRef.current = opacity;
        updateOpacity(nextMaterialsRef.current, opacity);
      },
      handoffStarted: handoffStartedRef.current,
      transitionHandled: transitionHandledRef.current,
      onEnterHandoff,
      onCompleteTransition,
      handoffLandingHoldFrames: HANDOFF_LANDING_HOLD_FRAMES,
      handoffLandingFrameCounterRef: handoffLandingFrameCounterRef,
    });
    handoffStartedRef.current = transitionResult.handoffStarted;
    transitionHandledRef.current = transitionResult.transitionHandled;

    let targetFallIntensity = 0;
    if (transitionPhase !== 'idle' && transitionTarget) {
      const ballBody = ballRef.current;
      if (ballBody) {
        if (fallStartYRef.current === null) {
          fallStartYRef.current = ballBody.translation().y;
        }
        const y = ballBody.translation().y;
        targetFallIntensity = getTransitionVisualIntensity(y, transitionTarget[1], fallStartYRef.current);
        const dy = y - transitionTarget[1];
        if (dy < TRANSITION_LANDING_SOFT_RANGE) {
          const u = THREE.MathUtils.clamp(dy / TRANSITION_LANDING_SOFT_RANGE, 0, 1);
          targetFallIntensity *= THREE.MathUtils.smootherstep(0, 1, u);
        }
      }
    } else {
      fallStartYRef.current = null;
    }

    const prevSmooth = smoothedFallVisualRef.current;
    const damp = targetFallIntensity >= prevSmooth ? FALL_VISUAL_DAMP_UP : FALL_VISUAL_DAMP_DOWN;
    let nextSmooth = prevSmooth + (targetFallIntensity - prevSmooth) * Math.min(1, damp * delta);
    if (targetFallIntensity === 0 && Math.abs(nextSmooth) < 0.004) {
      nextSmooth = 0;
    }
    smoothedFallVisualRef.current = nextSmooth;
    transitionFallIntensityRef.current = nextSmooth;

    const composer = composerRef.current;
    if (composer) {
      if (!transitionFxCacheRef.current?.bloom) {
        transitionFxCacheRef.current = collectTransitionFxEffects(composer);
      }
      if (transitionFxCacheRef.current) {
        const lastFx = transitionFxLastAppliedIntensityRef.current;
        if (
          Number.isNaN(lastFx) ||
          Math.abs(nextSmooth - lastFx) >= 0.02 ||
          (nextSmooth === 0 && lastFx !== 0)
        ) {
          applyTransitionFxEffects(transitionFxCacheRef.current, nextSmooth);
          transitionFxLastAppliedIntensityRef.current = nextSmooth;
        }
      }
    }

    if (nextMaze) {
      const o = nextOpacityRef.current;
      nextRevealRadiusRef.current = REVEAL_RADIUS_MIN + o * REVEAL_RADIUS_SPAN;
    }

    if (nextMaze && isPerfEnabled()) {
      const stats = renderStatsRef.current;
      const frameMs = delta * 1000;
      stats.elapsed += frameMs;
      stats.frameCount += 1;
      if (frameMs > stats.maxDeltaMs) stats.maxDeltaMs = frameMs;
      if (stats.elapsed >= 500) {
        const drawCalls = state.gl.info.render.calls;
        const triangles = state.gl.info.render.triangles;
        const avgFrame = stats.elapsed / stats.frameCount;
        console.debug(
          `[perf] transition overlap: avgFrame=${avgFrame.toFixed(2)}ms maxFrame=${stats.maxDeltaMs.toFixed(2)}ms drawCalls=${drawCalls} triangles=${triangles}`,
        );
        stats.elapsed = 0;
        stats.frameCount = 0;
        stats.maxDeltaMs = 0;
      }
    }
    markDuration('scene.useFrame', performance.now() - frameStart);
  });

  const nextRevealCenter = useMemo<[number, number]>(() => {
    if (!transitionTarget) return [0, 0];
    return [
      transitionTarget[0] - nextMazeOffset[0],
      transitionTarget[2] - nextMazeOffset[1],
    ];
  }, [nextMazeOffset, transitionTarget]);

  return (
    <>
       <ambientLight intensity={1.0} />
       <directionalLight 
         ref={lightRef}
         position={[15, 25, 15]} 
         intensity={1.5} 
         castShadow 
         shadow-mapSize={SHADOW_MAP_SIZE}
         shadow-camera-left={-12}
         shadow-camera-right={12}
         shadow-camera-top={12}
         shadow-camera-bottom={-12}
         shadow-camera-near={0.1}
         shadow-camera-far={100}
         shadow-bias={-0.0005}
       />
       <pointLight position={[-15, 15, -15]} intensity={1.0} />

      <Physics key={isReady ? 'active' : 'inactive'}>
        <GravityController 
          targetGravity={targetGravity} 
          isReady={isReady} 
          controlsEnabled={controlsEnabled && !isFailed} 
          transitionPhase={transitionPhase}
        />
         <Suspense fallback={null}>
          <group ref={activeBoardRef}>
            <Maze 
              map={activeMaze.map} 
              onPortalEnter={onPortalEnter} 
              onFail={onFail} 
              isInteractive
              castsStaticShadows={transitionPhase === 'idle'}
            />
            {(!isMobile || isReady) && (
              <Ball 
                ref={ballRef} 
                position={ballSpawnPosition} 
                restitution={transitionPhase === 'idle' ? 0 : (transitionPhase === 'handoff' ? 0 : 0.6)} 
              />
            )}
           </group>
          {nextMaze && (
            <group 
              ref={nextBoardRef} 
              visible={isNextMazeVisible}
              position={[nextMazeOffset[0], -DROP_DISTANCE, nextMazeOffset[1]]}
            >
              <Maze 
                map={nextMaze.map} 
                onPortalEnter={NOOP_PORTAL_ENTER}
                onFail={NOOP_FAIL}
                isInteractive={false}
                includeStaticColliders
                revealCenter={nextRevealCenter}
                revealRadiusRef={nextRevealRadiusRef}
              />
            </group>
          )}
         </Suspense>
        <BallCameraFollow
          ballRef={ballRef}
          activeBoardRef={activeBoardRef}
          camera={camera}
          lookTargetRef={lookTarget}
          lightRef={lightRef}
          fallIntensityRef={transitionFallIntensityRef}
        />
       </Physics>

       <EffectComposer
         ref={composerRef}
         enableNormalPass={false}
         /** Fixed level avoids framebuffer/MSAA teardown when `idle` starts (was a large hitch with 0→8). */
         multisampling={4}
       >
         <Bloom luminanceThreshold={1} luminanceSmoothing={0.9} height={300} intensity={1.5} />
         <ChromaticAberration offset={[0, 0]} radialModulation modulationOffset={0.12} />
         <Noise opacity={0.02} />
         <Vignette eskil={false} offset={0.1} darkness={1.1} />
       </EffectComposer>
    </>
  );
}

export function GameScene({
  requestedPath,
  onPathChange,
}: {
  requestedPath: string;
  onPathChange: (path: string) => void;
}) {
    const [isReady, setIsReady] = useState(!isMobile);
    const [isLandscape, setIsLandscape] = useState(false);
    const [isFailed, setIsFailed] = useState(false);
    const [activeMaze, setActiveMaze] = useState<MazeDescriptor>(() => mazeFromPath(requestedPath));
    const [nextMaze, setNextMaze] = useState<MazeDescriptor | null>(null);
    const [transitionPhase, setTransitionPhase] = useState<TransitionPhase>('idle');
    const [transitionTarget, setTransitionTarget] = useState<[number, number, number] | null>(null);
    const [nextMazeOffset, setNextMazeOffset] = useState<[number, number]>([0, 0]);
    const ballRef = useRef<RapierRigidBody | null>(null);

    const controlsEnabled = isReady && !isFailed && transitionPhase === 'idle';
    const ballSpawnPosition = useMemo(() => getDescriptorStartPosition(activeMaze), [activeMaze]);
    const transitionStartRef = useRef(0);

    useEffect(() => {
        if (!isMobile) return;
        const checkOrientation = () => setIsLandscape(window.innerWidth > window.innerHeight);
        checkOrientation();
        window.addEventListener('resize', checkOrientation);
        return () => window.removeEventListener('resize', checkOrientation);
    }, []);

    const handleInitialTap = async () => {
        if (isReady) return;
        const DeviceMotionEventAny = (window as unknown as { DeviceMotionEvent?: { requestPermission?: () => Promise<'granted' | 'denied'> } }).DeviceMotionEvent;
        if (DeviceMotionEventAny && typeof DeviceMotionEventAny.requestPermission === 'function') {
            try { await DeviceMotionEventAny.requestPermission(); setIsReady(true); } catch { setIsReady(true); }
        } else { setIsReady(true); }
    };

    const handleFail = useCallback((entryPosition: [number, number, number]) => {
      if (transitionPhase !== 'idle' || isFailed) return;
      const setupStart = performance.now();
      
      const match = activeMaze.path.match(/^\/endless\/([^/]+)/);
      if (!match) return; // Only endless mode has retry maze
      
      const seed = match[1];
      const destination = mazeFromPath(`/endless/${seed}/retry`);
      
      const targetStartLocal = getDescriptorStartPosition(destination, 0);
      const offsetX = entryPosition[0] - targetStartLocal[0];
      const offsetZ = entryPosition[2] - targetStartLocal[2];
      
      setNextMaze(destination);
      setNextMazeOffset([offsetX, offsetZ]);
      setTransitionTarget([entryPosition[0], -DROP_DISTANCE + 0.5, entryPosition[2]]);
      setTransitionPhase('falling');
      transitionStartRef.current = performance.now();
      markDuration('transition.failSetup', performance.now() - setupStart);
    }, [activeMaze.path, transitionPhase, isFailed]);

    const handlePortalEnter = useCallback((destinationId: string, entryPosition: [number, number, number]) => {
      if (transitionPhase !== 'idle' || isFailed) return;
      const setupStart = performance.now();

      let destination: MazeDescriptor;
      if (destinationId === 'endless') {
        const seed = randomSeed();
        destination = mazeFromPath(`/endless/${seed}`);
      } else if (destinationId === 'endless/retry') {
        const seed = activeMaze.path.split('/')[2];
        destination = mazeFromPath(`/endless/${seed}`);
      } else {
        const normalizedPath = destinationId === 'home' ? '/' : `/${destinationId}`;
        destination = mazeFromPath(normalizedPath);
      }

      const targetStartLocal = getDescriptorStartPosition(destination, 0);
      const offsetX = entryPosition[0] - targetStartLocal[0];
      const offsetZ = entryPosition[2] - targetStartLocal[2];
      
      setNextMaze(destination);
      setNextMazeOffset([offsetX, offsetZ]);
      setTransitionTarget([entryPosition[0], -DROP_DISTANCE + 0.5, entryPosition[2]]);
      setTransitionPhase('falling');
      transitionStartRef.current = performance.now();
      markDuration('transition.portalSetup', performance.now() - setupStart);
    }, [activeMaze.path, transitionPhase, isFailed]);

    const portalEnterRef = useRef(handlePortalEnter);
    const failRef = useRef(handleFail);
    useEffect(() => { portalEnterRef.current = handlePortalEnter; }, [handlePortalEnter]);
    useEffect(() => { failRef.current = handleFail; }, [handleFail]);

    const stablePortalEnter = useCallback((id: string, pos: [number, number, number]) => portalEnterRef.current(id, pos), []);
    const stableFail = useCallback((pos: [number, number, number]) => failRef.current(pos), []);

    const handleEnterHandoff = useCallback(() => {
      setTransitionPhase('handoff');
      if (transitionStartRef.current > 0) {
        markDuration('transition.toHandoff', performance.now() - transitionStartRef.current);
      }
    }, []);

    const handleCompleteTransition = useCallback(() => {
      if (!nextMaze) return;
      setActiveMaze(nextMaze);
      setNextMaze(null);
      setTransitionTarget(null);
      setTransitionPhase('idle');
      setIsFailed(false);
      onPathChange(nextMaze.path);
      if (transitionStartRef.current > 0) {
        markDuration('transition.fullDuration', performance.now() - transitionStartRef.current);
      }
      transitionStartRef.current = 0;
    }, [nextMaze, onPathChange]);

    return (
        <div onClick={handleInitialTap} style={{ position: 'fixed', inset: 0, width: '100dvw', height: '100dvh', background: '#111', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {isMobile && isLandscape && <OrientationOverlay />}
          {isMobile && !isLandscape && !isReady && (
            <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', zIndex: 999, color: 'white', background: 'rgba(0,0,0,0.8)', padding: '25px 45px', borderRadius: '50px', pointerEvents: 'none', fontFamily: 'sans-serif', border: '1px solid #4af', textAlign: 'center', boxShadow: '0 0 30px rgba(74,175,255,0.3)' }}>
                <div style={{ fontSize: '0.8rem', opacity: 0.6, marginBottom: '5px' }}>INTERACTIVE PORTFOLIO</div>
                <div style={{ fontWeight: 'bold', letterSpacing: '1px' }}>TAP TO ENTER</div>
            </div>
          )}

          <Canvas 
            key={'camera'}
            shadows 
            gl={{ antialias: true }}
            camera={{ position: [0, 25, 0], fov: 40 }} 
            dpr={[1, 2]}
          >
              <color attach="background" args={['#1a1a1a']} />
              <SceneContent
                activeMaze={activeMaze}
                nextMaze={nextMaze}
                transitionPhase={transitionPhase}
                transitionTarget={transitionTarget}
                ballSpawnPosition={ballSpawnPosition}
                isReady={isReady}
                controlsEnabled={controlsEnabled}
                isFailed={isFailed}
                onPortalEnter={stablePortalEnter}
                onFail={stableFail}
                onEnterHandoff={handleEnterHandoff}
                onCompleteTransition={handleCompleteTransition}
                nextMazeOffset={nextMazeOffset}
                ballRef={ballRef}
              />
          </Canvas>
        </div>
    )
}

function OrientationOverlay() {
    return (
        <div style={{ position: 'fixed', inset: 0, display: 'flex', justifyContent: 'center', alignItems: 'center', background: '#1a1a1a', zIndex: 10000, color: 'white', textAlign: 'center', padding: '20px' }}>
            <div style={{ fontSize: '3rem', marginBottom: '20px' }}>📱</div>
            <h2>Please rotate to Portrait</h2>
            <p style={{ opacity: 0.7 }}>Experience optimized for vertical viewing</p>
        </div>
    );
}
