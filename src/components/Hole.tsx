import { CylinderCollider, RigidBody, CuboidCollider, RapierRigidBody } from '@react-three/rapier';
import { Text } from '@react-three/drei';
import { useMemo, useRef, memo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

interface HoleProps {
  position: [number, number, number];
  destinationId: string;
  onEnter: (destinationId: string, entryPosition: [number, number, number]) => void;
  label?: string;
  color?: string;
}

export const Hole = memo(function Hole({ position, destinationId, onEnter, label, color = "#00ccff" }: HoleProps) {
  const ballInRangeRef = useRef<RapierRigidBody | null>(null);
  const holePosVec = useMemo(() => new THREE.Vector3(...position), [position]);
  const tempVec = useRef(new THREE.Vector3());

  const floorShape = useMemo(() => {
    const shape = new THREE.Shape();
    shape.moveTo(-0.5, -0.5);
    shape.lineTo(0.5, -0.5);
    shape.lineTo(0.5, 0.5);
    shape.lineTo(-0.5, 0.5);
    shape.lineTo(-0.5, -0.5);

    const hole = new THREE.Path();
    hole.absarc(0, 0, 0.4, 0, Math.PI * 2, true);
    shape.holes.push(hole);
    return shape;
  }, []);

  useFrame((_state, delta) => {
    if (ballInRangeRef.current) {
        const body = ballInRangeRef.current;
        const ballPos = body.translation();
        
        // Use pre-allocated vector to avoid GC pressure
        tempVec.current.set(ballPos.x, position[1], ballPos.z);
        const dist = holePosVec.distanceTo(tempVec.current);
        
        if (dist < 1.0) {
            const pullStrength = 5.0 * (1 - dist);
            // Reuse tempVec for direction calculation
            tempVec.current.set(position[0] - ballPos.x, 0, position[2] - ballPos.z).normalize();
            body.applyImpulse({ 
                x: tempVec.current.x * pullStrength * delta, 
                y: -0.5 * delta,
                z: tempVec.current.z * pullStrength * delta 
            }, true);
        }
    }
  });

  return (
    <group position={position}>
      {/* Surrounding Floor Tile with Hole */}
      <mesh rotation-x={-Math.PI / 2} position={[0, -0.05, 0]} receiveShadow>
        <shapeGeometry args={[floorShape]} />
        <meshStandardMaterial color="#ffffff" metalness={0.1} roughness={0.9} transparent />
      </mesh>

      {/* Deep Hole Visual */}
      <mesh position={[0, -0.5, 0]} receiveShadow>
        <cylinderGeometry args={[0.4, 0.4, 1, 32]} />
        <meshStandardMaterial color="#000000" roughness={1} transparent />
      </mesh>

      {/* Glowing Ring Rim */}
      <mesh position={[0, 0.01, 0]} rotation-x={-Math.PI / 2}>
        <ringGeometry args={[0.38, 0.45, 32]} />
        <meshBasicMaterial color={color} toneMapped={false} transparent />
      </mesh>
      
      {label && (
        <Text
          position={[0, 1.5, 0]}
          fontSize={0.4}
          color={color}
          anchorX="center"
          anchorY="middle"
          rotation={[-Math.PI / 2, 0, 0]}
          font="/fonts/RobotoMono.ttf"
        >
          {label}
          <meshBasicMaterial attach="material" color={color} toneMapped={false} transparent />
        </Text>
      )}
      
      {/* Physics: Sensor and Peripheral Support */}
      <RigidBody type="fixed" colliders={false}>
        {/* Entrance Sensor */}
        <CylinderCollider 
          args={[0.5, 0.5]} 
          position={[0, -0.5, 0]} 
          sensor 
          onIntersectionEnter={({ other }) => {
            if (other.rigidBodyObject?.name === "ball") {
              const rb = other.rigidBody;
              if (rb) {
                const translation = rb.translation();
                onEnter(destinationId, [translation.x, translation.y, translation.z]);
              }
            }
          }}
        />
        {/* Solid corners to support the ball */}
        <CuboidCollider args={[0.05, 0.5, 0.5]} position={[-0.475, -0.5, 0]} />
        <CuboidCollider args={[0.05, 0.5, 0.5]} position={[0.475, -0.5, 0]} />
        <CuboidCollider args={[0.425, 0.5, 0.05]} position={[0, -0.5, -0.475]} />
        <CuboidCollider args={[0.425, 0.5, 0.05]} position={[0, -0.5, 0.475]} />
      </RigidBody>

      {/* Physics: Suction Sensor */}
      <RigidBody 
        type="fixed" 
        sensor 
        colliders={false}
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
    </group>
  );
});
