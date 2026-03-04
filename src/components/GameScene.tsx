import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Physics, RapierRigidBody, useRapier } from '@react-three/rapier';
import { useState, useEffect, useLayoutEffect, useRef, Suspense, useCallback, useMemo } from 'react';
import type { MutableRefObject } from 'react';
import { Maze } from './Maze';
import { Ball } from './Ball';
import * as THREE from 'three';
import { EffectComposer, Bloom, Noise, Vignette } from '@react-three/postprocessing';
import { levelHome, levelProjects, levelSkills, levelContact, levelRetry } from '../levels';
import { generateMaze } from '../utils/mazeGenerator';

/* eslint-disable react-hooks/immutability */

const isMobile = typeof window !== 'undefined' && /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
const DROP_DISTANCE = 30;
const CAMERA_HEIGHT = 20;

type MazeId = 'home' | 'projects' | 'skills' | 'contact' | 'endless' | 'retry';
type TransitionPhase = 'idle' | 'falling' | 'handoff';

interface MazeDescriptor {
  id: MazeId;
  path: string;
  map: number[][];
}

function randomSeed() {
  return Math.random().toString(36).substring(7);
}

function mazeFromPath(path: string): MazeDescriptor {
  if (path === '/projects') return { id: 'projects', path, map: levelProjects };
  if (path === '/skills') return { id: 'skills', path, map: levelSkills };
  if (path === '/contact') return { id: 'contact', path, map: levelContact };

  const retryMatch = path.match(/^\/endless\/([^/]+)\/retry$/);
  if (retryMatch) {
    return { id: 'retry', path, map: levelRetry };
  }

  const endlessMatch = path.match(/^\/endless\/([^/]+)$/);
  if (endlessMatch) {
    const seed = endlessMatch[1];
    return {
      id: 'endless',
      path: `/endless/${seed}`,
      map: generateMaze(seed, 15),
    };
  }

  return { id: 'home', path: '/', map: levelHome };
}

function mazeFromDestination(destinationId: string): MazeDescriptor {
  if (destinationId === 'endless') {
    const seed = randomSeed();
    return {
      id: 'endless',
      path: `/endless/${seed}`,
      map: generateMaze(seed, 15),
    };
  }

  const normalized = destinationId === 'home' ? '/' : `/${destinationId}`;
  return mazeFromPath(normalized);
}

