// Presentation: Three.js scene. Reads simulation state every frame and reacts to bus events.
// It never changes game state.
import * as THREE from '../vendor/three.module.min.js';
import { TABLE_W, TABLE_H, CX } from '../core/table.js';
import { PHYS } from '../core/config.js';
import { THEMES, lerpTheme } from './themes.js';
import * as TX from './textures.js';
import { ParticleSystem, createFireflies, createStars } from './particles.js';

const R = PHYS.BALL_R;
const OX = TABLE_W / 2, OZ = TABLE_H / 2;
const W = (x, y, h = 0, v = new THREE.Vector3()) => v.set(x - OX, h, OZ - y);
const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _axis = new THREE.Vector3();
const _col = new THREE.Color();
const smooth = (t) => t * t * (3 - 2 * t);

// ------------------------------------------------------------------------------------------- geometry helpers
function mergeGeometries(list) {
  const geos = list.map((g) => (g.index ? g.toNonIndexed() : g));
  let n = 0;
  for (const g of geos) n += g.attributes.position.count;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2);
  let o = 0;
  for (const g of geos) {
    const c = g.attributes.position.count;
    pos.set(g.attributes.position.array, o * 3);
    if (g.attributes.normal) nor.set(g.attributes.normal.array, o * 3);
    if (g.attributes.uv) uv.set(g.attributes.uv.array, o * 2);
    o += c;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return out;
}

/** Boxes along a table-space polyline. offsetOut: push the wall away from `away` point by half its thickness. */
function wallBoxes(pts, { thick = 0.25, h = 1, y0 = 0, outFrom = null }) {
  const geos = [];
  const m = new THREE.Matrix4();
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, ay] = pts[i], [bx, by] = pts[i + 1];
    const dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy);
    if (len < 1e-4) continue;
    let mx = (ax + bx) / 2, my = (ay + by) / 2;
    if (outFrom) {
      let nx = -dy / len, ny = dx / len;
      if ((mx - outFrom[0]) * nx + (my - outFrom[1]) * ny < 0) { nx = -nx; ny = -ny; }
      mx += nx * thick / 2; my += ny * thick / 2;
    }
    const g = new THREE.BoxGeometry(len + thick * 0.9, h, thick);
    m.makeRotationY(Math.atan2(dy, dx));
    m.setPosition(mx - OX, y0 + h / 2, OZ - my);
    g.applyMatrix4(m);
    geos.push(g);
  }
  return geos;
}

/** Extrude a table-space polygon upwards. */
function extrudeTable(pts, depth, bevel = 0.04) {
  const shape = new THREE.Shape();
  pts.forEach(([x, y], i) => (i ? shape.lineTo(x - OX, y - OZ) : shape.moveTo(x - OX, y - OZ)));
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 1, curveSegments: 4 });
  g.rotateX(-Math.PI / 2);
  return g;
}

function glowSprite(tex, color, size, opacity = 1) {
  const mat = new THREE.SpriteMaterial({ map: tex, color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending });
  const s = new THREE.Sprite(mat);
  s.scale.setScalar(size);
  s.renderOrder = 8;
  return s;
}

function floorGlow(tex, color, size, opacity = 1) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshBasicMaterial({ map: tex, color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending }));
  m.rotation.x = -Math.PI / 2;
  m.renderOrder = 2;
  return m;
}

