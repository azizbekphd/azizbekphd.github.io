import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Physics } from '@react-three/rapier';
import { useState, useEffect, useRef, Suspense } from 'react';
import { Maze } from './Maze';
import { Ball } from './Ball';
import * as THREE from 'three';

const isMobile = typeof window !== 'undefined' && /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

function SceneContent({ map, onNavigate, isReady }: { map: number[][], onNavigate: (path: string) => void, isReady: boolean }) {
  const [gravity, setGravity] = useState<[number, number, number]>([0, -30, 0]);
  const { camera, size } = useThree();
  const targetGravity = useRef<THREE.Vector3>(new THREE.Vector3(0, -30, 0));
  const boardRef = useRef<THREE.Group>(null);
  
  // Ref to track mobile rotation for useFrame
  const mobileRotation = useRef({ x: 0, z: 0 });
  
  const CELL_SIZE = 1;
  const width = map[0].length;
  const height = map.length;
  
  let startPos: [number, number, number] = [0, 0.5, 0];
  for(let z=0; z<height; z++) {
      for(let x=0; x<width; x++) {
          if(map[z][x] === 9) {
              startPos = [
                  (x - width / 2) * CELL_SIZE + CELL_SIZE / 2, 
                  0.5, 
                  (z - height / 2) * CELL_SIZE + CELL_SIZE / 2
              ];
          }
      }
  }

  // Dynamically adjust camera height to fit maze in any aspect ratio
  useEffect(() => {
    const aspect = size.width / size.height;
    const fovRad = (40 * Math.PI) / 180;
    const padding = 2; // Extra units of padding
    
    // Height needed to fit the maze vertically
    const camHeightForVertical = (height + padding) / (2 * Math.tan(fovRad / 2));
    
    // Height needed to fit the maze horizontally
    const camHeightForHorizontal = (width + padding) / (2 * Math.tan(fovRad / 2) * aspect);
    
    // Pick the larger height to ensure both dimensions fit, with a minimum floor of 15
    const finalCamHeight = Math.max(camHeightForVertical, camHeightForHorizontal, 15);
    
    camera.position.set(0, finalCamHeight, 0);
    camera.lookAt(0, 0, 0);
  }, [camera, size, width, height]);

  useEffect(() => {
    if (!isMobile || !isReady) return;

    const handleMotion = (event: DeviceMotionEvent) => {
      const acc = event.accelerationIncludingGravity;
      if (!acc) return;

      const s = 5.0; // Sensitivity set to 5.0
      const ax = acc.x || 0;
      const ay = acc.y || 0;
      const az = acc.z || 9.8;

      // Gravity Mapping
      const gx = -ax * s; 
      const gz = ay * s;  
      const gy = -az * s;
      targetGravity.current.set(gx, gy, gz);

      // Significant visual tilt
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
            // Desktop mouse tilt
            const maxTilt = 15 * (Math.PI / 180); 
            const mouseX = state.pointer.x;
            const mouseY = state.pointer.y;
            
            const targetRotX = -mouseY * maxTilt; 
            const targetRotZ = -mouseX * maxTilt; 
            
            boardRef.current.rotation.x = THREE.MathUtils.lerp(boardRef.current.rotation.x, targetRotX, 0.05);
            boardRef.current.rotation.z = THREE.MathUtils.lerp(boardRef.current.rotation.z, targetRotZ, 0.05);
            targetGravity.current.set(mouseX * 15, -30, -mouseY * 15);
        } else {
            // Mobile more aggressive visual tilt
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
       <ambientLight intensity={1.5} />
       <directionalLight 
         position={[15, 25, 15]} 
         intensity={2.0} 
         castShadow 
         shadow-mapSize={[2048, 2048]}
         shadow-camera-left={-20}
         shadow-camera-right={20}
         shadow-camera-top={20}
         shadow-camera-bottom={-20}
         shadow-camera-near={0.1}
         shadow-camera-far={100}
       />
       <pointLight position={[-15, 15, -15]} intensity={1.5} />

       <Physics gravity={gravity} key={isReady ? 'active' : 'inactive'}>
         <Suspense fallback={null}>
           <group ref={boardRef}>
             <Maze map={map} onNavigate={onNavigate} />
             {(!isMobile || isReady) && <Ball position={startPos} />} 
           </group>
         </Suspense>
       </Physics>
    </>
  );
}

export function GameScene({ map, onNavigate }: { map: number[][], onNavigate: (path: string) => void }) {
    const [isReady, setIsReady] = useState(!isMobile);
    const [isLandscape, setIsLandscape] = useState(false);

    useEffect(() => {
        if (!isMobile) return;
        const checkOrientation = () => {
            setIsLandscape(window.innerWidth > window.innerHeight);
        };
        checkOrientation();
        window.addEventListener('resize', checkOrientation);
        return () => window.removeEventListener('resize', checkOrientation);
    }, []);

    const handleInitialTap = async () => {
        if (isReady) return;
        const DeviceMotionEventAny = (window as any).DeviceMotionEvent;
        if (DeviceMotionEventAny && typeof DeviceMotionEventAny.requestPermission === 'function') {
            try {
                const response = await DeviceMotionEventAny.requestPermission();
                if (response === 'granted') setIsReady(true);
            } catch (e) {
                console.error(e);
                setIsReady(true);
            }
        } else {
            setIsReady(true);
        }
    };

    return (
        <div 
            onClick={handleInitialTap}
            style={{ 
                position: 'fixed', inset: 0,
                width: '100dvw', height: '100dvh', 
                background: '#111', overflow: 'hidden', 
                display: 'flex', flexDirection: 'column'
            }}
        >
          {isMobile && isLandscape && <OrientationOverlay />}

          {isMobile && !isLandscape && !isReady && (
            <div style={{
                position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
                zIndex: 999, color: 'white', background: 'rgba(0,0,0,0.8)', padding: '25px 45px',
                borderRadius: '50px', pointerEvents: 'none', fontFamily: 'sans-serif', border: '1px solid #4af',
                textAlign: 'center', boxShadow: '0 0 30px rgba(74,175,255,0.3)'
            }}>
                <div style={{ fontSize: '0.8rem', opacity: 0.6, marginBottom: '5px' }}>INTERACTIVE PORTFOLIO</div>
                <div style={{ fontWeight: 'bold', letterSpacing: '1px' }}>TAP TO ENTER</div>
            </div>
          )}
          
          <Canvas shadows camera={{ position: [0, 25, 0], fov: 40 }} dpr={[1, 2]}>
              <color attach="background" args={['#1a1a1a']} />
              <SceneContent map={map} onNavigate={onNavigate} isReady={isReady} />
          </Canvas>
        </div>
    )
}

function OrientationOverlay() {
    return (
        <div style={{
            position: 'fixed', inset: 0,
            display: 'flex', justifyContent: 'center', alignItems: 'center',
            background: '#1a1a1a', zIndex: 10000, color: 'white', textAlign: 'center', padding: '20px'
        }}>
            <div style={{ fontSize: '3rem', marginBottom: '20px' }}>📱</div>
            <h2>Please rotate to Portrait</h2>
            <p style={{ opacity: 0.7 }}>Experience optimized for vertical viewing</p>
        </div>
    );
}
