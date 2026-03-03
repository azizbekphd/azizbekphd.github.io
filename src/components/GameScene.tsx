import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Physics } from '@react-three/rapier';
import { useState, useEffect, useRef, Suspense, useCallback } from 'react';
import { Maze } from './Maze';
import { Ball } from './Ball';
import * as THREE from 'three';
import { EffectComposer, Bloom, Noise, Vignette } from '@react-three/postprocessing';

const isMobile = typeof window !== 'undefined' && /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

function SceneContent({ map, onNavigate, isReady, onFail }: { map: number[][], onNavigate: (path: string) => void, isReady: boolean, onFail: () => void }) {
  const [gravity, setGravity] = useState<[number, number, number]>([0, -30, 0]);
  const { camera, size } = useThree();
  const targetGravity = useRef<THREE.Vector3>(new THREE.Vector3(0, -30, 0));
  const boardRef = useRef<THREE.Group>(null);
  const mobileRotation = useRef({ x: 0, z: 0 });
  
  const CELL_SIZE = 1;
  const width = map[0].length;
  const height = map.length;
  
  let startPos: [number, number, number] = [0, 0.5, 0];
  for(let z=0; z<height; z++) {
      for(let x=0; x<width; x++) {
          if(map[z][x] === 9) {
              startPos = [(x - width / 2) * CELL_SIZE + CELL_SIZE / 2, 0.5, (z - height / 2) * CELL_SIZE + CELL_SIZE / 2];
          }
      }
  }

  useEffect(() => {
    const aspect = size.width / size.height;
    const fovRad = (40 * Math.PI) / 180;
    const padding = 2;
    const camHeightForVertical = (height + padding) / (2 * Math.tan(fovRad / 2));
    const camHeightForHorizontal = (width + padding) / (2 * Math.tan(fovRad / 2) * aspect);
    const finalCamHeight = Math.max(camHeightForVertical, camHeightForHorizontal, 15);
    camera.position.set(0, finalCamHeight, 0);
    camera.lookAt(0, 0, 0);
  }, [camera, size, width, height]);

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

  useFrame((state) => {
    if (!isReady) return;
    if (boardRef.current) {
        if (!isMobile) {
            const maxTilt = 15 * (Math.PI / 210);
            const mouseX = state.pointer.x;
            const mouseY = state.pointer.y;
            boardRef.current.rotation.x = THREE.MathUtils.lerp(boardRef.current.rotation.x, -mouseY * maxTilt, 0.05);
            boardRef.current.rotation.z = THREE.MathUtils.lerp(boardRef.current.rotation.z, -mouseX * maxTilt, 0.05);
            targetGravity.current.set(mouseX * 15, -30, -mouseY * 15);
        } else {
            boardRef.current.rotation.x = THREE.MathUtils.lerp(boardRef.current.rotation.x, mobileRotation.current.x, 0.1);
            boardRef.current.rotation.z = THREE.MathUtils.lerp(boardRef.current.rotation.z, mobileRotation.current.z, 0.1);
        }
    }
    camera.lookAt(0, 0, 0);
    const currentG = new THREE.Vector3(...gravity);
    currentG.lerp(targetGravity.current, 0.05);
    setGravity([currentG.x, currentG.y, currentG.z]);
  });

  return (
    <>
       <ambientLight intensity={1.0} />
       <directionalLight 
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

       <Physics gravity={gravity} key={isReady ? 'active' : 'inactive'}>
         <Suspense fallback={null}>
           <group ref={boardRef}>
             <Maze map={map} onNavigate={onNavigate} onFail={onFail} />
             {(!isMobile || isReady) && <Ball position={startPos} />} 
           </group>
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

export function GameScene({ map, onNavigate }: { map: number[][], onNavigate: (path: string) => void }) {
    const [isReady, setIsReady] = useState(!isMobile);
    const [isLandscape, setIsLandscape] = useState(false);
    const [isFailed, setIsFailed] = useState(false);
    const [gameKey, setGameKey] = useState(0);

    useEffect(() => {
        if (!isMobile) return;
        const checkOrientation = () => setIsLandscape(window.innerWidth > window.innerHeight);
        checkOrientation();
        window.addEventListener('resize', checkOrientation);
        return () => window.removeEventListener('resize', checkOrientation);
    }, []);

    const handleInitialTap = async () => {
        if (isReady) return;
        const DeviceMotionEventAny = (window as any).DeviceMotionEvent;
        if (DeviceMotionEventAny && typeof DeviceMotionEventAny.requestPermission === 'function') {
            try { await DeviceMotionEventAny.requestPermission(); setIsReady(true); } catch (e) { setIsReady(true); }
        } else { setIsReady(true); }
    };

    const handleFail = useCallback(() => {
        setIsFailed(true);
    }, []);

    const handleRetry = useCallback(() => {
        setIsFailed(false);
        setGameKey(prev => prev + 1);
    }, []);

    const handleNavigate = useCallback((path: string) => {
        onNavigate(path);
    }, [onNavigate]);

    return (
        <div onClick={handleInitialTap} style={{ position: 'fixed', inset: 0, width: '100dvw', height: '100dvh', background: '#111', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {isMobile && isLandscape && <OrientationOverlay />}
          {isMobile && !isLandscape && !isReady && (
            <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', zIndex: 999, color: 'white', background: 'rgba(0,0,0,0.8)', padding: '25px 45px', borderRadius: '50px', pointerEvents: 'none', fontFamily: 'sans-serif', border: '1px solid #4af', textAlign: 'center', boxShadow: '0 0 30px rgba(74,175,255,0.3)' }}>
                <div style={{ fontSize: '0.8rem', opacity: 0.6, marginBottom: '5px' }}>INTERACTIVE PORTFOLIO</div>
                <div style={{ fontWeight: 'bold', letterSpacing: '1px' }}>TAP TO ENTER</div>
            </div>
          )}

          {isFailed && (
            <div style={{ position: 'absolute', inset: 0, zIndex: 1000, display: 'flex', justifyContent: 'center', alignItems: 'center', background: 'rgba(0,0,0,0.3)', backdropFilter: 'blur(30px)' }}>
                <div style={{ padding: '40px', borderRadius: '20px', textAlign: 'center', color: 'white', fontFamily: 'sans-serif' }}>
                    <h2 style={{ fontSize: '2rem', marginBottom: '10px', color: '#ff4400' }}>FAIL</h2>
                    <p style={{ opacity: 0.8, marginBottom: '30px' }}>The ball fell into a trap</p>
                    <button 
                        onClick={(e) => { e.stopPropagation(); handleRetry(); }}
                        style={{ background: '#ff4400', color: 'white', border: 'none', padding: '12px 30px', borderRadius: '50px', fontSize: '1.1rem', fontWeight: 'bold', cursor: 'pointer', transition: 'all 0.2s' }}
                    >
                        TRY AGAIN
                    </button>
                </div>
            </div>
          )}

          <Canvas 
            key={gameKey} 
            shadows 
            gl={{ antialias: true }}
            camera={{ position: [0, 25, 0], fov: 40 }} 
            dpr={[1, 2]}
          >
              <color attach="background" args={['#1a1a1a']} />
              <SceneContent map={map} onNavigate={handleNavigate} isReady={isReady} onFail={handleFail} />
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
