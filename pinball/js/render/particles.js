// Pooled particle effects. Every system is a single draw call with pre-allocated buffers:
// nothing is created or destroyed while playing (no GC spikes).
import * as THREE from '../vendor/three.module.min.js';

const pointVS = `
  attribute float size;
  attribute vec3 color;
  varying vec3 vColor;
  uniform float uScale;
  void main() {
    vColor = color;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = size * uScale / -mv.z;
    gl_Position = projectionMatrix * mv;
  }`;
const pointFS = `
  varying vec3 vColor;
  void main() {
    vec2 d = gl_PointCoord - 0.5;
    float a = smoothstep(0.5, 0.0, length(d));
    if (a < 0.01) discard;
    gl_FragColor = vec4(vColor * a, a);
  }`;

export class ParticleSystem {
  constructor(max = 700) {
    this.max = max;
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.size = new Float32Array(max);
    this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    this.base = new Float32Array(max * 3);
    this.grav = new Float32Array(max);
    this.drag = new Float32Array(max);
    this.startSize = new Float32Array(max);
    this.cursor = 0;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('size', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e4);
    this.material = new THREE.ShaderMaterial({
      uniforms: { uScale: { value: 300 } },
      vertexShader: pointVS, fragmentShader: pointFS,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(geo, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 10;
    this.alive = 0;
  }

  spawn(x, y, z, vx, vy, vz, color, size, life, gravity = 0, drag = 1) {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.max;
    const i3 = i * 3;
    this.pos[i3] = x; this.pos[i3 + 1] = y; this.pos[i3 + 2] = z;
    this.vel[i3] = vx; this.vel[i3 + 1] = vy; this.vel[i3 + 2] = vz;
    this.base[i3] = color.r; this.base[i3 + 1] = color.g; this.base[i3 + 2] = color.b;
    this.life[i] = life; this.maxLife[i] = life;
    this.startSize[i] = size; this.grav[i] = gravity; this.drag[i] = drag;
  }

  /** Radial burst of sparks. */
  burst(x, y, z, color, count = 24, speed = 6, size = 0.5, life = 0.7, gravity = -6, up = 0.6) {
    for (let k = 0; k < count; k++) {
      const a = Math.random() * Math.PI * 2;
      const u = Math.random();
      const s = speed * (0.4 + Math.random() * 0.8);
      this.spawn(x, y, z, Math.cos(a) * s * (1 - u * 0.5), (up + Math.random()) * s * 0.6, Math.sin(a) * s * (1 - u * 0.5),
        color, size * (0.6 + Math.random() * 0.8), life * (0.6 + Math.random() * 0.7), gravity, 0.985);
    }
  }

  /** Spherical firework shell. */
  firework(x, y, z, color, count = 90, speed = 7) {
    for (let k = 0; k < count; k++) {
      const u = Math.random() * 2 - 1, a = Math.random() * Math.PI * 2, r = Math.sqrt(1 - u * u);
      const s = speed * (0.85 + Math.random() * 0.3);
      this.spawn(x, y, z, r * Math.cos(a) * s, u * s, r * Math.sin(a) * s, color, 0.55 + Math.random() * 0.35, 1.3 + Math.random() * 0.6, -3.5, 0.975);
    }
  }

  update(dt) {
    let alive = 0;
    for (let i = 0; i < this.max; i++) {
      const i3 = i * 3;
      if (this.life[i] <= 0) { this.size[i] = 0; continue; }
      alive++;
      this.life[i] -= dt;
      const k = Math.max(0, this.life[i] / this.maxLife[i]);
      const d = Math.pow(this.drag[i], dt * 60);
      this.vel[i3] *= d; this.vel[i3 + 1] = this.vel[i3 + 1] * d + this.grav[i] * dt; this.vel[i3 + 2] *= d;
      this.pos[i3] += this.vel[i3] * dt; this.pos[i3 + 1] += this.vel[i3 + 1] * dt; this.pos[i3 + 2] += this.vel[i3 + 2] * dt;
      const fade = k * k * (3 - 2 * k);
      this.col[i3] = this.base[i3] * fade; this.col[i3 + 1] = this.base[i3 + 1] * fade; this.col[i3 + 2] = this.base[i3 + 2] * fade;
      this.size[i] = this.startSize[i] * (0.4 + 0.6 * k);
    }
    this.alive = alive;
    const g = this.points.geometry;
    g.attributes.position.needsUpdate = true;
    g.attributes.color.needsUpdate = true;
    g.attributes.size.needsUpdate = true;
  }
}

/** Fireflies (day/night) or rising embers (fire), animated entirely on the GPU. */
export function createFireflies(count, bounds) {
  const seed = new Float32Array(count * 4);
  const pos = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    seed[i * 4] = Math.random(); seed[i * 4 + 1] = Math.random(); seed[i * 4 + 2] = Math.random(); seed[i * 4 + 3] = Math.random();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('seed', new THREE.BufferAttribute(seed, 4));
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e4);
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 }, uColor: { value: new THREE.Color(1, 1, 0.5) }, uMode: { value: 0 }, uScale: { value: 300 },
      uMin: { value: new THREE.Vector3(bounds.minX, 0.3, bounds.minZ) }, uSize: { value: new THREE.Vector3(bounds.maxX - bounds.minX, 5, bounds.maxZ - bounds.minZ) },
    },
    vertexShader: `
      attribute vec4 seed;
      uniform float uTime, uMode, uScale;
      uniform vec3 uMin, uSize;
      varying float vA;
      void main() {
        float t = uTime * (0.15 + seed.w * 0.2);
        vec3 p = uMin + vec3(seed.x, seed.y, seed.z) * uSize;
        p.x += sin(t * 2.1 + seed.y * 40.0) * 1.2;
        p.z += cos(t * 1.7 + seed.x * 40.0) * 1.2;
        p.y += sin(t * 3.0 + seed.z * 20.0) * 0.6;
        // embers: rise and wrap
        float rise = fract(seed.y + uTime * (0.08 + seed.w * 0.1));
        p.y = mix(p.y, uMin.y + rise * 9.0, uMode);
        float blink = 0.5 + 0.5 * sin(uTime * (2.0 + seed.x * 3.0) + seed.z * 30.0);
        vA = mix(blink * blink, (1.0 - rise) * (0.6 + 0.4 * blink), uMode);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = (0.45 + seed.w * 0.35) * uScale / -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform vec3 uColor;
      varying float vA;
      void main() {
        float d = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.0, d) * vA;
        if (a < 0.01) discard;
        gl_FragColor = vec4(uColor * a * 1.6, a);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  pts.renderOrder = 9;
  return pts;
}

export function createStars(count, center, radius) {
  const pos = new Float32Array(count * 3);
  const tw = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    pos[i * 3] = center.x + (Math.random() - 0.5) * radius * 2.4;
    pos[i * 3 + 1] = center.y + Math.random() * radius;
    pos[i * 3 + 2] = center.z - Math.random() * 4;
    tw[i] = Math.random();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('tw', new THREE.BufferAttribute(tw, 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uOpacity: { value: 0 }, uScale: { value: 300 } },
    vertexShader: `
      attribute float tw; uniform float uTime, uScale; varying float vA;
      void main() {
        vA = 0.55 + 0.45 * sin(uTime * (1.0 + tw * 2.5) + tw * 50.0);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = (0.35 + tw * 0.5) * uScale / -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform float uOpacity; varying float vA;
      void main() {
        float a = smoothstep(0.5, 0.0, length(gl_PointCoord - 0.5)) * vA * uOpacity;
        if (a < 0.01) discard;
        gl_FragColor = vec4(vec3(0.85, 0.9, 1.0) * a, a);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const p = new THREE.Points(geo, mat);
  p.frustumCulled = false;
  return p;
}
