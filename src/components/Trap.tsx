import { RigidBody, CylinderCollider, CuboidCollider, RapierRigidBody } from '@react-three/rapier';
import { useState, useEffect, useMemo, useRef, memo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

interface TrapProps {
  position: [number, number, number];
  onFail: (entryPosition: [number, number, number]) => void;
  slideDirection?: { x: number; z: number };
}

const NEON_BLUE = new THREE.Color("#00ccff");
const RED_ORANGE = new THREE.Color("#ff4400");

const TrapVisuals = memo(({ 
    doorRef, 
    doorMatRef, 
    borderRef, 
    borderMatRef, 
    floorShape 
}: { 
    doorRef: React.RefObject<THREE.Mesh>, 
    doorMatRef: React.RefObject<THREE.MeshStandardMaterial>, 
    borderRef: React.RefObject<THREE.Mesh>, 
    borderMatRef: React.RefObject<THREE.MeshBasicMaterial>, 
    floorShape: THREE.Shape 
}) => {
  return (
    <>
      <mesh rotation-x={-Math.PI / 2} position={[0, -0.05, 0]} receiveShadow>
        <shapeGeometry args={[floorShape]} />
        <meshStandardMaterial color="#ffffff" metalness={0.1} roughness={0.9} transparent />
      </mesh>

      <mesh position={[0, -0.6, 0]} receiveShadow>
        <cylinderGeometry args={[0.48, 0.48, 1, 32]} />
        <meshStandardMaterial color="#000000" roughness={1} transparent />
      </mesh>

      <mesh ref={doorRef} position={[0, -0.05, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.44, 0.44, 0.05, 32]} />
        <meshStandardMaterial 
          ref={doorMatRef}
          color="#ffffff" 
          metalness={0.4} 
          roughness={0.6} 
          transparent
          userData={{ localOpacity: 1 }}
        />
      </mesh>

      <mesh ref={borderRef} position={[0, 0.01, 0]} rotation-x={-Math.PI / 2}>
        <ringGeometry args={[0.44, 0.52, 32]} />
        <meshBasicMaterial ref={borderMatRef} color={NEON_BLUE} toneMapped={false} transparent userData={{ localOpacity: 1 }} />
      </mesh>
    </>
  );
});

export const Trap = memo(function Trap({ position, onFail, slideDirection = { x: 0, z: -1 } }: TrapProps) {
  const [isPhysicsOpen, setIsPhysicsOpen] = useState(false);
  const trapPosVec = useMemo(() => new THREE.Vector3(...position), [position]);
  const tempVec = useRef(new THREE.Vector3());
  
  const isOpenRef = useRef(false);
  const progressRef = useRef(0);
  const ballInRangeRef = useRef<RapierRigidBody | null>(null);
  
  const doorRef = useRef<THREE.Mesh>(null);
  const doorMatRef = useRef<THREE.MeshStandardMaterial>(null);
  const borderRef = useRef<THREE.Mesh>(null);
  const borderMatRef = useRef<THREE.MeshBasicMaterial>(null);

  const floorShape = useMemo(() => {
    const shape = new THREE.Shape();
    shape.moveTo(-0.5, -0.5);
    shape.lineTo(0.5, -0.5);
    shape.lineTo(0.5, 0.5);
    shape.lineTo(-0.5, 0.5);
    shape.lineTo(-0.5, -0.5);

    const hole = new THREE.Path();
    hole.absarc(0, 0, 0.45, 0, Math.PI * 2, true);
    shape.holes.push(hole);
    return shape;
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      isOpenRef.current = !isOpenRef.current;
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  useFrame((_state, delta) => {
    const speed = 4.0;
    const isOpen = isOpenRef.current;
    
    if (isOpen && progressRef.current < 1) {
      progressRef.current = Math.min(1, progressRef.current + delta * speed);
    } else if (!isOpen && progressRef.current > 0) {
      progressRef.current = Math.max(0, progressRef.current - delta * speed);
    }

    const t = progressRef.current;

    if (doorRef.current) {
        doorRef.current.position.x = slideDirection.x * t * 0.9;
        doorRef.current.position.z = slideDirection.z * t * 0.9;
        doorRef.current.position.y = -0.05 - (t * 0.05);
    }
    if (doorMatRef.current) {
        const localOpacity = 1 - t;
        doorMatRef.current.userData.localOpacity = localOpacity;
        const globalOpacity = doorMatRef.current.userData.globalOpacity ?? 1;
        doorMatRef.current.opacity = localOpacity * globalOpacity;
    }

    if (borderMatRef.current) {
        borderMatRef.current.color.copy(NEON_BLUE).lerp(RED_ORANGE, t);
        const globalOpacity = borderMatRef.current.userData.globalOpacity ?? 1;
        borderMatRef.current.opacity = globalOpacity;
    }
    if (borderRef.current) {
        const pulse = isOpen ? Math.sin(Date.now() * 0.01) * 0.2 + 0.8 : 1;
        borderRef.current.scale.setScalar(isOpen ? pulse : 1);
    }

    if (t > 0.8) {
      if (!isPhysicsOpen) setIsPhysicsOpen(true);
    } else if (t < 0.2) {
      if (isPhysicsOpen) setIsPhysicsOpen(false);
    }

    if (isPhysicsOpen && t > 0.6 && ballInRangeRef.current) {
        const body = ballInRangeRef.current;
        const ballPos = body.translation();
        tempVec.current.set(ballPos.x, position[1], ballPos.z);
        const dist = trapPosVec.distanceTo(tempVec.current);
        
        if (dist < 1.0) {
            const pullStrength = 10.0 * (1 - dist);
            tempVec.current.set(position[0] - ballPos.x, 0, position[2] - ballPos.z).normalize();
            body.applyImpulse({ 
                x: tempVec.current.x * pullStrength * delta, 
                y: -1.5 * delta,
                z: tempVec.current.z * pullStrength * delta 
            }, true);
        }
    }
  });

  return (
    <group position={position}>
      <TrapVisuals 
        doorRef={doorRef}
        doorMatRef={doorMatRef}
        borderRef={borderRef}
        borderMatRef={borderMatRef}
        floorShape={floorShape}
      />

      <RigidBody type="fixed" friction={0.1} restitution={0.2} colliders={false}>
        {!isPhysicsOpen && <CuboidCollider args={[0.5, 0.5, 0.5]} position={[0, -0.5, 0]} />}
      </RigidBody>

      <RigidBody type="fixed" friction={0.1} restitution={0.2} colliders={false}>
        <CuboidCollider args={[0.1, 0.5, 0.5]} position={[-0.45, -0.5, 0]} />
        <CuboidCollider args={[0.1, 0.5, 0.5]} position={[0.45, -0.5, 0]} />
        <CuboidCollider args={[0.4, 0.5, 0.1]} position={[0, -0.5, -0.45]} />
        <CuboidCollider args={[0.4, 0.5, 0.1]} position={[0, -0.5, 0.45]} />
      </RigidBody>

      <RigidBody type="fixed" sensor colliders={false}
        onIntersectionEnter={({ other }) => {
          if (other.rigidBodyObject?.name === "ball") {
            ballInRangeRef.current = other.rigidBody ?? null;
          }
        }}
        onIntersectionExit={({ other }) => {
          if (other.rigidBodyObject?.name === "ball") {
            ballInRangeRef.current = null;
          }
        }}
      >
        <CylinderCollider args={[0.5, 1.0]} position={[0, 0, 0]} />
      </RigidBody>

      <RigidBody type="fixed" sensor colliders={false} onIntersectionEnter={({ other }) => {
        if (other.rigidBodyObject?.name === "ball" && isPhysicsOpen) {
          const rb = other.rigidBody;
          if (rb) {
            const pos = rb.translation();
            onFail([pos.x, pos.y, pos.z]);
          }
        }
      }}>
        <CylinderCollider args={[0.3, 0.4]} position={[0, -1.0, 0]} />
      </RigidBody>
    </group>
  );
});
