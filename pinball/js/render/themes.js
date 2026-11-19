// Chapter looks. Changing chapter only changes light, colour and atmosphere – never geometry.
import * as THREE from '../vendor/three.module.min.js';

const C = (hex) => new THREE.Color(hex);

export const THEMES = [
  { // Chapter 1 – Enchanted Mushroom Forest: soft magical daylight
    background: C(0x0d2414),
    skyTop: C(0x6fb6e8), skyBottom: C(0xffe2a6),
    hemiSky: C(0xfff3d6), hemiGround: C(0x2f5a2a), hemiIntensity: 1.35,
    dirColor: C(0xfff0c8), dirIntensity: 1.9,
    fieldTint: C(0xffffff),
    glowColor: C(0xc8ff7a), glowStrength: 0.65, // mushrooms / crystals emissive
    crystalColor: C(0x7ff0ff),
    towerLight: C(0xffd27a), towerLightIntensity: 14,
    poolDeep: C(0x0b5a52), poolShallow: C(0x58e0c4),
    waterfall: C(0xbff7ff),
    stars: 0, sparkColor: C(0xd8ff7a), sparkMode: 0, // fireflies
    exposure: 1.05,
  },
  { // Chapter 2 – Night of Stars and Crystals: deep blue-violet, neon glow, moonlit silver water
    background: C(0x050414),
    skyTop: C(0x05061c), skyBottom: C(0x3a1c6e),
    hemiSky: C(0x7c8cff), hemiGround: C(0x24143e), hemiIntensity: 0.95,
    dirColor: C(0xa9b8ff), dirIntensity: 0.9,
    fieldTint: C(0xa4a4ec),
    glowColor: C(0xff4df2), glowStrength: 2.2,
    crystalColor: C(0x4dfcff),
    towerLight: C(0xa070ff), towerLightIntensity: 20,
    poolDeep: C(0x0b1450), poolShallow: C(0x9fb4ff),
    waterfall: C(0xe6ecff),
    stars: 1, sparkColor: C(0x8ff6ff), sparkMode: 0,
    exposure: 1.15,
  },
  { // Chapter 3 – Dragon's Gate: gold, amber and fire-red, magical fire
    background: C(0x1a0602),
    skyTop: C(0x2a0400), skyBottom: C(0xff7a1a),
    hemiSky: C(0xffb36b), hemiGround: C(0x3a0a02), hemiIntensity: 1.0,
    dirColor: C(0xffa04a), dirIntensity: 1.6,
    fieldTint: C(0xffb98a),
    glowColor: C(0xffa21a), glowStrength: 1.8,
    crystalColor: C(0xffd36b),
    towerLight: C(0xff5a1a), towerLightIntensity: 26,
    poolDeep: C(0x5a0e02), poolShallow: C(0xffb03a),
    waterfall: C(0xffc46b),
    stars: 0.25, sparkColor: C(0xff8a2a), sparkMode: 1, // rising embers
    exposure: 1.1,
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
