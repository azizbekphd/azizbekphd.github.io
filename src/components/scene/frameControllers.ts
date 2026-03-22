import type { RapierRigidBody } from '@react-three/rapier';
import * as THREE from 'three';

const CAMERA_HEIGHT = 20;
/** Extra camera height while falling (speed / pullback read). */
const TRANSITION_CAMERA_HEIGHT_BOOST = 2.5;
/** FOV widens by this amount at full transition intensity (PerspectiveCamera only). */
const TRANSITION_FOV_BOOST = 6;
/** Matches Canvas default in GameScene. */
export const DEFAULT_SCENE_CAMERA_FOV = 40;
const FOV_APPLY_EPSILON = 0.02;
const OPACITY_EPSILON = 0.01;

const _cameraUserDataKey = '__mazeTransitionLastFov';

/** Reused for camera follow so it matches the interpolated RigidBody mesh transform. */
const _ballWorldPos = new THREE.Vector3();

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

/**
 * Normalized 0–1 progress through a vertical drop for transition visuals.
 * Uses ease-in so intensity ramps up as the ball falls deeper.
 */
export function getTransitionVisualIntensity(
  currentY: number,
  targetY: number,
  startY: number | null,
): number {
  if (startY === null) return 0;
  const range = startY - targetY;
  if (range <= 1e-6) return 0;
  const linear = (startY - currentY) / range;
  const clamped = THREE.MathUtils.clamp(linear, 0, 1);
  return clamped * clamped;
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
  /** Require this many consecutive frames in the landing zone before swapping mazes (handoff only). */
  handoffLandingHoldFrames?: number;
  handoffLandingFrameCounterRef?: { current: number };
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
    handoffLandingHoldFrames = 1,
    handoffLandingFrameCounterRef,
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
    const dampH = 0.22;
    ball.setLinvel(
      {
        x: THREE.MathUtils.lerp(velocity.x, 0, dampH),
        y: Math.min(velocity.y, 0),
        z: THREE.MathUtils.lerp(velocity.z, 0, dampH),
      },
      true,
    );

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

    const nearLanding = current.y <= transitionTarget[1] + 0.85;
    const holdCounter = handoffLandingFrameCounterRef;
    if (!nextTransitionHandled && nearLanding) {
      if (holdCounter && handoffLandingHoldFrames > 1) {
        holdCounter.current += 1;
        if (holdCounter.current >= handoffLandingHoldFrames) {
          nextTransitionHandled = true;
          holdCounter.current = 0;
          onCompleteTransition();
        }
      } else {
        nextTransitionHandled = true;
        if (holdCounter) holdCounter.current = 0;
        onCompleteTransition();
      }
    } else if (holdCounter && !nearLanding) {
      holdCounter.current = 0;
    }
  }

  return {
    handoffStarted: nextHandoffStarted,
    transitionHandled: nextTransitionHandled,
  };
}

export function syncCameraAndLight(params: {
  ball: RapierRigidBody | null;
  /** Same Object3D Rapier drives each frame (interpolated); avoids jitter vs `ball.translation()`. */
  ballObject: THREE.Object3D | null;
  camera: THREE.Camera;
  lookTarget: THREE.Vector3;
  light: THREE.DirectionalLight | null;
  /** 0 = idle look; 1 = full fall speed visual (FOV / height). */
  fallIntensity?: number;
  baseFov?: number;
}): void {
  const { ball, ballObject, camera, lookTarget, light, fallIntensity = 0, baseFov = DEFAULT_SCENE_CAMERA_FOV } =
    params;
  if (!ball && !ballObject) return;

  if (ballObject) {
    ballObject.getWorldPosition(_ballWorldPos);
  } else if (ball) {
    const t = ball.translation();
    _ballWorldPos.set(t.x, t.y, t.z);
  } else {
    return;
  }

  const height = CAMERA_HEIGHT + fallIntensity * TRANSITION_CAMERA_HEIGHT_BOOST;
  camera.position.x = _ballWorldPos.x;
  camera.position.y = _ballWorldPos.y + height;
  camera.position.z = _ballWorldPos.z;

  lookTarget.copy(_ballWorldPos);
  camera.lookAt(lookTarget);

  if (camera instanceof THREE.PerspectiveCamera) {
    const targetFov = baseFov + fallIntensity * TRANSITION_FOV_BOOST;
    const ud = camera.userData as Record<string, number | undefined>;
    const last = ud[_cameraUserDataKey];
    if (last === undefined || Math.abs(targetFov - last) > FOV_APPLY_EPSILON) {
      camera.fov = targetFov;
      camera.updateProjectionMatrix();
      ud[_cameraUserDataKey] = targetFov;
    }
  }

  if (light) {
    light.position.set(_ballWorldPos.x + 15, _ballWorldPos.y + 25, _ballWorldPos.z + 15);
    light.target.position.copy(_ballWorldPos);
    light.target.updateMatrixWorld();
  }
}
