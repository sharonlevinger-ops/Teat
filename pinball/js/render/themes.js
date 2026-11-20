// Chapter looks. Changing chapter only changes light, colour and atmosphere – never geometry.
import * as THREE from '../vendor/three.module.min.js';

const C = (hex) => new THREE.Color(hex);

export const THEMES = [
  { // Chapter 1 – Enchanted Mushroom Forest: soft magical twilight, warm sun shafts, fireflies
    background: C(0x07110a),
    skyTop: C(0x081a18), skyBottom: C(0x2c5a3c),
    hemiSky: C(0xcfe8ff), hemiGround: C(0x1c3214), hemiIntensity: 0.75,
    dirColor: C(0xfff0cf), dirIntensity: 2.3,
    fieldTint: C(0xffffff), floorGlow: 0.75,
    glowColor: C(0xc8ff7a), glowStrength: 1.0,
    crystalColor: C(0x7ff0ff), runeColor: C(0x5dff80),
    towerLight: C(0xffc860), towerLightIntensity: 16,
    poolDeep: C(0x063a48), poolShallow: C(0x40d8ff),
    waterfall: C(0xbff7ff),
    stars: 0, sparkColor: C(0xd8ff7a), sparkMode: 0, // fireflies
    bloom: 0.45, exposure: 1.05,
  },
  { // Chapter 2 – Night of Stars and Crystals: deep blue-violet moonlight, neon glow, silver water
    background: C(0x030212),
    skyTop: C(0x03041a), skyBottom: C(0x34186a),
    hemiSky: C(0x6c7cff), hemiGround: C(0x1a0c34), hemiIntensity: 0.65,
    dirColor: C(0x9fb0ff), dirIntensity: 1.1,
    fieldTint: C(0x9a9ae6), floorGlow: 1.3,
    glowColor: C(0xff4df2), glowStrength: 2.2,
    crystalColor: C(0x4dfcff), runeColor: C(0x4dd8ff),
    towerLight: C(0xa070ff), towerLightIntensity: 22,
    poolDeep: C(0x0b1450), poolShallow: C(0xa6b8ff),
    waterfall: C(0xe6ecff),
    stars: 1, sparkColor: C(0x8ff6ff), sparkMode: 0,
    bloom: 0.7, exposure: 1.15,
  },
  { // Chapter 3 – Dragon's Gate: gold, amber and fire-red, magical fire
    background: C(0x140401),
    skyTop: C(0x2a0400), skyBottom: C(0xff6a10),
    hemiSky: C(0xffb36b), hemiGround: C(0x3a0a02), hemiIntensity: 0.7,
    dirColor: C(0xffa04a), dirIntensity: 1.9,
    fieldTint: C(0xffc49a), floorGlow: 0.9,
    glowColor: C(0xffa21a), glowStrength: 1.8,
    crystalColor: C(0xffd36b), runeColor: C(0xffa030),
    towerLight: C(0xff5a1a), towerLightIntensity: 28,
    poolDeep: C(0x5a0e02), poolShallow: C(0xffb03a),
    waterfall: C(0xffc46b),
    stars: 0.25, sparkColor: C(0xff8a2a), sparkMode: 1, // rising embers
    bloom: 0.6, exposure: 1.05,
  },
];

/** Interpolate two themes into `out` (all THREE.Color / numbers). */
export function lerpTheme(a, b, t, out) {
  for (const k of Object.keys(a)) {
    if (a[k] instanceof THREE.Color) {
      if (!out[k]) out[k] = new THREE.Color();
      out[k].copy(a[k]).lerp(b[k], t);
    } else {
      out[k] = a[k] + (b[k] - a[k]) * t;
    }
  }
  return out;
}
