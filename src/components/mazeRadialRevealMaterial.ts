import * as THREE from 'three';

export type MazeRevealShaderUniforms = {
  uRevealCenter: { value: THREE.Vector2 };
  uRevealRadius: { value: number };
  uRevealSoftness: { value: number };
};

const REVEAL_UNIFORMS_UD = 'mazeRevealShaderUniforms';
const REVEAL_PATCH_UD = 'mazeRevealShaderPatched';

/**
 * Soft radial mask in maze-local XZ (instance origin), for InstancedMesh only.
 * Uniform `.value` updates each frame — no React/layout churn.
 *
 * Safe to call repeatedly: only the first call installs `onBeforeCompile` and
 * triggers `needsUpdate` (shader compile). Later calls only refresh uniform
 * values so layout/map changes do not re-run `getProgramInfoLog` / relink.
 */
export function applyRadialRevealToInstancedStandardMaterial(
  material: THREE.MeshStandardMaterial,
  center: [number, number],
  radius: number,
  softness: number,
): MazeRevealShaderUniforms {
  const ud = material.userData as Record<string, unknown>;
  const existing = ud[REVEAL_UNIFORMS_UD] as MazeRevealShaderUniforms | undefined;
  if (ud[REVEAL_PATCH_UD] === true && existing) {
    existing.uRevealCenter.value.set(center[0], center[1]);
    existing.uRevealRadius.value = radius;
    existing.uRevealSoftness.value = softness;
    return existing;
  }

  const revealUniforms: MazeRevealShaderUniforms = {
    uRevealCenter: { value: new THREE.Vector2(center[0], center[1]) },
    uRevealRadius: { value: radius },
    uRevealSoftness: { value: softness },
  };
  ud[REVEAL_UNIFORMS_UD] = revealUniforms;
  ud[REVEAL_PATCH_UD] = true;

  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, revealUniforms);

    shader.vertexShader = `
      varying vec2 vRevealCellXZ;
      ${shader.vertexShader}
    `.replace(
      '#include <project_vertex>',
      `#include <project_vertex>
#ifdef USE_INSTANCING
	vRevealCellXZ = ( instanceMatrix * vec4( 0.0, 0.0, 0.0, 1.0 ) ).xz;
#else
	vRevealCellXZ = vec2( 0.0 );
#endif
`,
    );

    shader.fragmentShader = `
      uniform vec2 uRevealCenter;
      uniform float uRevealRadius;
      uniform float uRevealSoftness;
      varying vec2 vRevealCellXZ;
      ${shader.fragmentShader}
    `.replace(
      '#include <dithering_fragment>',
      `{
        float revealDist = distance( vRevealCellXZ, uRevealCenter );
        float revealInner = max( 0.0, uRevealRadius - uRevealSoftness );
        float revealMask = 1.0 - smoothstep( revealInner, uRevealRadius + 0.001, revealDist );
        gl_FragColor.a *= revealMask;
      }
      #include <dithering_fragment>`,
    );
  };

  material.needsUpdate = true;
  return revealUniforms;
}

export function getRevealShaderUniforms(material: THREE.MeshStandardMaterial): MazeRevealShaderUniforms | undefined {
  return (material.userData as Record<string, MazeRevealShaderUniforms | undefined>)[REVEAL_UNIFORMS_UD];
}

export function syncRadialRevealUniforms(
  material: THREE.MeshStandardMaterial,
  center: [number, number],
  radius: number,
): void {
  const u = getRevealShaderUniforms(material);
  if (!u) return;
  u.uRevealCenter.value.set(center[0], center[1]);
  u.uRevealRadius.value = radius;
}
