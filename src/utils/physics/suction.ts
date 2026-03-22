import type { MutableRefObject } from 'react';
import type { RapierRigidBody } from '@react-three/rapier';
import * as THREE from 'three';

interface IntersectionBody {
  rigidBodyObject?: { name?: string } | null;
  rigidBody?: RapierRigidBody | null;
}

export function isBallIntersection(other: IntersectionBody): boolean {
  return other.rigidBodyObject?.name === 'ball';
}

export function setBallInRangeRef(
  ballInRangeRef: MutableRefObject<RapierRigidBody | null>,
  other: IntersectionBody,
): void {
  ballInRangeRef.current = isBallIntersection(other) ? (other.rigidBody ?? null) : ballInRangeRef.current;
}

export function clearBallInRangeRef(
  ballInRangeRef: MutableRefObject<RapierRigidBody | null>,
  other: IntersectionBody,
): void {
  if (isBallIntersection(other)) {
    ballInRangeRef.current = null;
  }
}

export function applySuctionImpulse(params: {
  body: RapierRigidBody;
  attractor: THREE.Vector3;
  planeY: number;
  tempVec: THREE.Vector3;
  delta: number;
  radius: number;
  horizontalStrength: number;
  verticalStrength: number;
}): void {
  const {
    body,
    attractor,
    planeY,
    tempVec,
    delta,
    radius,
    horizontalStrength,
    verticalStrength,
  } = params;

  const ballPos = body.translation();
  tempVec.set(ballPos.x, planeY, ballPos.z);
  const radiusSq = radius * radius;
  const distSq = attractor.distanceToSquared(tempVec);
  if (distSq >= radiusSq) return;

  const dist = Math.sqrt(distSq);
  const pullStrength = horizontalStrength * (1 - dist / radius);
  tempVec.set(attractor.x - ballPos.x, 0, attractor.z - ballPos.z).normalize();
  body.applyImpulse(
    {
      x: tempVec.x * pullStrength * delta,
      y: verticalStrength * delta,
      z: tempVec.z * pullStrength * delta,
    },
    true,
  );
}
