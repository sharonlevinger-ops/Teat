// 3D scene: table, models, lights, effects. Table px → world units via S.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import * as L from './layout.js';
import * as T from './textures.js';

export const S = 0.01;
export const OX = 387, OZ = 670;
export const TILT = 0.07;
const R = L.BALL_R;
export const wx = (x) => (x - OX) * S;
export const wz = (y) => (y - OZ) * S;
export const V = (x, y, h = 0) => new THREE.Vector3(wx(x), h * S, wz(y));
const rnd = T.rand;

// ---------------- shaders ----------------
const NOISE_GLSL = `
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
float noise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(hash(i),hash(i+vec2(1,0)),f.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x), f.y); }
float fbm(vec2 p){ float s=0.0, a=0.5; for(int i=0;i<4;i++){ s+=a*noise(p); p*=2.03; a*=0.5; } return s; }`;

function flameMaterial(colA, colB) {
  return new THREE.ShaderMaterial({
    uniforms: { time: { value: 0 }, boost: { value: 1 }, colA: { value: new THREE.Color(colA) }, colB: { value: new THREE.Color(colB) } },
    vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: `varying vec2 vUv; uniform float time; uniform float boost; uniform vec3 colA; uniform vec3 colB; ${NOISE_GLSL}
      void main(){ vec2 uv=vUv; float n=fbm(vec2(uv.x*3.0, uv.y*2.5-time*2.4));
        float w=(1.0-uv.y)*0.42+0.04; float d=abs(uv.x-0.5+(n-0.5)*0.35*uv.y);
        float f=smoothstep(w, w*0.15, d)*smoothstep(0.0,0.12,uv.y)*pow(1.0-uv.y,0.7);
        f*= 0.75+0.5*n; vec3 c=mix(colA, colB, smoothstep(0.25,0.9,f));
        gl_FragColor=vec4(c*f*1.5*boost, f); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
}

function waterMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { time: { value: 0 }, ripple: { value: 0 }, glow: { value: 1 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: `varying vec2 vUv; uniform float time; uniform float ripple; uniform float glow; ${NOISE_GLSL}
      void main(){ vec2 p=vUv*2.0-1.0; float r=length(p); float a=atan(p.y,p.x);
        float sw=a + time*0.9 + 2.6/(r+0.35);
        vec2 q=vec2(cos(sw),sin(sw))*r*3.0;
        float n=fbm(q+time*0.3); float bands=sin(sw*3.0 + n*5.0)*0.5+0.5;
        float rip=sin(r*38.0 - time*14.0)*ripple*exp(-r*2.0);
        vec3 deep=vec3(0.02,0.12,0.35), mid=vec3(0.08,0.55,0.95), hi=vec3(0.75,0.98,1.0);
        vec3 c=mix(deep, mid, n*0.9+bands*0.35);
        c=mix(c, hi, smoothstep(0.7,1.0,bands*n*1.6+rip*0.6));
        c+= vec3(0.3,0.8,1.0)*(1.0-smoothstep(0.0,0.45,r))*0.55;
        c+= vec3(0.5,0.9,1.0)*smoothstep(0.85,1.0,r)*0.6;
        float edge=1.0-smoothstep(0.96,1.0,r);
        gl_FragColor=vec4(c*glow, edge); }`,
    transparent: true,
  });
}

// ---------------- particles ----------------
class Particles {
  constructor(scene, n = 700) {
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
    scene.add(this.points);
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
      const k = this.life[i] / this.max[i];
      this.size[i] *= k > 0.02 ? 0.995 : 0;
      if (this.life[i] <= 0) this.size[i] = 0;
    }
    const g = this.points.geometry;
    g.attributes.position.needsUpdate = g.attributes.color.needsUpdate = g.attributes.size.needsUpdate = true;
  }
}

// ---------------- lamps (inserts) ----------------
class Lamp {
  constructor(mesh, color, base = 0.12, onI = 3.2) {
    this.mesh = mesh; this.color = new THREE.Color(color); this.base = base; this.onI = onI; this.state = 0; this.level = 0; this.phase = rnd() * 6;
    mesh.material.emissive = this.color.clone();
  }
  set(s) { this.state = s; }
  update(t, dt) {
    let target = 0;
    if (this.state === 1) target = 1;
    else if (this.state === 2) target = Math.sin(t * 6 + this.phase) > 0 ? 1 : 0.05;
    else if (this.state === 3) target = Math.sin(t * 16 + this.phase) > 0 ? 1 : 0.05;
    this.level += (target - this.level) * Math.min(1, dt * 18);
    this.mesh.material.emissiveIntensity = this.base + this.level * this.onI;
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
    this.anim = []; // per-frame callbacks
    this.t = 0;
    this.maxAniso = renderer.capabilities.getMaxAnisotropy();
    this.mats = this.makeMaterials();
    this.buildEnvironment();
    this.buildLights();
    this.buildPlayfield();
    this.buildWalls();
    this.buildTower();
    this.buildCastle();
    this.buildMushrooms();
    this.buildPool();
    this.buildMine();
    this.buildBastion();
    this.buildTargets();
    this.buildFlippers();
    this.buildSlingsPosts();
    this.buildSpinner();
    this.buildInserts();
    this.buildPlunger();
    this.buildCabinet();
    this.buildDecor();
    this.particles = new Particles(this.table);
    this.buildBalls();
    this.mood = { name: 'normal', k: 0 };
    this.setMood('normal', true);
  }

  // ---------------- materials ----------------
  makeMaterials() {
    const A = this.maxAniso;
    const stoneC = T.stoneTexture({ base: [118, 108, 96], moss: 0.3, seed: 2 });
    const darkStoneC = T.stoneTexture({ base: [70, 68, 74], moss: 0.15, seed: 5, rows: 12, cols: 4 });
    const lightStoneC = T.stoneTexture({ base: [176, 160, 132], moss: 0.32, seed: 9, rows: 9, cols: 4 });
    const mk = (c, rep, o = {}) => {
      const map = T.canvasToTex(c, { repeat: rep, aniso: A });
      const bump = T.canvasToTex(c, { repeat: rep, srgb: false, aniso: A });
      return new THREE.MeshStandardMaterial({ map, bumpMap: bump, bumpScale: o.bump ?? 2.2, roughness: o.rough ?? 0.92, metalness: 0, ...o.extra });
    };
    const rockC = T.rockTexture();
    const woodC = T.woodTexture(), darkWoodC = T.woodTexture({ dark: true });
    return {
      stone: mk(stoneC, [3, 3]),
      darkStone: mk(darkStoneC, [3, 4]),
      lightStone: mk(lightStoneC, [2, 2]),
      rock: mk(rockC, [2, 2], { bump: 4 }),
      wood: mk(woodC, [1, 1], { rough: 0.7, bump: 1 }),
      darkWood: mk(darkWoodC, [1, 4], { rough: 0.45, bump: 0.6, extra: { metalness: 0.05 } }),
      roof: mk(T.roofTexture(), [2, 2], { rough: 0.75, bump: 2 }),
      chrome: new THREE.MeshStandardMaterial({ color: 0xd4d8de, metalness: 1, roughness: 0.2 }),
      satin: new THREE.MeshStandardMaterial({ color: 0x9aa0a8, metalness: 1, roughness: 0.42 }),
      iron: new THREE.MeshStandardMaterial({ color: 0x2b2d33, metalness: 0.85, roughness: 0.45 }),
      gold: new THREE.MeshStandardMaterial({ color: 0xffc35a, metalness: 1, roughness: 0.25 }),
      brass: new THREE.MeshStandardMaterial({ color: 0xc89a4a, metalness: 1, roughness: 0.35 }),
      rubber: new THREE.MeshStandardMaterial({ color: 0xf2efe6, roughness: 0.55 }),
      redRubber: new THREE.MeshStandardMaterial({ color: 0xb3121b, roughness: 0.5 }),
      plasticWhite: new THREE.MeshPhysicalMaterial({ color: 0xd9d6cf, roughness: 0.32, clearcoat: 0.8, clearcoatRoughness: 0.15 }),
      black: new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 1 }),
      leaf: new THREE.MeshStandardMaterial({ color: 0x2f6a24, roughness: 0.8, side: THREE.DoubleSide }),
      darkLeaf: new THREE.MeshStandardMaterial({ color: 0x1c4419, roughness: 0.85 }),
      bark: new THREE.MeshStandardMaterial({ color: 0x4a3221, roughness: 0.95 }),
    };
  }

  add(obj, parent = this.table) { parent.add(obj); return obj; }
  mesh(geo, mat, { cast = true, recv = true } = {}) { const m = new THREE.Mesh(geo, mat); m.castShadow = cast; m.receiveShadow = recv; return m; }
  lamp(name, mesh, color, base, on) { mesh.userData.dynamic = true; const l = new Lamp(mesh, color, base, on); this.lamps.set(name, l); return l; }

  // ---------------- environment ----------------
  buildEnvironment() {
    const scene = this.scene;
    const back = T.backdropTexture();
    const sky = new THREE.Mesh(new THREE.SphereGeometry(60, 48, 24), new THREE.MeshBasicMaterial({ map: back, side: THREE.BackSide, fog: false }));
    sky.rotation.y = Math.PI * 0.55;
    scene.add(sky);
    scene.fog = new THREE.Fog(0x1f3026, 11, 40);
    scene.background = new THREE.Color(0x0b130e);

    // reflection environment for metal / chrome ball: sky + forest ground + soft lights
    const envScene = new THREE.Scene();
    envScene.add(new THREE.Mesh(new THREE.SphereGeometry(20, 32, 16), new THREE.MeshBasicMaterial({ map: back, side: THREE.BackSide })));
    const gnd = new THREE.Mesh(new THREE.CircleGeometry(19, 32), new THREE.MeshBasicMaterial({ color: 0x1d3a18 }));
    gnd.rotation.x = -Math.PI / 2; gnd.position.y = -2; envScene.add(gnd);
    const panel = (c, x, y, z, s) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(s, s), new THREE.MeshBasicMaterial({ color: c, side: THREE.DoubleSide })); m.position.set(x, y, z); m.lookAt(0, 0, 0); envScene.add(m); };
    panel(0x8a7d62, -6, 12, 4, 8); panel(0x506878, 8, 8, -6, 5); panel(0x7a6648, 0, 10, 10, 6);
    const pm = new THREE.PMREMGenerator(this.renderer);
    scene.environment = pm.fromScene(envScene, 0.02).texture;
    scene.environmentIntensity = 0.85;
    pm.dispose();

    // forest floor around the cabinet
    const gc = document.createElement('canvas'); gc.width = gc.height = 256;
    const gg = gc.getContext('2d'); const id = gg.createImageData(256, 256);
    for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) { const n = T.fbm(x / 16, y / 16, 5, 16); const i = (y * 256 + x) * 4; id.data[i] = 25 + n * 40; id.data[i + 1] = 45 + n * 60; id.data[i + 2] = 18 + n * 25; id.data[i + 3] = 255; }
    gg.putImageData(id, 0, 0);
    const gt = T.canvasToTex(gc, { repeat: [30, 30] });
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(140, 140), new THREE.MeshStandardMaterial({ map: gt, roughness: 1 }));
    ground.rotation.x = -Math.PI / 2; ground.position.y = -1.1; ground.receiveShadow = true;
    scene.add(ground);

    // instanced trees (pines + broadleaf) around the clearing
    const pineGeo = mergeGeometries([
      new THREE.CylinderGeometry(0.08, 0.12, 1.2, 6).translate(0, 0.6, 0),
      new THREE.ConeGeometry(0.8, 1.5, 12).translate(0, 1.5, 0),
      new THREE.ConeGeometry(0.62, 1.3, 12).translate(0, 2.2, 0),
      new THREE.ConeGeometry(0.45, 1.1, 12).translate(0, 2.85, 0),
      new THREE.ConeGeometry(0.26, 0.9, 10).translate(0, 3.4, 0),
    ].map((g) => g.toNonIndexed()));
    const cols = []; const pc = pineGeo.attributes.position.count;
    for (let i = 0; i < pc; i++) { const y = pineGeo.attributes.position.getY(i); const trunk = y < 0.85; cols.push(...(trunk ? [0.29, 0.2, 0.13] : [0.1 + y * 0.02, 0.24 + y * 0.03, 0.12])); }
    pineGeo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    const pineMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 });
    const N = 150; const pines = new THREE.InstancedMesh(pineGeo, pineMat, N);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p = new THREE.Vector3();
    let k = 0;
    while (k < N) {
      const a = rnd() * Math.PI * 2, r = 11 + rnd() * 34;
      const x = Math.cos(a) * r, z = Math.sin(a) * r - 8;
      if (z > -2 && Math.abs(x) < 13) continue; // keep the player's view open
      const s = 1.6 + rnd() * 1.8;
      p.set(x, -1.1, z); q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rnd() * 6); sc.set(s, s * (0.9 + rnd() * 0.5), s);
      pines.setMatrixAt(k++, m4.compose(p, q, sc));
    }
    pines.castShadow = true;
    scene.add(pines);
    // broadleaf trees
    const canopy = new THREE.IcosahedronGeometry(1, 1);
    const pa = canopy.attributes.position;
    for (let i = 0; i < pa.count; i++) { p.fromBufferAttribute(pa, i); p.multiplyScalar(0.85 + T.fbm(p.x * 2 + 5, p.y * 2 + p.z, 3) * 0.5); pa.setXYZ(i, p.x, p.y, p.z); }
    canopy.computeVertexNormals();
    const bl = new THREE.InstancedMesh(mergeGeometries([canopy.translate(0, 2.4, 0).toNonIndexed(), new THREE.CylinderGeometry(0.1, 0.16, 1.8, 6).translate(0, 0.9, 0).toNonIndexed()]), new THREE.MeshStandardMaterial({ color: 0x2d5a22, roughness: 0.9, flatShading: true }), 60);
    k = 0;
    while (k < 60) {
      const a = rnd() * Math.PI * 2, r = 10 + rnd() * 28;
      const x = Math.cos(a) * r, z = Math.sin(a) * r - 9;
      if (z > -3 && Math.abs(x) < 12) continue;
      const s = 1 + rnd() * 1.6;
      p.set(x, -1.1, z); q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rnd() * 6); sc.set(s, s, s);
      bl.setMatrixAt(k++, m4.compose(p, q, sc));
    }
    bl.castShadow = true;
    scene.add(bl);
  }

  buildLights() {
    const scene = this.scene;
    this.hemi = new THREE.HemisphereLight(0xbfd8ff, 0x2a3a18, 0.55);
    scene.add(this.hemi);
    this.key = new THREE.DirectionalLight(0xfff0d8, 2.4);
    this.key.position.set(-4, 12, -3);
    this.key.target.position.set(0, 0, 0.5);
    this.key.castShadow = true;
    this.key.shadow.mapSize.set(2048, 2048);
    const sc = this.key.shadow.camera; sc.left = -5.2; sc.right = 5.2; sc.top = 8; sc.bottom = -8; sc.near = 2; sc.far = 30;
    this.key.shadow.bias = -0.0006; this.key.shadow.normalBias = 0.02;
    scene.add(this.key, this.key.target);
    this.fill = new THREE.DirectionalLight(0x8fb4ff, 0.5);
    this.fill.position.set(5, 6, 8);
    scene.add(this.fill);
    // feature lights
    this.flameLight = new THREE.PointLight(0x4aa8ff, 6, 4.5, 1.6);
    this.flameLight.position.copy(V(L.TOWER.x, L.TOWER.y, 330));
    this.table.add(this.flameLight);
    this.castleLight = new THREE.PointLight(0xffb45a, 3, 3.5, 1.6);
    this.castleLight.position.copy(V(530, 380, 140));
    this.table.add(this.castleLight);
    this.poolLight = new THREE.PointLight(0x37c8ff, 2.5, 3, 1.5);
    this.poolLight.position.copy(V(L.pool.x, L.pool.y, 60));
    this.table.add(this.poolLight);
    this.bumperLight = new THREE.PointLight(0xd889ff, 2.5, 3.2, 1.6);
    this.bumperLight.position.copy(V(368, 230, 110));
    this.table.add(this.bumperLight);
  }

  // ---------------- playfield ----------------
  buildPlayfield() {
    const { map, bump } = T.playfieldTexture(this.maxAniso);
    const geo = new THREE.PlaneGeometry(T.PF.w * S, T.PF.h * S);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshStandardMaterial({ map, bumpMap: bump, bumpScale: 1.6, roughness: 0.62, metalness: 0.02 });
    // clear-coat look: slight specular sheen of the lacquered playfield
    this.playfieldMat = mat;
    const pf = this.mesh(geo, mat, { cast: false });
    pf.position.set(wx(T.PF.w / 2), 0, wz(T.PF.h / 2));
    this.add(pf);
    // holes (saucers)
    for (const h of L.holes) {
      const g = new THREE.Group();
      const pit = this.mesh(new THREE.CylinderGeometry(h.r * S, h.r * S * 0.8, 0.2, 24, 1, true), this.mats.black, { cast: false });
      pit.position.y = -0.1;
      const bottom = this.mesh(new THREE.CircleGeometry(h.r * S, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x000000 }), { cast: false });
      bottom.position.y = 0.002;
      const ring = this.mesh(new THREE.TorusGeometry((h.r + 2) * S, 2.2 * S, 8, 32).rotateX(Math.PI / 2), this.mats.chrome, { cast: false });
      ring.position.y = 0.01;
      const glow = new THREE.Mesh(new THREE.RingGeometry((h.r + 4) * S, (h.r + 13) * S, 40).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffffff, transparent: true, opacity: 0.9 }));
      glow.position.y = 0.004;
      g.add(pit, bottom, ring, glow);
      g.position.copy(V(h.x, h.y));
      this.add(g);
      const col = { tower: 0x55b8ff, castle: 0xffcf6a, mystery: 0xc36bff, mine: 0xffa030 }[h.id];
      this.lamp('hole_' + h.id, glow, col, 0.15, 2.6);
    }
  }

  // ---------------- walls / rails ----------------
  buildWalls() {
    const boxes = { wood: [], blade: [] };
    L.walls.forEach((w, wi) => {
      if (!w.vis) return;
      const type = wi === 0 ? 'wood' : 'blade';
      const pts = w.points; const n = w.closed ? pts.length : pts.length - 1;
      for (let i = 0; i < n; i++) boxes[type].push([pts[i], pts[(i + 1) % pts.length], type === 'wood' ? 48 : w.h, type === 'wood' ? 16 : 5]);
    });
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    for (const [type, list] of Object.entries(boxes)) {
      const mat = type === 'wood' ? this.mats.darkWood : this.mats.satin;
      const im = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), mat, list.length);
      list.forEach(([a, b, h, t], i) => {
        const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy);
        // wood shell sits outside the field line
        let ox = 0, oy = 0;
        if (type === 'wood') { const nx = dy / len, ny = -dx / len; ox = nx * t / 2; oy = ny * t / 2; }
        p.copy(V((a[0] + b[0]) / 2 + ox, (a[1] + b[1]) / 2 + oy, h / 2));
        q.setFromAxisAngle(up, -Math.atan2(dy, dx));
        s.set((len + (type === 'wood' ? 6 : 1)) * S, h * S, t * S);
        im.setMatrixAt(i, m4.compose(p, q, s));
      });
      im.castShadow = true; im.receiveShadow = true;
      this.add(im);
    }
    // chrome cap rail on top of the outer shell
    const shell = L.walls[0].points.map(([x, y]) => V(x, y, 49));
    const curve = new THREE.CatmullRomCurve3(shell, false, 'catmullrom', 0.05);
    this.add(this.mesh(new THREE.TubeGeometry(curve, 300, 4 * S, 8), this.mats.satin));
    // rounded caps on blade ends
    const caps = [];
    L.walls.forEach((w, wi) => { if (!w.vis || wi === 0) return; w.points.forEach((pt) => caps.push([pt, w.h])); });
    const capIm = new THREE.InstancedMesh(new THREE.CylinderGeometry(3 * S, 3 * S, 1, 12), this.mats.satin, caps.length);
    caps.forEach(([pt, h], i) => { p.copy(V(pt[0], pt[1], h / 2)); s.set(1, h * S, 1); capIm.setMatrixAt(i, m4.compose(p, q.identity(), s)); });
    capIm.castShadow = true;
    this.add(capIm);
  }

  // ---------------- wizard tower ----------------
  buildTower() {
    const g = new THREE.Group(); g.position.copy(V(L.TOWER.x, L.TOWER.y));
    const tw = L.TOWER;
    const ms = this.mats;
    const plinth = this.mesh(new THREE.CylinderGeometry((tw.r + 8) * S, (tw.r + 14) * S, 16 * S, 24), ms.darkStone);
    plinth.position.y = 8 * S; g.add(plinth);
    const bodyH = 270;
    const bodyGeo = new THREE.CylinderGeometry(62 * S, (tw.r - 2) * S, bodyH * S, 10, 6);
    const body = this.mesh(bodyGeo, ms.darkStone); body.position.y = (16 + bodyH / 2) * S; g.add(body);
    // buttresses
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + 0.6;
      const bt = this.mesh(new THREE.BoxGeometry(18 * S, 120 * S, 26 * S), ms.darkStone);
      bt.position.set(Math.cos(a) * 76 * S, 70 * S, Math.sin(a) * 76 * S); bt.rotation.y = -a; bt.rotation.z = 0.12 * Math.sign(Math.cos(a));
      g.add(bt);
    }
    // stone bands
    for (const y of [90, 180]) { const band = this.mesh(new THREE.TorusGeometry((tw.r - 2 - (y / bodyH) * 16) * S, 5 * S, 6, 24).rotateX(Math.PI / 2), ms.stone); band.position.y = y * S; g.add(band); }
    // top: overhang, crenellations, spikes
    const topY = (16 + bodyH) * S;
    const over = this.mesh(new THREE.CylinderGeometry(78 * S, 64 * S, 22 * S, 16), ms.darkStone); over.position.y = topY + 8 * S; g.add(over);
    const mer = new THREE.InstancedMesh(new THREE.BoxGeometry(18 * S, 22 * S, 12 * S), ms.darkStone, 12);
    const spikes = new THREE.InstancedMesh(new THREE.ConeGeometry(7 * S, 70 * S, 6), ms.iron, 6);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
    for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; q.setFromAxisAngle(up, -a); mer.setMatrixAt(i, m4.compose(new THREE.Vector3(Math.cos(a) * 72 * S, topY + 30 * S, Math.sin(a) * 72 * S), q, new THREE.Vector3(1, 1, 1))); }
    for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2 + 0.26; spikes.setMatrixAt(i, m4.compose(new THREE.Vector3(Math.cos(a) * 74 * S, topY + 70 * S, Math.sin(a) * 74 * S), q.identity(), new THREE.Vector3(1, 1, 1))); }
    mer.castShadow = spikes.castShadow = true; g.add(mer, spikes);
    // brazier + blue flame
    const bowl = this.mesh(new THREE.LatheGeometry([[0, 0], [22, 2], [36, 18], [40, 30], [34, 30]].map(([x, y]) => new THREE.Vector2(x * S, y * S)), 20), ms.iron);
    bowl.position.y = topY + 18 * S; g.add(bowl);
    this.flames = [];
    const fm = flameMaterial(0x0f3cff, 0x8fd6ff);
    for (let i = 0; i < 3; i++) {
      const f = new THREE.Mesh(new THREE.PlaneGeometry(70 * S, 130 * S), fm);
      f.position.y = topY + (36 + 65) * S; f.rotation.y = (i / 3) * Math.PI;
      f.userData.dynamic = true; g.add(f); this.flames.push(f);
    }
    this.flameMat = fm;
    this.flameGroup = g;
    // facing direction toward the door/hole
    const hole = L.holes.find((h) => h.id === 'tower');
    const fa = Math.atan2(hole.y - tw.y, hole.x - tw.x); // table angle
    const front = new THREE.Group(); front.rotation.y = -fa; g.add(front);
    // rune clock window
    const rune = new THREE.Mesh(new THREE.CircleGeometry(30 * S, 32), new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0x66c8ff, emissiveMap: T.runeTexture('#59b8ff'), map: T.runeTexture('#59b8ff'), transparent: true }));
    rune.position.set(66 * S, 205 * S, 0); rune.rotation.y = Math.PI / 2; rune.rotation.x = 0; front.add(rune);
    const runeRing = this.mesh(new THREE.TorusGeometry(31 * S, 4 * S, 8, 32), ms.iron); runeRing.position.copy(rune.position); runeRing.rotation.y = Math.PI / 2; front.add(runeRing);
    this.lamp('tower_rune', rune, 0x66c8ff, 0.5, 2.5);
    // door arch + stairs
    const archShape = new THREE.Shape(); archShape.moveTo(-22, 0); archShape.lineTo(-22, 40); archShape.absarc(0, 40, 22, Math.PI, 0, true); archShape.lineTo(22, 0); archShape.lineTo(-22, 0);
    const archGeo = new THREE.ShapeGeometry(archShape).scale(S, S, S);
    const door = new THREE.Mesh(archGeo, new THREE.MeshStandardMaterial({ color: 0x050308, emissive: 0x3a7dff, emissiveIntensity: 0 }));
    door.position.set(77 * S, 16 * S, 0); door.rotation.y = Math.PI / 2; front.add(door);
    this.lamp('tower_door', door, 0x3a7dff, 0.0, 1.6);
    const frame = this.mesh(new THREE.TorusGeometry(25 * S, 5 * S, 6, 16, Math.PI), ms.stone); frame.position.set(79 * S, 56 * S, 0); frame.rotation.y = Math.PI / 2; front.add(frame);
    for (let i = 0; i < 4; i++) { const st = this.mesh(new THREE.BoxGeometry(12 * S, (14 - i * 3.5) * S, 50 * S), ms.stone); st.position.set((84 + i * 10) * S, (7 - i * 1.75) * S, 0); front.add(st); }
    // lock runes (3 small glowing windows up the tower)
    for (let i = 0; i < 3; i++) {
      const win = new THREE.Mesh(new THREE.PlaneGeometry(10 * S, 26 * S), new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0x9a6bff }));
      const a = -0.45 + i * 0.45; const r = (74 - (i * 50 + 80) / bodyH * 16) * S;
      win.position.set(Math.cos(a) * r, (90 + i * 45) * S, Math.sin(a) * r); win.rotation.y = -a + Math.PI / 2; front.add(win);
      this.lamp('tower_lock_' + i, win, 0xb388ff, 0.15, 3.5);
    }
    this.add(g);
  }

  // ---------------- castle ----------------
  buildCastle() {
    const ms = this.mats;
    const g = new THREE.Group(); this.add(g);
    // stone base following the footprint
    const shape = new THREE.Shape(L.CASTLE_POLY.map(([x, y]) => new THREE.Vector2(wx(x), -wz(y))));
    const baseGeo = new THREE.ExtrudeGeometry(shape, { depth: 18 * S, bevelEnabled: true, bevelSize: 3 * S, bevelThickness: 3 * S, bevelSegments: 2 });
    baseGeo.rotateX(-Math.PI / 2);
    g.add(this.mesh(baseGeo, ms.lightStone));
    const tower = (x, y, r, h, roofH, banner) => {
      const t = new THREE.Group(); t.position.copy(V(x, y));
      const body = this.mesh(new THREE.CylinderGeometry(r * S, (r + 3) * S, h * S, 16), ms.lightStone); body.position.y = h / 2 * S; t.add(body);
      const ring = this.mesh(new THREE.CylinderGeometry((r + 6) * S, (r + 2) * S, 12 * S, 16), ms.lightStone); ring.position.y = (h + 4) * S; t.add(ring);
      const roof = this.mesh(new THREE.ConeGeometry((r + 9) * S, roofH * S, 16), ms.roof); roof.position.y = (h + 10 + roofH / 2) * S; t.add(roof);
      const fin = this.mesh(new THREE.SphereGeometry(3.5 * S, 8, 6), ms.gold); fin.position.y = (h + 10 + roofH + 2) * S; t.add(fin);
      // windows
      for (let i = 0; i < 2; i++) {
        const w = new THREE.Mesh(new THREE.PlaneGeometry(7 * S, 14 * S), new THREE.MeshStandardMaterial({ color: 0x110800, emissive: 0xffa040, emissiveIntensity: 1.6 }));
        const a = Math.PI / 2 + (i - 0.5) * 0.9; w.position.set(Math.cos(a) * (r + 0.5) * S, (h * 0.55 + i * 18) * S, Math.sin(a) * (r + 0.5) * S); w.rotation.y = -a + Math.PI / 2; t.add(w);
        this.castleWindows = this.castleWindows || []; this.castleWindows.push(w.material);
      }
      if (banner) { const f = new THREE.Mesh(new THREE.PlaneGeometry(26 * S, 14 * S), new THREE.MeshStandardMaterial({ color: 0x2e5bd8, side: THREE.DoubleSide, roughness: 0.8 })); f.position.set(13 * S, (h + roofH + 4) * S, 0); t.add(f); f.userData.dynamic = true; this.banners = this.banners || []; this.banners.push(f); const pole = this.mesh(new THREE.CylinderGeometry(1 * S, 1 * S, 26 * S), ms.iron); pole.position.y = (h + roofH + 4) * S; t.add(pole); }
      g.add(t); return t;
    };
    // keep
    const keep = new THREE.Group(); keep.position.copy(V(540, 285)); g.add(keep);
    const kb = this.mesh(new THREE.BoxGeometry(130 * S, 150 * S, 150 * S), ms.lightStone); kb.position.y = 93 * S; keep.add(kb);
    const roofShape = new THREE.Shape([new THREE.Vector2(-72 * S, 0), new THREE.Vector2(72 * S, 0), new THREE.Vector2(0, 70 * S)]);
    const rg = new THREE.ExtrudeGeometry(roofShape, { depth: 160 * S, bevelEnabled: false }); rg.translate(0, 0, -80 * S);
    const kroof = this.mesh(rg, ms.roof); kroof.position.y = 168 * S; keep.add(kroof);
    for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) {
      const w = new THREE.Mesh(new THREE.PlaneGeometry(14 * S, 22 * S), new THREE.MeshStandardMaterial({ color: 0x110800, emissive: 0xffa040, emissiveIntensity: 1.8 }));
      w.position.set((-40 + i * 40) * S, (70 + j * 46) * S, 75.5 * S); keep.add(w);
      this.castleWindows = this.castleWindows || []; this.castleWindows.push(w.material);
    }
    // balcony + princess
    const bal = this.mesh(new THREE.BoxGeometry(56 * S, 6 * S, 20 * S), ms.lightStone); bal.position.set(0, 140 * S, 84 * S); keep.add(bal);
    const princess = new THREE.Group(); princess.position.set(0, 143 * S, 84 * S);
    const pinkMat = new THREE.MeshStandardMaterial({ color: 0xff7ab8, roughness: 0.5, emissive: 0xff4fa0, emissiveIntensity: 0.1 });
    const dress = this.mesh(new THREE.ConeGeometry(9 * S, 28 * S, 12), pinkMat); dress.position.y = 14 * S; princess.add(dress);
    const head = this.mesh(new THREE.SphereGeometry(5 * S, 12, 10), new THREE.MeshStandardMaterial({ color: 0xffd7b5 })); head.position.y = 32 * S; princess.add(head);
    const hair = this.mesh(new THREE.SphereGeometry(5.6 * S, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.6), new THREE.MeshStandardMaterial({ color: 0xf2c14e })); hair.position.y = 33 * S; princess.add(hair);
    const crown = this.mesh(new THREE.CylinderGeometry(3.5 * S, 4 * S, 4 * S, 6, 1, true), ms.gold); crown.position.y = 38 * S; princess.add(crown);
    princess.userData.dynamic = true;
    keep.add(princess);
    this.princess = princess; this.princessMat = pinkMat;
    // towers
    tower(482, 172, 30, 230, 110, true);
    tower(606, 196, 26, 205, 95, true);
    tower(618, 410, 24, 130, 70);
    tower(458, 425, 22, 120, 66);
    // front curtain wall with gate towers
    const wall = this.mesh(new THREE.BoxGeometry(110 * S, 70 * S, 18 * S), ms.lightStone); wall.position.copy(V(505, 452, 35)); g.add(wall);
    const merG = new THREE.BoxGeometry(12 * S, 14 * S, 18 * S);
    for (let i = 0; i < 8; i++) { const mm = this.mesh(merG, ms.lightStone); mm.position.copy(V(455 + i * 14.3, 452, 77)); g.add(mm); }
    tower(472, 458, 16, 104, 50); tower(538, 458, 16, 104, 50);
    // gate opening (dark) and portcullis
    const gateDark = new THREE.Mesh(new THREE.PlaneGeometry(46 * S, 52 * S), new THREE.MeshStandardMaterial({ color: 0x080503, emissive: 0xffb24a, emissiveIntensity: 0 }));
    gateDark.position.copy(V(505, 461.5, 26)); g.add(gateDark);
    this.lamp('castle_inside', gateDark, 0xffb24a, 0, 2.2);
    const port = new THREE.Group();
    const barG = new THREE.BoxGeometry(3 * S, 52 * S, 3 * S), barH = new THREE.BoxGeometry(46 * S, 3 * S, 3 * S);
    for (let i = 0; i < 6; i++) { const b = this.mesh(barG, ms.iron); b.position.set((-20 + i * 8) * S, 26 * S, 0); port.add(b); }
    for (let i = 0; i < 4; i++) { const b = this.mesh(barH, ms.iron); b.position.set(0, (8 + i * 13) * S, 0); port.add(b); }
    port.position.copy(V(505, 466, 0)); g.add(port);
    port.userData.dynamic = true;
    this.portcullis = port; this.portOpen = 0; this.portTarget = 0;
    // castle gate progress lamps (on the wall)
    for (let i = 0; i < 3; i++) {
      const l = new THREE.Mesh(new THREE.SphereGeometry(5 * S, 12, 8), new THREE.MeshStandardMaterial({ color: 0x221100, emissive: 0xffc34a }));
      l.position.copy(V(485 + i * 20, 462, 62)); g.add(l);
      this.lamp('castle_gate_' + i, l, 0xffc34a, 0.1, 3.5);
    }
    // ivy patches
    const ivy = new THREE.MeshStandardMaterial({ color: 0x2f6b25, roughness: 0.9 });
    for (let i = 0; i < 18; i++) { const s = this.mesh(new THREE.SphereGeometry((6 + rnd() * 8) * S, 6, 5), ivy); const x = 450 + rnd() * 170, y = 220 + rnd() * 230; s.position.copy(V(x, y, 14 + rnd() * 40)); s.scale.y = 0.5; g.add(s); }
  }

  // ---------------- mushroom bumpers ----------------
  buildMushrooms() {
    this.bumperMeshes = [];
    for (const b of L.bumpers) {
      const g = new THREE.Group(); g.position.copy(V(b.x, b.y));
      const base = this.mesh(new THREE.CylinderGeometry((b.r + 4) * S, (b.r + 6) * S, 8 * S, 24), this.mats.chrome); base.position.y = 4 * S; g.add(base);
      const ring = this.mesh(new THREE.TorusGeometry((b.r + 1) * S, 3 * S, 8, 32).rotateX(Math.PI / 2), this.mats.satin); ring.position.y = 16 * S; g.add(ring);
      const stem = this.mesh(new THREE.LatheGeometry([[16, 0], [13, 10], [11, 26], [12, 40], [10, 48]].map(([x, y]) => new THREE.Vector2(x * S, y * S)), 20),
        new THREE.MeshStandardMaterial({ color: 0xf2e6cc, roughness: 0.6, emissive: 0xfff1d0, emissiveIntensity: 0.15 }));
      stem.position.y = 6 * S; g.add(stem);
      const cap = [];
      for (let i = 0; i <= 12; i++) { const a = (i / 12) * Math.PI / 2; cap.push(new THREE.Vector2(Math.sin(a) * (b.r + 12) * S, (Math.cos(a) * 32 - (i === 12 ? 4 : 0)) * S)); }
      cap.push(new THREE.Vector2((b.r + 8) * S, -6 * S), new THREE.Vector2(10 * S, -2 * S));
      const capTex = T.capTexture(b.color);
      const capMat = new THREE.MeshPhysicalMaterial({ map: capTex, emissiveMap: capTex, emissive: 0xffffff, emissiveIntensity: 0.35, roughness: 0.35, clearcoat: 0.6 });
      const capM = this.mesh(new THREE.LatheGeometry(cap.reverse(), 32), capMat); capM.position.y = 52 * S; g.add(capM);
      // gills glow underneath
      const gill = new THREE.Mesh(new THREE.CircleGeometry((b.r + 8) * S, 32).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: new THREE.Color(b.color).multiplyScalar(0.8) }));
      gill.position.y = 46.5 * S; g.add(gill);
      this.add(g);
      g.userData.dynamic = true;
      this.bumperMeshes.push({ g, capM, capMat, flash: 0, color: b.color, b });
    }
  }

  // ---------------- ramps ----------------
  railFrames(rail, step = 1) {
    const S2 = rail.samples; const out = [];
    for (let i = 0; i < S2.length; i += step) {
      const a = S2[Math.max(0, i - 1)], b = S2[Math.min(S2.length - 1, i + 1)], c = S2[i];
      const T3 = new THREE.Vector3(wx(b.x) - wx(a.x), (b.h - a.h) * S, wz(b.y) - wz(a.y)).normalize();
      const side = new THREE.Vector3().crossVectors(T3, new THREE.Vector3(0, 1, 0)).normalize();
      const N = new THREE.Vector3().crossVectors(side, T3).normalize();
      out.push({ P: V(c.x, c.y, c.h + R), T: T3, side, N, h: c.h, s: c.s });
    }
    return out;
  }
  trough(frames, mat, half = 19, wall = 10) {
    const prof = [[-half, wall]];
    for (let i = 0; i <= 10; i++) { const a = Math.PI + (i / 10) * Math.PI; prof.push([Math.cos(a) * (R + 3), Math.sin(a) * (R + 3)]); }
    prof.push([half, wall]);
    const pos = [], uv = [], idx = [];
    frames.forEach((f, i) => {
      prof.forEach(([sx, sy], j) => {
        const p = f.P.clone().addScaledVector(f.side, sx * S).addScaledVector(f.N, sy * S);
        pos.push(p.x, p.y, p.z); uv.push(j / (prof.length - 1), f.s / 120);
      });
      if (i > 0) for (let j = 0; j < prof.length - 1; j++) {
        const a = (i - 1) * prof.length + j, b = a + 1, c = i * prof.length + j, d = c + 1;
        idx.push(a, c, b, b, c, d);
      }
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx); g.computeVertexNormals();
    return new THREE.Mesh(g, mat);
  }
  wire(frames, sx, sy, r, mat) {
    const pts = frames.map((f) => f.P.clone().addScaledVector(f.side, sx * S).addScaledVector(f.N, sy * S));
    const c = new THREE.CatmullRomCurve3(pts);
    const m = this.mesh(new THREE.TubeGeometry(c, Math.max(20, pts.length * 2), r * S, 6), mat, { recv: false });
    return m;
  }
  supports(frames, every = 9) {
    const g = [];
    for (let i = every; i < frames.length - 2; i += every) {
      const f = frames[i]; if (f.h < 25) continue;
      const len = f.h * S;
      const c = new THREE.CylinderGeometry(2.2 * S, 2.8 * S, len, 6); c.translate(f.P.x, len / 2, f.P.z);
      g.push(c);
    }
    if (g.length) this.add(this.mesh(mergeGeometries(g), this.mats.satin));
  }
  buildRampMeshes(rails) {
    // tower ramp: steel entry trough, then a 4-wire habitrail with the glittering corkscrew
    const tf = this.railFrames(rails.tower, 2);
    const cut = Math.floor(tf.length * 0.3);
    const plate = this.trough(tf.slice(0, cut + 1), new THREE.MeshStandardMaterial({ color: 0xaab2bd, metalness: 0.95, roughness: 0.3, side: THREE.DoubleSide }), 20, 12);
    plate.castShadow = true; this.add(plate);
    const wf = tf.slice(cut);
    const glitterTex = T.glitterTexture();
    const sparkle = new THREE.MeshStandardMaterial({ color: 0xcfe9ff, metalness: 1, roughness: 0.22, emissive: 0x3a78ff, emissiveIntensity: 0.12 });
    for (const [sx, sy] of [[-15, -6], [15, -6], [-17, 8], [17, 8]]) this.add(this.wire(wf, sx, sy, 2.1, sparkle));
    for (const [sx, sy] of [[-21, 12], [21, 12]]) this.add(this.wire(tf.slice(0, cut + 1), sx, sy, 2.4, this.mats.chrome));
    this.supports(tf, 6);
    // crystal ramp: transparent glittering trough with steel edges
    const cf = this.railFrames(rails.crystal, 2);
    glitterTex.repeat.set(1, 1);
    const crystalMat = new THREE.MeshPhysicalMaterial({ color: 0x7fd8ff, map: glitterTex, emissive: 0x2a8cff, emissiveMap: glitterTex, emissiveIntensity: 0.55, roughness: 0.08, metalness: 0.1, transparent: true, opacity: 0.62, side: THREE.DoubleSide, depthWrite: false, clearcoat: 1 });
    const cr = this.trough(cf, crystalMat, 21, 12); cr.renderOrder = 2; this.add(cr);
    this.crystalMat = crystalMat;
    for (const sx of [-22, 22]) this.add(this.wire(cf, sx, 12, 2.6, this.mats.chrome));
    this.supports(cf, 7);
    // crystal shards along the ramp start
    const shardMat = new THREE.MeshPhysicalMaterial({ color: 0x9ae6ff, emissive: 0x3aa0ff, emissiveIntensity: 0.6, roughness: 0.05, transparent: true, opacity: 0.85, flatShading: true });
    for (let i = 0; i < 9; i++) {
      const sh = this.mesh(new THREE.OctahedronGeometry((8 + rnd() * 9) * S, 0), shardMat);
      const x = 694 + rnd() * 30, y = 520 + rnd() * 300;
      sh.position.copy(V(x, y, 10)); sh.scale.y = 2 + rnd() * 1.4; sh.rotation.set(rnd() * 0.5, rnd() * 3, rnd() * 0.5 - 0.25);
      this.add(sh);
    }
    this.lamp('crystal_glow', cr, 0x2a8cff, 0.55, 2.4);
  }

  // ---------------- magic pool ----------------
  buildPool() {
    const P = L.pool;
    this.waterMat = waterMaterial();
    const w = new THREE.Mesh(new THREE.CircleGeometry(P.r * S, 64).rotateX(-Math.PI / 2), this.waterMat);
    w.position.copy(V(P.x, P.y, 0.6)); w.renderOrder = 1; w.userData.dynamic = true;
    this.add(w);
  }

  // ---------------- dwarf mine ----------------
  rockGeo(r, seed) {
    const g = new THREE.IcosahedronGeometry(r, 2);
    const p = g.attributes.position, v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); const n = T.fbm(v.x * 9 + seed, v.y * 9 + v.z * 7, 4); v.multiplyScalar(0.72 + n * 0.55); p.setXYZ(i, v.x, v.y, v.z); }
    g.computeVertexNormals();
    return g;
  }
  buildMine() {
    const ms = this.mats;
    const rocks = [];
    const poly = L.MINE_POLY;
    const cx = poly.reduce((s, p) => s + p[0], 0) / poly.length, cy = poly.reduce((s, p) => s + p[1], 0) / poly.length;
    rocks.push([cx - 6, cy, 82, 70]);
    for (const [x, y] of poly) rocks.push([x + (cx - x) * 0.18, y + (cy - y) * 0.18, 34 + rnd() * 10, 30]);
    rocks.push([cx - 30, cy - 40, 50, 60], [cx + 10, cy + 40, 46, 45], [cx - 40, cy + 30, 44, 40]);
    const geos = rocks.map(([x, y, r, h], i) => { const g = this.rockGeo(r * S, i * 3.1); g.scale(1, h / r, 1); g.translate(wx(x), h * 0.35 * S, wz(y)); return g.toNonIndexed(); });
    this.add(this.mesh(mergeGeometries(geos), ms.rock));
    // timber entrance on the right face, facing the hole
    const hole = L.holes.find((h) => h.id === 'mine');
    const ent = new THREE.Group(); ent.position.copy(V(hole.x - 24, hole.y)); ent.rotation.y = 0;
    const post = new THREE.BoxGeometry(9 * S, 66 * S, 9 * S);
    const p1 = this.mesh(post, ms.wood); p1.position.set(0, 33 * S, -26 * S); ent.add(p1);
    const p2 = this.mesh(post, ms.wood); p2.position.set(0, 33 * S, 26 * S); ent.add(p2);
    const lintel = this.mesh(new THREE.BoxGeometry(12 * S, 10 * S, 70 * S), ms.wood); lintel.position.set(0, 68 * S, 0); ent.add(lintel);
    const dark = new THREE.Mesh(new THREE.PlaneGeometry(46 * S, 60 * S), new THREE.MeshStandardMaterial({ color: 0x050302, emissive: 0xff9a2a, emissiveIntensity: 0 }));
    dark.position.set(-4 * S, 30 * S, 0); dark.rotation.y = Math.PI / 2; ent.add(dark);
    this.lamp('mine_inside', dark, 0xff9a2a, 0, 2.5);
    // lantern
    const lan = new THREE.Mesh(new THREE.SphereGeometry(5 * S, 10, 8), new THREE.MeshStandardMaterial({ color: 0x331a00, emissive: 0xffb347, emissiveIntensity: 2 }));
    lan.position.set(6 * S, 58 * S, 30 * S); ent.add(lan);
    // mine cart rails coming out
    for (const z of [-9, 9]) { const r = this.mesh(new THREE.BoxGeometry(60 * S, 2 * S, 2.5 * S), ms.iron); r.position.set(30 * S, 1.5 * S, z * S); ent.add(r); }
    for (let i = 0; i < 5; i++) { const sl = this.mesh(new THREE.BoxGeometry(5 * S, 2 * S, 28 * S), ms.wood); sl.position.set((6 + i * 12) * S, 0.8 * S, 0); ent.add(sl); }
    // gold nuggets
    for (let i = 0; i < 7; i++) { const n = this.mesh(new THREE.DodecahedronGeometry((3 + rnd() * 3) * S), ms.gold); n.position.set((10 + rnd() * 30) * S, 3 * S, (rnd() - 0.5) * 40 * S); ent.add(n); }
    this.add(ent);
  }

  // ---------------- prince's bastion ----------------
  shieldGeo(w, h, d) {
    const s = new THREE.Shape();
    s.moveTo(-w / 2, h / 2); s.lineTo(w / 2, h / 2); s.lineTo(w / 2, 0); s.quadraticCurveTo(w / 2, -h * 0.35, 0, -h / 2); s.quadraticCurveTo(-w / 2, -h * 0.35, -w / 2, 0); s.closePath();
    return new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: true, bevelSize: d * 0.4, bevelThickness: d * 0.4, bevelSegments: 2 });
  }
  buildBastion() {
    const shape = new THREE.Shape(L.BASTION_POLY.map(([x, y]) => new THREE.Vector2(wx(x), -wz(y))));
    const geo = new THREE.ExtrudeGeometry(shape, { depth: 46 * S, bevelEnabled: true, bevelSize: 4 * S, bevelThickness: 4 * S, bevelSegments: 2 });
    geo.rotateX(-Math.PI / 2);
    this.add(this.mesh(geo, this.mats.lightStone));
    // crenellations on top edge
    const pts = L.BASTION_POLY;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      const n = Math.floor(Math.hypot(b[0] - a[0], b[1] - a[1]) / 22);
      for (let k = 0; k < n; k++) {
        const f = (k + 0.5) / n; const m = this.mesh(new THREE.BoxGeometry(10 * S, 12 * S, 10 * S), this.mats.lightStone);
        m.position.copy(V(a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, 56)); this.add(m);
      }
    }
    // sword + banner in the middle
    const sw = new THREE.Group(); sw.position.copy(V(512, 885, 50));
    const blade = this.mesh(new THREE.BoxGeometry(5 * S, 70 * S, 1.5 * S), this.mats.chrome); blade.position.y = 35 * S; sw.add(blade);
    const guard = this.mesh(new THREE.BoxGeometry(26 * S, 4 * S, 4 * S), this.mats.gold); guard.position.y = 72 * S; sw.add(guard);
    const hilt = this.mesh(new THREE.CylinderGeometry(2 * S, 2 * S, 16 * S), this.mats.darkWood); hilt.position.y = 82 * S; sw.add(hilt);
    const pom = this.mesh(new THREE.SphereGeometry(3.5 * S), this.mats.gold); pom.position.y = 91 * S; sw.add(pom);
    sw.rotation.z = 0.1; this.add(sw);
    // shield stand-up targets
    this.shieldMeshes = [];
    const sgeo = this.shieldGeo(34 * S, 40 * S, 5 * S);
    L.shieldTargets.forEach((t, i) => {
      const mat = new THREE.MeshStandardMaterial({ color: 0x9c1b1b, metalness: 0.3, roughness: 0.4, emissive: 0xff3a2a, emissiveIntensity: 0.1 });
      const g = new THREE.Group(); g.position.copy(V(t.cx + t.nx * 6, t.cy + t.ny * 6, 26));
      g.rotation.y = Math.atan2(t.nx, t.ny);
      const sh = this.mesh(sgeo, mat); g.add(sh);
      const rim = this.mesh(new THREE.TorusGeometry(10 * S, 2 * S, 6, 16), this.mats.gold); rim.position.z = 8 * S; g.add(rim);
      this.add(g);
      g.userData.dynamic = true;
      this.shieldMeshes.push({ g, mat, hit: 0 });
      this.lamp('shield_' + i, sh, 0xff3a2a, 0.1, 2.2);
    });
  }

  // ---------------- drop targets & castle gate ----------------
  buildTargets() {
    this.dropMeshes = [];
    const geo = this.shieldGeo(28 * S, 34 * S, 5 * S);
    for (const d of L.dropTargets) {
      const mat = new THREE.MeshStandardMaterial({ color: 0x2a4ea8, metalness: 0.4, roughness: 0.35, emissive: 0x4f8bff, emissiveIntensity: 0.15 });
      const g = new THREE.Group(); g.position.copy(V(d.cx, d.cy, 18));
      g.rotation.y = Math.atan2(d.nx, d.ny);
      const sh = this.mesh(geo, mat); g.add(sh);
      const boss = this.mesh(new THREE.SphereGeometry(5 * S, 10, 8), this.mats.gold); boss.position.z = 8 * S; g.add(boss);
      this.add(g);
      g.userData.dynamic = true;
      this.dropMeshes.push({ g, down: 0, target: 0, mat });
      this.lamp('drop_' + d.i, sh, 0x4f8bff, 0.15, 2.2);
    }
  }

  // ---------------- flippers ----------------
  flipperGeo(len, r0, r1, height) {
    const s = new THREE.Shape();
    const a = Math.asin((r0 - r1) / len);
    s.absarc(0, 0, r0, Math.PI / 2 + a, Math.PI * 1.5 - a, false);
    s.absarc(len, 0, r1, -Math.PI / 2 - a, Math.PI / 2 + a, false);
    s.closePath();
    const g = new THREE.ExtrudeGeometry(s, { depth: height, bevelEnabled: true, bevelSize: 1.6, bevelThickness: 1.6, bevelSegments: 3, curveSegments: 16 });
    g.rotateX(Math.PI / 2); g.translate(0, height + 1.6, 0); g.scale(S, S, S);
    return g;
  }
  buildFlippers() {
    this.flipperMeshes = [];
    for (const f of L.flippers) {
      const g = new THREE.Group(); g.position.copy(V(f.x, f.y));
      const body = this.mesh(this.flipperGeo(f.len, f.r0 - 2.5, f.r1 - 2.5, 14), this.mats.plasticWhite); body.position.y = 2 * S; g.add(body);
      const rub = this.mesh(this.flipperGeo(f.len, f.r0, f.r1, 6), this.mats.redRubber); rub.position.y = 6 * S; g.add(rub);
      const cap = this.mesh(new THREE.CylinderGeometry(6 * S, 6 * S, 4 * S, 16), this.mats.chrome); cap.position.y = 21 * S; g.add(cap);
      const logo = new THREE.Mesh(new THREE.CircleGeometry(3.5 * S, 16).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x1a3d8f, emissive: 0x3366ff, emissiveIntensity: 0.4 }));
      logo.position.set(f.len * 0.55 * S, 19.8 * S, 0); g.add(logo);
      g.userData.dynamic = true;
      this.add(g);
      this.flipperMeshes.push(g);
    }
  }

  // ---------------- slings / posts ----------------
  buildSlingsPosts() {
    this.slingMeshes = [];
    const sides = [
      { pts: L.SLING_L, face: [L.SLING_L[0], L.SLING_L[2]], col: 0x46b0ff },
      { pts: L.SLING_R, face: [L.SLING_R[0], L.SLING_R[2]], col: 0xff8a3a },
    ];
    for (const sd of sides) {
      const shape = new THREE.Shape(sd.pts.map(([x, y]) => new THREE.Vector2(wx(x), -wz(y))));
      const geo = new THREE.ExtrudeGeometry(shape, { depth: 30 * S, bevelEnabled: true, bevelSize: 3 * S, bevelThickness: 2 * S }); geo.rotateX(-Math.PI / 2);
      const mat = new THREE.MeshPhysicalMaterial({ color: 0x222222, emissive: sd.col, emissiveIntensity: 0.4, roughness: 0.15, transparent: true, opacity: 0.88, clearcoat: 1 });
      this.add(this.mesh(geo, mat));
      // white rubber band along the kicking face
      const [a, b] = sd.face; const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const band = this.mesh(new THREE.BoxGeometry(len * S, 9 * S, 5 * S), this.mats.rubber);
      const nx = -(b[1] - a[1]) / len, ny = (b[0] - a[0]) / len; const sgn = (L.CX - (a[0] + b[0]) / 2) * nx > 0 ? 1 : -1;
      band.position.copy(V((a[0] + b[0]) / 2 + nx * sgn * 5, (a[1] + b[1]) / 2 + ny * sgn * 5, 16));
      band.rotation.y = -Math.atan2(b[1] - a[1], b[0] - a[0]);
      band.userData.dynamic = true;
      this.add(band);
      this.slingMeshes.push({ band, mat, base: band.position.clone(), n: new THREE.Vector3(nx * sgn, 0, ny * sgn), kick: 0 });
    }
    // rubber posts
    for (const p of L.posts) {
      const g = new THREE.Group(); g.position.copy(V(p.x, p.y));
      const post = this.mesh(new THREE.CylinderGeometry(p.r * 0.6 * S, p.r * 0.7 * S, 34 * S, 12), this.mats.chrome); post.position.y = 17 * S; g.add(post);
      const ring = this.mesh(new THREE.TorusGeometry(p.r * S, 3 * S, 8, 20).rotateX(Math.PI / 2), this.mats.rubber); ring.position.y = 14 * S; g.add(ring);
      const top = this.mesh(new THREE.SphereGeometry(p.r * 0.75 * S, 12, 8), this.mats.gold); top.position.y = 35 * S; g.add(top);
      this.add(g);
    }
  }

  // ---------------- spinner ----------------
  buildSpinner() {
    const sp = L.spinner;
    const g = new THREE.Group(); g.position.copy(V(sp.x, sp.y, 40));
    const bar = this.mesh(new THREE.CylinderGeometry(2.5 * S, 2.5 * S, 86 * S, 8).rotateZ(Math.PI / 2), this.mats.chrome); g.add(bar);
    for (const sx of [-42, 42]) { const pst = this.mesh(new THREE.CylinderGeometry(2.5 * S, 2.5 * S, 42 * S, 8), this.mats.chrome); pst.position.set(sx * S, -21 * S, 0); g.add(pst); }
    const plateG = new THREE.Group();
    const plateMat = new THREE.MeshStandardMaterial({ color: 0xffcc40, metalness: 0.9, roughness: 0.25, emissive: 0xffb020, emissiveIntensity: 0.2 });
    const plate = this.mesh(new THREE.BoxGeometry(70 * S, 26 * S, 2 * S), plateMat); plate.position.y = -14 * S; plateG.add(plate);
    const fairy = new THREE.Mesh(new THREE.CircleGeometry(8 * S, 16), new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0x9fffd8, emissiveIntensity: 1.5, side: THREE.DoubleSide }));
    fairy.position.set(0, -14 * S, 1.2 * S); plateG.add(fairy);
    g.add(plateG);
    g.userData.dynamic = true;
    this.spinnerPlate = plateG; this.spinnerMat = plateMat; this.spinnerAngle = 0; this.spinnerVel = 0;
    this.add(g);
  }

  // ---------------- inserts / lamps ----------------
  insert(name, x, y, rot, color, size = 22, texture) {
    const mat = new THREE.MeshStandardMaterial({ color: 0x0b0b0b, map: texture || this.arrowTex, transparent: true, emissiveMap: texture || this.arrowTex, roughness: 0.2, depthWrite: false });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(size * S, size * S * 1.2).rotateX(-Math.PI / 2), mat);
    m.position.copy(V(x, y, 0.8)); m.rotation.y = rot; m.renderOrder = 1;
    this.add(m);
    return this.lamp(name, m, color, 0.12, 3.4);
  }
  buildInserts() {
    this.arrowTex = T.arrowTexture();
    const ang = (dx, dy) => Math.atan2(-dx, -dy); // arrow points along table direction (dx,dy)
    // shot arrows
    this.insert('arrow_towerRamp', 318, 500, ang(0, -1), 0x9ad0ff, 26);
    this.insert('arrow_towerHole', 270, 490, ang(-0.4, -1), 0x6ab8ff, 24);
    this.insert('arrow_castle', 505, 530, ang(0, -1), 0xffc34a, 26);
    this.insert('arrow_crystal', 648, 650, ang(0.15, -1), 0x39d6ff, 24);
    this.insert('arrow_orbit', 70, 470, ang(0, -1), 0xa8ff6a, 24);
    this.insert('arrow_mystery', 520, 585, ang(0.1, 1), 0xd27bff, 20);
    this.insert('arrow_mine', 336, 892, ang(-1, 0.1), 0xffa030, 22);
    this.insert('arrow_bumpers', 380, 380, ang(0, -1), 0xff8adf, 24);
    // dwarf lights (7)
    const dcol = [0xff3030, 0x30ff60, 0xffd030, 0xff3030, 0x30ff60, 0xffd030, 0xff3030];
    for (let i = 0; i < 7; i++) {
      const x = 182 + i * 23, y = 995 - Math.sin((i / 6) * Math.PI) * 10;
      const mat = new THREE.MeshPhysicalMaterial({ color: 0x111111, roughness: 0.1, clearcoat: 1, transparent: true, opacity: 0.95 });
      const dome = this.mesh(new THREE.SphereGeometry(8 * S, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat, { cast: false });
      dome.position.copy(V(x, y, 0)); this.add(dome);
      this.lamp('dwarf_' + i, dome, dcol[i], 0.12, 3.5);
    }
    // M-A-G-E lane letters
    for (const r of L.rollovers) {
      this.insert('mage_' + r.id, r.x, r.y + 26, 0, 0xffd27a, 26, T.letterTexture(r.id));
      const wire = this.mesh(new THREE.TorusGeometry(10 * S, 1.2 * S, 6, 16, Math.PI).rotateY(Math.PI / 2), this.mats.chrome); wire.position.copy(V(r.x, r.y, 0)); this.add(wire);
    }
    // kickback lamps
    for (const k of L.kickbacks) {
      this.insert('kick_' + k.side, k.x, k.y - 40, 0, 0x6dff8a, 20);
      const plate = this.mesh(new THREE.BoxGeometry(20 * S, 6 * S, 12 * S), this.mats.iron); plate.position.copy(V(k.x, k.y + 18, 3)); this.add(plate);
    }
    // bonus multiplier inserts (bottom centre)
    ['2', '3', '4', '5'].forEach((n, i) => this.insert('bx_' + n, 320 + i * 28, 1120, 0, 0xfff0a0, 22, T.letterTexture(n)));
    // shoot again / ball save
    this.insert('ballsave', 362, 1160, 0, 0xff6b6b, 26, T.letterTexture('★'));
    // tower lock / castle progress floor lamps near shots
    for (let i = 0; i < 3; i++) this.insert('lockf_' + i, 236 + i * 16, 520, 0, 0xb388ff, 12, T.softDot());
    for (let i = 0; i < 3; i++) this.insert('gatef_' + i, 488 + i * 17, 560, 0, 0xffc34a, 12, T.softDot());
  }

  // ---------------- plunger ----------------
  buildPlunger() {
    const g = new THREE.Group(); g.position.copy(V(L.PLUNGER.x, L.PLUNGER.y + R + 2, R));
    const tip = this.mesh(new THREE.CylinderGeometry(9 * S, 9 * S, 10 * S, 16).rotateX(Math.PI / 2), this.mats.iron); tip.position.z = 5 * S; g.add(tip);
    const rod = this.mesh(new THREE.CylinderGeometry(3 * S, 3 * S, 90 * S, 10).rotateX(Math.PI / 2), this.mats.chrome); rod.position.z = 50 * S; g.add(rod);
    const coil = [];
    for (let i = 0; i <= 120; i++) { const a = i / 120 * Math.PI * 2 * 9; coil.push(new THREE.Vector3(Math.cos(a) * 7 * S, Math.sin(a) * 7 * S, (12 + i / 120 * 50) * S)); }
    this.spring = this.mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(coil), 240, 1.3 * S, 5), this.mats.chrome); g.add(this.spring);
    const knob = this.mesh(new THREE.SphereGeometry(12 * S, 16, 12), new THREE.MeshPhysicalMaterial({ color: 0xc41620, roughness: 0.2, clearcoat: 1 })); knob.position.z = 98 * S; g.add(knob);
    g.userData.dynamic = true;
    this.plungerG = g; this.plungerBase = g.position.z;
    this.add(g);
    // lane floor stripe (steel)
    const lane = this.mesh(new THREE.PlaneGeometry(40 * S, 900 * S).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x3a3226, roughness: 0.6, metalness: 0.3 }), { cast: false });
    lane.position.copy(V(713, 850, 0.3)); this.add(lane);
  }

  // ---------------- cabinet ----------------
  buildCabinet() {
    const ms = this.mats;
    const w = (L.FIELD.right - L.FIELD.left + 100) * S, len = 1420 * S, cx = wx((L.FIELD.left + L.FIELD.right) / 2), cz = wz(670);
    // body under the playfield
    const body = this.mesh(new THREE.BoxGeometry(w, 100 * S, len), ms.darkWood); body.position.set(cx, -52 * S, cz); this.add(body);
    // side rails
    for (const side of [-1, 1]) {
      const rail = this.mesh(new THREE.BoxGeometry(30 * S, 70 * S, len), ms.darkWood); rail.position.set(cx + side * (w / 2 - 15 * S), 20 * S, cz); this.add(rail);
      const trim = this.mesh(new THREE.BoxGeometry(5 * S, 5 * S, len), ms.brass); trim.position.set(cx + side * (w / 2 - 28 * S), 56 * S, cz); this.add(trim);
    }
    // apron with lockdown bar
    const apronShape = new THREE.Shape();
    apronShape.moveTo(wx(L.FIELD.left), -wz(1350)); apronShape.lineTo(wx(L.FIELD.left), -wz(1236)); apronShape.lineTo(wx(225), -wz(1238));
    apronShape.quadraticCurveTo(wx(L.CX), -wz(1262), wx(m2(225)), -wz(1238)); apronShape.lineTo(wx(L.FIELD.laneX), -wz(1236)); apronShape.lineTo(wx(L.FIELD.laneX), -wz(1350)); apronShape.closePath();
    function m2(x) { return 2 * L.CX - x; }
    const ag = new THREE.ExtrudeGeometry(apronShape, { depth: 14 * S, bevelEnabled: true, bevelSize: 2 * S, bevelThickness: 2 * S }); ag.rotateX(-Math.PI / 2);
    this.add(this.mesh(ag, new THREE.MeshStandardMaterial({ color: 0x1c140c, roughness: 0.5, metalness: 0.4 })));
    const lock = this.mesh(new THREE.BoxGeometry(w, 26 * S, 40 * S), ms.darkWood); lock.position.set(cx, 30 * S, wz(1345)); this.add(lock);
    // top board
    const top = this.mesh(new THREE.BoxGeometry(w, 70 * S, 30 * S), ms.darkWood); top.position.set(cx, 20 * S, wz(20)); this.add(top);
    // gold trim around the playfield edge (the wooden frame of the concept art)
    const trimG = new THREE.MeshStandardMaterial({ color: 0xd9a74a, metalness: 1, roughness: 0.3 });

  }

  // ---------------- decor (ferns, stumps, rocks, mini trees on the table corners) ----------------
  buildDecor() {
    const ms = this.mats;
    const fern = (x, y, s = 1) => {
      const g = new THREE.Group(); g.position.copy(V(x, y));
      const leafG = new THREE.SphereGeometry(1, 8, 4); leafG.scale(4 * S, 1.2 * S, 30 * S); leafG.translate(0, 0, 26 * S);
      for (let i = 0; i < 11; i++) {
        const l = this.mesh(leafG, i % 2 ? ms.leaf : ms.darkLeaf);
        l.rotation.y = (i / 11) * Math.PI * 2 + rnd() * 0.3; l.rotation.x = -0.5 - rnd() * 0.4; l.position.y = 4 * S;
        l.scale.setScalar(s * (0.8 + rnd() * 0.4)); g.add(l);
      }
      this.add(g);
    };
    const stump = (x, y, r, h) => {
      const g = new THREE.Group(); g.position.copy(V(x, y));
      const st = this.mesh(new THREE.CylinderGeometry(r * S, r * 1.25 * S, h * S, 12), ms.bark); st.position.y = h / 2 * S; g.add(st);
      const topM = this.mesh(new THREE.CircleGeometry(r * S, 12).rotateX(-Math.PI / 2), ms.wood); topM.position.y = h * S + 0.001; g.add(topM);
      const moss = this.mesh(new THREE.SphereGeometry(r * 0.8 * S, 8, 6), new THREE.MeshStandardMaterial({ color: 0x3f7a2a, roughness: 1 })); moss.scale.y = 0.35; moss.position.set(r * 0.3 * S, h * S, 0); g.add(moss);
      this.add(g);
    };
    const rock = (x, y, r) => { const m = this.mesh(this.rockGeo(r * S, x + y), ms.rock); m.position.copy(V(x, y, r * 0.3)); m.scale.y = 0.7; this.add(m); };
    const pine = (x, y, s) => {
      const g = new THREE.Group(); g.position.copy(V(x, y));
      const tr = this.mesh(new THREE.CylinderGeometry(4 * S * s, 6 * S * s, 40 * S * s, 6), ms.bark); tr.position.y = 20 * S * s; g.add(tr);
      for (let i = 0; i < 4; i++) { const c = this.mesh(new THREE.ConeGeometry((46 - i * 9) * S * s, 60 * S * s, 9), ms.darkLeaf); c.position.y = (55 + i * 32) * S * s; g.add(c); }
      this.add(g);
    };
    // bottom corners (below the inlanes, like the concept art)
    stump(120, 1190, 22, 60); fern(160, 1230, 1.2); fern(70, 1260, 1); rock(185, 1185, 16);
    stump(m(150), 1205, 18, 46); fern(m(120), 1185, 1.1); fern(m(185), 1240, 1); rock(m(80), 1240, 14);
    // top corners outside the arc
    pine(70, 85, 1.0); pine(115, 60, 0.8); rock(62, 140, 18); fern(95, 120, 0.8);
    pine(700, 90, 0.95); rock(718, 150, 14);
    function m(x) { return 2 * L.CX - x; }
  }

  // ---------------- balls ----------------
  buildBalls() {
    this.ballMeshes = [];
    const geo = new THREE.SphereGeometry(R * S * 1.12, 32, 24);
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 1, roughness: 0.05, envMapIntensity: 2.6 });
    for (let i = 0; i < 4; i++) {
      const m = this.mesh(geo, mat, { recv: false }); m.visible = false; m.userData.dynamic = true; this.add(m);
      this.ballMeshes.push(m);
    }
  }

  // merge static meshes that share a material → far fewer draw calls on iPhone
  finalize() {
    this.table.updateMatrixWorld(true);
    const inv = this.table.matrixWorld.clone().invert();
    const groups = new Map();
    const victims = [];
    const visit = (o, dyn) => {
      dyn = dyn || o.userData.dynamic;
      if (!dyn && o.isMesh && !o.isInstancedMesh && !o.material.transparent && o.renderOrder === 0) {
        const key = o.material.uuid + (o.castShadow ? 'c' : '') + (o.receiveShadow ? 'r' : '');
        if (!groups.has(key)) groups.set(key, { mat: o.material, cast: o.castShadow, recv: o.receiveShadow, list: [] });
        groups.get(key).list.push(o);
        victims.push(o);
      }
      for (const c of o.children) visit(c, dyn);
    };
    for (const c of this.table.children) visit(c, false);
    let merged = 0;
    for (const g of groups.values()) {
      if (g.list.length < 2) { victims.splice(victims.indexOf(g.list[0]), 1); continue; }
      const geos = g.list.map((m) => {
        let geo = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
        for (const name of Object.keys(geo.attributes)) if (!['position', 'normal', 'uv'].includes(name)) geo.deleteAttribute(name);
        if (!geo.attributes.normal) geo.computeVertexNormals();
        if (!geo.attributes.uv) geo.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(geo.attributes.position.count * 2), 2));
        geo.morphAttributes = {};
        geo.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld));
        return geo;
      });
      const mg = mergeGeometries(geos, false);
      if (!mg) { g.list.forEach((m) => victims.splice(victims.indexOf(m), 1)); continue; }
      const mesh = new THREE.Mesh(mg, g.mat); mesh.castShadow = g.cast; mesh.receiveShadow = g.recv;
      this.table.add(mesh); merged += g.list.length;
    }
    for (const v of victims) v.parent.remove(v);
    return merged;
  }

  ballWorld(b) { return V(b.x, b.y, R + (b.h || 0)); }

  // ---------------- effects API ----------------
  fx(type, data = {}) {
    const p = data.x !== undefined ? V(data.x, data.y, data.h ?? 20) : null;
    switch (type) {
      case 'bumper': {
        const bm = this.bumperMeshes[L.bumpers.indexOf(data.bumper)];
        if (bm) { bm.flash = 1; this.particles.emit(V(bm.b.x, bm.b.y, 60), bm.color, 26, 1.6, 0.9, 0.09, 1, 0.5); }
        this.bumperLight.color.set(bm ? bm.color : 0xffffff); this.bumperFlash = 1;
        break;
      }
      case 'sling': this.slingMeshes[data.side === 'L' ? 0 : 1].kick = 1; if (p) this.particles.emit(p, 0xffffff, 10, 1.2, 0.4, 0.06); break;
      case 'spark': if (p) this.particles.emit(p, data.color ?? 0xffe6a0, data.n ?? 14, data.speed ?? 1.2, 0.6, data.size ?? 0.07); break;
      case 'splash': if (p) this.particles.emit(p, 0x7fe6ff, 26, 1.0, 0.9, 0.08, 1.4); this.ripple = 1; break;
      case 'drop': this.dropMeshes[data.i].target = 1; break;
      case 'dropReset': this.dropMeshes.forEach((d) => (d.target = 0)); break;
      case 'shield': this.shieldMeshes[data.i].hit = 1; break;
      case 'gate': this.portcullisShake = 1; break;
      case 'gateOpen': this.portTarget = data.open ? 1 : 0; break;
      case 'spin': this.spinnerVel = Math.min(60, this.spinnerVel + data.speed / 40); break;
      case 'flame': this.flameBoost = 2.2; this.particles.emit(V(L.TOWER.x, L.TOWER.y, 330), 0x7fc4ff, 40, 1.8, 1.2, 0.1, 1.4, 0.3); break;
      case 'princess': this.princessGlow = data.on ? 1 : 0; break;
      case 'treasure': this.particles.emit(V(300, 880, 40), 0xffd24a, 80, 2.2, 1.4, 0.1, 1.6); break;
      case 'crystal': this.crystalFlash = 1; break;
      case 'burst': if (p) this.particles.emit(p, data.color ?? 0xffffff, data.n ?? 40, data.speed ?? 2, 1.1, 0.1, 1.5); break;
    }
  }

  setMood(name, instant = false) {
    const moods = {
      normal: { hemi: 0xb4d4ff, hemiI: 0.8, key: 0xfff0d8, keyI: 2.9, fog: 0x24352c, flame: 6, castle: 3, pool: 2.5, exposure: 1.0 },
      multiball: { hemi: 0x7d6bff, hemiI: 0.7, key: 0xb9c8ff, keyI: 2.0, fog: 0x1c1f3a, flame: 12, castle: 3, pool: 4, exposure: 1.08 },
      castle: { hemi: 0xffc98a, hemiI: 0.7, key: 0xffd9a0, keyI: 2.6, fog: 0x3a2a1a, flame: 5, castle: 9, pool: 2.5, exposure: 1.08 },
      treasure: { hemi: 0xffd56a, hemiI: 0.8, key: 0xffe2a0, keyI: 2.8, fog: 0x3a3215, flame: 6, castle: 4, pool: 3, exposure: 1.12 },
      drain: { hemi: 0x6a7a8a, hemiI: 0.35, key: 0xb0b8c8, keyI: 1.4, fog: 0x151a18, flame: 3, castle: 1.5, pool: 1.2, exposure: 0.9 },
      hot: { hemi: 0xff9ad8, hemiI: 0.65, key: 0xffe6f0, keyI: 2.5, fog: 0x2e1f30, flame: 8, castle: 4, pool: 3.5, exposure: 1.06 },
    };
    const m = moods[name] || moods.normal;
    this.moodTarget = { ...m, hemi: new THREE.Color(m.hemi), key: new THREE.Color(m.key), fog: new THREE.Color(m.fog) };
    this.moodName = name;
    if (instant) this.moodCur = { ...this.moodTarget, hemi: this.moodTarget.hemi.clone(), key: this.moodTarget.key.clone(), fog: this.moodTarget.fog.clone() };
  }

  // ---------------- per-frame ----------------
  update(dt, phys, game) {
    this.t += dt; const t = this.t;
    // mood blending
    const c = this.moodCur, tg = this.moodTarget, k = Math.min(1, dt * 2.5);
    c.hemi.lerp(tg.hemi, k); c.key.lerp(tg.key, k); c.fog.lerp(tg.fog, k);
    for (const n of ['hemiI', 'keyI', 'flame', 'castle', 'pool', 'exposure']) c[n] += (tg[n] - c[n]) * k;
    this.hemi.color.copy(c.hemi); this.hemi.intensity = c.hemiI;
    this.key.color.copy(c.key); this.key.intensity = c.keyI;
    this.scene.fog.color.copy(c.fog);
    this.renderer.toneMappingExposure = c.exposure;

    // flame
    this.flameBoost = Math.max(1, (this.flameBoost || 1) - dt * 1.5);
    this.flameMat.uniforms.time.value = t;
    this.flameMat.uniforms.boost.value = this.flameBoost * (0.9 + (game?.towerLocks || 0) * 0.15);
    this.flameLight.intensity = c.flame * this.flameBoost * (0.85 + Math.sin(t * 17) * 0.08 + Math.sin(t * 7.3) * 0.07);
    if (rnd() < dt * 8) this.particles.emit(V(L.TOWER.x + (rnd() - 0.5) * 30, L.TOWER.y + (rnd() - 0.5) * 30, 360), 0x8fd0ff, 1, 0.3, 1.4, 0.05, 1.5, -0.2);
    // castle
    this.castleLight.intensity = c.castle * (0.92 + Math.sin(t * 9) * 0.05);
    if (this.castleWindows) for (const w of this.castleWindows) w.emissiveIntensity = 1.2 + c.castle * 0.12;
    this.portOpen += (this.portTarget - this.portOpen) * Math.min(1, dt * 3);
    this.portcullisShake = Math.max(0, (this.portcullisShake || 0) - dt * 4);
    this.portcullis.position.y = this.portOpen * 48 * S;
    this.portcullis.position.x = wx(505) + Math.sin(t * 60) * this.portcullisShake * 1.5 * S;
    if (this.banners) this.banners.forEach((b, i) => { b.rotation.y = Math.sin(t * 2.2 + i) * 0.35; });
    const pg = this.princessGlow || 0;
    this.princessMat.emissiveIntensity = 0.1 + pg * (1.2 + Math.sin(t * 5) * 0.4);
    this.princess.rotation.y = pg ? Math.sin(t * 2) * 0.5 : 0;
    // pool
    this.ripple = Math.max(0, (this.ripple || 0) - dt * 0.8);
    this.waterMat.uniforms.time.value = t; this.waterMat.uniforms.ripple.value = this.ripple;
    this.waterMat.uniforms.glow.value = 0.9 + this.ripple * 0.6 + (this.moodName === 'multiball' ? 0.25 : 0);
    this.poolLight.intensity = c.pool * (1 + this.ripple);
    if (rnd() < dt * 3) this.particles.emit(V(L.pool.x + (rnd() - 0.5) * 120, L.pool.y + (rnd() - 0.5) * 120, 6), 0x9ff0ff, 1, 0.2, 1.6, 0.05, 1, -0.15);
    // crystal shimmer
    this.crystalFlash = Math.max(0, (this.crystalFlash || 0) - dt * 1.5);
    if (this.crystalMat) { this.crystalMat.map.offset.y = -t * 0.15; }
    // bumpers
    this.bumperFlash = Math.max(0, (this.bumperFlash || 0) - dt * 4);
    this.bumperLight.intensity = 1.8 + this.bumperFlash * 7;
    for (const bm of this.bumperMeshes) {
      bm.flash = Math.max(0, bm.flash - dt * 5);
      const mult = game?.mult || 1;
      bm.capMat.emissiveIntensity = 0.35 + (mult - 1) * 0.12 + bm.flash * 2.4 + Math.sin(t * 2 + bm.b.x) * 0.05;
      const s = 1 + bm.flash * 0.08; bm.capM.scale.set(s, 1 - bm.flash * 0.1, s);
      bm.capM.position.y = (52 - bm.flash * 6) * S;
    }
    // slings
    for (const sm of this.slingMeshes) {
      sm.kick = Math.max(0, sm.kick - dt * 8);
      sm.band.position.copy(sm.base).addScaledVector(sm.n, sm.kick * 6 * S);
      sm.mat.emissiveIntensity = 0.4 + sm.kick * 3;
    }
    // drop targets
    for (const d of this.dropMeshes) { d.down += (d.target - d.down) * Math.min(1, dt * 14); d.g.position.y = (18 - d.down * 40) * S; d.g.visible = d.down < 0.97; }
    for (const s of this.shieldMeshes) { s.hit = Math.max(0, s.hit - dt * 5); s.g.scale.setScalar(1 + s.hit * 0.15); }
    // spinner
    this.spinnerVel *= Math.pow(0.35, dt);
    this.spinnerAngle += this.spinnerVel * dt;
    this.spinnerPlate.rotation.x = this.spinnerAngle;
    this.spinnerMat.emissiveIntensity = 0.2 + Math.min(2, this.spinnerVel * 0.08);
    // flippers
    if (phys) phys.flippers.forEach((f, i) => { this.flipperMeshes[i].rotation.y = -f.angle; });
    // plunger
    if (phys) { const pull = phys.plunger.pull; this.plungerG.position.z = this.plungerBase + pull * 46 * S; this.spring.scale.z = 1 - pull * 0.5; this.spring.position.z = pull * 6 * S; }
    // lamps
    for (const l of this.lamps.values()) l.update(t, dt);
    // balls
    if (phys) {
      this.ballMeshes.forEach((m, i) => {
        const b = phys.balls[i];
        if (!b || b.mode === 'held' || b.hidden) { m.visible = false; return; }
        m.visible = true;
        m.position.copy(this.ballWorld(b));
        const dx = b.rollX * S, dz = b.rollY * S; b.rollX = 0; b.rollY = 0;
        const d = Math.hypot(dx, dz);
        if (d > 1e-6) { const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(dz / d, 0, -dx / d), d / (R * S)); m.quaternion.premultiply(q); }
        // trail sparkle when fast or on ramps
        const sp = Math.hypot(b.vx || 0, b.vy || 0);
        if ((b.mode === 'rail' && rnd() < 0.6) || (sp > 2200 && rnd() < 0.3)) this.particles.emit(m.position, b.railName === 'crystal' ? 0x7fe6ff : 0xfff0c0, 1, 0.1, 0.4, 0.05, 0, 0);
      });
    }
    this.particles.update(dt);
  }
}
