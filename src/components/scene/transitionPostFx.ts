import {
  type Effect,
  type EffectComposer,
  BloomEffect,
  ChromaticAberrationEffect,
  EffectPass,
  NoiseEffect,
  VignetteEffect,
} from 'postprocessing';
import * as THREE from 'three';

export type TransitionFxEffectCache = {
  bloom: BloomEffect | null;
  vignette: VignetteEffect | null;
  chromatic: ChromaticAberrationEffect | null;
  noise: NoiseEffect | null;
};

const IDLE_BLOOM = 1.5;
const PEAK_BLOOM = 2.65;
const IDLE_VIGNETTE_DARKNESS = 1.1;
const PEAK_VIGNETTE_DARKNESS = 1.62;
const PEAK_CHROMATIC_OFFSET = 0.03;
const IDLE_NOISE_OPACITY = 0.02;
const PEAK_NOISE_OPACITY = 0.034;

/** R3F may initialize chromatic `offset` as a plain `{x,y}`; assign a real Vector2 via the setter. */
const _chromaticOffsetScratch = new THREE.Vector2();

function getEffectPassEffects(pass: EffectPass): Effect[] {
  return (pass as unknown as { effects: Effect[] }).effects;
}

export function collectTransitionFxEffects(composer: EffectComposer): TransitionFxEffectCache {
  const cache: TransitionFxEffectCache = {
    bloom: null,
    vignette: null,
    chromatic: null,
    noise: null,
  };
  for (const pass of composer.passes) {
    if (!(pass instanceof EffectPass)) continue;
    for (const effect of getEffectPassEffects(pass)) {
      if (effect instanceof BloomEffect && cache.bloom === null) cache.bloom = effect;
      else if (effect instanceof VignetteEffect && cache.vignette === null) cache.vignette = effect;
      else if (effect instanceof ChromaticAberrationEffect && cache.chromatic === null)
        cache.chromatic = effect;
      else if (effect instanceof NoiseEffect && cache.noise === null) cache.noise = effect;
    }
  }
  return cache;
}

export function applyTransitionFxEffects(cache: TransitionFxEffectCache, intensity: number): void {
  const t = THREE.MathUtils.clamp(intensity, 0, 1);
  if (cache.bloom) {
    cache.bloom.intensity = THREE.MathUtils.lerp(IDLE_BLOOM, PEAK_BLOOM, t);
  }
  if (cache.vignette) {
    cache.vignette.darkness = THREE.MathUtils.lerp(IDLE_VIGNETTE_DARKNESS, PEAK_VIGNETTE_DARKNESS, t);
  }
  if (cache.chromatic) {
    const o = t * PEAK_CHROMATIC_OFFSET;
    _chromaticOffsetScratch.set(o, o);
    cache.chromatic.offset = _chromaticOffsetScratch;
  }
  if (cache.noise) {
    cache.noise.blendMode.setOpacity(THREE.MathUtils.lerp(IDLE_NOISE_OPACITY, PEAK_NOISE_OPACITY, t));
  }
}
