import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Physics, RapierRigidBody, useRapier } from '@react-three/rapier';
import { useState, useEffect, useRef, Suspense, useCallback, useMemo } from 'react';
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
  ballKey,
  isReady,
  controlsEnabled,
  isFailed,
  onPortalEnter,
  onFail,
  onEnterHandoff,
  onCompleteTransition,
  nextMazeOffset,
}: {
  activeMaze: MazeDescriptor;
  nextMaze: MazeDescriptor | null;
  transitionPhase: TransitionPhase;
  transitionTarget: [number, number, number] | null;
  ballSpawnPosition: [number, number, number];
  ballKey: number;
  isReady: boolean;
  controlsEnabled: boolean;
  isFailed: boolean;
  onPortalEnter: (destinationId: string, entryPosition: [number, number, number]) => void;
  onFail: (entryPosition: [number, number, number]) => void;
  onEnterHandoff: () => void;
  onCompleteTransition: () => void;
  nextMazeOffset: [number, number];
}) {
  const { camera } = useThree();
  const targetGravity = useRef<THREE.Vector3>(new THREE.Vector3(0, -30, 0));
  const activeBoardRef = useRef<THREE.Group>(null);
  const nextBoardRef = useRef<THREE.Group>(null);
  const [activeOpacity, setActiveOpacity] = useState(1);
  const [nextOpacity, setNextOpacity] = useState(0);
  const mobileRotation = useRef({ x: 0, z: 0 });
  const ballRef = useRef<RapierRigidBody | null>(null);
  const transitionHandledRef = useRef(false);
  const handoffStartedRef = useRef(false);
  const lastActiveMazePath = useRef(activeMaze.path);
  const lookTarget = useRef(new THREE.Vector3(0, 0, 0));
  const lightRef = useRef<THREE.DirectionalLight>(null);

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
    transitionHandledRef.current = false;
    handoffStartedRef.current = false;
  }, [ballKey]);

  useEffect(() => {
    if (transitionPhase === 'idle') {
      transitionHandledRef.current = false;
      handoffStartedRef.current = false;
      setActiveOpacity(1);
      setNextOpacity(0);
    }
  }, [transitionPhase]);

  useFrame((state) => {
    // Detect Maze Swap and teleport camera to avoid jump
    if (activeMaze.path !== lastActiveMazePath.current) {
      camera.position.y += DROP_DISTANCE;
      lookTarget.current.y += DROP_DISTANCE;
      // Also teleport horizontally to compensate for the maze offset being reset to [0,0]
      camera.position.x -= nextMazeOffset[0];
      camera.position.z -= nextMazeOffset[1];
      lookTarget.current.x -= nextMazeOffset[0];
      lookTarget.current.z -= nextMazeOffset[1];
      lastActiveMazePath.current = activeMaze.path;
    }

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
      // Active maze fades out as ball drops from 0 to -10
      const aOpacity = THREE.MathUtils.clamp(1 + current.y / 10, 0, 1);
      if (activeOpacity !== aOpacity) setActiveOpacity(aOpacity);

      // Next maze fades in as ball approaches transitionTarget.y
      // transitionTarget.y is roughly -DROP_DISTANCE + 0.5
      const distToTarget = Math.abs(current.y - transitionTarget[1]);
      const nOpacity = THREE.MathUtils.clamp(1 - distToTarget / 15, 0, 1);
      if (nextOpacity !== nOpacity) setNextOpacity(nOpacity);

      if (transitionPhase === 'falling') {
        const steer = 0.08;
        const nextX = THREE.MathUtils.lerp(current.x, transitionTarget[0], steer);
        const nextZ = THREE.MathUtils.lerp(current.z, transitionTarget[2], steer);
        ball.setTranslation({ x: nextX, y: current.y, z: nextZ }, true);
        ball.setLinvel({ x: 0, y: Math.min(velocity.y, -10), z: 0 }, true);

        if (!handoffStartedRef.current && current.y <= transitionTarget[1] + 2.5) {
          handoffStartedRef.current = true;
          onEnterHandoff();
        }
      }

      if (transitionPhase === 'handoff') {
        const handoffSteer = 0.15;
        const steerX = THREE.MathUtils.lerp(current.x, transitionTarget[0], handoffSteer);
        const steerZ = THREE.MathUtils.lerp(current.z, transitionTarget[2], handoffSteer);
        ball.setTranslation({ x: steerX, y: current.y, z: steerZ }, true);
        const nearLanding = current.y <= transitionTarget[1] + 0.55;
        const stable = Math.abs(velocity.y) <= 2.5;
        if (!transitionHandledRef.current && nearLanding && stable) {
          transitionHandledRef.current = true;
          ball.setTranslation({ x: transitionTarget[0], y: transitionTarget[1], z: transitionTarget[2] }, true);
          ball.setLinvel({ x: 0, y: 0, z: 0 }, true);
          ball.setAngvel({ x: 0, y: 0, z: 0 }, true);
          onCompleteTransition();
        }
      }
    }

    if (!ballRef.current) return
    const cameraTarget = ballRef.current.translation()
    const lookX = cameraTarget.x;
    const lookY = cameraTarget.y;
    const lookZ = cameraTarget.z;
    
    // Direct assignment to keep the ball perfectly centered without lag
    camera.position.x = lookX;
    camera.position.y = lookY + CAMERA_HEIGHT;
    camera.position.z = lookZ;
    
    lookTarget.current.set(lookX, lookY, lookZ);
    camera.lookAt(lookTarget.current);

    if (lightRef.current) {
      lightRef.current.position.set(lookX + 15, lookY + 25, lookZ + 15);
      lightRef.current.target.position.set(lookX, lookY, lookZ);
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
              opacity={transitionPhase === 'idle' ? 1 : activeOpacity}
            />
            {(!isMobile || isReady) && (
              <Ball 
                key={ballKey} 
                ref={ballRef} 
                position={ballSpawnPosition} 
                restitution={transitionPhase === 'idle' ? 0 : (transitionPhase === 'handoff' ? 0 : 0.6)} 
              />
            )}
           </group>
          {nextMaze && (
            <group ref={nextBoardRef} position={[nextMazeOffset[0], -DROP_DISTANCE, nextMazeOffset[1]]}>
              <Maze 
                map={nextMaze.map} 
                mazeId={nextMaze.id} 
                onPortalEnter={() => {}} 
                onFail={() => {}} 
                opacity={transitionPhase === 'idle' ? 0 : nextOpacity}
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
    const [ballKey, setBallKey] = useState(0);
    const [activeMaze, setActiveMaze] = useState<MazeDescriptor>(() => mazeFromPath(requestedPath));
    const [nextMaze, setNextMaze] = useState<MazeDescriptor | null>(null);
    const [transitionPhase, setTransitionPhase] = useState<TransitionPhase>('idle');
    const [transitionTarget, setTransitionTarget] = useState<[number, number, number] | null>(null);
    const [nextMazeOffset, setNextMazeOffset] = useState<[number, number]>([0, 0]);

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
      
      // Calculate offset to align the next maze's start with current ball position
      const offsetX = entryPosition[0] - targetStartLocal[0];
      const offsetZ = entryPosition[2] - targetStartLocal[2];
      
      setNextMaze(destination);
      setNextMazeOffset([offsetX, offsetZ]);
      setTransitionTarget([entryPosition[0], -DROP_DISTANCE + 0.5, entryPosition[2]]);
      setTransitionPhase('falling');
    }, [activeMaze.path, transitionPhase, isFailed]);

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
      setBallKey((prev) => prev + 1);
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
                ballKey={ballKey}
                isReady={isReady}
                controlsEnabled={controlsEnabled}
                isFailed={isFailed}
                onPortalEnter={handlePortalEnter}
                onFail={handleFail}
                onEnterHandoff={handleEnterHandoff}
                onCompleteTransition={handleCompleteTransition}
                nextMazeOffset={nextMazeOffset}
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
