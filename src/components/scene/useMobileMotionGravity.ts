import { useEffect } from 'react';
import type { MutableRefObject } from 'react';
import * as THREE from 'three';

export function useMobileMotionGravity(params: {
  isMobile: boolean;
  isReady: boolean;
  targetGravity: MutableRefObject<THREE.Vector3>;
  mobileRotation: MutableRefObject<{ x: number; z: number }>;
}): void {
  const { isMobile, isReady, targetGravity, mobileRotation } = params;

  useEffect(() => {
    if (!isMobile || !isReady) return;

    const handleMotion = (event: DeviceMotionEvent) => {
      const acc = event.accelerationIncludingGravity;
      if (!acc) return;

      const s = 5.0;
      const ax = acc.x ?? 0;
      const ay = acc.y ?? 0;
      const az = acc.z ?? 9.8;
      const safeAz = Math.max(1.0, az);

      targetGravity.current.set(-ax * s, -safeAz * s, ay * s);

      const mobileMaxTilt = 18 * (Math.PI / 180);
      mobileRotation.current.x = (ay / 10) * mobileMaxTilt;
      mobileRotation.current.z = (ax / 10) * mobileMaxTilt;
    };

    window.addEventListener('devicemotion', handleMotion, true);
    return () => window.removeEventListener('devicemotion', handleMotion);
  }, [isMobile, isReady, targetGravity, mobileRotation]);
}
