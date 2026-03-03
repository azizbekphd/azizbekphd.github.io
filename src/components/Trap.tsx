import { RigidBody, CylinderCollider, CuboidCollider, RapierRigidBody } from '@react-three/rapier';
import { useState, useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

interface TrapProps {
  position: [number, number, number];
  onFail: (entryPosition: [number, number, number]) => void;
}

const NEON_BLUE = new THREE.Color("#00ccff");
const RED_ORANGE = new THREE.Color("#ff4400");

export function Trap({ position, onFail }: TrapProps) {
  const [isPhysicsOpen, setIsPhysicsOpen] = useState(false);
  const trapPosVec = useMemo(() => new THREE.Vector3(...position), [position]);
  
  // Refs for animation state to avoid re-renders
  const isOpenRef = useRef(false);
  const progressRef = useRef(0);
  const ballInRangeRef = useRef<RapierRigidBody | null>(null);
  
  // Refs for direct THREE.js updates
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
    
    // Update progress
    if (isOpen && progressRef.current < 1) {
      progressRef.current = Math.min(1, progressRef.current + delta * speed);
    } else if (!isOpen && progressRef.current > 0) {
      progressRef.current = Math.max(0, progressRef.current - delta * speed);
    }

    const t = progressRef.current;

    // 1. Update Door Visuals (Directly via refs)
    if (doorRef.current) {
        doorRef.current.position.y = -0.05 - (t * 0.85);
    }
    if (doorMatRef.current) {
        doorMatRef.current.opacity = 1 - (t * 0.4);
        doorMatRef.current.color.set(isOpen ? "#333333" : "#cccccc");
    }

    // 2. Update Border Visuals
    if (borderMatRef.current) {
        borderMatRef.current.color.copy(NEON_BLUE).lerp(RED_ORANGE, t);
    }
    if (borderRef.current) {
        const pulse = isOpen ? Math.sin(Date.now() * 0.01) * 0.2 + 0.8 : 1;
        borderRef.current.scale.setScalar(isOpen ? pulse : 1);
    }

    // 3. Sync Physics State (Thresholded re-render)
    if (t > 0.8) {
      if (!isPhysicsOpen) setIsPhysicsOpen(true);
    } else if (t < 0.2) {
      if (isPhysicsOpen) setIsPhysicsOpen(false);
    }

    // 4. Suction logic: Only pull if ball is in range and trap is open
    if (isPhysicsOpen && t > 0.6 && ballInRangeRef.current) {
        const body = ballInRangeRef.current;
        const ballPos = body.translation();
        const dist = trapPosVec.distanceTo(new THREE.Vector3(ballPos.x, position[1], ballPos.z));
        
        if (dist < 1.0) {
            const pullStrength = 10.0 * (1 - dist);
            const dir = new THREE.Vector3(position[0] - ballPos.x, 0, position[2] - ballPos.z).normalize();
            body.applyImpulse({ 
                x: dir.x * pullStrength * delta, 
                y: -1.5 * delta,
                z: dir.z * pullStrength * delta 
            }, true);
        }
    }
  });

  return (
    <group position={position}>
      {/* Surrounding Floor Tile with Hole */}
      <mesh rotation-x={-Math.PI / 2} position={[0, -0.05, 0]} receiveShadow>
        <shapeGeometry args={[floorShape]} />
        <meshStandardMaterial color="#ffffff" metalness={0.1} roughness={0.9} />
      </mesh>

      {/* Deep Hole Visual */}
      <mesh position={[0, -0.6, 0]} receiveShadow>
        <cylinderGeometry args={[0.48, 0.48, 1, 32]} />
        <meshStandardMaterial color="#000000" roughness={1} />
      </mesh>

      {/* Trap Door Visual */}
      <mesh ref={doorRef} position={[0, -0.05, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.44, 0.44, 0.05, 32]} />
        <meshStandardMaterial 
          ref={doorMatRef}
          color="#ccc" 
          metalness={0.4} 
          roughness={0.6} 
          transparent
        />
      </mesh>

      {/* Glowing Border */}
      <mesh ref={borderRef} position={[0, 0.01, 0]} rotation-x={-Math.PI / 2}>
        <ringGeometry args={[0.44, 0.52, 32]} />
        <meshBasicMaterial ref={borderMatRef} color={NEON_BLUE} toneMapped={false} />
      </mesh>

      {/* Physics: Main floor collider - Solid fixed body when closed, unmounted when open */}
      <RigidBody type="fixed" friction={0.1} restitution={0.2} colliders={false}>
        {!isPhysicsOpen && <CuboidCollider args={[0.5, 0.5, 0.5]} position={[0, -0.5, 0]} />}
      </RigidBody>

      {/* Fixed peripheral support corners - always present */}
      <RigidBody type="fixed" friction={0.1} restitution={0.2} colliders={false}>
        <CuboidCollider args={[0.1, 0.5, 0.5]} position={[-0.45, -0.5, 0]} />
        <CuboidCollider args={[0.1, 0.5, 0.5]} position={[0.45, -0.5, 0]} />
        <CuboidCollider args={[0.4, 0.5, 0.1]} position={[0, -0.5, -0.45]} />
        <CuboidCollider args={[0.4, 0.5, 0.1]} position={[0, -0.5, 0.45]} />
      </RigidBody>

      {/* Physics: Suction Sensor */}
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

      {/* Physics: Failure sensor - only triggers if trap is open */}
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
}