function getStartPosition(map: number[][], yOffset = 0): [number, number, number] {
  const width = map[0].length;
  const height = map.length;
  for (let z = 0; z < height; z++) {
    for (let x = 0; x < width; x++) {
      if (map[z][x] === 9) {
        return [(x - width / 2) + 0.5, yOffset + 0.5, (z - height / 2) + 0.5];
      }
    }
  }
  return [0, yOffset + 0.5, 0];
}

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

  // Cache for materials to avoid traversal in useFrame
  const activeMaterialsRef = useRef<{ material: THREE.Material, text?: any }[]>([]);
  const nextMaterialsRef = useRef<{ material: THREE.Material, text?: any }[]>([]);
  const [isNextMazeVisible, setIsNextMazeVisible] = useState(false);

  const collectMaterials = useCallback((group: THREE.Group | null) => {
    const collected: { material: THREE.Material, text?: any }[] = [];
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
      if ((node as any).isText || (node as any).fillOpacity !== undefined) {
        collected.push({ material: (node as any).material, text: node });
      }
    });
    return collected;
  }, []);

  const updateOpacity = useCallback((items: { material: THREE.Material, text?: any }[], opacity: number) => {
    items.forEach((item) => {
      if (item.text) {
        item.text.fillOpacity = opacity;
      } else {
        const mat = item.material;
        mat.userData.globalOpacity = opacity;
        const local = mat.userData.localOpacity !== undefined ? mat.userData.localOpacity : 1;
        mat.opacity = local * opacity;
      }
    });
  }, []);

  // Use layout effect for immediate opacity application before paint
  useLayoutEffect(() => {
    if (activeBoardRef.current) {
      activeMaterialsRef.current = collectMaterials(activeBoardRef.current);
      updateOpacity(activeMaterialsRef.current, activeOpacityRef.current);
    }
  }, [activeMaze.id, collectMaterials, updateOpacity]);

  useLayoutEffect(() => {
    if (nextMaze) {
        setIsNextMazeVisible(false);
        // Immediate collection and visibility setup to avoid lag
        if (nextBoardRef.current) {
            nextMaterialsRef.current = collectMaterials(nextBoardRef.current);
            updateOpacity(nextMaterialsRef.current, 0); 
            setIsNextMazeVisible(true);
        }
    } else {
        nextMaterialsRef.current = [];
        setIsNextMazeVisible(false);
    }
  }, [nextMaze?.id, collectMaterials, updateOpacity]);

  // Synchronize ball and camera teleportation with maze swap to prevent jiggles and tunneling
  useLayoutEffect(() => {
    if (ballRef.current && activeMaze.path !== lastActiveMazePath.current) {
        const targetStartLocal = getStartPosition(activeMaze.map, 0);
        
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
  }, [activeMaze.path, camera, nextMazeOffset, ballRef]);

  useEffect(() => {
    camera.up.set(0, 0, -1);
  }, [camera]);

  useEffect(() => {
    if (!isMobile || !isReady) return;
    const handleMotion = (event: DeviceMotionEvent) => {
      const acc = event.accelerationIncludingGravity;
      if (!acc) return;
      const s = 5.0;
      const ax = acc.x ?? 0;
      const ay = acc.y ?? 0;
      const az = acc.z ?? 9.8;
      const safeAz = Math.max(1.0, az);
      
      targetGravity.current.set(-ax * s, -safeAz * s, ay * s);
      const mobileMaxTilt = 18 * (Math.PI / 180);
      mobileRotation.current.x = (ay / 10) * mobileMaxTilt;
      mobileRotation.current.z = (ax / 10) * mobileMaxTilt;
    };
    window.addEventListener('devicemotion', handleMotion, true);
    return () => window.removeEventListener('devicemotion', handleMotion);
  }, [isReady]);

  useEffect(() => {
    if (transitionPhase === 'idle') {
      transitionHandledRef.current = false;
      handoffStartedRef.current = false;
      activeOpacityRef.current = 1;
      nextOpacityRef.current = 0;
      updateOpacity(activeMaterialsRef.current, 1);
      updateOpacity(nextMaterialsRef.current, 0);
    }
  }, [transitionPhase, updateOpacity]);

  useFrame((state) => {
    if (activeBoardRef.current) {
      if (controlsEnabled && !isFailed && isReady) {
        if (!isMobile) {
          const maxTilt = 15 * (Math.PI / 210);
          const mouseX = state.pointer.x;
          const mouseY = state.pointer.y;
          activeBoardRef.current.rotation.x = THREE.MathUtils.lerp(activeBoardRef.current.rotation.x, -mouseY * maxTilt, 0.05);
          activeBoardRef.current.rotation.z = THREE.MathUtils.lerp(activeBoardRef.current.rotation.z, -mouseX * maxTilt, 0.05);
          targetGravity.current.set(mouseX * 15, -30, -mouseY * 15);
        } else {
          activeBoardRef.current.rotation.x = THREE.MathUtils.lerp(activeBoardRef.current.rotation.x, mobileRotation.current.x, 0.1);
          activeBoardRef.current.rotation.z = THREE.MathUtils.lerp(activeBoardRef.current.rotation.z, mobileRotation.current.z, 0.1);
        }
      } else {
        activeBoardRef.current.rotation.x = THREE.MathUtils.lerp(activeBoardRef.current.rotation.x, 0, 0.08);
        activeBoardRef.current.rotation.z = THREE.MathUtils.lerp(activeBoardRef.current.rotation.z, 0, 0.08);
      }
    }

    if (nextBoardRef.current) {
      nextBoardRef.current.rotation.x = THREE.MathUtils.lerp(nextBoardRef.current.rotation.x, 0, 0.1);
      nextBoardRef.current.rotation.z = THREE.MathUtils.lerp(nextBoardRef.current.rotation.z, 0, 0.1);
    }

    if (ballRef.current && transitionPhase !== 'idle' && transitionTarget) {
      const ball = ballRef.current;
      const current = ball.translation();
      const velocity = ball.linvel();

      // Fade transitions based on ball height
      const aOpacity = THREE.MathUtils.clamp(1 + current.y / 10, 0, 1);
      if (activeOpacityRef.current !== aOpacity) {
        activeOpacityRef.current = aOpacity;
        updateOpacity(activeMaterialsRef.current, aOpacity);
      }

      const distToTarget = Math.abs(current.y - transitionTarget[1]);
      const nOpacity = THREE.MathUtils.clamp(1 - distToTarget / 15, 0, 1);
      if (nextOpacityRef.current !== nOpacity) {
        nextOpacityRef.current = nOpacity;
        updateOpacity(nextMaterialsRef.current, nOpacity);
      }

      if (transitionPhase === 'falling') {
        const steer = 0.12;
        const nextX = THREE.MathUtils.lerp(current.x, transitionTarget[0], steer);
        const nextZ = THREE.MathUtils.lerp(current.z, transitionTarget[2], steer);
        ball.setTranslation({ x: nextX, y: current.y, z: nextZ }, true);
        ball.setLinvel({ x: 0, y: Math.min(velocity.y, -15), z: 0 }, true);

        if (!handoffStartedRef.current && current.y <= transitionTarget[1] + 2.5) {
          handoffStartedRef.current = true;
          onEnterHandoff();
        }
      }

      if (transitionPhase === 'handoff') {
        const handoffSteer = 0.25;
        const steerX = THREE.MathUtils.lerp(current.x, transitionTarget[0], handoffSteer);
        const steerZ = THREE.MathUtils.lerp(current.z, transitionTarget[2], handoffSteer);
        ball.setTranslation({ x: steerX, y: current.y, z: steerZ }, true);
        
        const nearLanding = current.y <= transitionTarget[1] + 0.6;
        if (!transitionHandledRef.current && nearLanding) {
          transitionHandledRef.current = true;
          onCompleteTransition();
        }
      }
    }

    if (!ballRef.current) return
    const cameraTarget = ballRef.current.translation()
    
    camera.position.x = cameraTarget.x;
    camera.position.y = cameraTarget.y + CAMERA_HEIGHT;
    camera.position.z = cameraTarget.z;
    
    lookTarget.current.set(cameraTarget.x, cameraTarget.y, cameraTarget.z);
    camera.lookAt(lookTarget.current);

    if (lightRef.current) {
      lightRef.current.position.set(cameraTarget.x + 15, cameraTarget.y + 25, cameraTarget.z + 15);
      lightRef.current.target.position.set(cameraTarget.x, cameraTarget.y, cameraTarget.z);
      lightRef.current.target.updateMatrixWorld();
    }
  });

  return (
    <>
       <ambientLight intensity={1.0} />
       <directionalLight 
         ref={lightRef}
         position={[15, 25, 15]} 
         intensity={1.5} 
         castShadow 
         shadow-mapSize={[2048, 2048]}
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
              mazeId={activeMaze.id} 
              onPortalEnter={onPortalEnter} 
              onFail={onFail} 
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
                mazeId={nextMaze.id} 
                onPortalEnter={() => {}} 
                onFail={() => {}} 
              />
            </group>
          )}
         </Suspense>
       </Physics>

       <EffectComposer enableNormalPass={false} multisampling={8}>
         <Bloom luminanceThreshold={1} luminanceSmoothing={0.9} height={300} intensity={1.5} />
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
    const ballSpawnPosition = useMemo(() => getStartPosition(activeMaze.map), [activeMaze.map]);

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
      
      const match = activeMaze.path.match(/^\/endless\/([^/]+)/);
      if (!match) return; // Only endless mode has retry maze
      
      const seed = match[1];
      const destination: MazeDescriptor = {
          id: 'retry',
          path: `/endless/${seed}/retry`,
          map: levelRetry,
      };
      
      const targetStartLocal = getStartPosition(destination.map, 0);
      const offsetX = entryPosition[0] - targetStartLocal[0];
      const offsetZ = entryPosition[2] - targetStartLocal[2];
      
      setNextMaze(destination);
      setNextMazeOffset([offsetX, offsetZ]);
      setTransitionTarget([entryPosition[0], -DROP_DISTANCE + 0.5, entryPosition[2]]);
      setTransitionPhase('falling');
    }, [activeMaze.path, transitionPhase, isFailed]);

    const handlePortalEnter = useCallback((destinationId: string, entryPosition: [number, number, number]) => {
      if (transitionPhase !== 'idle' || isFailed) return;

      let destination: MazeDescriptor;
      if (destinationId === 'retry_action') {
        const match = activeMaze.path.match(/^\/endless\/([^/]+)/);
        const seed = match ? match[1] : randomSeed();
        destination = {
          id: 'endless',
          path: `/endless/${seed}`,
          map: generateMaze(seed, 15),
        };
      } else {
        destination = mazeFromDestination(destinationId);
      }

      const targetStartLocal = getStartPosition(destination.map, 0);
      const offsetX = entryPosition[0] - targetStartLocal[0];
      const offsetZ = entryPosition[2] - targetStartLocal[2];
      
      setNextMaze(destination);
      setNextMazeOffset([offsetX, offsetZ]);
      setTransitionTarget([entryPosition[0], -DROP_DISTANCE + 0.5, entryPosition[2]]);
      setTransitionPhase('falling');
    }, [activeMaze.path, transitionPhase, isFailed]);

    const portalEnterRef = useRef(handlePortalEnter);
    const failRef = useRef(handleFail);
    useEffect(() => { portalEnterRef.current = handlePortalEnter; }, [handlePortalEnter]);
    useEffect(() => { failRef.current = handleFail; }, [handleFail]);

    const stablePortalEnter = useCallback((id: string, pos: [number, number, number]) => portalEnterRef.current(id, pos), []);
    const stableFail = useCallback((pos: [number, number, number]) => failRef.current(pos), []);

    const handleEnterHandoff = useCallback(() => {
      setTransitionPhase('handoff');
    }, []);

    const handleCompleteTransition = useCallback(() => {
      if (!nextMaze) return;
      setActiveMaze(nextMaze);
      setNextMaze(null);
      setTransitionTarget(null);
      setTransitionPhase('idle');
      setIsFailed(false);
      onPathChange(nextMaze.path);
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
