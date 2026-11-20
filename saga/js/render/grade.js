// Chapter colour grading. One shared set of uniforms is injected into every material that shows the
// painting (the table, the screen extensions, and every sprite cut from it), so they always match exactly.
import * as THREE from '../vendor/three.module.min.js';

export const gradeUniforms = {
  uSat: { value: 1 },
  uContrast: { value: 1 },
  uBright: { value: 1 },
  uShadow: { value: new THREE.Vector3(1, 1, 1) },
  uHigh: { value: new THREE.Vector3(1, 1, 1) },
};

/** Patch a MeshBasicMaterial so its colour goes through the chapter grade. */
export function applyGrade(material) {
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, gradeUniforms);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform float uSat, uContrast, uBright; uniform vec3 uShadow, uHigh;`)
      .replace('#include <map_fragment>', `#include <map_fragment>
        {
          vec3 gc = diffuseColor.rgb;
          float gl = dot(gc, vec3(0.2126, 0.7152, 0.0722));
          gc = mix(vec3(gl), gc, uSat);
          gc = (gc - 0.18) * uContrast + 0.18;
          gc *= uBright * mix(uShadow, uHigh, smoothstep(0.0, 0.6, gl));
          diffuseColor.rgb = max(gc, 0.0);
        }`);
  };
  material.customProgramCacheKey = () => 'chapter-grade';
  material.needsUpdate = true;
  return material;
}

export const GRADES = [
  { sat: 1.08, contrast: 1.03, bright: 1.0, shadow: [1, 1, 1], high: [1.03, 1.0, 0.95] }, // 1: the painting as painted, warm
  { sat: 0.85, contrast: 1.14, bright: 0.58, shadow: [0.62, 0.5, 1.45], high: [0.92, 0.84, 1.5] }, // 2: deep blue-violet night
  { sat: 1.2, contrast: 1.12, bright: 0.84, shadow: [1.35, 0.55, 0.25], high: [1.4, 0.95, 0.5] }, // 3: amber and fire-red
];

/** set the shared uniforms to a blend between two grades */
export function setGrade(a, b, t) {
  const L = (x, y) => x + (y - x) * t;
  gradeUniforms.uSat.value = L(a.sat, b.sat);
  gradeUniforms.uContrast.value = L(a.contrast, b.contrast);
  gradeUniforms.uBright.value = L(a.bright, b.bright);
  gradeUniforms.uShadow.value.set(L(a.shadow[0], b.shadow[0]), L(a.shadow[1], b.shadow[1]), L(a.shadow[2], b.shadow[2]));
  gradeUniforms.uHigh.value.set(L(a.high[0], b.high[0]), L(a.high[1], b.high[1]), L(a.high[2], b.high[2]));
}
