import { CylinderCollider, RigidBody, CuboidCollider } from '@react-three/rapier';
import { Text } from '@react-three/drei';
import { useMemo } from 'react';
import * as THREE from 'three';

interface HoleProps {
  position: [number, number, number];
  to: string;
  onEnter: (path: string) => void;
  label?: string;
  color?: string;
}

export function Hole({ position, to, onEnter, label, color = "#00ccff" }: HoleProps) {
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

  return (
    <group position={position}>
      {/* Surrounding Floor Tile with Hole */}
      <mesh rotation-x={-Math.PI / 2} position={[0, -0.05, 0]} receiveShadow>
        <shapeGeometry args={[floorShape]} />
        <meshStandardMaterial color="#ffffff" metalness={0.1} roughness={0.9} />
      </mesh>

      {/* Deep Hole Visual */}
      <mesh position={[0, -0.5, 0]} receiveShadow>
        <cylinderGeometry args={[0.4, 0.4, 1, 32]} />
        <meshStandardMaterial color="#000000" roughness={1} />
      </mesh>

      {/* Glowing Ring Rim */}
      <mesh position={[0, 0.01, 0]} rotation-x={-Math.PI / 2}>
        <ringGeometry args={[0.38, 0.45, 32]} />
        <meshBasicMaterial color={color} toneMapped={false} />
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
          <meshBasicMaterial attach="material" color={color} toneMapped={false} />
        </Text>
      )}
      
      {/* Physics: Sensor and Peripheral Support */}
      <RigidBody type="fixed">
        {/* Entrance Sensor */}
        <CylinderCollider 
          args={[0.5, 0.2]} 
          position={[0, -0.5, 0]} 
          sensor 
          onIntersectionEnter={({ other }) => {
            if (other.rigidBodyObject?.name === "ball") {
              onEnter(to);
            }
          }}
        />
        {/* Solid corners to support the ball */}
        <CuboidCollider args={[0.05, 0.5, 0.5]} position={[-0.475, -0.5, 0]} />
        <CuboidCollider args={[0.05, 0.5, 0.5]} position={[0.475, -0.5, 0]} />
        <CuboidCollider args={[0.425, 0.5, 0.05]} position={[0, -0.5, -0.475]} />
        <CuboidCollider args={[0.425, 0.5, 0.05]} position={[0, -0.5, 0.475]} />
      </RigidBody>
    </group>
  );
}
