// Step 5 – the three story chapters. Only light, colour, atmosphere (and music, in main.js) change;
// nothing physical moves. Chapter changes cross-fade over 3 seconds.
import * as THREE from '../vendor/three.module.min.js';
import { GRADES, setGrade } from './grade.js';

const FADE = 3;
const C = (h) => new THREE.Color(h);
// per-chapter atmosphere for the effects layer
const LOOKS = [
  { glow: 1.0, fly: C(0xd8ff7a), flyMode: 0, pool: C(0x7ff0ff), fall: C(0xd8f6ff), stars: 0, moon: 0, fire: 0 },
  { glow: 1.6, fly: C(0x8ff6ff), flyMode: 0, pool: C(0xb8c8ff), fall: C(0xeef2ff), stars: 1, moon: 1, fire: 0 },
  { glow: 1.25, fly: C(0xff8a2a), flyMode: 1, pool: C(0xffa040), fall: C(0xffc87a), stars: 0.2, moon: 0, fire: 1 },
];

function glowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const rg = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  rg.addColorStop(0, 'rgba(255,255,255,1)'); rg.addColorStop(0.3, 'rgba(255,255,255,0.45)'); rg.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = rg; g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class ChapterLook {
  constructor(stage, effects) {
    this.effects = effects;
    this.from = 0; this.to = 0; this.t = 1;
    this.look = { ...LOOKS[0], fly: LOOKS[0].fly.clone(), pool: LOOKS[0].pool.clone(), fall: LOOKS[0].fall.clone() };
    this.group = new THREE.Group();
    stage.artGroup.add(this.group);
    const glow = glowTexture();
    const add = (color, w, h, x, y, order) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: glow, color, transparent: true, opacity: 0, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
      m.position.set(x, -y, 0); m.renderOrder = order;
      this.group.add(m);
      return m;
    };
    // night sky: twinkling stars where the sky shows (above the painting and down its top corners) and a moon
    const N = 170, pos = new Float32Array(N * 3), tw = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const top = Math.random() < 0.55;
      pos[i * 3] = top ? Math.random() * 1284 : (Math.random() < 0.5 ? Math.random() * 120 : 1160 + Math.random() * 124);
      pos[i * 3 + 1] = -(top ? -150 + Math.random() * 190 : Math.random() * 430);
      tw[i] = Math.random();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('tw', new THREE.BufferAttribute(tw, 1));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
    this.starMat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uOpacity: { value: 0 }, uScale: { value: 1 } },
      vertexShader: 'attribute float tw; uniform float uTime, uScale; varying float vA; void main(){ vA = 0.5 + 0.5 * sin(uTime * (1.0 + tw * 3.0) + tw * 40.0); gl_PointSize = (5.0 + tw * 7.0) * uScale; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'uniform float uOpacity; varying float vA; void main(){ float a = smoothstep(0.5, 0.0, length(gl_PointCoord - 0.5)) * vA * uOpacity; if (a < 0.01) discard; gl_FragColor = vec4(vec3(0.85, 0.9, 1.0) * a, a); }',
      transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    const stars = new THREE.Points(geo, this.starMat);
    stars.frustumCulled = false; stars.renderOrder = 9e4;
    this.group.add(stars);
    this.moonHalo = add(0xcfdcff, 260, 260, 64, 92, 9e4);
    this.moon = add(0xffffff, 64, 64, 64, 92, 9e4 + 1);
    // magical fire: around the tower base and over the pool
    this.fireTower = add(0xff6a1a, 560, 420, 632, 930, 9e4 + 2);
    this.firePool = add(0xff8a20, 520, 230, 630, 1425, 9e4 + 2);
    this.time = 0;
  }

  setScale(s) { this.starMat.uniforms.uScale.value = s; }

  bind(bus) {
    bus.on('stage', ({ index, initial }) => {
      if (initial) { this.from = this.to = index; this.t = 1; return; }
      this.from = this._blendIndex(); // start from wherever we are
      this.fromLook = this._snapshot();
      this.to = index; this.t = 0;
    });
  }

  _blendIndex() { return this.to; }

  _snapshot() {
    const g = this.currentGrade || GRADES[this.to];
    return { grade: JSON.parse(JSON.stringify(g)), look: { ...this.look, fly: this.look.fly.clone(), pool: this.look.pool.clone(), fall: this.look.fall.clone() } };
  }

  update(dt) {
    this.time += dt;
    if (this.t < 1) this.t = Math.min(1, this.t + dt / FADE);
    const k = this.t * this.t * (3 - 2 * this.t);
    const fromGrade = this.fromLook ? this.fromLook.grade : GRADES[this.from];
    const toGrade = GRADES[this.to];
    setGrade(fromGrade, toGrade, k);
    const L = (a, b) => a + (b - a) * k;
    this.currentGrade = {
      sat: L(fromGrade.sat, toGrade.sat), contrast: L(fromGrade.contrast, toGrade.contrast), bright: L(fromGrade.bright, toGrade.bright),
      shadow: fromGrade.shadow.map((v, i) => L(v, toGrade.shadow[i])), high: fromGrade.high.map((v, i) => L(v, toGrade.high[i])),
    };
    const A = this.fromLook ? this.fromLook.look : LOOKS[this.from], B = LOOKS[this.to];
    const look = this.look;
    for (const key of ['glow', 'flyMode', 'stars', 'moon', 'fire']) look[key] = L(A[key], B[key]);
    look.fly.copy(A.fly).lerp(B.fly, k); look.pool.copy(A.pool).lerp(B.pool, k); look.fall.copy(A.fall).lerp(B.fall, k);
    // apply
    const t = this.time;
    this.starMat.uniforms.uTime.value = t;
    this.starMat.uniforms.uOpacity.value = look.stars;
    this.moon.material.opacity = look.moon;
    this.moonHalo.material.opacity = look.moon * 0.55;
    const flicker = 0.75 + 0.15 * Math.sin(t * 7.1) + 0.1 * Math.sin(t * 12.7);
    this.fireTower.material.opacity = look.fire * 0.5 * flicker;
    this.firePool.material.opacity = look.fire * 0.55 * (0.8 + 0.2 * Math.sin(t * 5.3));
    this.effects.setLook(look);
  }
}
