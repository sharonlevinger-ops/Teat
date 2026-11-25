// 3D scene. The playfield IS the concept art (text removed), shown unlit so its colours match
// the reference exactly. On top: real 3D flippers, chrome balls, drop-target sprites,
// glowing lamps over the drawn lights, flame / water / bumper / sling effects, forest around.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import * as L from './layout.js';
import * as T from './textures.js';

export const S = 0.01;
export const OX = L.IMG.w / 2, OZ = L.IMG.h / 2;
export const TILT = 0.07;
const R = L.BALL_R;
export const wx = (x) => (x - OX) * S;
export const wz = (y) => (y - OZ) * S;
export const V = (x, y, h = 0) => new THREE.Vector3(wx(x), h * S, wz(y));
const rnd = T.rand;
const LIFT = 0.15; // overlays float this many px above the art

const NOISE_GLSL = `
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
float noise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(hash(i),hash(i+vec2(1,0)),f.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x), f.y); }
float fbm(vec2 p){ float s=0.0, a=0.5; for(int i=0;i<4;i++){ s+=a*noise(p); p*=2.03; a*=0.5; } return s; }`;

const flat = (w, h) => new THREE.PlaneGeometry(w * S, h * S).rotateX(-Math.PI / 2);
const additive = (opts) => new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, ...opts });

