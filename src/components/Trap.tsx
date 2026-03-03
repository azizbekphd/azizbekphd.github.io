import { RigidBody, CylinderCollider, CuboidCollider, useRapier } from '@react-three/rapier';
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
  const { world } = useRapier();
  const trapPosVec = useMemo(() => new THREE.Vector3(...position), [position]);

  const floorShape = useMemo(() => {
    const shape = new THREE.Shape();
    shape.moveTo(-0.5, -0.5);
    shape.lineTo(0.5, -0.5);
    shape.lineTo(0.5, 0.5);
    shape.lineTo(-0.5, 0.5);
    shape.lineTo(-0.5, -0.5);

    const hole = new THREE.Path();
    hole.absarc(0, 0, 0.45, 0, Math.PI * 2, true); // Slightly larger visual hole
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

  // Handle visual transition and suction
  useFrame((_state, delta) => {
    const speed = 4.0;
    if (isOpen && transitionProgress < 1) {
      setTransitionProgress(prev => Math.min(1, prev + delta * speed));
    } else if (!isOpen && transitionProgress > 0) {
      setTransitionProgress(prev => Math.max(0, prev - delta * speed));
    }

    // Suction logic: Pull ball towards center when open
    if (isOpen && transitionProgress > 0.6) {
      world.forEachRigidBody((body) => {
        // In this setup, we identify the ball by checking its mass/type or name
        // The Ball component has name="ball" on the RigidBody
        if (body.isDynamic()) {
          const ballPos = body.translation();
          const dist = trapPosVec.distanceTo(new THREE.Vector3(ballPos.x, position[1], ballPos.z));
          
          if (dist < 1.0) { // Suction radius
            const pullStrength = 8.0 * (1 - dist); // Stronger as you get closer
            const dir = new THREE.Vector3(position[0] - ballPos.x, 0, position[2] - ballPos.z).normalize();
            body.applyImpulse({ 
                x: dir.x * pullStrength * delta, 
                y: -1.0 * delta, // Slight downward pull too
                z: dir.z * pullStrength * delta 
            }, true);
          }
        }
      });
    }
  });

  const borderColor = new THREE.Color();
  const emissiveColor = new THREE.Color();
  
  // Neon Blue (#00ccff) to Red-Orange (#ff4400)
  const neonBlue = new THREE.Color("#00ccff");
  const redOrange = new THREE.Color("#ff4400");
  
  borderColor.lerpColors(neonBlue, redOrange, transitionProgress);
  
  // Pulsing effect when open
  const pulse = isOpen ? Math.sin(Date.now() * 0.01) * 0.2 + 0.8 : 1;
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
        <cylinderGeometry args={[0.48, 0.48, 1, 32]} />
        <meshStandardMaterial color="#000000" roughness={1} />
      </mesh>

      {/* Trap Door Visual */}
      <mesh position={[0, -0.05 - (transitionProgress * 0.85), 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.44, 0.44, 0.05, 32]} />
        <meshStandardMaterial 
          color={isOpen ? "#333" : "#ccc"} 
          emissive={emissiveColor}
          metalness={0.4} 
          roughness={0.6} 
          opacity={1 - (transitionProgress * 0.4)}
          transparent
        />
      </mesh>

      {/* Glowing Border */}
      <mesh position={[0, 0.01, 0]} rotation-x={-Math.PI / 2} scale={isOpen ? pulse : 1}>
        <ringGeometry args={[0.44, 0.52, 32]} />
        <meshBasicMaterial color={borderColor} toneMapped={false} />
      </mesh>

      {/* Physics: Main floor collider - Solid when closed */}
      {!isOpen && transitionProgress < 0.1 ? (
        <RigidBody type="fixed" friction={0.1} restitution={0.2}>
          <CuboidCollider args={[0.5, 0.5, 0.5]} position={[0, -0.5, 0]} />
        </RigidBody>
      ) : (
        // Tighter peripheral colliders to support corners - less safe space
        <RigidBody type="fixed" friction={0.1} restitution={0.2}>
          <CuboidCollider args={[0.05, 0.5, 0.5]} position={[-0.475, -0.5, 0]} />
          <CuboidCollider args={[0.05, 0.5, 0.5]} position={[0.475, -0.5, 0]} />
          <CuboidCollider args={[0.425, 0.5, 0.05]} position={[0, -0.5, -0.475]} />
          <CuboidCollider args={[0.425, 0.5, 0.05]} position={[0, -0.5, 0.475]} />
        </RigidBody>
      )}

      {/* Physics: Larger failure sensor */}
      <RigidBody type="fixed" sensor onIntersectionEnter={({ other }) => {
        if (other.rigidBodyObject?.name === "ball") {
          onFail();
        }
      }}>
        <CylinderCollider args={[0.2, 0.48]} position={[0, -0.7, 0]} />
      </RigidBody>
    </group>
  );
}
