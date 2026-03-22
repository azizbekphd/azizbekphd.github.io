import type { RapierRigidBody } from '@react-three/rapier';
import * as THREE from 'three';

const CAMERA_HEIGHT = 20;
const OPACITY_EPSILON = 0.01;

export function updateActiveBoardTilt(params: {
  activeBoard: THREE.Group | null;
  controlsEnabled: boolean;
  isFailed: boolean;
  isReady: boolean;
  isMobile: boolean;
  pointer: { x: number; y: number };
  mobileRotation: { x: number; z: number };
  targetGravity: THREE.Vector3;
}): void {
  const {
    activeBoard,
    controlsEnabled,
    isFailed,
    isReady,
    isMobile,
    pointer,
    mobileRotation,
    targetGravity,
  } = params;

  if (!activeBoard) return;

  if (controlsEnabled && !isFailed && isReady) {
    if (!isMobile) {
      const maxTilt = 15 * (Math.PI / 210);
      activeBoard.rotation.x = THREE.MathUtils.lerp(activeBoard.rotation.x, -pointer.y * maxTilt, 0.05);
      activeBoard.rotation.z = THREE.MathUtils.lerp(activeBoard.rotation.z, -pointer.x * maxTilt, 0.05);
      targetGravity.set(pointer.x * 15, -30, -pointer.y * 15);
    } else {
      activeBoard.rotation.x = THREE.MathUtils.lerp(activeBoard.rotation.x, mobileRotation.x, 0.1);
      activeBoard.rotation.z = THREE.MathUtils.lerp(activeBoard.rotation.z, mobileRotation.z, 0.1);
    }
  } else {
    activeBoard.rotation.x = THREE.MathUtils.lerp(activeBoard.rotation.x, 0, 0.08);
    activeBoard.rotation.z = THREE.MathUtils.lerp(activeBoard.rotation.z, 0, 0.08);
  }
}

export function updateNextBoardRotation(nextBoard: THREE.Group | null): void {
  if (!nextBoard) return;
  nextBoard.rotation.x = THREE.MathUtils.lerp(nextBoard.rotation.x, 0, 0.1);
  nextBoard.rotation.z = THREE.MathUtils.lerp(nextBoard.rotation.z, 0, 0.1);
}

export function updateTransitionState(params: {
  ball: RapierRigidBody | null;
  transitionPhase: 'idle' | 'falling' | 'handoff';
  transitionTarget: [number, number, number] | null;
  activeOpacity: number;
  nextOpacity: number;
  onActiveOpacityChange: (opacity: number) => void;
  onNextOpacityChange: (opacity: number) => void;
  handoffStarted: boolean;
  transitionHandled: boolean;
  onEnterHandoff: () => void;
  onCompleteTransition: () => void;
}): { handoffStarted: boolean; transitionHandled: boolean } {
  const {
    ball,
    transitionPhase,
    transitionTarget,
    activeOpacity,
    nextOpacity,
    onActiveOpacityChange,
    onNextOpacityChange,
    handoffStarted,
    transitionHandled,
    onEnterHandoff,
    onCompleteTransition,
  } = params;

  if (!ball || transitionPhase === 'idle' || !transitionTarget) {
    return { handoffStarted, transitionHandled };
  }

  const current = ball.translation();
  const velocity = ball.linvel();

  const aOpacity = THREE.MathUtils.clamp(1 + current.y / 10, 0, 1);
  if (Math.abs(activeOpacity - aOpacity) > OPACITY_EPSILON) {
    onActiveOpacityChange(aOpacity);
  }

  const distToTarget = Math.abs(current.y - transitionTarget[1]);
  const nOpacity = THREE.MathUtils.clamp(1 - distToTarget / 15, 0, 1);
  if (Math.abs(nextOpacity - nOpacity) > OPACITY_EPSILON) {
    onNextOpacityChange(nOpacity);
  }

  let nextHandoffStarted = handoffStarted;
  let nextTransitionHandled = transitionHandled;

  if (transitionPhase === 'falling') {
    const steer = 0.12;
    const nextX = THREE.MathUtils.lerp(current.x, transitionTarget[0], steer);
    const nextZ = THREE.MathUtils.lerp(current.z, transitionTarget[2], steer);
    ball.setTranslation({ x: nextX, y: current.y, z: nextZ }, true);
    ball.setLinvel({ x: 0, y: Math.min(velocity.y, -15), z: 0 }, true);

    if (!nextHandoffStarted && current.y <= transitionTarget[1] + 2.5) {
      nextHandoffStarted = true;
      onEnterHandoff();
    }
  }

  if (transitionPhase === 'handoff') {
    const handoffSteer = 0.25;
    const steerX = THREE.MathUtils.lerp(current.x, transitionTarget[0], handoffSteer);
    const steerZ = THREE.MathUtils.lerp(current.z, transitionTarget[2], handoffSteer);
    ball.setTranslation({ x: steerX, y: current.y, z: steerZ }, true);

    const nearLanding = current.y <= transitionTarget[1] + 0.6;
    if (!nextTransitionHandled && nearLanding) {
      nextTransitionHandled = true;
      onCompleteTransition();
    }
  }

  return {
    handoffStarted: nextHandoffStarted,
    transitionHandled: nextTransitionHandled,
  };
}

export function syncCameraAndLight(params: {
  ball: RapierRigidBody | null;
  camera: THREE.Camera;
  lookTarget: THREE.Vector3;
  light: THREE.DirectionalLight | null;
}): void {
  const { ball, camera, lookTarget, light } = params;
  if (!ball) return;

  const cameraTarget = ball.translation();
  camera.position.x = cameraTarget.x;
  camera.position.y = cameraTarget.y + CAMERA_HEIGHT;
  camera.position.z = cameraTarget.z;

  lookTarget.set(cameraTarget.x, cameraTarget.y, cameraTarget.z);
  camera.lookAt(lookTarget);

  if (light) {
    light.position.set(cameraTarget.x + 15, cameraTarget.y + 25, cameraTarget.z + 15);
    light.target.position.set(cameraTarget.x, cameraTarget.y, cameraTarget.z);
    light.target.updateMatrixWorld();
  }
}