// ---------------- particles ----------------
class Particles {
  constructor(parent, n = 700) {
    this.n = n; this.i = 0;
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(n * 3); this.col = new Float32Array(n * 3); this.size = new Float32Array(n);
    this.vel = new Float32Array(n * 3); this.life = new Float32Array(n); this.max = new Float32Array(n); this.grav = new Float32Array(n);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    g.setAttribute('size', new THREE.BufferAttribute(this.size, 1));
    this.mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: T.softDot() }, scale: { value: 300 } },
      vertexShader: `attribute float size; attribute vec3 color; varying vec3 vC; varying float vA; uniform float scale;
        void main(){ vC=color; vA=step(0.001,size); vec4 mv=modelViewMatrix*vec4(position,1.0); gl_PointSize=size*scale/-mv.z; gl_Position=projectionMatrix*mv; }`,
      fragmentShader: `uniform sampler2D map; varying vec3 vC; varying float vA; void main(){ vec4 t=texture2D(map, gl_PointCoord); gl_FragColor=vec4(vC*t.a*1.6, t.a)*vA; }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
    parent.add(this.points);
  }
  emit(p, color, count = 20, speed = 1.5, life = 0.8, size = 0.12, up = 1, grav = 1) {
    const c = new THREE.Color(color);
    for (let k = 0; k < count; k++) {
      const i = this.i; this.i = (this.i + 1) % this.n;
      this.pos[i * 3] = p.x; this.pos[i * 3 + 1] = p.y; this.pos[i * 3 + 2] = p.z;
      const a = rnd() * Math.PI * 2, s = speed * (0.3 + rnd() * 0.7);
      this.vel[i * 3] = Math.cos(a) * s; this.vel[i * 3 + 1] = (0.4 + rnd()) * speed * up; this.vel[i * 3 + 2] = Math.sin(a) * s;
      const v = 0.75 + rnd() * 0.5;
      this.col[i * 3] = c.r * v; this.col[i * 3 + 1] = c.g * v; this.col[i * 3 + 2] = c.b * v;
      this.life[i] = this.max[i] = life * (0.6 + rnd() * 0.6);
      this.size[i] = size * (0.6 + rnd() * 0.8);
      this.grav[i] = grav;
    }
  }
  update(dt) {
    for (let i = 0; i < this.n; i++) {
      if (this.life[i] <= 0) { this.size[i] = 0; continue; }
      this.life[i] -= dt;
      this.vel[i * 3 + 1] -= 4 * dt * this.grav[i];
      this.pos[i * 3] += this.vel[i * 3] * dt; this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt; this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      this.size[i] *= 0.995;
      if (this.life[i] <= 0) this.size[i] = 0;
    }
    const g = this.points.geometry;
    g.attributes.position.needsUpdate = g.attributes.color.needsUpdate = g.attributes.size.needsUpdate = true;
  }
}

// ---------------- lamps over the drawn lights ----------------
// glow = additive coloured halo; dim = darkening disc so a drawn light looks "off" when unlit
class Lamp {
  constructor(glow, dim, { onI = 1, offDim = 0.55 } = {}) {
    this.glow = glow; this.dim = dim; this.onI = onI; this.offDim = offDim;
    this.state = 0; this.level = 0; this.phase = rnd() * 6;
  }
  set(s) { this.state = s; }
  update(t, dt) {
    let target = 0;
    if (this.state === 1) target = 1;
    else if (this.state === 2) target = Math.sin(t * 6 + this.phase) > 0 ? 1 : 0.05;
    else if (this.state === 3) target = Math.sin(t * 16 + this.phase) > 0 ? 1 : 0.05;
    this.level += (target - this.level) * Math.min(1, dt * 18);
    this.glow.material.opacity = this.level * this.onI;
    this.glow.visible = this.level > 0.01;
    if (this.dim) this.dim.material.opacity = (1 - this.level) * this.offDim;
  }
}

export class World {
  constructor(renderer) {
    this.renderer = renderer;
    this.scene = new THREE.Scene();
    this.table = new THREE.Group();
    this.table.rotation.x = TILT;
    this.scene.add(this.table);
    this.lamps = new Map();
    this.t = 0;
    this.maxAniso = renderer.capabilities.getMaxAnisotropy();
    this.dot = T.softDot();
    this.mats = {
      chrome: new THREE.MeshStandardMaterial({ color: 0xd4d8de, metalness: 1, roughness: 0.2 }),
      flipBody: new THREE.MeshPhysicalMaterial({ color: 0xe6e1d6, roughness: 0.35, clearcoat: 0.7, clearcoatRoughness: 0.2 }),
      flipRim: new THREE.MeshStandardMaterial({ color: 0x3b2618, roughness: 0.6 }),
      darkWood: new THREE.MeshStandardMaterial({ color: 0x3a2617, roughness: 0.55 }),
    };
    this.buildEnvironment();
    this.buildLights();
    this.buildPlayfield();
    this.buildOverlays();
    this.buildFlippers();
    this.buildSpinner();
    this.particles = new Particles(this.table);
    this.buildBalls();
    this.setMood('normal', true);
  }

  add(obj, parent = this.table) { parent.add(obj); return obj; }

  // ---------------- forest surroundings ----------------
  buildEnvironment() {
    const scene = this.scene;
    const back = T.backdropTexture();
    const sky = new THREE.Mesh(new THREE.SphereGeometry(60, 48, 24), new THREE.MeshBasicMaterial({ map: back, side: THREE.BackSide, fog: false }));
    sky.rotation.y = Math.PI * 0.55;
    scene.add(sky);
    scene.fog = new THREE.Fog(0x1f3026, 12, 42);
    scene.background = new THREE.Color(0x0b130e);
    // reflection environment for the chrome ball and flipper caps
    const envScene = new THREE.Scene();
    envScene.add(new THREE.Mesh(new THREE.SphereGeometry(20, 32, 16), new THREE.MeshBasicMaterial({ map: back, side: THREE.BackSide })));
    const gnd = new THREE.Mesh(new THREE.CircleGeometry(19, 32), new THREE.MeshBasicMaterial({ color: 0x2a4a22 }));
    gnd.rotation.x = -Math.PI / 2; gnd.position.y = -2; envScene.add(gnd);
    const panel = (c, x, y, z, s) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(s, s), new THREE.MeshBasicMaterial({ color: c, side: THREE.DoubleSide })); m.position.set(x, y, z); m.lookAt(0, 0, 0); envScene.add(m); };
    panel(0xd8ccb0, -6, 12, 4, 8); panel(0x6aa0ff, 8, 8, -6, 5); panel(0xc0a070, 0, 10, 10, 6);
    const pm = new THREE.PMREMGenerator(this.renderer);
    scene.environment = pm.fromScene(envScene, 0.02).texture;
    pm.dispose();
    // forest floor
    const gc = document.createElement('canvas'); gc.width = gc.height = 256;
    const gg = gc.getContext('2d'); const id = gg.createImageData(256, 256);
    for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) { const n = T.fbm(x / 16, y / 16, 5, 16); const i = (y * 256 + x) * 4; id.data[i] = 25 + n * 40; id.data[i + 1] = 45 + n * 60; id.data[i + 2] = 18 + n * 25; id.data[i + 3] = 255; }
    gg.putImageData(id, 0, 0);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(140, 140), new THREE.MeshStandardMaterial({ map: T.canvasToTex(gc, { repeat: [30, 30] }), roughness: 1 }));
    ground.rotation.x = -Math.PI / 2; ground.position.y = -1.1; ground.receiveShadow = true;
    scene.add(ground);
    // pines
    const pineGeo = mergeGeometries([
      new THREE.CylinderGeometry(0.08, 0.12, 1.2, 6).translate(0, 0.6, 0),
      new THREE.ConeGeometry(0.8, 1.5, 12).translate(0, 1.5, 0),
      new THREE.ConeGeometry(0.62, 1.3, 12).translate(0, 2.2, 0),
      new THREE.ConeGeometry(0.45, 1.1, 12).translate(0, 2.85, 0),
      new THREE.ConeGeometry(0.26, 0.9, 10).translate(0, 3.4, 0),
    ].map((g) => g.toNonIndexed()));
    const cols = [];
    for (let i = 0; i < pineGeo.attributes.position.count; i++) { const y = pineGeo.attributes.position.getY(i); const v = 0.75 + Math.random() * 0.5; cols.push(...(y < 0.85 ? [0.22, 0.15, 0.1] : [0.05 * v + y * 0.01, (0.15 + y * 0.025) * v, 0.08 * v])); }
    pineGeo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    const pineMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 });
    const N = 260; const pines = new THREE.InstancedMesh(pineGeo, pineMat, N);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p = new THREE.Vector3();
    let k = 0;
    while (k < N) {
      const a = rnd() * Math.PI * 2, r = 10 + rnd() * 34;
      const x = Math.cos(a) * r, z = Math.sin(a) * r - 8;
      if (z > -2 && Math.abs(x) < 12) continue;
      const s = 1.6 + rnd() * 2;
      p.set(x, -1.1, z); q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rnd() * 6); sc.set(s, s * (0.9 + rnd() * 0.5), s);
      pines.setMatrixAt(k++, m4.compose(p, q, sc));
    }
    scene.add(pines);
  }

  buildLights() {
    this.hemi = new THREE.HemisphereLight(0xcfe0ff, 0x30401c, 0.7);
    this.scene.add(this.hemi);
    this.key = new THREE.DirectionalLight(0xfff0d8, 1.8);
    this.key.position.set(-4, 12, -3);
    this.key.castShadow = true;
    this.key.shadow.mapSize.set(1024, 1024);
    const sc = this.key.shadow.camera; sc.left = -5; sc.right = 5; sc.top = 8; sc.bottom = -8; sc.near = 2; sc.far = 30;
    this.scene.add(this.key);
  }

  // ---------------- the concept-art playfield ----------------
  buildPlayfield() {
    const loader = new THREE.TextureLoader();
    const map = loader.load('assets/playfield.jpg');
    map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = this.maxAniso;
    this.pfMat = new THREE.MeshBasicMaterial({ map, toneMapped: false });
    const pf = new THREE.Mesh(flat(L.IMG.w, L.IMG.h), this.pfMat);
    pf.position.copy(V(L.IMG.w / 2, L.IMG.h / 2));
    this.add(pf);
    // cabinet body under the art (gives the table thickness in the 3D views)
    const body = new THREE.Mesh(new THREE.BoxGeometry(L.IMG.w * S, 0.9, L.IMG.h * S), this.mats.darkWood);
    body.position.copy(V(L.IMG.w / 2, L.IMG.h / 2, -46)); body.castShadow = true;
    this.add(body);
    // drop-target sprites (original pixels) over the inpainted art
    this.dropMeshes = L.dropTargets.map((d, i) => {
      const tx = loader.load(`assets/target${i}.png`); tx.colorSpace = THREE.SRGBColorSpace;
      const m = new THREE.Mesh(flat(52, 52), new THREE.MeshBasicMaterial({ map: tx, transparent: true, toneMapped: false, depthWrite: false }));
      m.position.copy(V(d.cx, d.cy, LIFT)); m.renderOrder = 2;
      this.add(m);
      return { m, down: 0, target: 0 };
    });
  }

  glow(x, y, size, color, renderOrder = 3) {
    const m = new THREE.Mesh(flat(size, size), additive({ map: this.dot, color, opacity: 0 }));
    m.position.copy(V(x, y, LIFT * 2)); m.renderOrder = renderOrder;
    return this.add(m);
  }
  dimDisc(x, y, size) {
    const m = new THREE.Mesh(flat(size, size), new THREE.MeshBasicMaterial({ map: this.dot, color: 0x000000, transparent: true, opacity: 0, depthWrite: false, toneMapped: false }));
    m.position.copy(V(x, y, LIFT)); m.renderOrder = 2;
    return this.add(m);
  }
  lamp(name, x, y, color, size = 34, { dim = true, onI = 1, offDim = 0.55, dimSize } = {}) {
    const l = new Lamp(this.glow(x, y, size, color), dim ? this.dimDisc(x, y, dimSize || size * 0.7) : null, { onI, offDim });
    this.lamps.set(name, l);
    return l;
  }

  buildOverlays() {
    const A = L.LAMPS;
    const dcol = [0xff3030, 0xff3030, 0x30ff60, 0xffc030, 0xffc030, 0x30ff60, 0xffc030];
    A.dwarf.forEach(([x, y], i) => this.lamp('dwarf_' + i, x, y, dcol[i], 34));
    const lcol = [0xff3030, 0x30ff60, 0x30ff60, 0xffc030, 0xff3030];
    ['bx_2', 'bx_3', 'bx_4', 'bx_5', 'ballsave'].forEach((n, i) => this.lamp(n, A.lowerRow[i][0], A.lowerRow[i][1], lcol[i], 36));
    const acol = { towerHole: 0xffc860, towerRamp: 0x40ff80, orbit: 0xffc860, castle: 0xff9a40, crystal: 0x40ff80 };
    for (const [k, [x, y]] of Object.entries(A.arrows)) this.lamp('arrow_' + k, x, y, acol[k], 70, { dimSize: 48 });
    this.lamp('kick_L', A.kick.L[0], A.kick.L[1], 0xffb060, 46, { dimSize: 30 });
    this.lamp('kick_R', A.kick.R[0], A.kick.R[1], 0xffe0a0, 46, { dimSize: 30 });
    for (const [c, [x, y]] of Object.entries(A.mage)) this.lamp('mage_' + c, x, y, 0xffd27a, 40, { offDim: 0.35, dimSize: 26 });
    A.towerLocks.forEach(([x, y], i) => this.lamp('tower_lock_' + i, x, y, 0x9a7bff, 46, { dim: false }));
    this.lamp('tower_rune', A.towerRune[0], A.towerRune[1], 0x5ab8ff, 70, { dim: false });
    A.castleGate.forEach(([x, y], i) => this.lamp('castle_gate_' + i, x, y, 0xffc34a, 40, { dim: false }));
    for (const h of L.holes) this.lamp('hole_' + h.id, h.x, h.y, { tower: 0x55b8ff, castle: 0xffcf6a, mystery: 0xc36bff, mystery2: 0xc36bff, mine: 0xffa030 }[h.id], h.r * 4.2, { dim: false });
    L.shieldTargets.forEach((s, i) => this.lamp('shield_' + i, s.lamp[0], s.lamp[1], 0xff6a40, 64, { dim: false, onI: 0.8 }));
    this.lamp('crystal_glow', 640, 420, 0x40b0ff, 180, { dim: false, onI: 0.5 });

    // bumper flashes, sling flashes, flame and water effects
    this.bumperGlows = L.bumpers.map((b) => ({ m: this.glow(b.cap[0], b.cap[1], 120, b.color), b, flash: 0 }));
    this.slingGlows = L.slings.map((s) => ({ m: this.glow((s.a[0] + s.b[0]) / 2, (s.a[1] + s.b[1]) / 2, 120, s.side === 'L' ? 0x7fd0ff : 0xffb080), kick: 0 }));
    this.flameGlow = this.glow(A.flame[0], A.flame[1], 150, 0x3d8bff);
    this.flameMat = new THREE.ShaderMaterial({
      uniforms: { time: { value: 0 }, boost: { value: 1 } },
      vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
      fragmentShader: `varying vec2 vUv; uniform float time; uniform float boost; ${NOISE_GLSL}
        void main(){ vec2 uv=vUv; float n=fbm(vec2(uv.x*3.0, uv.y*2.5+time*2.4));
          float w=uv.y*0.42+0.04; float d=abs(uv.x-0.5+(n-0.5)*0.35*(1.0-uv.y));
          float f=smoothstep(w, w*0.15, d)*smoothstep(1.0,0.85,uv.y)*pow(uv.y,0.7);
          vec3 c=mix(vec3(0.1,0.35,1.0), vec3(0.75,0.95,1.0), smoothstep(0.3,0.9,f));
          gl_FragColor=vec4(c*f*0.55*boost, f); }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
    });
    const fl = new THREE.Mesh(flat(56, 80), this.flameMat); fl.position.copy(V(A.flame[0], A.flame[1] + 4, LIFT * 3)); fl.renderOrder = 4; this.add(fl);
    this.waterMat = new THREE.ShaderMaterial({
      uniforms: { time: { value: 0 }, ripple: { value: 0 } },
      vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
      fragmentShader: `varying vec2 vUv; uniform float time; uniform float ripple; ${NOISE_GLSL}
        void main(){ vec2 p=vUv*2.0-1.0; float r=length(p); float a=atan(p.y,p.x);
          float sw=a + time*0.8 + 2.4/(r+0.35); vec2 q=vec2(cos(sw),sin(sw))*r*3.0;
          float n=fbm(q+time*0.3); float bands=pow(sin(sw*3.0 + n*5.0)*0.5+0.5, 4.0);
          float rip=max(0.0, sin(r*30.0 - time*12.0))*ripple*exp(-r*1.5);
          float edge=1.0-smoothstep(0.82,1.0,r);
          vec3 c=vec3(0.35,0.8,1.0)*(bands*0.35 + rip*0.8);
          gl_FragColor=vec4(c*edge, 1.0); }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
    });
    const wtr = new THREE.Mesh(flat(L.pool.rx * 2, L.pool.ry * 2), this.waterMat); wtr.position.copy(V(L.pool.x, L.pool.y, LIFT)); wtr.renderOrder = 2; this.add(wtr);
    // fake contact shadows for the balls (the art is unlit)
    this.shadowMat = new THREE.MeshBasicMaterial({ map: this.dot, color: 0x000000, transparent: true, opacity: 0.55, depthWrite: false, toneMapped: false });
  }

  // ---------------- 3D flippers styled like the drawn ones ----------------
  flipperGeo(len, r0, r1, height, bevel) {
    const s = new THREE.Shape();
    const a = Math.asin((r0 - r1) / len);
    s.absarc(0, 0, r0, Math.PI / 2 + a, Math.PI * 1.5 - a, false);
    s.absarc(len, 0, r1, -Math.PI / 2 - a, Math.PI / 2 + a, false);
    s.closePath();
    const g = new THREE.ExtrudeGeometry(s, { depth: height, bevelEnabled: true, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 3, curveSegments: 18 });
    g.rotateX(Math.PI / 2); g.translate(0, height + bevel, 0); g.scale(S, S, S);
    return g;
  }
  buildFlippers() {
    this.flipperMeshes = [];
    for (const f of L.flippers) {
      const g = new THREE.Group(); g.position.copy(V(f.x, f.y));
      const rim = new THREE.Mesh(this.flipperGeo(f.len, f.r0 + 2, f.r1 + 2, 7, 1.2), this.mats.flipRim); rim.castShadow = true; g.add(rim);
      const body = new THREE.Mesh(this.flipperGeo(f.len - 2, f.r0 - 1.5, f.r1 - 1.5, 9, 2.2), this.mats.flipBody); body.position.y = 3 * S; body.castShadow = true; g.add(body);
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(f.r0 * 0.55 * S, f.r0 * 0.6 * S, 3 * S, 20), this.mats.chrome); cap.position.y = 15.5 * S; g.add(cap);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(f.r0 * 0.6 * S, 1.1 * S, 8, 24).rotateX(Math.PI / 2), this.mats.chrome); ring.position.y = 15 * S; g.add(ring);
      this.add(g);
      this.flipperMeshes.push(g);
    }
  }

  // ---------------- spinner plate over the drawn gold gate ----------------
  buildSpinner() {
    const sp = L.spinner;
    const g = new THREE.Group(); g.position.copy(V(sp.x + 12, sp.y - 3, 10));
    const plate = new THREE.Mesh(new THREE.BoxGeometry(52 * S, 13 * S, 2 * S), new THREE.MeshStandardMaterial({ color: 0xd9a845, metalness: 1, roughness: 0.3, emissive: 0x6a4a10, emissiveIntensity: 0 }));
    plate.position.y = -0.5 * S;
    g.add(plate);
    this.spinnerG = g; this.spinnerMat = plate.material; this.spinnerAngle = -Math.PI / 2; this.spinnerVel = 0;
    g.rotation.x = this.spinnerAngle;
    this.add(g);
  }

  buildBalls() {
    this.ballMeshes = [];
    this.ballShadows = [];
    const geo = new THREE.SphereGeometry(R * S, 32, 24);
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 1, roughness: 0.16, envMapIntensity: 1.6 });
    for (let i = 0; i < 4; i++) {
      const m = new THREE.Mesh(geo, mat); m.visible = false; this.add(m); this.ballMeshes.push(m);
      const sh = new THREE.Mesh(flat(R * 3, R * 3), this.shadowMat); sh.visible = false; sh.renderOrder = 3; this.add(sh); this.ballShadows.push(sh);
    }
  }

  ballWorld(b) { return V(b.x, b.y, R + (b.h || 0)); }

  // ---------------- effects API ----------------
  fx(type, data = {}) {
    const p = data.x !== undefined ? V(data.x, data.y, data.h ?? 20) : null;
    switch (type) {
      case 'bumper': {
        const bg = this.bumperGlows[L.bumpers.indexOf(data.bumper)];
        this.shake = Math.max(this.shake || 0, 0.35);
        if (bg) { bg.flash = 1; this.particles.emit(V(bg.b.cap[0], bg.b.cap[1], 30), bg.b.color, 26, 1.4, 0.8, 0.08, 1, 0.5); }
        break;
      }
      case 'sling': this.shake = Math.max(this.shake || 0, 0.25); this.slingGlows[data.side === 'L' ? 0 : 1].kick = 1; if (p) this.particles.emit(p, 0xffffff, 10, 1.2, 0.4, 0.06); break;
      case 'spark': if (p) this.particles.emit(p, data.color ?? 0xffe6a0, data.n ?? 14, data.speed ?? 1.2, 0.6, data.size ?? 0.07); break;
      case 'splash': if (p) this.particles.emit(p, 0x7fe6ff, 26, 1.0, 0.9, 0.08, 1.4); this.ripple = 1; break;
      case 'drop': this.dropMeshes[data.i].target = 1; break;
      case 'dropReset': this.dropMeshes.forEach((d) => (d.target = 0)); break;
      case 'shield': { const s = L.shieldTargets[data.i]; this.particles.emit(V(s.lamp[0], s.lamp[1], 20), 0xffa060, 14, 1, 0.5, 0.06); break; }
      case 'gate': this.particles.emit(V(527, 455, 20), 0xffd27a, 10, 0.8, 0.5, 0.06); break;
      case 'gateOpen': this.gateOpen = !!data.open; break;
      case 'spin': this.spinnerVel = Math.min(60, this.spinnerVel + data.speed / 40); break;
      case 'flame': this.flameBoost = 2.4; this.particles.emit(V(L.LAMPS.flame[0], L.LAMPS.flame[1], 60), 0x7fc4ff, 40, 1.6, 1.2, 0.1, 1.4, 0.3); break;
      case 'princess': this.princessGlow = data.on ? 1 : 0; break;
      case 'treasure': this.particles.emit(V(266, 900, 30), 0xffd24a, 80, 2.2, 1.4, 0.1, 1.6); break;
      case 'crystal': this.crystalFlash = 1; break;
      case 'lightshow': this.showT = 1.6; break;
      case 'burst': if (p) this.particles.emit(p, data.color ?? 0xffffff, data.n ?? 40, data.speed ?? 2, 1.1, 0.1, 1.5); break;
    }
  }

  setMood(name, instant = false) {
    // the art keeps its true colours; moods tint it very gently and drive the glows
    const moods = {
      normal: { tint: 0xffffff, glow: 1 },
      multiball: { tint: 0xdcd8ff, glow: 1.5 },
      castle: { tint: 0xfff0d8, glow: 1.4 },
      treasure: { tint: 0xfff2c8, glow: 1.6 },
      drain: { tint: 0xa8acb4, glow: 0.6 },
      hot: { tint: 0xffe8f4, glow: 1.3 },
    };
    const m = moods[name] || moods.normal;
    this.moodTarget = { tint: new THREE.Color(m.tint), glow: m.glow };
    this.moodName = name;
    if (instant || !this.moodCur) this.moodCur = { tint: this.moodTarget.tint.clone(), glow: m.glow };
  }

  // ---------------- per-frame ----------------
  update(dt, phys, game) {
    this.t += dt; const t = this.t;
    const c = this.moodCur, k = Math.min(1, dt * 2.5);
    c.tint.lerp(this.moodTarget.tint, k); c.glow += (this.moodTarget.glow - c.glow) * k;
    this.pfMat.color.copy(c.tint);

    this.flameBoost = Math.max(1, (this.flameBoost || 1) - dt * 1.5);
    this.flameMat.uniforms.time.value = t;
    this.flameMat.uniforms.boost.value = this.flameBoost * c.glow * (0.9 + (game?.towerLocks || 0) * 0.2);
    this.flameGlow.material.opacity = 0.25 * this.flameBoost * c.glow * (0.85 + Math.sin(t * 13) * 0.1 + Math.sin(t * 5.3) * 0.08);
    this.ripple = Math.max(0, (this.ripple || 0) - dt * 0.8);
    this.waterMat.uniforms.time.value = t; this.waterMat.uniforms.ripple.value = this.ripple;
    for (const bg of this.bumperGlows) {
      bg.flash = Math.max(0, bg.flash - dt * 5);
      bg.m.material.opacity = 0.12 * c.glow + ((game?.mult || 1) - 1) * 0.06 + bg.flash * 0.9;
    }
    for (const sg of this.slingGlows) { sg.kick = Math.max(0, sg.kick - dt * 6); sg.m.material.opacity = sg.kick * 0.8; sg.m.visible = sg.kick > 0.01; }
    for (const d of this.dropMeshes) {
      d.down += (d.target - d.down) * Math.min(1, dt * 14);
      d.m.material.opacity = 1 - d.down; d.m.scale.setScalar(1 - d.down * 0.25); d.m.visible = d.down < 0.98;
    }
    this.spinnerVel *= Math.pow(0.35, dt);
    this.spinnerAngle += this.spinnerVel * dt;
    if (this.spinnerVel < 0.3) { const rest = Math.round((this.spinnerAngle + Math.PI / 2) / Math.PI) * Math.PI - Math.PI / 2; this.spinnerAngle += (rest - this.spinnerAngle) * Math.min(1, dt * 6); }
    this.spinnerG.rotation.x = this.spinnerAngle;
    this.spinnerMat.emissiveIntensity = Math.min(2, this.spinnerVel * 0.08);
    if (rnd() < dt * 4 * c.glow) this.particles.emit(V(L.LAMPS.flame[0] + (rnd() - 0.5) * 20, L.LAMPS.flame[1] + 10, 30), 0x8fd0ff, 1, 0.3, 1.2, 0.05, 1.5, -0.2);
    if (rnd() < dt * 3) this.particles.emit(V(L.pool.x + (rnd() - 0.5) * 150, L.pool.y + (rnd() - 0.5) * 90, 4), 0x9ff0ff, 1, 0.2, 1.4, 0.04, 1, -0.15);
    this.crystalFlash = Math.max(0, (this.crystalFlash || 0) - dt * 1.2);
    if (rnd() < dt * (2 + this.crystalFlash * 30)) { const s = phys?.rails?.crystal; if (s) { const q = s.at(rnd() * s.length); this.particles.emit(V(q.x, q.y, 6), 0xbff0ff, 1, 0.15, 0.9, 0.06, 0.5, 0); } }
    if (this.princessGlow && rnd() < dt * 10) this.particles.emit(V(540 + (rnd() - 0.5) * 80, 300 + (rnd() - 0.5) * 80, 40), 0xff9ad0, 1, 0.4, 1.2, 0.06, 1, -0.1);

    if (phys) phys.flippers.forEach((f, i) => { this.flipperMeshes[i].rotation.y = -f.angle; });
    // light show: every lamp chases around the table for a moment
    this.showT = Math.max(0, (this.showT || 0) - dt);
    let li = 0;
    for (const l of this.lamps.values()) {
      if (this.showT > 0) { const saved = l.state; l.state = Math.sin(t * 14 - li * 0.9) > 0 ? 1 : 0; l.update(t, dt); l.state = saved; } else l.update(t, dt);
      li++;
    }
    if (phys) {
      this.ballMeshes.forEach((m, i) => {
        const b = phys.balls[i], sh = this.ballShadows[i];
        if (!b || b.mode === 'held' || b.hidden) { m.visible = false; sh.visible = false; return; }
        m.visible = true;
        m.position.copy(this.ballWorld(b));
        sh.visible = true;
        const hh = b.h || 0;
        sh.position.copy(V(b.x + 4 + hh * 0.25, b.y + 5 + hh * 0.2, LIFT * 2.5));
        sh.scale.setScalar(1 + hh / 120);
        const dx = b.rollX * S, dz = b.rollY * S; b.rollX = 0; b.rollY = 0;
        const d = Math.hypot(dx, dz);
        if (d > 1e-6) { const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(dz / d, 0, -dx / d), d / (R * S)); m.quaternion.premultiply(q); }
        const sp = Math.hypot(b.vx || 0, b.vy || 0);
        if ((b.mode === 'rail' && rnd() < 0.5) || (sp > 2300 && rnd() < 0.3)) this.particles.emit(m.position, b.railName === 'crystal' ? 0x7fe6ff : 0xfff0c0, 1, 0.1, 0.4, 0.05, 0, 0);
      });
    }
    this.particles.update(dt);
  }
}