// ------------------------------------------------------------------------------------------- renderer
export class GameRenderer {
  constructor(canvas, sim, { getTopInset = () => 0, getBottomInset = () => 0 } = {}) {
    this.sim = sim;
    this.table = sim.table;
    this.getTopInset = getTopInset;
    this.getBottomInset = getBottomInset;
    this.cameraMode = 'classic';
    this.time = 0;
    this.shake = 0;
    this.flash = 0;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.maxPixelRatio = dpr;
    this.pixelRatio = dpr;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: dpr < 2.5, powerPreference: 'high-performance', stencil: false });
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(40, 1, 0.5, 200);

    this.tex = {
      glow: TX.glowTexture(),
      shadow: TX.shadowTexture(),
      wood: TX.woodTexture(7, [96, 58, 30]),
      darkWood: TX.woodTexture(11, [52, 30, 16]),
    };
    this.gold = []; // static gold trim from every part of the table -> one merged mesh
    this._buildEnv();
    this._buildLights();
    this._buildCabinet();
    this._buildWalls();
    this._buildFlippers();
    this._buildMushrooms();
    this._buildCrystals();
    this._buildPotion();
    this._buildWizard();
    this._buildTower();
    this._buildPool();
    this._buildRamps();
    this._buildBackdrop();
    this._buildInserts();
    this._buildPlunger();
    this._buildBalls();
    this.scene.add(new THREE.Mesh(mergeGeometries(this.gold), this.goldMat));
    this.gold = null;
    this.particles = new ParticleSystem(700);
    this.scene.add(this.particles.points);
    this.fireflies = createFireflies(110, { minX: -OX + 1, maxX: OX - 1, minZ: -OZ + 2, maxZ: OZ - 4 });
    this.scene.add(this.fireflies);

    this.theme = lerpTheme(THEMES[0], THEMES[0], 0, {});
    this.themeFrom = THEMES[0];
    this.themeTo = THEMES[0];
    this.themeT = 1;
    this._applyTheme(this.theme);

    this.frameTimes = [];
    this.qualityTimer = 0;
    this.resize();
  }

  // ----------------------------------------------------------------------------------------- build
  _buildEnv() {
    const env = new THREE.Scene();
    const geo = new THREE.SphereGeometry(50, 32, 16);
    const cols = [];
    const top = new THREE.Color(0x9fd0ff), mid = new THREE.Color(0xfff0d0), bot = new THREE.Color(0x203018);
    for (let i = 0; i < geo.attributes.position.count; i++) {
      const y = geo.attributes.position.getY(i) / 50;
      _col.copy(y > 0 ? mid : bot).lerp(y > 0 ? top : mid, y > 0 ? y : 1 + y);
      cols.push(_col.r, _col.g, _col.b);
    }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    env.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));
    const lamp = (x, y, z, c, s) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(s, s), new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(6), side: THREE.DoubleSide }));
      m.position.set(x, y, z); m.lookAt(0, 0, 0); env.add(m);
    };
    lamp(10, 30, 20, 0xffe6b0, 14);
    lamp(-25, 18, -10, 0x9fe8ff, 10);
    lamp(20, 10, -25, 0xffb060, 8);
    const pm = new THREE.PMREMGenerator(this.renderer);
    this.envMap = pm.fromScene(env, 0.02).texture;
    pm.dispose();
    geo.dispose();
  }

  _buildLights() {
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x333333, 1.2);
    this.scene.add(this.hemi);
    this.dir = new THREE.DirectionalLight(0xffffff, 1.6);
    this.dir.position.set(-6, 30, 22);
    this.scene.add(this.dir);
    const t = this.table.decor.tower;
    this.towerLight = new THREE.PointLight(0xffd27a, 10, 16, 1.6);
    W(t.x, t.y - t.r - 0.8, 1.6, this.towerLight.position);
    this.scene.add(this.towerLight);
    const p = this.table.decor.pool;
    this.poolLight = new THREE.PointLight(0x58e0c4, 6, 9, 1.6);
    W(p.x, p.y, 1.8, this.poolLight.position);
    this.scene.add(this.poolLight);
  }

  _buildCabinet() {
    const tex = TX.playfieldTexture(this.table);
    this.fieldMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.62, metalness: 0.0 });
    const field = new THREE.Mesh(new THREE.PlaneGeometry(TABLE_W, TABLE_H), this.fieldMat);
    field.rotation.x = -Math.PI / 2;
    this.scene.add(field);
    // cabinet body around the playfield
    const cabMat = new THREE.MeshStandardMaterial({ map: this.tex.darkWood, roughness: 0.55, color: 0x8a6a50 });
    const body = new THREE.BoxGeometry(TABLE_W + 2.4, 3, TABLE_H + 4);
    body.translate(0, -1.52, -0.5);
    // side rails with gold trim
    this.goldMat = new THREE.MeshStandardMaterial({ color: 0xe0b050, metalness: 1, roughness: 0.28, envMap: this.envMap, envMapIntensity: 1.2 });
    const railGeo = [body];
    for (const sx of [-1, 1]) {
      const g = new THREE.BoxGeometry(1.2, 1.9, TABLE_H + 4);
      g.translate(sx * (OX + 0.6), 0.95 - 0.3, -0.5);
      railGeo.push(g);
    }
    const front = new THREE.BoxGeometry(TABLE_W + 2.4, 1.2, 1.4);
    front.translate(0, 0.3, OZ + 1.6);
    railGeo.push(front);
    this.scene.add(new THREE.Mesh(mergeGeometries(railGeo), cabMat));
    const trim = [];
    for (const sx of [-1, 1]) { const g = new THREE.BoxGeometry(0.16, 0.12, TABLE_H + 4); g.translate(sx * (OX + 0.08), 1.62, -0.5); trim.push(g); }
    this.gold.push(...trim);
  }

  _buildWalls() {
    const byMat = { cabinet: [], wood: [], rail: [], crystalRamp: [], gate: [], sling: [] };
    const center = [OX, OZ];
    for (const w of this.table.walls) {
      switch (w.visual) {
        case 'cabinet': byMat.cabinet.push(...wallBoxes(w.pts, { thick: 0.7, h: w.h || 1.6, outFrom: center })); break;
        case 'wood': byMat.wood.push(...wallBoxes(w.pts, { thick: 0.3, h: w.h || 1.2 })); break;
        case 'rail':
          byMat.rail.push(...wallBoxes(w.pts, { thick: 0.16, h: 0.18, y0: (w.h || 1) - 0.18 }));
          byMat.wood.push(...wallBoxes(w.pts, { thick: 0.24, h: (w.h || 1) - 0.18 }));
          break;
        case 'crystalRamp': byMat.crystalRamp.push(...wallBoxes(w.pts, { thick: 0.22, h: w.h || 1 })); break;
        case 'gate': byMat.gate.push(...wallBoxes(w.pts, { thick: 0.08, h: 0.9, y0: 0.15 })); break;
        default: break;
      }
    }
    const woodMat = new THREE.MeshStandardMaterial({ map: this.tex.wood, roughness: 0.6 });
    const cabMat = new THREE.MeshStandardMaterial({ map: this.tex.darkWood, roughness: 0.5, color: 0xb08a6a });
    this.crystalMat = new THREE.MeshStandardMaterial({
      color: 0x8ff0ff, emissive: 0x2aa0c0, emissiveIntensity: 0.6, roughness: 0.08, metalness: 0.1,
      transparent: true, opacity: 0.55, envMap: this.envMap, envMapIntensity: 1.5, depthWrite: false,
    });
    const add = (list, mat, order = 0) => { if (list.length) { const m = new THREE.Mesh(mergeGeometries(list), mat); m.renderOrder = order; this.scene.add(m); return m; } return null; };
    add(byMat.cabinet, cabMat);
    add(byMat.wood, woodMat);
    this.gold.push(...byMat.rail, ...byMat.gate);
    add(byMat.crystalRamp, this.crystalMat, 3);

    // slingshots: carved body + glowing rubber band
    const slingBody = [];
    this.slingRubbers = {};
    const ivory = new THREE.MeshStandardMaterial({ map: this.tex.wood, color: 0xd8c0a0, roughness: 0.5 });
    this.table.decor.slings.forEach((s, i) => {
      slingBody.push(extrudeTable([s.top, s.low, s.tip, s.top], 0.85));
      const rub = new THREE.MeshStandardMaterial({ color: 0x5a1010, emissive: 0xff6a2a, emissiveIntensity: 0.15, roughness: 0.7 });
      const g = mergeGeometries(wallBoxes([s.top, s.tip], { thick: 0.22, h: 0.55, y0: 0.15 }));
      const m = new THREE.Mesh(g, rub);
      this.scene.add(m);
      this.slingRubbers[i === 0 ? 'slingL' : 'slingR'] = { mat: rub, flash: 0, mid: W((s.top[0] + s.tip[0]) / 2, (s.top[1] + s.tip[1]) / 2, 0.5) };
    });
    this.scene.add(new THREE.Mesh(mergeGeometries(slingBody), ivory));
    // posts
    const postGeo = [];
    for (const c of this.table.circles) if (c.kind === 'post') { const g = new THREE.CylinderGeometry(0.2, 0.2, 1.1, 10); g.translate(c.x - OX, 0.55, OZ - c.y); postGeo.push(g); }
    this.gold.push(...postGeo);
  }

  _buildFlippers() {
    this.flipperMeshes = [];
    const wood = new THREE.MeshStandardMaterial({ map: this.tex.wood, color: 0xf0d2a8, roughness: 0.45 });
    const rubber = new THREE.MeshStandardMaterial({ color: 0x1e5a24, emissive: 0x2a8a30, emissiveIntensity: 0.25, roughness: 0.6 });
    const leafMat = new THREE.MeshStandardMaterial({ color: 0x6ad04a, emissive: 0x4ab030, emissiveIntensity: 0.7, roughness: 0.4, side: THREE.DoubleSide });
    for (const f of this.sim.world.flippers) {
      const shape = (grow) => {
        const s = new THREE.Shape();
        const r1 = f.r1 + grow, r2 = f.r2 + grow;
        s.moveTo(0, r1);
        s.lineTo(f.len, r2);
        s.absarc(f.len, 0, r2, Math.PI / 2, -Math.PI / 2, true);
        s.lineTo(0, -r1);
        s.absarc(0, 0, r1, -Math.PI / 2, Math.PI / 2, true);
        return s;
      };
      const body = new THREE.ExtrudeGeometry(shape(-0.05), { depth: 0.62, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.05, bevelSegments: 2, curveSegments: 16 });
      body.rotateX(-Math.PI / 2);
      const band = new THREE.ExtrudeGeometry(shape(0.02), { depth: 0.22, bevelEnabled: false, curveSegments: 16 });
      band.rotateX(-Math.PI / 2); band.translate(0, 0.2, 0);
      const g = new THREE.Group();
      g.add(new THREE.Mesh(body, wood));
      g.add(new THREE.Mesh(band, rubber));
      // carved leaves on top (one merged mesh)
      const leafGeos = [];
      for (let k = 0; k < 3; k++) {
        const ls = new THREE.Shape();
        const L = 0.55 - k * 0.1;
        ls.moveTo(0, 0); ls.quadraticCurveTo(L * 0.5, L * 0.35, L, 0); ls.quadraticCurveTo(L * 0.5, -L * 0.35, 0, 0);
        leafGeos.push(new THREE.ShapeGeometry(ls).rotateX(-Math.PI / 2).rotateY(k % 2 ? 0.4 : -0.4).translate(0.5 + k * 0.85, 0.74, 0));
      }
      g.add(new THREE.Mesh(mergeGeometries(leafGeos), leafMat));
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.12, 12), this.goldMat);
      cap.position.y = 0.76; g.add(cap);
      W(f.px, f.py, 0.02, g.position);
      this.scene.add(g);
      this.flipperMeshes.push({ f, g });
    }
  }

  _buildMushrooms() {
    this.mushrooms = {};
    const caps = { mush1: '#d8342c', mush2: '#9a3ae0', mush3: '#e8902a' };
    const stemMat = new THREE.MeshStandardMaterial({ color: 0xf2e6c8, roughness: 0.7, emissive: 0x302810, emissiveIntensity: 0.4 });
    const baseMat = new THREE.MeshStandardMaterial({ map: this.tex.darkWood, roughness: 0.5 });
    const gillMat = new THREE.MeshStandardMaterial({ color: 0xe8d4b0, roughness: 0.9, side: THREE.DoubleSide });
    const bases = [], stems = [];
    for (const c of this.table.circles) {
      if (!caps[c.id]) continue;
      const g = new THREE.Group();
      W(c.x, c.y, 0, g.position);
      const P = g.position;
      bases.push(new THREE.CylinderGeometry(c.r, c.r * 1.04, 0.42, 28).translate(P.x, 0.21, P.z));
      this.gold.push(new THREE.TorusGeometry(c.r, 0.06, 6, 28).rotateX(Math.PI / 2).translate(P.x, 0.43, P.z));
      stems.push(new THREE.CylinderGeometry(0.42, 0.6, 1.0, 18).translate(P.x, 0.9, P.z));
      const capTex = TX.mushroomCapTexture(caps[c.id]);
      const capMat = new THREE.MeshStandardMaterial({ map: capTex, emissiveMap: capTex, emissive: 0xffffff, emissiveIntensity: 0.5, roughness: 0.35 });
      const cap = new THREE.Mesh(new THREE.SphereGeometry(1.2, 32, 14, 0, Math.PI * 2, 0, Math.PI / 2), capMat);
      cap.scale.y = 0.62; cap.position.y = 1.32;
      const gill = new THREE.Mesh(new THREE.CircleGeometry(1.18, 32), gillMat);
      gill.rotation.x = Math.PI / 2; gill.position.y = 1.31;
      const capGroup = new THREE.Group();
      capGroup.add(cap, gill);
      g.add(capGroup);
      const glow = floorGlow(this.tex.glow, new THREE.Color(caps[c.id]), 4.4, 0.5);
      glow.position.y = 0.02; g.add(glow);
      const halo = glowSprite(this.tex.glow, new THREE.Color(caps[c.id]), 3.2, 0.35);
      halo.position.y = 1.8; g.add(halo);
      this.scene.add(g);
      this.mushrooms[c.id] = { g, capGroup, capMat, glow, halo, hit: 0, phase: Math.random() * 6, color: new THREE.Color(caps[c.id]) };
    }
    this.scene.add(new THREE.Mesh(mergeGeometries(bases), baseMat), new THREE.Mesh(mergeGeometries(stems), stemMat));
  }

  _buildCrystals() {
    this.crystals = {};
    const bases = [];
    for (const c of this.table.decor.crystals) {
      const parts = [];
      const add = (sx, sy, sz, x, z, tilt, rot) => {
        const o = new THREE.OctahedronGeometry(1, 0);
        o.scale(sx, sy, sz);
        o.rotateZ(tilt); o.rotateY(rot);
        o.translate(x, sy * 0.85, z);
        parts.push(o);
      };
      add(0.42, 1.25, 0.42, 0, 0, 0, 0.3);
      add(0.26, 0.8, 0.26, 0.32, 0.25, -0.45, 0.9);
      add(0.22, 0.65, 0.22, -0.3, -0.22, 0.5, 1.7);
      add(0.18, 0.5, 0.18, 0.05, -0.42, -0.2, 0.2);
      const mat = new THREE.MeshStandardMaterial({
        color: 0x9ff6ff, emissive: 0x4dfcff, emissiveIntensity: 0.9, roughness: 0.05, metalness: 0.2,
        transparent: true, opacity: 0.88, flatShading: true, envMap: this.envMap, envMapIntensity: 2,
      });
      const m = new THREE.Mesh(mergeGeometries(parts), mat);
      W(c.x, c.y, 0, m.position);
      m.rotation.y = c.rot;
      bases.push(new THREE.CylinderGeometry(0.75, 0.85, 0.15, 7).translate(c.x - OX, 0.07, OZ - c.y));
      const halo = glowSprite(this.tex.glow, new THREE.Color(0x4dfcff), 3, 0.45);
      W(c.x, c.y, 1.2, halo.position);
      const glow = floorGlow(this.tex.glow, new THREE.Color(0x4dfcff), 3.4, 0.5);
      W(c.x, c.y, 0.03, glow.position);
      this.scene.add(m, halo, glow);
      this.crystals[c.id] = { m, mat, halo, glow, hit: 0, phase: Math.random() * 6 };
    }
    this.scene.add(new THREE.Mesh(mergeGeometries(bases), new THREE.MeshStandardMaterial({ color: 0x6a6a72, roughness: 0.9 })));
  }

  _buildPotion() {
    const c = this.table.circles.find((o) => o.id === 'potion');
    const g = new THREE.Group();
    W(c.x, c.y, 0, g.position);
    const prof = [[0, 0], [0.5, 0.02], [0.6, 0.18], [0.62, 0.62], [0.5, 0.92], [0.22, 1.12], [0.18, 1.45], [0.23, 1.52], [0.2, 1.56], [0, 1.56]].map(([r, y]) => new THREE.Vector2(r, y));
    const glass = new THREE.MeshStandardMaterial({ color: 0xd8fff0, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.35, envMap: this.envMap, envMapIntensity: 2.2, depthWrite: false });
    const bottle = new THREE.Mesh(new THREE.LatheGeometry(prof, 24), glass);
    bottle.renderOrder = 4;
    const liqProf = [[0, 0.04], [0.47, 0.05], [0.56, 0.2], [0.57, 0.62], [0.47, 0.82], [0, 0.82]].map(([r, y]) => new THREE.Vector2(r, y));
    this.potionLiquidMat = new THREE.MeshStandardMaterial({ color: 0xff3ad8, emissive: 0xff3ad8, emissiveIntensity: 1.2, roughness: 0.2 });
    const liquid = new THREE.Mesh(new THREE.LatheGeometry(liqProf, 20), this.potionLiquidMat);
    const cork = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.16, 0.25, 10), new THREE.MeshStandardMaterial({ color: 0x8a5a2a, roughness: 0.9 }));
    cork.position.y = 1.62;
    const halo = glowSprite(this.tex.glow, new THREE.Color(0xff5ae0), 2.6, 0.55);
    halo.position.y = 0.6;
    const glow = floorGlow(this.tex.glow, new THREE.Color(0xff5ae0), 3, 0.6);
    glow.position.y = 0.03;
    g.add(liquid, bottle, cork, halo, glow);
    this.scene.add(g);
    this.potion = { g, halo, glow, hit: 0, x: c.x, y: c.y };
  }

  _buildWizard() {
    const wz = this.table.decor.wizard;
    const g = new THREE.Group();
    W(wz.x, wz.y, 0, g.position);
    g.rotation.y = -0.35; // looks toward the flippers / tower door
    const robeMat = new THREE.MeshStandardMaterial({ color: 0xf4f4ff, emissive: 0x9aa0ff, emissiveIntensity: 0.12, roughness: 0.75 });
    const skin = new THREE.MeshStandardMaterial({ color: 0xf0c8a0, roughness: 0.8 });
    const beardMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1 });
    const robeGeo = mergeGeometries([
      new THREE.ConeGeometry(0.78, 2.3, 18).translate(0, 1.15, 0),
      new THREE.ConeGeometry(0.4, 1.2, 16).rotateX(-0.25).translate(0, 3.15, -0.05),
      new THREE.CylinderGeometry(0.58, 0.58, 0.05, 20).translate(0, 2.62, 0),
      new THREE.CylinderGeometry(0.13, 0.2, 0.9, 8).rotateZ(-0.9).translate(0.48, 1.85, 0.1),
    ]);
    const robe = new THREE.Mesh(robeGeo, robeMat);
    const belt = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.05, 6, 18), this.goldMat); belt.rotation.x = Math.PI / 2; belt.position.y = 1.35;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.3, 16, 12), skin); head.position.y = 2.42;
    const beard = new THREE.Mesh(new THREE.ConeGeometry(0.27, 0.95, 12), beardMat); beard.rotation.x = Math.PI; beard.position.set(0, 1.98, 0.16);
    const eyes = new THREE.Mesh(mergeGeometries([new THREE.SphereGeometry(0.04, 6, 4).translate(-0.1, 2.47, 0.27), new THREE.SphereGeometry(0.04, 6, 4).translate(0.1, 2.47, 0.27)]), new THREE.MeshBasicMaterial({ color: 0x223355 }));
    const staffG = new THREE.Group();
    staffG.position.set(0.82, 0, 0.15);
    const staff = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 3.0, 8), new THREE.MeshStandardMaterial({ map: this.tex.wood, roughness: 0.7 }));
    staff.position.y = 1.5;
    this.orbMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x88ccff, emissiveIntensity: 0.6, roughness: 0.1 });
    const orb = new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 12), this.orbMat); orb.position.y = 3.1;
    this.orbHalo = glowSprite(this.tex.glow, new THREE.Color(0x88ccff), 1.4, 0.6); this.orbHalo.position.y = 3.1;
    staffG.add(staff, orb, this.orbHalo);
    const body = new THREE.Group();
    body.add(robe, belt, head, beard, eyes, staffG);
    g.add(body);
    const auraGlow = floorGlow(this.tex.glow, new THREE.Color(0xbfd4ff), 3.4, 0.4); auraGlow.position.y = 0.03;
    g.add(auraGlow);
    this.scene.add(g);
    // the rune stone plate in front of him (the actual target)
    const [[ax, ay], [bx, by]] = wz.plate;
    this.plateMat = new THREE.MeshStandardMaterial({ color: 0x8a8a96, emissive: 0x6aa8ff, emissiveIntensity: 0.3, roughness: 0.6 });
    const plate = new THREE.Mesh(mergeGeometries(wallBoxes([[ax, ay], [bx, by]], { thick: 0.22, h: 0.7 })), this.plateMat);
    this.scene.add(plate);
    this.wizard = { g, body, staffG, orbWorld: new THREE.Vector3(), hit: 0, charge: 0, auraGlow };
  }

  _buildTower() {
    const t = this.table.decor.tower;
    const g = new THREE.Group();
    W(t.x, t.y, 0, g.position);
    const stone = new THREE.MeshStandardMaterial({ color: 0xb8ab96, roughness: 0.85, map: this.tex.wood });
    const wall = new THREE.MeshStandardMaterial({ color: 0xf0e2c4, roughness: 0.8 });
    const levels = [[t.r + 0.05, t.r - 0.1, 2.4, stone], [t.r - 0.15, t.r - 0.45, 1.9, wall], [t.r - 0.5, t.r - 0.8, 1.7, wall], [t.r - 0.85, t.r - 1.1, 1.4, wall]];
    let y = 0;
    const windows = [], wallGeos = [];
    const TX0 = g.position.x, TZ0 = g.position.z;
    levels.forEach(([r0, r1, h, mat], i) => {
      const cg = new THREE.CylinderGeometry(r1, r0, h, 36).translate(0, y + h / 2, 0);
      if (i === 0) g.add(new THREE.Mesh(cg, mat)); else wallGeos.push(cg);
      // spiral balcony
      const pts = [];
      for (let k = 0; k <= 40; k++) {
        const a = (k / 40) * Math.PI * 2 + i * 1.3;
        const rr = r0 + 0.12 - (r0 - r1) * (k / 40);
        pts.push(new THREE.Vector3(Math.cos(a) * rr, y + 0.15 + (k / 40) * h * 0.85, Math.sin(a) * rr));
      }
      this.gold.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 60, 0.07, 5).translate(TX0, 0, TZ0));
      if (i > 0) {
        for (let k = 0; k < 4; k++) {
          const a = (k / 4) * Math.PI * 2 + i * 0.8 + 0.4;
          const rr = (r0 + r1) / 2 + 0.02;
          const wg = new THREE.BoxGeometry(0.34, 0.5, 0.08);
          wg.rotateY(-a + Math.PI / 2);
          wg.translate(Math.cos(a) * rr, y + h * 0.5, Math.sin(a) * rr);
          windows.push(wg);
        }
      }
      y += h;
    });
    this.windowMat = new THREE.MeshStandardMaterial({ color: 0x302010, emissive: 0xffc860, emissiveIntensity: 1.6 });
    g.add(new THREE.Mesh(mergeGeometries(windows), this.windowMat));
    g.add(new THREE.Mesh(mergeGeometries(wallGeos), wall));
    // mushroom roof
    const roofTex = TX.mushroomCapTexture('#c8282a');
    this.roofMat = new THREE.MeshStandardMaterial({ map: roofTex, emissiveMap: roofTex, emissive: 0xffffff, emissiveIntensity: 0.35, roughness: 0.4 });
    const roof = new THREE.Mesh(new THREE.SphereGeometry(2.5, 40, 16, 0, Math.PI * 2, 0, Math.PI / 2), this.roofMat);
    roof.scale.y = 0.6; roof.position.y = y - 0.1;
    g.add(roof);
    this.gold.push(new THREE.ConeGeometry(0.16, 1.2, 8).translate(TX0, y + 1.9, TZ0));
    this.spireStar = glowSprite(this.tex.glow, new THREE.Color(0xfff0a0), 1.6, 0.9);
    this.spireStar.position.y = y + 2.6; g.add(this.spireStar);
    this.towerTopY = y + 2.6;
    // door (faces the player = +Z in world)
    const doorG = new THREE.Group();
    doorG.position.set(0, 0, t.r + 0.08); // on the tower's surface
    const arch = new THREE.Shape();
    arch.moveTo(-0.95, 0); arch.lineTo(-0.95, 1.3); arch.absarc(0, 1.3, 0.95, Math.PI, 0, true); arch.lineTo(0.95, 0); arch.lineTo(-0.95, 0);
    this.doorInnerMat = new THREE.MeshBasicMaterial({ color: 0x120804 });
    const inner = new THREE.Mesh(new THREE.ShapeGeometry(arch), this.doorInnerMat);
    inner.position.z = -0.05;
    this.gold.push(new THREE.TorusGeometry(0.98, 0.09, 6, 20, Math.PI).translate(TX0, 1.3, TZ0 + t.r + 0.08));
    const leafMat = new THREE.MeshStandardMaterial({ map: this.tex.darkWood, color: 0xc89a6a, roughness: 0.6 });
    const leaves = [];
    for (const side of [-1, 1]) {
      const hinge = new THREE.Group();
      hinge.position.set(side * 0.95, 0, 0);
      const leaf = new THREE.Mesh(new THREE.BoxGeometry(0.95, 1.95, 0.1), leafMat);
      leaf.position.set(-side * 0.475, 0.975, 0.05);
      hinge.add(leaf);
      doorG.add(hinge);
      leaves.push({ hinge, side });
    }
    this.doorGlow = glowSprite(this.tex.glow, new THREE.Color(0xffd27a), 4.5, 0);
    this.doorGlow.position.set(0, 1.2, 0.6);
    const beam = floorGlow(this.tex.glow, new THREE.Color(0xffc040), 6, 0);
    beam.position.set(0, 0.03, 1.8);
    doorG.add(inner, this.doorGlow, beam);
    g.add(doorG);
    this.scene.add(g);
    this.tower = { g, doorG, leaves, beam, open: 0, target: 0 };
    this.towerTopWorld = new THREE.Vector3(g.position.x, this.towerTopY, g.position.z);
  }

  _buildPool() {
    const p = this.table.decor.pool;
    this.poolUniforms = {
      uTime: { value: 0 },
      uDeep: { value: new THREE.Color(0x0b5a52) },
      uShallow: { value: new THREE.Color(0x58e0c4) },
      uR: { value: p.r },
      uRipples: { value: [new THREE.Vector4(0, 0, -99, 0), new THREE.Vector4(0, 0, -99, 0), new THREE.Vector4(0, 0, -99, 0), new THREE.Vector4(0, 0, -99, 0)] },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.poolUniforms,
      vertexShader: `varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `
        uniform float uTime, uR; uniform vec3 uDeep, uShallow; uniform vec4 uRipples[4]; varying vec2 vP;
        void main(){
          float r = length(vP) / uR;
          vec3 col = mix(uShallow, uDeep, smoothstep(0.0, 0.95, 1.0 - r) * 0.85);
          float c = sin(vP.x * 3.1 + uTime * 1.3) * sin(vP.y * 2.7 - uTime * 1.1) + sin((vP.x + vP.y) * 4.3 + uTime * 1.9) * 0.5;
          col += uShallow * smoothstep(0.75, 1.4, c) * 0.35;
          float rip = 0.0;
          for (int i = 0; i < 4; i++) {
            float age = uTime - uRipples[i].z;
            if (age < 0.0 || age > 2.0) continue;
            float d = length(vP - uRipples[i].xy);
            float ring = abs(d - age * 2.2);
            rip += smoothstep(0.18, 0.0, ring) * (1.0 - age / 2.0) * uRipples[i].w;
          }
          col += vec3(1.0) * rip * 0.6;
          col += uShallow * smoothstep(0.82, 1.0, r) * 0.6;
          gl_FragColor = vec4(col, 1.0);
        }`,
    });
    const water = new THREE.Mesh(new THREE.CircleGeometry(p.r, 48), mat);
    water.rotation.x = -Math.PI / 2;
    W(p.x, p.y, 0.012, water.position);
    this.scene.add(water);
    // flat flagstones (instanced: one draw call)
    const N = 22;
    const stones = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 1, 1, 7), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 }), N);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3();
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2;
      const rr = p.r + 0.32;
      const sz = 0.33 + ((i * 37) % 10) / 70;
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), a * 3.1);
      s.set(sz, 0.07, sz * 0.85);
      m.compose(W(p.x + Math.cos(a) * rr, p.y + Math.sin(a) * rr, 0.03, _v), q, s);
      stones.setMatrixAt(i, m);
      stones.setColorAt(i, _col.setHSL(0.08, 0.06, 0.38 + ((i * 53) % 10) / 45));
    }
    this.scene.add(stones);
    this.rippleIndex = 0;
  }

  _buildRamps() {
    this.rampMeshes = {};
    const rails = [];
    const up = new THREE.Vector3(0, 1, 0);
    for (const [id, ramp] of Object.entries(this.table.ramps)) {
      const pts = ramp.path.pts.map(([x, y, z]) => W(x, y, z + 0.05, new THREE.Vector3()));
      const n = pts.length;
      const posArr = [], uvArr = [], idx = [];
      const left = [], right = [];
      for (let i = 0; i < n; i++) {
        const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
        const tan = _v.subVectors(b, a).normalize();
        const side = new THREE.Vector3().crossVectors(tan, up).normalize();
        const L = pts[i].clone().addScaledVector(side, -0.62), Rr = pts[i].clone().addScaledVector(side, 0.62);
        posArr.push(L.x, L.y, L.z, Rr.x, Rr.y, Rr.z);
        uvArr.push(0, i / 6, 1, i / 6);
        if (i < n - 1) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
        left.push(L.clone().add(new THREE.Vector3(0, 0.38, 0)));
        right.push(Rr.clone().add(new THREE.Vector3(0, 0.38, 0)));
        // supports
        if (i % 14 === 7 && pts[i].y > 0.8) {
          const sg = new THREE.CylinderGeometry(0.05, 0.05, pts[i].y, 6);
          sg.translate(pts[i].x, pts[i].y / 2, pts[i].z);
          rails.push(sg);
        }
      }
      const floor = new THREE.BufferGeometry();
      floor.setAttribute('position', new THREE.Float32BufferAttribute(posArr, 3));
      floor.setAttribute('uv', new THREE.Float32BufferAttribute(uvArr, 2));
      floor.setIndex(idx);
      floor.computeVertexNormals();
      const isCrystal = ramp.material === 'crystal';
      const mat = isCrystal
        ? new THREE.MeshStandardMaterial({ color: 0x9ff0ff, emissive: 0x2ad0ff, emissiveIntensity: 0.5, roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.42, side: THREE.DoubleSide, depthWrite: false, envMap: this.envMap, envMapIntensity: 1.6 })
        : new THREE.MeshStandardMaterial({ color: 0xffd070, emissive: 0x6a4a10, emissiveIntensity: 0.4, roughness: 0.3, metalness: 0.9, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false, envMap: this.envMap });
      const fm = new THREE.Mesh(floor, mat);
      fm.renderOrder = 5;
      this.scene.add(fm);
      rails.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(left), n * 2, 0.06, 6));
      rails.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(right), n * 2, 0.06, 6));
      this.rampMeshes[id] = { mat, flash: 0 };
    }
    this.gold.push(...rails);
  }

  _buildBackdrop() {
    this.skyUniforms = { uTop: { value: new THREE.Color() }, uBottom: { value: new THREE.Color() }, uTime: { value: 0 } };
    const sky = new THREE.Mesh(new THREE.PlaneGeometry(90, 40), new THREE.ShaderMaterial({
      uniforms: this.skyUniforms,
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `uniform vec3 uTop, uBottom; varying vec2 vUv;
        void main(){ vec3 c = mix(uBottom, uTop, smoothstep(0.15, 0.85, vUv.y));
          float glow = smoothstep(0.5, 0.0, length((vUv - vec2(0.5, 0.3)) * vec2(2.0, 1.2)));
          c += uBottom * glow * 0.6; gl_FragColor = vec4(c, 1.0); }`,
      depthWrite: false,
    }));
    sky.position.set(0, 12, -OZ - 14);
    sky.renderOrder = -10;
    this.scene.add(sky);
    this.stars = createStars(260, new THREE.Vector3(0, 2, -OZ - 12), 20);
    this.scene.add(this.stars);
    this.silMat = new THREE.MeshBasicMaterial({ map: TX.forestSilhouetteTexture(), color: 0x0a1a0e, transparent: true, depthWrite: false });
    const sil = new THREE.Mesh(new THREE.PlaneGeometry(70, 14), this.silMat);
    sil.position.set(0, 3, -OZ - 8);
    this.scene.add(sil);
    // the glowing waterfall behind the tower
    this.fallUniforms = { uTime: { value: 0 }, uColor: { value: new THREE.Color(0xbff7ff) } };
    const fall = new THREE.Mesh(new THREE.PlaneGeometry(4, 16, 1, 1), new THREE.ShaderMaterial({
      uniforms: this.fallUniforms,
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `uniform float uTime; uniform vec3 uColor; varying vec2 vUv;
        float h(float x){ return fract(sin(x * 91.7) * 43758.5); }
        void main(){
          float x = vUv.x; float edge = smoothstep(0.0, 0.18, x) * smoothstep(1.0, 0.82, x);
          float streak = 0.0;
          for (int i = 0; i < 3; i++) { float fi = float(i);
            float col = floor(x * (14.0 + fi * 9.0));
            float sp = 0.6 + h(col + fi * 7.0) * 0.8;
            streak += smoothstep(0.55, 1.0, fract(vUv.y * (2.0 + fi) + uTime * sp + h(col))) * (0.5 - fi * 0.12); }
          float a = edge * (0.35 + streak) * smoothstep(0.0, 0.25, vUv.y);
          gl_FragColor = vec4(uColor * a * 1.4, a);
        }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    fall.position.set(CX - OX, 6, -OZ - 6);
    this.scene.add(fall);
    this.fallMist = glowSprite(this.tex.glow, new THREE.Color(0xbff7ff), 9, 0.45);
    this.fallMist.position.set(CX - OX, 0.5, -OZ - 4);
    this.scene.add(this.fallMist);
  }

  _buildInserts() {
    const I = this.table.decor.inserts;
    this.insertList = [];
    const push = (key, p, color, size = 0.34) => this.insertList.push({ key, x: p.x, y: p.y, color: new THREE.Color(color), size, level: 0 });
    I.combo.forEach((p) => push('combo:' + p.id, p, 0xffd040));
    push('kickback', I.kickback, 0x40ff70, 0.38);
    I.wizard.forEach((p, i) => push('wizard:' + i, p, 0x80b8ff, 0.3));
    push('door', I.door, 0xffb020, 0.48);
    push('rampA', I.rampA, 0x4df0ff, 0.36);
    push('rampB', I.rampB, 0xffd060, 0.36);
    push('orbitL', I.orbitL, 0xff60d0, 0.32);
    push('orbitR', I.orbitR, 0xff60d0, 0.32);
    const n = this.insertList.length;
    const disc = new THREE.InstancedMesh(new THREE.CircleGeometry(1, 20), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95 }), n);
    const glow = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: this.tex.glow, color: 0xffffff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }), n);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2), s = new THREE.Vector3();
    this.insertList.forEach((it, i) => {
      m.compose(W(it.x, it.y, 0.016, _v), q, s.setScalar(it.size)); disc.setMatrixAt(i, m);
      m.compose(W(it.x, it.y, 0.02, _v), q, s.setScalar(it.size * 5)); glow.setMatrixAt(i, m);
      disc.setColorAt(i, _col.setRGB(0.1, 0.1, 0.1)); glow.setColorAt(i, _col.setRGB(0, 0, 0));
    });
    disc.renderOrder = 1; glow.renderOrder = 2;
    this.scene.add(disc, glow);
    this.insertDisc = disc; this.insertGlow = glow;
    // skill-shot ring around mushroom 3
    const m3 = this.table.circles.find((c) => c.id === 'mush3');
    this.skillRing = new THREE.Mesh(new THREE.RingGeometry(1.25, 1.6, 40), new THREE.MeshBasicMaterial({ color: 0x80ff80, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    this.skillRing.rotation.x = -Math.PI / 2;
    W(m3.x, m3.y, 0.03, this.skillRing.position);
    this.scene.add(this.skillRing);
    this.laneGlow = floorGlow(this.tex.glow, new THREE.Color(0x80ff80), 2.6, 0);
    W(19.8, 4.5, 0.03, this.laneGlow.position);
    this.scene.add(this.laneGlow);
  }

  _buildPlunger() {
    const g = new THREE.Group();
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 2.2, 10), this.goldMat);
    rod.rotation.x = Math.PI / 2; rod.position.set(0, 0.45, 1.1);
    const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.25, 16), new THREE.MeshStandardMaterial({ color: 0x401010, roughness: 0.6 }));
    tip.rotation.x = Math.PI / 2; tip.position.set(0, 0.45, 0);
    const coils = [];
    for (let k = 0; k < 7; k++) { const tg = new THREE.TorusGeometry(0.26, 0.04, 5, 14); tg.translate(0, 0, 0.3 + k * 0.22); coils.push(tg); }
    const spring = new THREE.Mesh(mergeGeometries(coils), new THREE.MeshStandardMaterial({ color: 0xc0c0c8, metalness: 1, roughness: 0.3, envMap: this.envMap }));
    spring.position.y = 0.45;
    g.add(rod, tip, spring);
    W(19.8, 0.6, 0, g.position);
    this.scene.add(g);
    this.plungerG = g; this.plungerSpring = spring; this.plungerBaseZ = g.position.z;
  }

  _buildBalls() {
    const tex = TX.ballTexture();
    this.ballMeshes = [];
    const geo = new THREE.SphereGeometry(R, 32, 20);
    for (const b of this.sim.world.balls) {
      const mat = new THREE.MeshPhysicalMaterial({
        map: tex, color: 0xffffff, metalness: 0.25, roughness: 0.08, clearcoat: 1, clearcoatRoughness: 0.05,
        envMap: this.envMap, envMapIntensity: 1.6, emissive: 0x0b5a30, emissiveIntensity: 0.55, transparent: true, opacity: 1,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.visible = false;
      const halo = glowSprite(this.tex.glow, new THREE.Color(0x60ffb0), 1.9, 0.5);
      const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1.4), new THREE.MeshBasicMaterial({ map: this.tex.shadow, transparent: true, depthWrite: false }));
      shadow.rotation.x = -Math.PI / 2;
      shadow.renderOrder = 1;
      this.scene.add(mesh, halo, shadow);
      this.ballMeshes.push({ b, mesh, halo, shadow, mat, lastX: 0, lastZ: 0, trail: 0, spawnFx: 0 });
    }
  }

  // ----------------------------------------------------------------------------------------- events
  bind(bus) {
    const P = this.particles;
    const gold = new THREE.Color(0xffd060), green = new THREE.Color(0x60ff90), cyan = new THREE.Color(0x60f0ff), pink = new THREE.Color(0xff60e0), white = new THREE.Color(0xffffff);
    bus.on('element', ({ id, x, y }) => {
      const mu = this.mushrooms[id];
      if (mu) { mu.hit = 1; W(x, y, 1, _v); P.burst(_v.x, 1.2, _v.z, mu.color, 26, 6, 0.55, 0.8); }
      const cr = this.crystals[id];
      if (cr) { cr.hit = 1; W(x, y, 1, _v); P.burst(_v.x, 1.0, _v.z, cyan, 34, 8, 0.4, 0.6, -9, 0.3); }
      if (id === 'potion') { this.potion.hit = 1; W(this.potion.x, this.potion.y, 0, _v); for (let k = 0; k < 14; k++) P.spawn(_v.x + (Math.random() - 0.5) * 0.6, 1.2 + Math.random(), _v.z + (Math.random() - 0.5) * 0.6, (Math.random() - 0.5), 2 + Math.random() * 2, (Math.random() - 0.5), pink, 0.45, 1.2, 0.5); }
    });
    bus.on('contact', (c) => {
      if (c.kind === 'sling' && this.slingRubbers[c.id]) { const s = this.slingRubbers[c.id]; s.flash = 1; P.burst(s.mid.x, 0.6, s.mid.z, gold, 12, 5, 0.35, 0.4); }
      else if (c.impact > 25 && (c.kind === 'wall' || c.kind === 'gate')) { W(c.x, c.y, 0, _v); P.burst(_v.x, 0.5, _v.z, gold, 5, 3, 0.25, 0.3); }
    });
    bus.on('wizardHit', () => { this.wizard.hit = 1; this.wizard.staffG.children[1].getWorldPosition(_v); P.burst(_v.x, _v.y, _v.z, new THREE.Color(0x9fd0ff), 30, 5, 0.45, 0.8, -2); });
    bus.on('wizardCharge', ({ charge }) => { this.wizard.charge = charge; });
    bus.on('doorOpen', () => {
      this.tower.target = 1;
      this.wizard.staffG.children[1].getWorldPosition(_v);
      for (let k = 0; k < 40; k++) { // magic stream from the staff to the tower
        const t = k / 40; const tw = this.towerTopWorld;
        P.spawn(_v.x + (tw.x - _v.x) * t, _v.y + (2.5 - _v.y) * t + Math.sin(t * 3) * 1.5, _v.z + (tw.z + 2 - _v.z) * t, 0, 0.5, 0, gold, 0.6, 0.6 + t, 0);
      }
    });
    bus.on('doorClose', () => { this.tower.target = 0; });
    bus.on('towerEnter', () => { this.fireworks(5, 2.4); this.shake = 0.6; this.flash = 0.8; });
    bus.on('superJackpot', ({ x, y }) => { this.fireworks(3, 1.2); W(x, y, 0, _v); P.burst(_v.x, 1, _v.z, gold, 60, 10, 0.6, 1.0); this.shake = 0.5; this.flash = 0.6; });
    bus.on('skillShot', ({ x, y }) => { W(x, y, 0, _v); P.burst(_v.x, 1.5, _v.z, green, 50, 9, 0.6, 1); this.fireworks(1, 0.1); });
    bus.on('skillRedirect', () => { W(19.8, 32.5, 0, _v); P.burst(_v.x, 0.8, _v.z, green, 30, 6, 0.5, 0.6, 0); });
    bus.on('kickbackFire', ({ x, y }) => { W(x, y, 0, _v); P.burst(_v.x, 0.5, _v.z, green, 30, 7, 0.5, 0.6); this.shake = 0.25; });
    bus.on('railEnter', ({ id }) => { this.rampMeshes[id].flash = 1; });
    bus.on('ramp', ({ id }) => { const end = this.table.ramps[id].path.pts.at(-1); W(end[0], end[1], 0, _v); P.burst(_v.x, 0.6, _v.z, id === 'rampA' ? cyan : gold, 30, 5, 0.45, 0.7); });
    bus.on('loop', ({ side }) => { const p = this.table.decor.inserts[side === 'L' ? 'orbitL' : 'orbitR']; W(p.x, p.y + 2, 0, _v); P.burst(_v.x, 0.6, _v.z, pink, 30, 6, 0.45, 0.7); });
    bus.on('poolSplash', ({ x, y, speed }) => {
      const pl = this.table.decor.pool;
      const r = this.poolUniforms.uRipples.value[this.rippleIndex++ % 4];
      r.set(x - pl.x, y - pl.y, this.time, Math.min(1, 0.3 + speed / 40));
      W(x, y, 0, _v);
      P.burst(_v.x, 0.2, _v.z, this.theme.poolShallow, 10, 3, 0.3, 0.5, -10, 1.2);
    });
    bus.on('ballDissolve', ({ x, y, z, visible }) => { if (visible) { W(x, y, z + R, _v); P.burst(_v.x, _v.y, _v.z, white, 40, 4, 0.5, 1, 1, 0.2); P.burst(_v.x, _v.y, _v.z, green, 30, 3, 0.45, 1.2, 1.5, 0.2); } });
    bus.on('ballSpawn', ({ id, where }) => { const bm = this.ballMeshes[id]; bm.spawnFx = 1; if (where === 'portal') { const p = this.table.points.portal; W(p[0], p[1], 0, _v); P.burst(_v.x, 0.6, _v.z, pink, 40, 5, 0.5, 0.8, 0); } });
    bus.on('towerEject', ({ x, y }) => { W(x, y, 0, _v); P.burst(_v.x, 0.6, _v.z, gold, 24, 5, 0.45, 0.6); });
    bus.on('ballRescue', () => { const p = this.table.points.rescue; W(p[0], p[1], 0, _v); P.burst(_v.x, 0.6, _v.z, white, 30, 4, 0.45, 0.7); });
    bus.on('multiballStart', () => { this.flash = 1; });
    bus.on('stage', ({ index, initial }) => this.setStage(index, !!initial));
    bus.on('gameStart', () => { this.tower.target = 0; this.wizard.charge = 0; });
  }

  fireworks(shells, spread) {
    for (let i = 0; i < shells; i++) {
      this.pending = this.pending || [];
      this.pending.push({ t: i * (spread / Math.max(1, shells)), done: false });
    }
  }

  setStage(index, instant = false) {
    this.themeFrom = lerpTheme(this.theme, this.theme, 0, {});
    this.themeTo = THEMES[index];
    this.themeT = instant ? 1 : 0;
    if (instant) { lerpTheme(this.themeTo, this.themeTo, 0, this.theme); this._applyTheme(this.theme); }
  }

  _applyTheme(th) {
    this.scene.background = th.background;
    this.hemi.color.copy(th.hemiSky); this.hemi.groundColor.copy(th.hemiGround); this.hemi.intensity = th.hemiIntensity;
    this.dir.color.copy(th.dirColor); this.dir.intensity = th.dirIntensity;
    this.fieldMat.color.copy(th.fieldTint);
    this.towerLight.color.copy(th.towerLight);
    this.poolLight.color.copy(th.poolShallow);
    this.poolUniforms.uDeep.value.copy(th.poolDeep);
    this.poolUniforms.uShallow.value.copy(th.poolShallow);
    this.skyUniforms.uTop.value.copy(th.skyTop);
    this.skyUniforms.uBottom.value.copy(th.skyBottom);
    this.fallUniforms.uColor.value.copy(th.waterfall);
    this.fallMist.material.color.copy(th.waterfall);
    this.stars.material.uniforms.uOpacity.value = th.stars;
    this.fireflies.material.uniforms.uColor.value.copy(th.sparkColor);
    this.fireflies.material.uniforms.uMode.value = th.sparkMode;
    this.crystalMat.emissive.copy(th.crystalColor).multiplyScalar(0.5);
    this.windowMat.emissive.copy(th.towerLight);
    this.silMat.color.copy(th.background);
    this.renderer.toneMappingExposure = th.exposure;
    for (const c of Object.values(this.crystals)) { c.mat.emissive.copy(th.crystalColor); c.halo.material.color.copy(th.crystalColor); c.glow.material.color.copy(th.crystalColor); }
  }

  // ----------------------------------------------------------------------------------------- frame
  setCameraMode(mode) { this.cameraMode = mode; this.resize(); }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.fov = this.cameraMode === 'top' ? 34 : 40;
    this.camera.updateProjectionMatrix();
    const topPx = this.getTopInset(), botPx = this.getBottomInset();
    const yTop = 1 - (2 * topPx) / h, yBot = -1 + (2 * botPx) / h;
    const avail = yTop - yBot;
    const target = new THREE.Vector3(0, 0, 1.5);
    const pts = [[-OX - 0.6, 0, OZ + 0.8], [OX + 0.6, 0, OZ + 0.8], [-OX, 1.6, -OZ], [OX, 1.6, -OZ], [-OX - 0.6, 1.6, 0], [OX + 0.6, 1.6, 0]].map((p) => new THREE.Vector3(...p));
    const cam = this.camera;
    const dir = new THREE.Vector3();
    const measure = (d) => {
      cam.position.copy(target).addScaledVector(dir, -d);
      cam.lookAt(target);
      cam.updateMatrixWorld();
      let minX = 9, maxX = -9, minY = 9, maxY = -9;
      for (const p of pts) { _v.copy(p).project(cam); minX = Math.min(minX, _v.x); maxX = Math.max(maxX, _v.x); minY = Math.min(minY, _v.y); maxY = Math.max(maxY, _v.y); }
      return { minX, maxX, minY, maxY };
    };
    const fitAt = (pitchDeg) => {
      const p = (pitchDeg * Math.PI) / 180;
      dir.set(0, -Math.sin(p), -Math.cos(p));
      let lo = 5, hi = 400;
      for (let i = 0; i < 32; i++) {
        const mid = (lo + hi) / 2;
        const m = measure(mid);
        if (m.maxX - m.minX <= 1.97 && m.maxY - m.minY <= avail * 0.995) hi = mid; else lo = mid;
      }
      const m = measure(hi);
      return { d: hi, m, fill: (m.maxY - m.minY) / avail };
    };
    // the lowest (most three-dimensional) camera angle that still fills the screen height on this phone
    const [p0, p1] = this.cameraMode === 'top' ? [70, 84] : [44, 64];
    let pitch = p1;
    for (let pd = p0; pd <= p1; pd += 1) { if (fitAt(pd).fill >= 0.965) { pitch = pd; break; } }
    const { m } = fitAt(pitch);
    this.camBase = cam.position.clone();
    this.camTarget = target.clone();
    this.cameraPitch = pitch;
    // off-axis shift: table bottom sits on the bottom edge, any spare room goes under the HUD (backdrop / waterfall)
    const shift = yBot - m.minY;
    cam.projectionMatrix.elements[9] = -shift;
    cam.projectionMatrixInverse.copy(cam.projectionMatrix).invert();
    this._pointScale = (h * this.pixelRatio) / (2 * Math.tan((cam.fov * Math.PI) / 360));
    for (const mat of [this.particles?.material, this.fireflies?.material, this.stars?.material]) if (mat) mat.uniforms.uScale.value = this._pointScale;
  }

  /** Screen position (CSS px) of a table point; used by the HUD for score pop-ups. */
  project(x, y, h = 1) {
    W(x, y, h, _v).project(this.camera);
    return { x: (_v.x * 0.5 + 0.5) * window.innerWidth, y: (-_v.y * 0.5 + 0.5) * window.innerHeight };
  }

  render(dt, alpha) {
    this.time += dt;
    const t = this.time;
    const rules = this.sim.rules;

    // chapter transition (cross-fade of all lighting)
    if (this.themeT < 1) {
      this.themeT = Math.min(1, this.themeT + dt / 3);
      lerpTheme(this.themeFrom, this.themeTo, smooth(this.themeT), this.theme);
      this._applyTheme(this.theme);
    }
    const th = this.theme;

    // flippers
    for (const { f, g } of this.flipperMeshes) g.rotation.y = f.angle;

    // balls
    for (const bm of this.ballMeshes) {
      const b = bm.b;
      const vis = b.active && b.mode !== 'tower';
      bm.mesh.visible = bm.halo.visible = bm.shadow.visible = vis;
      if (!vis) continue;
      const x = b.px + (b.x - b.px) * alpha, y = b.py + (b.y - b.py) * alpha, z = b.pz + (b.z - b.pz) * alpha;
      W(x, y, z + R, bm.mesh.position);
      const dx = bm.mesh.position.x - bm.lastX, dz = bm.mesh.position.z - bm.lastZ;
      const d = Math.hypot(dx, dz);
      if (d > 1e-4 && d < 3) {
        _axis.set(dz, 0, -dx).normalize();
        _q.setFromAxisAngle(_axis, d / R);
        bm.mesh.quaternion.premultiply(_q);
      }
      bm.lastX = bm.mesh.position.x; bm.lastZ = bm.mesh.position.z;
      bm.halo.position.copy(bm.mesh.position);
      bm.shadow.position.set(bm.mesh.position.x + 0.15, z + 0.02, bm.mesh.position.z + 0.1);
      // magical trail at speed
      const sp = Math.hypot(b.vx, b.vy);
      if ((sp > 38 || b.mode === 'rail') && (bm.trail += dt) > 0.03) {
        bm.trail = 0;
        this.particles.spawn(bm.mesh.position.x, bm.mesh.position.y, bm.mesh.position.z, 0, 0.3, 0, Math.random() < 0.5 ? th.sparkColor : _col.setRGB(1, 0.85, 0.4), 0.35, 0.35, 0);
      }
      if (bm.spawnFx > 0) bm.spawnFx = Math.max(0, bm.spawnFx - dt * 2);
      bm.mat.emissiveIntensity = 0.55 + bm.spawnFx * 2;
    }

    // mushrooms bounce + glow
    for (const mu of Object.values(this.mushrooms)) {
      mu.hit = Math.max(0, mu.hit - dt * 3.5);
      const k = mu.hit;
      mu.capGroup.scale.set(1 + k * 0.18, 1 - k * 0.25, 1 + k * 0.18);
      mu.capGroup.position.y = -k * 0.15;
      const pulse = 0.5 + 0.5 * Math.sin(t * 2 + mu.phase);
      mu.capMat.emissive.copy(th.glowColor).lerp(mu.color, 0.5);
      mu.capMat.emissiveIntensity = th.glowStrength * (0.35 + 0.25 * pulse) + k * 2.5;
      mu.glow.material.opacity = 0.25 + th.glowStrength * 0.15 + k * 0.7;
      mu.halo.material.opacity = 0.15 + th.glowStrength * 0.12 + k * 0.6;
    }
    for (const cr of Object.values(this.crystals)) {
      cr.hit = Math.max(0, cr.hit - dt * 4);
      const pulse = 0.5 + 0.5 * Math.sin(t * 2.6 + cr.phase);
      cr.mat.emissiveIntensity = 0.5 + th.glowStrength * 0.5 * pulse + cr.hit * 3;
      cr.halo.material.opacity = 0.25 + th.glowStrength * 0.15 + cr.hit * 0.6;
      cr.m.scale.setScalar(1 + cr.hit * 0.12);
      cr.m.rotation.y += dt * 0.25;
    }
    this.potion.hit = Math.max(0, this.potion.hit - dt * 3);
    this.potion.g.rotation.z = Math.sin(t * 30) * 0.12 * this.potion.hit;
    this.potion.halo.material.opacity = 0.4 + 0.2 * Math.sin(t * 3) + this.potion.hit;
    this.potionLiquidMat.emissiveIntensity = 1 + this.potion.hit * 2 + 0.3 * Math.sin(t * 2.2);
    if (Math.random() < dt * 2.5) { W(this.potion.x, this.potion.y, 0, _v); this.particles.spawn(_v.x + (Math.random() - 0.5) * 0.2, 1.6, _v.z, 0, 1.2, 0, _col.setRGB(1, 0.4, 0.9), 0.25, 0.9, 0); }

    // wizard
    const wz = this.wizard;
    wz.hit = Math.max(0, wz.hit - dt * 3);
    wz.body.position.y = Math.sin(t * 1.6) * 0.05 + wz.hit * 0.25;
    wz.body.rotation.z = Math.sin(t * 0.9) * 0.04;
    wz.staffG.rotation.z = Math.sin(t * 1.3) * 0.06 - wz.hit * 0.3;
    const charged = rules.doorOpen;
    const lvl = charged ? 3 : wz.charge;
    const orbCol = _col.setHSL(0.58 - lvl * 0.06, 1, 0.6 + lvl * 0.05);
    this.orbMat.emissive.copy(orbCol);
    this.orbMat.emissiveIntensity = 0.6 + lvl * 0.9 + wz.hit * 3 + (charged ? Math.sin(t * 10) * 0.8 : 0);
    this.orbHalo.material.color.copy(orbCol);
    this.orbHalo.scale.setScalar(1.2 + lvl * 0.45 + wz.hit);
    this.plateMat.emissiveIntensity = 0.3 + lvl * 0.35 + wz.hit * 2;
    wz.auraGlow.material.opacity = 0.25 + lvl * 0.15;
    if (lvl > 0 && Math.random() < dt * (4 + lvl * 6)) { // orbiting sparkles show the charge
      wz.staffG.children[1].getWorldPosition(_v);
      const a = Math.random() * Math.PI * 2;
      this.particles.spawn(_v.x + Math.cos(a) * 0.6, _v.y + (Math.random() - 0.5) * 0.6, _v.z + Math.sin(a) * 0.6, -Math.sin(a) * 1.5, 0.4, Math.cos(a) * 1.5, orbCol, 0.35, 0.6, 0);
    }

    // tower door + lights
    const tw = this.tower;
    tw.open += (tw.target - tw.open) * Math.min(1, dt * 5);
    for (const { hinge, side } of tw.leaves) hinge.rotation.y = side * tw.open * 1.75;
    const doorPulse = tw.target ? 0.75 + 0.25 * Math.sin(t * 6) : 0;
    this.doorGlow.material.opacity = tw.open * doorPulse;
    tw.beam.material.opacity = tw.open * 0.7 * doorPulse;
    this.doorInnerMat.color.setRGB(0.07 + tw.open * 1.0, 0.03 + tw.open * 0.75, 0.02 + tw.open * 0.25);
    this.towerLight.intensity = th.towerLightIntensity * (1 + tw.open * 2.5 * doorPulse) + (rules.multiball ? 10 * (0.5 + 0.5 * Math.sin(t * 8)) : 0);
    this.windowMat.emissiveIntensity = 1.2 + 0.4 * Math.sin(t * 1.5) + (rules.multiball ? 1.5 : 0);
    this.spireStar.material.opacity = 0.7 + 0.3 * Math.sin(t * 3);
    if (tw.target && Math.random() < dt * 20) {
      W(CX, 28.6, 0, _v);
      this.particles.spawn(_v.x + (Math.random() - 0.5) * 1.6, 0.2 + Math.random() * 2, _v.z + 0.3, (Math.random() - 0.5), 1 + Math.random(), 1.5, _col.setRGB(1, 0.8, 0.35), 0.4, 0.9, 0.5);
    }

    // fireworks queue
    if (this.pending && this.pending.length) {
      for (const p of this.pending) {
        p.t -= dt;
        if (!p.done && p.t <= 0) {
          p.done = true;
          const hue = Math.random();
          const top = this.towerTopWorld;
          this.particles.firework(top.x + (Math.random() - 0.5) * 6, top.y + 3 + Math.random() * 3, top.z + (Math.random() - 0.5) * 3, _col.setHSL(hue, 1, 0.6).clone(), 80, 6 + Math.random() * 3);
          this.particles.firework(top.x + (Math.random() - 0.5) * 6, top.y + 2 + Math.random() * 3, top.z + (Math.random() - 0.5) * 3, _col.setHSL((hue + 0.15) % 1, 1, 0.7).clone(), 40, 4);
        }
      }
      this.pending = this.pending.filter((p) => !p.done);
    }

    // slings, ramps flashes
    for (const s of Object.values(this.slingRubbers)) { s.flash = Math.max(0, s.flash - dt * 5); s.mat.emissiveIntensity = 0.15 + s.flash * 2.5; }
    for (const r of Object.values(this.rampMeshes)) { r.flash = Math.max(0, r.flash - dt * 1.5); r.mat.emissiveIntensity = 0.45 + r.flash * 1.5 + 0.15 * Math.sin(t * 2); }

    this._updateInserts(t, rules);

    // skill-shot indicator
    const skill = rules.skillLit && !!this.sim.heldBall();
    this.skillRing.material.opacity = skill ? 0.85 : (rules.skillAvailable && this.sim.heldBall() ? 0.12 : 0);
    this.skillRing.scale.setScalar(skill ? 1 + 0.08 * Math.sin(t * 12) : 1);
    this.laneGlow.material.opacity = skill ? 0.9 : 0;

    // plunger
    const pz = this.sim.plunger.pos * 1.6;
    this.plungerG.position.z = this.plungerBaseZ + pz;
    this.plungerSpring.scale.z = 1 - this.sim.plunger.pos * 0.45;

    // pool / sky / fireflies / waterfall
    this.poolUniforms.uTime.value = t;
    this.fallUniforms.uTime.value = t;
    this.fireflies.material.uniforms.uTime.value = t;
    this.stars.material.uniforms.uTime.value = t;

    this.particles.update(dt);

    // camera shake / flash
    this.shake = Math.max(0, this.shake - dt * 1.5);
    this.flash = Math.max(0, this.flash - dt * 2);
    if (this.camBase) {
      const s = this.shake * this.shake * 0.35;
      this.camera.position.set(this.camBase.x + (Math.random() - 0.5) * s, this.camBase.y + (Math.random() - 0.5) * s, this.camBase.z);
    }
    this.renderer.toneMappingExposure = th.exposure * (1 + this.flash * 0.35);

    this.renderer.render(this.scene, this.camera);
    this._adaptQuality(dt);
  }

  _updateInserts(t, rules) {
    const blink = (f, ph = 0) => (Math.sin(t * f + ph) > 0 ? 1 : 0.15);
    let i = 0;
    for (const it of this.insertList) {
      let lvl = 0;
      let color = it.color;
      const [kind, arg] = it.key.split(':');
      if (kind === 'combo') {
        if (rules.rushActive) { lvl = blink(14, i); color = _col.setHSL((t * 0.8 + i / 6) % 1, 1, 0.55); }
        else lvl = rules.combo.has(arg) ? 1 : 0.08;
      } else if (kind === 'kickback') lvl = rules.kickbackLit ? 1 : 0.06;
      else if (kind === 'wizard') {
        const n = Number(arg);
        lvl = rules.doorOpen ? blink(12) : rules.wizardCharge > n ? 1 : rules.wizardCharge === n && !rules.multiball ? blink(4) * 0.6 : 0.06;
      } else if (kind === 'door') lvl = rules.doorOpen ? blink(10) : rules.multiball ? blink(16) : 0.08;
      else lvl = 0.25 + 0.75 * Math.max(0, Math.sin(t * 3 - i * 0.7)) * (rules.state === 'playing' ? 1 : 0.6);
      if (rules.state !== 'playing') lvl = 0.3 + 0.7 * Math.max(0, Math.sin(t * 2.5 - i * 0.5)); // attract mode chase
      // only touch the GPU buffer when something changed
      const q = Math.round(lvl * 20);
      if (q !== it.level || kind === 'combo') {
        it.level = q;
        this.insertDisc.setColorAt(i, _col.copy(color).multiplyScalar(0.12 + lvl * 0.95));
        this.insertGlow.setColorAt(i, _col.copy(color).multiplyScalar(lvl * 0.9));
        this._insertsDirty = true;
      }
      i++;
    }
    if (this._insertsDirty) {
      this.insertDisc.instanceColor.needsUpdate = true;
      this.insertGlow.instanceColor.needsUpdate = true;
      this._insertsDirty = false;
    }
  }

  _adaptQuality(dt) {
    // keep 50-60 FPS on older iPhones: lower the render resolution if frames get slow
    this.frameTimes.push(dt);
    if (this.frameTimes.length < 90) return;
    const avg = this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length;
    this.frameTimes.length = 0;
    if (avg > 1 / 50 && this.pixelRatio > 1) {
      this.pixelRatio = Math.max(1, this.pixelRatio - 0.25);
      this.renderer.setPixelRatio(this.pixelRatio);
      this.resize();
    } else if (avg < 1 / 58 && this.pixelRatio < this.maxPixelRatio && (this.qualityTimer += 1) > 6) {
      this.qualityTimer = 0;
      this.pixelRatio = Math.min(this.maxPixelRatio, this.pixelRatio + 0.25);
      this.renderer.setPixelRatio(this.pixelRatio);
      this.resize();
    }
  }

  get fps() { return this._fps || 0; }
}
