import { CylinderCollider, RigidBody, CuboidCollider, RapierRigidBody } from '@react-three/rapier';
import { Text } from '@react-three/drei';
import { useMemo, useRef, memo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import {
  applySuctionImpulse,
  clearBallInRangeRef,
  isBallIntersection,
  setBallInRangeRef,
} from '../utils/physics/suction';

interface HoleProps {
  position: [number, number, number];
  destinationId: string;
  onEnter: (destinationId: string, entryPosition: [number, number, number]) => void;
  label?: string;
  color?: string;
  interactive?: boolean;
}

const HoleVisuals = memo(function HoleVisuals({
  floorShape,
  label,
  color,
}: {
  floorShape: THREE.Shape;
  label?: string;
  color: string;
}) {
  return (
    <>
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
    </>
  );
});

const HoleInteractive = memo(function HoleInteractive({
  position,
  destinationId,
  onEnter,
  label,
  color,
}: {
  position: [number, number, number];
  destinationId: string;
  onEnter: (destinationId: string, entryPosition: [number, number, number]) => void;
  label?: string;
  color: string;
}) {
  const ballInRangeRef = useRef<RapierRigidBody | null>(null);
  const didTriggerEnterRef = useRef(false);
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
      applySuctionImpulse({
        body: ballInRangeRef.current,
        attractor: holePosVec,
        planeY: position[1],
        tempVec: tempVec.current,
        delta,
        radius: 1.0,
        horizontalStrength: 5.0,
        verticalStrength: -0.5,
      });
    }
  });

  return (
    <group position={position}>
      <HoleVisuals floorShape={floorShape} label={label} color={color} />

      {/* Physics: Sensor and Peripheral Support */}
      <RigidBody type="fixed" colliders={false}>
        {/* Entrance: narrow + below the rim so we only portal after the ball drops into the opening */}
        <CylinderCollider
          args={[0.38, 0.22]}
          position={[0, -0.72, 0]}
          sensor
          onIntersectionEnter={({ other }) => {
            if (didTriggerEnterRef.current) return;
            if (isBallIntersection(other)) {
              const rb = other.rigidBody;
              if (rb) {
                didTriggerEnterRef.current = true;
                const translation = rb.translation();
                onEnter(destinationId, [translation.x, translation.y, translation.z]);
              }
            }
          }}
          onIntersectionExit={({ other }) => {
            if (isBallIntersection(other)) {
              didTriggerEnterRef.current = false;
            }
          }}
        />
        {/* Solid corners to support the ball */}
        <CuboidCollider args={[0.05, 0.5, 0.5]} position={[-0.475, -0.5, 0]} />
        <CuboidCollider args={[0.05, 0.5, 0.5]} position={[0.475, -0.5, 0]} />
        <CuboidCollider args={[0.425, 0.5, 0.05]} position={[0, -0.5, -0.475]} />
        <CuboidCollider args={[0.425, 0.5, 0.05]} position={[0, -0.5, 0.475]} />
        {/* Suction Sensor */}
        <CylinderCollider
          args={[0.5, 1.0]}
          position={[0, 0, 0]}
          sensor
          onIntersectionEnter={({ other }) => {
          setBallInRangeRef(ballInRangeRef, other);
        }}
          onIntersectionExit={({ other }) => {
          clearBallInRangeRef(ballInRangeRef, other);
        }}
        />
      </RigidBody>
    </group>
  );
});

const HoleStatic = memo(function HoleStatic({
  position,
  label,
  color,
}: Pick<HoleProps, 'position' | 'label' | 'color'>) {
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
      <HoleVisuals floorShape={floorShape} label={label} color={color ?? '#00ccff'} />
    </group>
  );
});

export const Hole = memo(function Hole(props: HoleProps) {
  const { interactive = true } = props;
  if (!interactive) {
    return <HoleStatic position={props.position} label={props.label} color={props.color} />;
  }
  return (
    <HoleInteractive
      position={props.position}
      destinationId={props.destinationId}
      onEnter={props.onEnter}
      label={props.label}
      color={props.color ?? '#00ccff'}
    />
  );
});
