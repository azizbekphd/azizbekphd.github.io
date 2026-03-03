import { RigidBody, CylinderCollider, CuboidCollider } from '@react-three/rapier';
import { useState, useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

interface TrapProps {
  position: [number, number, number];
  onFail: () => void;
}

export function Trap({ position, onFail }: TrapProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [transitionProgress, setTransitionProgress] = useState(0); // 0 = fully closed, 1 = fully open

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

  // Periodically toggle the trap
  useEffect(() => {
    const interval = setInterval(() => {
      setIsOpen(prev => !prev);
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  // Handle visual transition
  useFrame((_, delta) => {
    const speed = 4.0;
    if (isOpen && transitionProgress < 1) {
      setTransitionProgress(prev => Math.min(1, prev + delta * speed));
    } else if (!isOpen && transitionProgress > 0) {
      setTransitionProgress(prev => Math.max(0, prev - delta * speed));
    }
  });

  const borderColor = new THREE.Color();
  const emissiveColor = new THREE.Color();
  
  // Neon Blue (#00ccff) to Red-Orange (#ff4400)
  const neonBlue = new THREE.Color("#00ccff");
  const redOrange = new THREE.Color("#ff4400");
  
  borderColor.lerpColors(neonBlue, redOrange, transitionProgress);
  emissiveColor.copy(neonBlue).multiplyScalar(0.2 * (1 - transitionProgress));

  return (
    <group position={position}>
      {/* Surrounding Floor Tile with Hole */}
      <mesh rotation-x={-Math.PI / 2} position={[0, -0.05, 0]} receiveShadow>
        <shapeGeometry args={[floorShape]} />
        <meshStandardMaterial color="#ffffff" metalness={0.1} roughness={0.9} />
      </mesh>

      {/* Deep Hole Visual */}
      <mesh position={[0, -0.6, 0]} receiveShadow>
        <cylinderGeometry args={[0.42, 0.42, 1, 32]} />
        <meshStandardMaterial color="#000000" roughness={1} />
      </mesh>

      {/* Trap Door Visual - Flush with floor when closed */}
      <mesh position={[0, -0.05 - (transitionProgress * 0.8), 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.39, 0.39, 0.05, 32]} />
        <meshStandardMaterial 
          color={isOpen ? "#444" : "#ccc"} 
          emissive={emissiveColor}
          metalness={0.4} 
          roughness={0.6} 
          opacity={1 - (transitionProgress * 0.4)}
          transparent
        />
      </mesh>

      {/* Glowing Border */}
      <mesh position={[0, 0.01, 0]} rotation-x={-Math.PI / 2}>
        <ringGeometry args={[0.39, 0.46, 32]} />
        <meshBasicMaterial color={borderColor} toneMapped={false} />
      </mesh>

      {/* Physics: Main floor collider - Solid when closed */}
      {!isOpen && transitionProgress < 0.1 ? (
        <RigidBody type="fixed" friction={0.1} restitution={0.2}>
          <CuboidCollider args={[0.5, 0.5, 0.5]} position={[0, -0.5, 0]} />
        </RigidBody>
      ) : (
        // Peripheral colliders to support corners when trap is open
        <RigidBody type="fixed" friction={0.1} restitution={0.2}>
          <CuboidCollider args={[0.1, 0.5, 0.5]} position={[-0.45, -0.5, 0]} />
          <CuboidCollider args={[0.1, 0.5, 0.5]} position={[0.45, -0.5, 0]} />
          <CuboidCollider args={[0.35, 0.5, 0.1]} position={[0, -0.5, -0.45]} />
          <CuboidCollider args={[0.35, 0.5, 0.1]} position={[0, -0.5, 0.45]} />
        </RigidBody>
      )}

      {/* Physics: Sensor at the bottom of the hole */}
      <RigidBody type="fixed" sensor onIntersectionEnter={({ other }) => {
        if (other.rigidBodyObject?.name === "ball" && (isOpen || transitionProgress > 0.5)) {
          onFail();
        }
      }}>
        <CylinderCollider args={[0.2, 0.4]} position={[0, -0.8, 0]} />
      </RigidBody>
    </group>
  );
}
