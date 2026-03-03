import { CylinderCollider, RigidBody } from '@react-three/rapier';
import { Text } from '@react-three/drei';

interface HoleProps {
  position: [number, number, number];
  to: string;
  onEnter: (path: string) => void;
  label?: string;
  color?: string;
}

export function Hole({ position, to, onEnter, label, color = "#00ccff" }: HoleProps) {
  return (
    <group position={position}>
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
      
      {/* Physics Sensor */}
      <RigidBody type="fixed" sensor onIntersectionEnter={({ other }) => {
        if (other.rigidBodyObject?.name === "ball") {
          onEnter(to);
        }
      }}>
        <CylinderCollider args={[0.5, 0.2]} position={[0, -0.5, 0]} /> 
      </RigidBody>
    </group>
  );
}
