// Step 3 – the painting comes alive: hit glows, mushroom bounce, wizard charge, the tower door opening in
// golden light, pool shimmer + ripples, flowing waterfalls, fireflies, particles and fireworks.
// Everything lives in painting pixels inside stage.artGroup and is created once (pooled).
import * as THREE from '../vendor/three.module.min.js';
import { flatToArt } from '../core/artmap.js';

const FX_ORDER = 1e5; // above the table, balls and occluders

function canvasTex(size, draw) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const glowTex = () => canvasTex(128, (g, n) => {
  const rg = g.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2);
  rg.addColorStop(0, 'rgba(255,255,255,1)'); rg.addColorStop(0.25, 'rgba(255,255,255,0.55)');
  rg.addColorStop(0.6, 'rgba(255,255,255,0.13)'); rg.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = rg; g.fillRect(0, 0, n, n);
});

/** the open doorway: an arch full of warm light with rays */
const doorTex = () => canvasTex(256, (g, n) => {
  g.save();
  g.beginPath();
  g.moveTo(n * 0.1, n); g.lineTo(n * 0.1, n * 0.42); g.arc(n / 2, n * 0.42, n * 0.4, Math.PI, 0); g.lineTo(n * 0.9, n); g.closePath();
  g.clip();
  const rg = g.createRadialGradient(n / 2, n * 0.62, 0, n / 2, n * 0.62, n * 0.6);
  rg.addColorStop(0, '#fffbe6'); rg.addColorStop(0.35, '#ffe08a'); rg.addColorStop(0.75, '#ffa53a'); rg.addColorStop(1, '#a04a10');
  g.fillStyle = rg; g.fillRect(0, 0, n, n);
  g.globalAlpha = 0.35; g.strokeStyle = '#fff6d0'; g.lineWidth = 6;
  for (let i = 0; i < 9; i++) { const a = Math.PI * (0.15 + i * 0.0875); g.beginPath(); g.moveTo(n / 2, n * 0.75); g.lineTo(n / 2 + Math.cos(a) * n, n * 0.75 - Math.sin(a) * n); g.stroke(); }
  g.restore();
});

