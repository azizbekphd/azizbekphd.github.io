import { RigidBody, RapierRigidBody } from '@react-three/rapier';
import { forwardRef } from 'react';

export const Ball = forwardRef<RapierRigidBody, { position: [number, number, number]; restitution?: number }>(
  function Ball({ position, restitution = 0.6 }, ref) {
    return (
      <RigidBody
        ref={ref}
        name="ball"
        colliders="ball"
        position={position}
        restitution={restitution}
        friction={0.05}
        linearDamping={0.1}
        angularDamping={0.1}
        canSleep={false}
      >
        <mesh castShadow receiveShadow userData={{ skipOpacity: true }}>
          <sphereGeometry args={[0.3, 32, 32]} />
          <meshStandardMaterial color="#eeeeee" metalness={0.9} roughness={0.2} />
        </mesh>
      </RigidBody>
    );
  }
);
