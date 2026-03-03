import { RigidBody } from '@react-three/rapier';

export function Ball({ position }: { position: [number, number, number] }) {
  return (
    <RigidBody 
      name="ball" 
      colliders="ball" 
      position={position} 
      restitution={0.6} 
      friction={0.05} 
      linearDamping={0.1}
      angularDamping={0.1}
      canSleep={false}
    >
      <mesh castShadow receiveShadow>
        <sphereGeometry args={[0.3, 32, 32]} />
        {/* Lower metalness so it's visible without complex reflections */}
        <meshStandardMaterial color="#eeeeee" metalness={0.9} roughness={0.2} />
      </mesh>
    </RigidBody>
  );
}