function additive(tex, color = 0xffffff, opacity = 1) {
  return new THREE.MeshBasicMaterial({ map: tex, color, transparent: true, opacity, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
}

function quad(mat, w, h, x, y, order = FX_ORDER) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  m.position.set(x, -y, 0);
  m.renderOrder = order;
  return m;
}

// ---------------------------------------------------------------------------------------------- particles
const POINT_VS = `
  attribute float size; attribute vec3 color; varying vec3 vColor; uniform float uScale;
  void main() { vColor = color; gl_PointSize = size * uScale; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const POINT_FS = `
  varying vec3 vColor;
  void main() { float a = smoothstep(0.5, 0.0, length(gl_PointCoord - 0.5)); if (a < 0.01) discard; gl_FragColor = vec4(vColor * a, a); }`;

class Particles {
  constructor(max = 600) {
    this.max = max; this.cursor = 0;
    this.pos = new Float32Array(max * 3); this.col = new Float32Array(max * 3); this.size = new Float32Array(max);
    this.vel = new Float32Array(max * 2); this.life = new Float32Array(max); this.maxLife = new Float32Array(max);
    this.base = new Float32Array(max * 3); this.start = new Float32Array(max); this.grav = new Float32Array(max);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('size', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
    this.material = new THREE.ShaderMaterial({ uniforms: { uScale: { value: 1 } }, vertexShader: POINT_VS, fragmentShader: POINT_FS, transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending });
    this.points = new THREE.Points(geo, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = FX_ORDER + 10;
  }

  /** x, y in painting pixels; velocities in px/s (y down) */
  spawn(x, y, vx, vy, color, size, life, grav = 0) {
    const i = this.cursor; this.cursor = (i + 1) % this.max;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = -y; this.pos[i * 3 + 2] = 0;
    this.vel[i * 2] = vx; this.vel[i * 2 + 1] = vy;
    this.base[i * 3] = color.r; this.base[i * 3 + 1] = color.g; this.base[i * 3 + 2] = color.b;
    this.life[i] = this.maxLife[i] = life; this.start[i] = size; this.grav[i] = grav;
  }

  burst(x, y, color, n = 24, speed = 260, size = 18, life = 0.7, grav = 220) {
    for (let k = 0; k < n; k++) {
      const a = Math.random() * Math.PI * 2, s = speed * (0.35 + Math.random() * 0.75);
      this.spawn(x, y, Math.cos(a) * s, Math.sin(a) * s * 0.75 - speed * 0.25, color, size * (0.6 + Math.random() * 0.8), life * (0.6 + Math.random() * 0.7), grav);
    }
  }

  firework(x, y, color, n = 90, speed = 330) {
    for (let k = 0; k < n; k++) {
      const a = Math.random() * Math.PI * 2, s = speed * (0.8 + Math.random() * 0.3);
      this.spawn(x, y, Math.cos(a) * s, Math.sin(a) * s, color, 22 + Math.random() * 12, 1.3 + Math.random() * 0.6, 160);
    }
  }

  update(dt) {
    const drag = Math.pow(0.12, dt);
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) { this.size[i] = 0; continue; }
      this.life[i] -= dt;
      const k = Math.max(0, this.life[i] / this.maxLife[i]), f = k * k * (3 - 2 * k);
      this.vel[i * 2] *= drag; this.vel[i * 2 + 1] = this.vel[i * 2 + 1] * drag + this.grav[i] * dt;
      this.pos[i * 3] += this.vel[i * 2] * dt; this.pos[i * 3 + 1] -= this.vel[i * 2 + 1] * dt;
      this.col[i * 3] = this.base[i * 3] * f; this.col[i * 3 + 1] = this.base[i * 3 + 1] * f; this.col[i * 3 + 2] = this.base[i * 3 + 2] * f;
      this.size[i] = this.start[i] * (0.4 + 0.6 * k);
    }
    const a = this.points.geometry.attributes;
    a.position.needsUpdate = a.color.needsUpdate = a.size.needsUpdate = true;
  }
}

/** fireflies drifting over the painting, animated entirely on the GPU */
function fireflies(count) {
  const seed = new Float32Array(count * 4);
  for (let i = 0; i < seed.length; i++) seed[i] = Math.random();
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
  geo.setAttribute('seed', new THREE.BufferAttribute(seed, 4));
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uScale: { value: 1 }, uColor: { value: new THREE.Color(0xd8ff7a) } },
    vertexShader: `
      attribute vec4 seed; uniform float uTime, uScale; varying float vA;
      void main() {
        float t = uTime * (0.08 + seed.w * 0.1);
        vec2 p = vec2(80.0 + seed.x * 1120.0, 440.0 + seed.y * 1700.0);
        p.x += sin(t * 6.3 + seed.y * 40.0) * 60.0;
        p.y += cos(t * 5.1 + seed.x * 40.0) * 45.0;
        float blink = 0.5 + 0.5 * sin(uTime * (1.6 + seed.z * 2.5) + seed.x * 30.0);
        vA = blink * blink;
        gl_PointSize = (10.0 + seed.w * 10.0) * uScale;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p.x, -p.y, 0.0, 1.0);
      }`,
    fragmentShader: `
      uniform vec3 uColor; varying float vA;
      void main() { float a = smoothstep(0.5, 0.0, length(gl_PointCoord - 0.5)) * vA; if (a < 0.01) discard; gl_FragColor = vec4(uColor * a * 1.4, a); }`,
    transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const p = new THREE.Points(geo, mat);
  p.frustumCulled = false;
  p.renderOrder = FX_ORDER + 5;
  return p;
}

// ---------------------------------------------------------------------------------------------- effects
// painted positions (art px) of everything that reacts
const SPOTS = {
  mush1: { x: 337, y: 1295, r: 120, color: 0xff9a3a },
  mush2: { x: 395, y: 1078, r: 115, color: 0xb070ff },
  mush3: { x: 435, y: 765, r: 110, color: 0x40ffd8 },
  crystal1: { x: 230, y: 1080, r: 150, color: 0x60fff0 },
  crystal2: { x: 1140, y: 1320, r: 140, color: 0xffe060 },
  potion: { x: 1000, y: 605, r: 140, color: 0xb070ff },
  wizard: { x: 760, y: 946, r: 90, color: 0xfff2a0 },
  slingL: { x: 352, y: 1690, r: 170, color: 0x7dff8a },
  slingR: { x: 928, y: 1690, r: 170, color: 0x7dff8a },
  kickback: { x: 138, y: 1840, r: 110, color: 0x50ff80 },
  plunger: { x: 1186, y: 1760, r: 120, color: 0x40ff90 },
};
const RUSH_IDS = ['mush1', 'mush2', 'mush3', 'crystal1', 'crystal2', 'potion'];
const DOOR = { x: 636, y: 921, w: 64, h: 84 };
const POOL = { x: 630, y: 1425, rx: 162, ry: 50 };
const TOWER_TOP = { x: 632, y: 610 }; // fireworks burst below the HUD frame, around the roof

export class Effects {
  constructor(stage, sim, layers) {
    this.stage = stage; this.sim = sim; this.layers = layers;
    this.group = new THREE.Group();
    stage.artGroup.add(this.group);
    this.time = 0;
    this.particles = new Particles(700);
    this.group.add(this.particles.points);
    this.flies = fireflies(70);
    this.group.add(this.flies);
    const glow = glowTex();
    // hit glows (one per reactive spot)
    this.glows = {};
    for (const [id, s] of Object.entries(SPOTS)) {
      const m = quad(additive(glow, s.color, 0), s.r * 2, s.r * 2, s.x, s.y);
      this.group.add(m);
      this.glows[id] = { mesh: m, flash: 0, base: 0, color: new THREE.Color(s.color) };
    }
    // slingshot rubbers: a bright streak along the kicking edge when they fire
    this.rubbers = {};
    for (const [id, a, b] of [['slingL', [333, 1572], [406, 1778]], ['slingR', [945, 1572], [872, 1778]]]) {
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const m = quad(additive(glow, 0xc8ffb0, 0), len * 1.15, 60, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
      m.rotation.z = -Math.atan2(b[1] - a[1], b[0] - a[0]);
      this.group.add(m);
      this.rubbers[id] = { mesh: m, flash: 0 };
    }
    // the tower door
    this.door = { open: 0, target: 0 };
    this.doorLight = quad(additive(doorTex(), 0xffffff, 0), DOOR.w, DOOR.h, DOOR.x, DOOR.y, FX_ORDER - 1);
    this.doorGlow = quad(additive(glow, 0xffc860, 0), 330, 300, DOOR.x, DOOR.y + 30);
    this.doorSpill = quad(additive(glow, 0xffb040, 0), 380, 150, DOOR.x, DOOR.y + 95);
    this.group.add(this.doorLight, this.doorGlow, this.doorSpill);
    // pool shimmer + ripples
    this.ripples = [0, 1, 2, 3].map(() => new THREE.Vector4(0, 0, -99, 0));
    this.rippleIdx = 0;
    this.poolMat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uR: { value: new THREE.Vector2(POOL.rx, POOL.ry) }, uRip: { value: this.ripples }, uColor: { value: new THREE.Color(0x7ff0ff) } },
      vertexShader: 'varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `
        uniform float uTime; uniform vec2 uR; uniform vec4 uRip[4]; uniform vec3 uColor; varying vec2 vP;
        void main(){
          vec2 q = vP / uR; float r = length(q); if (r > 1.0) discard;
          float edge = smoothstep(1.0, 0.75, r);
          float c = sin(vP.x * 0.05 + uTime * 1.2) * sin(vP.y * 0.16 - uTime * 0.9) + sin((vP.x * 0.03 + vP.y * 0.1) + uTime * 1.7) * 0.6;
          float caustic = smoothstep(0.85, 1.5, c);
          float sp = fract(sin(dot(floor(vP * 0.12 + vec2(uTime * 0.7, 0.0)), vec2(12.9898, 78.233))) * 43758.5453);
          float rip = 0.0;
          for (int i = 0; i < 4; i++) {
            float age = uTime - uRip[i].z; if (age < 0.0 || age > 1.8) continue;
            vec2 d = (vP - uRip[i].xy) * vec2(1.0, 3.2);
            rip += smoothstep(10.0, 0.0, abs(length(d) - age * 150.0)) * (1.0 - age / 1.8) * uRip[i].w;
          }
          float a = edge * (caustic * 0.32 + step(0.992, sp) * 0.6 + rip * 0.7);
          gl_FragColor = vec4(uColor * a, a);
        }`,
      transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    this.group.add(quad(this.poolMat, POOL.rx * 2, POOL.ry * 2, POOL.x, POOL.y, FX_ORDER - 50));
    // waterfalls (the two painted falls) – flowing streaks
    this.fallMat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color(0xd8f6ff) } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `
        uniform float uTime; uniform vec3 uColor; varying vec2 vUv;
        float h(float x){ return fract(sin(x * 91.7) * 43758.5); }
        void main(){
          float edge = smoothstep(0.0, 0.25, vUv.x) * smoothstep(1.0, 0.75, vUv.x) * smoothstep(0.0, 0.2, vUv.y) * smoothstep(1.0, 0.8, vUv.y);
          float col = floor(vUv.x * 14.0);
          float s = smoothstep(0.6, 1.0, fract(vUv.y * 3.0 + uTime * (0.9 + h(col) * 0.8) + h(col + 3.0)));
          float a = edge * s * 0.35;
          gl_FragColor = vec4(uColor * a, a);
        }`,
      transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    this.group.add(quad(this.fallMat, 60, 110, 802, 452, FX_ORDER - 40), quad(this.fallMat, 80, 150, 1205, 205, FX_ORDER - 40));
    this.pending = []; // queued firework shells
    this.scale = 1;
  }

  setScale(s) { this.scale = s; this.particles.material.uniforms.uScale.value = s; this.flies.material.uniforms.uScale.value = s; }

  bind(bus) {
    const P = this.particles;
    const c = (hex) => new THREE.Color(hex);
    const gold = c(0xffd060), green = c(0x70ff90), white = c(0xffffff);
    const hit = (id, n = 26, speed = 280) => {
      const g = this.glows[id], s = SPOTS[id];
      if (!g) return;
      g.flash = 1;
      P.burst(s.x, s.y, g.color, n, speed);
      const occ = this.layers.occ[id];
      if (occ) occ.hit = 1;
    };
    bus.on('element', ({ id }) => hit(id));
    bus.on('contact', (e) => {
      if (e.kind !== 'sling' || !this.glows[e.id]) return;
      this.glows[e.id].flash = 1;
      this.rubbers[e.id].flash = 1;
      const occ = this.layers.occ[e.id];
      if (occ) occ.hit = 1;
      const [bx, by] = flatToArt(e.x, e.y);
      P.burst(bx, by, green, 18, 300, 15, 0.45);
    });
    bus.on('wizardHit', () => hit('wizard', 30, 220));
    bus.on('doorOpen', () => {
      this.door.target = 1;
      const s = SPOTS.wizard; // a stream of magic from the staff to the door
      for (let k = 0; k < 40; k++) { const t = k / 40; P.spawn(s.x + (DOOR.x - s.x) * t, s.y + (DOOR.y - s.y) * t - Math.sin(t * Math.PI) * 60, 0, -20, gold, 16, 0.5 + t * 0.8, 0); }
    });
    bus.on('doorClose', () => { this.door.target = 0; });
    bus.on('towerEnter', () => this.fireworks(5, 2.4));
    bus.on('superJackpot', () => { this.fireworks(3, 1.2); P.burst(DOOR.x, DOOR.y + 40, gold, 60, 420, 22, 1); });
    bus.on('skillShot', () => { hit('mush3', 50, 380); this.fireworks(1, 0); });
    bus.on('kickbackFire', ({ x, y }) => { const [ax, ay] = flatToArt(x, y); P.burst(ax, ay, green, 30, 360, 18, 0.6, -100); });
    bus.on('railEnter', ({ id }) => { const s = id === 'rampA' ? [1012, 1255] : [286, 1045]; P.burst(s[0], s[1], id === 'rampA' ? c(0x9fe8ff) : gold, 16, 200, 14, 0.5); });
    bus.on('ramp', ({ id }) => { const s = id === 'rampA' ? [1012, 712] : [520, 628]; P.burst(s[0], s[1], id === 'rampA' ? c(0x9fe8ff) : gold, 30, 280, 16, 0.8); });
    bus.on('towerEject', ({ x, y }) => { const [ax, ay] = flatToArt(x, y); P.burst(ax, ay, gold, 24, 240, 16, 0.6); });
    bus.on('ballSpawn', ({ where }) => { if (where === 'portal') P.burst(200, 760, c(0xff70e0), 40, 260, 18, 0.8, 0); });
    bus.on('ballDissolve', ({ x, y }) => { const [ax, ay] = flatToArt(x, y); P.burst(ax, ay, white, 40, 200, 16, 1, 0); P.burst(ax, ay, green, 30, 150, 14, 1.2, 0); });
    bus.on('poolSplash', ({ x, y, speed }) => {
      const [ax, ay] = flatToArt(x, y);
      this.ripples[this.rippleIdx++ % 4].set(ax - POOL.x, -(ay - POOL.y), this.time, Math.min(1, 0.35 + speed / 40));
      P.burst(ax, ay, c(0xa0f4ff), 8, 140, 12, 0.5, 300);
    });
    bus.on('gameStart', () => { this.door.target = 0; });
  }

  fireworks(shells, spread) {
    for (let i = 0; i < shells; i++) this.pending.push(i * (spread / Math.max(1, shells)));
  }

  update(dt) {
    this.time += dt;
    const t = this.time, rules = this.sim.rules;
    // hit glows: quick flash that fades; the plunger gem breathes while a ball waits
    const waiting = rules.state === 'playing' && this.sim.canLaunch();
    const charge = rules.doorOpen ? 3 : rules.wizardCharge;
    for (const [id, g] of Object.entries(this.glows)) {
      g.flash = Math.max(0, g.flash - dt * 2.0); // a hit glows for about half a second
      let base = 0;
      if (RUSH_IDS.includes(id)) { // RUSH COMBO progress lives on the table itself
        if (rules.rushActive) base = 0.45 + 0.35 * Math.sin(t * 9 + RUSH_IDS.indexOf(id));
        else if (rules.combo.has(id)) base = 0.22 + 0.06 * Math.sin(t * 2.5);
      } else if (id === 'kickback') base = rules.state === 'playing' && rules.kickbackLit ? 0.45 + 0.15 * Math.sin(t * 4) : 0;
      if (id === 'plunger') base = waiting ? 0.35 + 0.25 * Math.sin(t * 5) : 0;
      else if (id === 'wizard') base = charge * 0.22 + (rules.doorOpen ? 0.2 * Math.sin(t * 10) : 0);
      g.mesh.material.opacity = Math.min(1, base + g.flash * 0.95);
      const s = 1 + g.flash * 0.25 + (id === 'wizard' ? charge * 0.12 : 0);
      g.mesh.scale.set(s, s, 1);
    }
    if (charge > 0 && Math.random() < dt * (3 + charge * 6)) { // sparks orbiting the charged staff
      const a = Math.random() * Math.PI * 2, s = SPOTS.wizard;
      this.particles.spawn(s.x + Math.cos(a) * 30, s.y + Math.sin(a) * 30, -Math.sin(a) * 70, Math.cos(a) * 70 - 30, new THREE.Color().setHSL(0.13, 1, 0.7), 14, 0.6, 0);
    }
    // painted objects react: mushrooms squash and bounce, everything hit brightens for a moment
    for (const [id, o] of Object.entries(this.layers.occ)) {
      if (!o.hit) continue;
      o.hit = Math.max(0, o.hit - dt * (id.startsWith('sling') ? 4.5 : 2.2));
      const k = o.hit, bright = 1 + k * 0.9;
      o.mesh.material.color.setRGB(bright, bright, bright);
      if (id.startsWith('sling')) { // the rubber snaps out toward the table centre, then settles
        const dir = id === 'slingL' ? 1 : -1;
        o.mesh.scale.set(1 + k * 0.05, 1 + k * 0.02, 1);
        o.mesh.position.x = o.cx + dir * k * 9;
      } else if (id.startsWith('mush')) {
        const sx = 1 + k * 0.08, sy = 1 - k * 0.1;
        o.mesh.scale.set(sx, sy, 1);
        o.mesh.position.y = -(o.base[1] + (o.cy - o.base[1]) * sy);
      }
    }
    for (const r of Object.values(this.rubbers)) { r.flash = Math.max(0, r.flash - dt * 4); r.mesh.material.opacity = r.flash; }
    // tower door
    const d = this.door;
    d.open += (d.target - d.open) * Math.min(1, dt * 5);
    const pulse = d.target ? 0.8 + 0.2 * Math.sin(t * 6) : 1;
    this.doorLight.material.opacity = Math.min(1, d.open * 1.1);
    this.doorLight.scale.set(0.6 + 0.4 * d.open, 0.8 + 0.2 * d.open, 1);
    this.doorGlow.material.opacity = d.open * 0.75 * pulse;
    this.doorSpill.material.opacity = d.open * 0.6 * pulse;
    if (d.target && Math.random() < dt * 22) this.particles.spawn(DOOR.x + (Math.random() - 0.5) * 60, DOOR.y + 30, (Math.random() - 0.5) * 40, -60 - Math.random() * 60, new THREE.Color(1, 0.82, 0.4), 12, 1.1, -20);
    // fireworks over the tower
    if (this.pending.length) {
      for (let i = this.pending.length - 1; i >= 0; i--) {
        this.pending[i] -= dt;
        if (this.pending[i] <= 0) {
          this.pending.splice(i, 1);
          const hue = Math.random();
          this.particles.firework(TOWER_TOP.x + (Math.random() - 0.5) * 420, TOWER_TOP.y + (Math.random() - 0.5) * 220, new THREE.Color().setHSL(hue, 1, 0.62));
          this.particles.firework(TOWER_TOP.x + (Math.random() - 0.5) * 380, TOWER_TOP.y + (Math.random() - 0.5) * 160, new THREE.Color().setHSL((hue + 0.15) % 1, 1, 0.72), 40, 220);
        }
      }
    }
    this.poolMat.uniforms.uTime.value = t;
    this.fallMat.uniforms.uTime.value = t;
    this.flies.material.uniforms.uTime.value = t;
    this.particles.update(dt);
  }
}
