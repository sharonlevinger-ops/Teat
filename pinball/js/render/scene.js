// Presentation: Three.js scene. Reads simulation state every frame and reacts to bus events.
// It never changes game state.
//
// Look: a dark, lush enchanted forest table – moss, roots, cobblestones, a cream mushroom tower with glowing
// windows, the wizard, glossy numbered mushrooms, crystals, a potion, a stone-rimmed magic pool – lit by a
// soft key light with real shadows plus coloured point lights, finished with bloom and a vignette.
import * as THREE from '../vendor/three.module.min.js';
import { EffectComposer } from '../vendor/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from '../vendor/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from '../vendor/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from '../vendor/jsm/postprocessing/OutputPass.js';
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
const V2 = (pts) => pts.map(([a, b]) => new THREE.Vector2(a, b));

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

/** Boxes along a table-space polyline. outFrom: push the wall away from that point by half its thickness. */
function wallBoxes(pts, { thick = 0.25, h = 1, y0 = 0, outFrom = null }) {
  const geos = [];
  const m = new THREE.Matrix4();
  let run = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, ay] = pts[i], [bx, by] = pts[i + 1];
    const dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy);
    if (len < 1e-4) continue;
    let mx = (ax + bx) / 2, my = (ay + by) / 2;
    if (outFrom) {
      let nx = -dy / len, ny = dx / len;
      if ((mx - outFrom[0]) * nx + (my - outFrom[1]) * ny < 0) { nx = -nx; ny = -ny; }
      mx += (nx * thick) / 2; my += (ny * thick) / 2;
    }
    const g = new THREE.BoxGeometry(len + thick * 0.9, h, thick);
    const uv = g.attributes.uv; // continuous texture along the wall
    for (let k = 0; k < uv.count; k++) uv.setX(k, (run + uv.getX(k) * len) * 0.35);
    run += len;
    m.makeRotationY(Math.atan2(dy, dx));
    m.setPosition(mx - OX, y0 + h / 2, OZ - my);
    g.applyMatrix4(m);
    geos.push(g);
  }
  return geos;
}

function tubeAlong(pts3, radius, seg = 6) {
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts3), Math.max(8, pts3.length * 3), radius, seg);
}

function extrudeTable(pts, depth, bevel = 0.04) {
  const shape = new THREE.Shape();
  pts.forEach(([x, y], i) => (i ? shape.lineTo(x - OX, y - OZ) : shape.moveTo(x - OX, y - OZ)));
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 4 });
  g.rotateX(-Math.PI / 2);
  return g;
}

function glowSprite(tex, color, size, opacity = 1) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending }));
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

const shadowy = (o, cast = true, receive = false) => { o.traverse((c) => { if (c.isMesh) { c.castShadow = cast; c.receiveShadow = receive; } }); return o; };

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
    this.bloomEnabled = true;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.maxPixelRatio = dpr;
    this.pixelRatio = dpr;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', stencil: false });
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(40, 1, 0.5, 220);

    this.tex = {
      glow: TX.glowTexture(),
      star: TX.starTexture(),
      bark: TX.barkTexture(3, [64, 38, 20]),
      darkBark: TX.barkTexture(8, [40, 24, 13]),
      plaster: TX.plasterTexture(),
      stone: TX.stoneTexture(),
    };
    this.gold = []; // static gold trim from every part of the table -> one merged mesh
    this._buildEnv();
    this._buildMaterials();
    this._buildLights();
    this._buildField();
    this._buildCabinet();
    this._buildWalls();
    this._buildSlings();
    this._buildFlippers();
    this._buildMushrooms();
    this._buildCrystals();
    this._buildPotion();
    this._buildWizard();
    this._buildTower();
    this._buildPool();
    this._buildRamps();
    this._buildDecor();
    this._buildBackdrop();
    this._buildInserts();
    this._buildPlunger();
    this._buildBalls();
    const goldMesh = new THREE.Mesh(mergeGeometries(this.gold), this.mat.gold);
    goldMesh.castShadow = true;
    this.scene.add(goldMesh);
    this.gold = null;

    this.particles = new ParticleSystem(700);
    this.scene.add(this.particles.points);
    this.fireflies = createFireflies(120, { minX: -OX + 1, maxX: OX - 1, minZ: -OZ + 2, maxZ: OZ - 4 });
    this.scene.add(this.fireflies);

    this._buildComposer();

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
    const top = new THREE.Color(0x3a5a9a), mid = new THREE.Color(0xffe0b0), bot = new THREE.Color(0x10200c);
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

  _buildMaterials() {
    const t = this.tex;
    const flipperRune = TX.runeWoodTexture(9);
    for (const tx of [flipperRune.map, flipperRune.emissiveMap]) { tx.repeat.set(1 / 3.8, 1 / 1.25); tx.offset.set(0.03, 0.5); }
    const slingRune = TX.runeWoodTexture(21);
    for (const tx of [slingRune.map, slingRune.emissiveMap]) { tx.repeat.set(0.35, 0.6); tx.offset.set(0.2, 0.3); tx.rotation = 1.2; }
    this.mat = {
      gold: new THREE.MeshStandardMaterial({ color: 0xe3b25a, metalness: 1, roughness: 0.28, envMap: this.envMap, envMapIntensity: 1.3 }),
      bark: new THREE.MeshStandardMaterial({ map: t.bark.map, normalMap: t.bark.normalMap, roughness: 0.82, color: 0xd8b898 }),
      darkBark: new THREE.MeshStandardMaterial({ map: t.darkBark.map, normalMap: t.darkBark.normalMap, roughness: 0.78, color: 0xc8a888 }),
      plaster: new THREE.MeshStandardMaterial({ map: t.plaster.map, normalMap: t.plaster.normalMap, roughness: 0.9 }),
      stone: new THREE.MeshStandardMaterial({ map: t.stone.map, normalMap: t.stone.normalMap, roughness: 0.92 }),
      runeGlow: new THREE.MeshStandardMaterial({ color: 0x1a3a1a, emissive: 0x4dff7a, emissiveIntensity: 1.8, roughness: 0.6 }),
      flipperTop: new THREE.MeshStandardMaterial({ map: flipperRune.map, emissiveMap: flipperRune.emissiveMap, emissive: 0x6dff8a, emissiveIntensity: 2.2, roughness: 0.55 }),
      slingTop: new THREE.MeshStandardMaterial({ map: slingRune.map, emissiveMap: slingRune.emissiveMap, emissive: 0x6dff8a, emissiveIntensity: 2.0, roughness: 0.6 }),
      crystal: new THREE.MeshStandardMaterial({
        color: 0x9fe4ff, emissive: 0x2a9ad0, emissiveIntensity: 0.3, roughness: 0.05, metalness: 0.2,
        transparent: true, opacity: 0.38, envMap: this.envMap, envMapIntensity: 1.8, depthWrite: false,
      }),
      emerald: new THREE.MeshStandardMaterial({ color: 0x2aff9a, emissive: 0x1aff80, emissiveIntensity: 1.6, roughness: 0.05, metalness: 0.3, flatShading: true, envMap: this.envMap }),
      purpleGem: new THREE.MeshStandardMaterial({ color: 0xff6ae0, emissive: 0xd03ac0, emissiveIntensity: 1.8, roughness: 0.1, flatShading: true, envMap: this.envMap }),
    };
    this.crystalMat = this.mat.crystal;
  }

  _buildLights() {
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x333333, 0.6);
    this.scene.add(this.hemi);
    this.dir = new THREE.DirectionalLight(0xffffff, 1.6);
    this.dir.position.set(-9, 34, 14);
    this.dir.target.position.set(0, 0, -2);
    this.dir.castShadow = true;
    this.dir.shadow.mapSize.set(2048, 2048);
    const sc = this.dir.shadow.camera;
    sc.left = -16; sc.right = 16; sc.top = 26; sc.bottom = -24; sc.near = 5; sc.far = 80;
    this.dir.shadow.bias = -0.0006;
    this.dir.shadow.normalBias = 0.03;
    this.dir.shadow.radius = 3;
    this.scene.add(this.dir, this.dir.target);
    const t = this.table.decor.tower;
    this.towerLight = new THREE.PointLight(0xffd27a, 10, 14, 1.6);
    W(t.x, t.y - t.r - 1.2, 1.8, this.towerLight.position);
    this.scene.add(this.towerLight);
    const p = this.table.decor.pool;
    this.poolLight = new THREE.PointLight(0x58e0ff, 8, 9, 1.5);
    W(p.x, p.y, 1.4, this.poolLight.position);
    this.scene.add(this.poolLight);
  }

  _buildField() {
    const f = TX.forestFloor(this.table);
    this.fieldMat = new THREE.MeshStandardMaterial({
      map: f.map, normalMap: f.normalMap, normalScale: new THREE.Vector2(1.1, 1.1),
      emissiveMap: f.emissiveMap, emissive: 0xffffff, emissiveIntensity: 1.3, roughness: 0.92, metalness: 0,
    });
    const field = new THREE.Mesh(new THREE.PlaneGeometry(TABLE_W, TABLE_H), this.fieldMat);
    field.rotation.x = -Math.PI / 2;
    field.receiveShadow = true;
    this.scene.add(field);
  }

  _buildCabinet() {
    // wide carved wooden frame with gold filigree and pink gems (as in the concept art)
    const parts = [];
    parts.push(new THREE.BoxGeometry(TABLE_W + 4, 3, TABLE_H + 5).translate(0, -1.52, -0.5));
    for (const sx of [-1, 1]) parts.push(new THREE.BoxGeometry(2, 2.3, TABLE_H + 5).translate(sx * (OX + 1), 1.15 - 0.3, -0.5));
    parts.push(new THREE.BoxGeometry(TABLE_W + 4, 1.0, 2).translate(0, 0.2, OZ + 2.2));
    parts.push(new THREE.BoxGeometry(TABLE_W + 4, 2.3, 1.2).translate(0, 0.85, -OZ - 0.6));
    const cab = new THREE.Mesh(mergeGeometries(parts), this.mat.darkBark);
    cab.receiveShadow = true;
    this.scene.add(cab);
    for (const sx of [-1, 1]) {
      this.gold.push(new THREE.BoxGeometry(0.18, 0.16, TABLE_H + 5).translate(sx * (OX + 0.12), 2.0, -0.5));
      this.gold.push(new THREE.BoxGeometry(0.12, 0.12, TABLE_H + 5).translate(sx * (OX + 1.9), 2.0, -0.5));
      const vine = [];
      for (let i = 0; i <= 60; i++) vine.push(new THREE.Vector3(sx * (OX + 1) + Math.sin(i * 0.55) * 0.55, 2.02, -OZ - 2 + (i / 60) * (TABLE_H + 4)));
      this.gold.push(tubeAlong(vine, 0.05, 5));
      for (let i = 0; i < 12; i++) { // curls
        const z = -OZ + i * 3.4, cx = sx * (OX + 1) + (i % 2 ? 0.4 : -0.4);
        const curl = [];
        for (let k = 0; k <= 14; k++) { const a = (k / 14) * Math.PI * 1.6; curl.push(new THREE.Vector3(cx + Math.cos(a) * 0.3 * (1 - k / 20), 2.03, z + Math.sin(a) * 0.3 * (1 - k / 20))); }
        this.gold.push(tubeAlong(curl, 0.035, 4));
      }
      for (const z of [-4, 6]) { // pink gems in gold bezels
        const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.42, 0), this.mat.purpleGem);
        gem.scale.set(1, 0.5, 1.4);
        gem.position.set(sx * (OX + 1), 2.15, z);
        this.scene.add(gem);
        this.gold.push(new THREE.TorusGeometry(0.55, 0.07, 6, 16).rotateX(Math.PI / 2).translate(sx * (OX + 1), 2.07, z));
      }
    }
  }

  _buildWalls() {
    const byMat = { cabinet: [], wood: [], runeBase: [], runeTop: [], crystalRamp: [] };
    const center = [OX, OZ];
    for (const w of this.table.walls) {
      switch (w.visual) {
        case 'cabinet':
          byMat.cabinet.push(...wallBoxes(w.pts, { thick: 0.8, h: w.h || 1.6, outFrom: center }));
          this.gold.push(...wallBoxes(w.pts, { thick: 0.16, h: 0.12, y0: w.h || 1.6, outFrom: center }));
          break;
        case 'wood': byMat.wood.push(...wallBoxes(w.pts, { thick: 0.3, h: w.h || 1.2 })); break;
        case 'rail': // wire-form style: wooden base, gold wire on top
          byMat.wood.push(...wallBoxes(w.pts, { thick: 0.22, h: (w.h || 1) - 0.22 }));
          this.gold.push(...wallBoxes(w.pts, { thick: 0.14, h: 0.14, y0: (w.h || 1) - 0.18 }));
          break;
        case 'runeRail': // carved wood with a glowing green rune strip
          byMat.runeBase.push(...wallBoxes(w.pts, { thick: 0.3, h: (w.h || 1) - 0.1 }));
          byMat.runeTop.push(...wallBoxes(w.pts, { thick: 0.12, h: 0.1, y0: (w.h || 1) - 0.1 }));
          break;
        case 'crystalRamp': byMat.crystalRamp.push(...wallBoxes(w.pts, { thick: 0.22, h: w.h || 1 })); break;
        case 'gate': this.gold.push(...wallBoxes(w.pts, { thick: 0.08, h: 0.9, y0: 0.15 })); break;
        default: break;
      }
    }
    const add = (list, mat, order = 0, cast = true) => {
      if (!list.length) return;
      const m = new THREE.Mesh(mergeGeometries(list), mat);
      m.renderOrder = order; m.castShadow = cast; m.receiveShadow = true;
      this.scene.add(m);
    };
    add(byMat.cabinet, this.mat.bark);
    add(byMat.wood, this.mat.bark);
    add(byMat.runeBase, this.mat.darkBark);
    add(byMat.runeTop, this.mat.runeGlow, 0, false);
    add(byMat.crystalRamp, this.mat.crystal, 3, false);
    for (const c of this.table.circles) if (c.kind === 'post') this.gold.push(new THREE.CylinderGeometry(0.2, 0.22, 1.1, 12).translate(c.x - OX, 0.55, OZ - c.y));
  }

  _buildSlings() {
    const bodies = [], tops = [];
    this.slingRubbers = {};
    this.table.decor.slings.forEach((s, i) => {
      const tri = [s.top, s.low, s.tip, s.top];
      bodies.push(extrudeTable(tri, 0.8, 0.05));
      const cxm = (s.top[0] + s.low[0] + s.tip[0]) / 3, cym = (s.top[1] + s.low[1] + s.tip[1]) / 3;
      const inset = tri.map(([x, y]) => [cxm + (x - cxm) * 0.72, cym + (y - cym) * 0.72]);
      tops.push(extrudeTable(inset, 0.03, 0).translate(0, 0.86, 0));
      this.gold.push(tubeAlong(tri.map(([x, y]) => W(x, y, 0.9, new THREE.Vector3())), 0.07, 5));
      const rub = new THREE.MeshStandardMaterial({ color: 0x3a0e0e, emissive: 0x7dff6a, emissiveIntensity: 0.15, roughness: 0.7 });
      const m = new THREE.Mesh(mergeGeometries(wallBoxes([s.top, s.tip], { thick: 0.24, h: 0.5, y0: 0.15 })), rub);
      this.scene.add(m);
      this.slingRubbers[i === 0 ? 'slingL' : 'slingR'] = { mat: rub, flash: 0, mid: W((s.top[0] + s.tip[0]) / 2, (s.top[1] + s.tip[1]) / 2, 0.5) };
    });
    this.scene.add(shadowy(new THREE.Mesh(mergeGeometries(bodies), this.mat.bark), true, true));
    this.scene.add(new THREE.Mesh(mergeGeometries(tops), this.mat.slingTop));
  }

  _buildFlippers() {
    this.flipperMeshes = [];
    const rubber = new THREE.MeshStandardMaterial({ color: 0x14240f, roughness: 0.7 });
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
      const body = new THREE.ExtrudeGeometry(shape(-0.04), { depth: 0.62, bevelEnabled: true, bevelThickness: 0.07, bevelSize: 0.05, bevelSegments: 2, curveSegments: 18 });
      body.rotateX(-Math.PI / 2);
      if (f.side === 'R') { const uv = body.attributes.uv; for (let k = 0; k < uv.count; k++) uv.setY(k, -uv.getY(k)); }
      const band = new THREE.ExtrudeGeometry(shape(0.03), { depth: 0.2, bevelEnabled: false, curveSegments: 18 });
      band.rotateX(-Math.PI / 2); band.translate(0, 0.22, 0);
      const g = new THREE.Group();
      g.add(new THREE.Mesh(body, [this.mat.flipperTop, this.mat.darkBark]));
      g.add(new THREE.Mesh(band, rubber));
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.3, 0.14, 16), this.mat.gold); cap.position.y = 0.78;
      const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.15, 0), this.mat.emerald); gem.position.y = 0.9; gem.scale.y = 0.6;
      g.add(cap, gem);
      shadowy(g);
      W(f.px, f.py, 0.02, g.position);
      this.scene.add(g);
      this.flipperMeshes.push({ f, g });
    }
  }

  _buildMushrooms() {
    this.mushrooms = {};
    const caps = { mush1: ['#ff8a1e', 1], mush2: ['#9a45ff', 2], mush3: ['#18c8a8', 3] };
    const stemMat = new THREE.MeshStandardMaterial({ color: 0xfff4dc, emissive: 0xfff0c8, emissiveIntensity: 0.45, roughness: 0.6 });
    const gillMat = new THREE.MeshStandardMaterial({ color: 0xf0dcc0, roughness: 0.9, side: THREE.DoubleSide, emissive: 0x403020, emissiveIntensity: 0.4 });
    const bases = [], stems = [], gills = [];
    // cap profile from the rim (v = 0) to the top (v = 1): rounded dome with a curled rim
    const capProfile = V2([[1.28, -0.12], [1.34, 0.02], [1.3, 0.2], [1.16, 0.46], [0.94, 0.7], [0.62, 0.88], [0.3, 0.97], [0.0, 1.0]]);
    const stemProfile = V2([[0.62, 0], [0.5, 0.12], [0.44, 0.5], [0.42, 0.9], [0.46, 1.15], [0, 1.16]]);
    for (const c of this.table.circles) {
      if (!caps[c.id]) continue;
      const [color, num] = caps[c.id];
      const g = new THREE.Group();
      W(c.x, c.y, 0, g.position);
      const P = g.position;
      bases.push(new THREE.CylinderGeometry(c.r, c.r * 1.06, 0.36, 32).translate(P.x, 0.18, P.z));
      this.gold.push(new THREE.TorusGeometry(c.r, 0.07, 6, 32).rotateX(Math.PI / 2).translate(P.x, 0.37, P.z));
      stems.push(new THREE.LatheGeometry(stemProfile, 20).scale(1.15, 1, 1.15).translate(P.x, 0.3, P.z));
      gills.push(new THREE.CircleGeometry(1.5, 32).rotateX(Math.PI / 2).translate(P.x, 1.36, P.z));
      const tx = TX.mushroomCapTexture(color, num);
      const capMat = new THREE.MeshPhysicalMaterial({ map: tx.map, emissiveMap: tx.emissiveMap, emissive: 0xffffff, emissiveIntensity: 0.6, roughness: 0.28, clearcoat: 1, clearcoatRoughness: 0.15, envMap: this.envMap, envMapIntensity: 0.8 });
      const cap = new THREE.Mesh(new THREE.LatheGeometry(capProfile, 40), capMat);
      cap.rotation.y = -Math.PI / 2; // the painted number faces the player
      cap.scale.set(1.22, 1.15, 1.22);
      cap.position.y = 1.36;
      cap.castShadow = true;
      const capGroup = new THREE.Group();
      capGroup.add(cap);
      g.add(capGroup);
      const glow = floorGlow(this.tex.glow, new THREE.Color(color), 5, 0.55);
      glow.position.y = 0.02; g.add(glow);
      const halo = glowSprite(this.tex.glow, new THREE.Color(color), 3.6, 0.3);
      halo.position.y = 1.9; g.add(halo);
      const light = new THREE.PointLight(new THREE.Color(color), 5, 5.5, 1.8);
      light.position.y = 0.8; g.add(light);
      this.scene.add(g);
      this.mushrooms[c.id] = { g, capGroup, capMat, glow, halo, light, hit: 0, phase: Math.random() * 6, color: new THREE.Color(color) };
    }
    const bm = new THREE.Mesh(mergeGeometries(bases), this.mat.darkBark); bm.castShadow = bm.receiveShadow = true;
    const sm = new THREE.Mesh(mergeGeometries(stems), stemMat); sm.castShadow = true;
    this.scene.add(bm, sm, new THREE.Mesh(mergeGeometries(gills), gillMat));
  }

  _buildCrystals() {
    this.crystals = {};
    const prism = (r, h, x, z, tilt, rot) => {
      const g = mergeGeometries([ // sharp hexagonal crystal: prism with pointed ends
        new THREE.CylinderGeometry(r, r, h * 0.6, 6, 1, true).translate(0, h * 0.5, 0),
        new THREE.ConeGeometry(r, h * 0.3, 6).translate(0, h * 0.95, 0),
        new THREE.ConeGeometry(r, h * 0.2, 6).rotateX(Math.PI).translate(0, h * 0.1, 0),
      ]);
      g.rotateZ(tilt); g.rotateY(rot); g.translate(x, 0, z);
      return g;
    };
    const defs = {
      crystal1: { color: 0xbfeaff, emissive: 0x6fd0ff, parts: [[0.38, 2.7, 0, 0, 0, 0.2], [0.18, 1.2, 0.36, 0.18, -0.4, 0.6], [0.16, 1.0, -0.32, -0.14, 0.45, 1.4]], pedestal: true },
      crystal2: { color: 0xd9a0ff, emissive: 0xa64dff, parts: [[0.3, 2.0, 0, 0, 0.1, 0.3], [0.24, 1.5, 0.38, 0.2, -0.45, 0.9], [0.22, 1.4, -0.36, 0.15, 0.5, 1.7], [0.18, 1.1, 0.05, -0.4, -0.25, 0.4], [0.16, 0.9, -0.2, 0.45, 0.3, 2.2]], pedestal: false },
    };
    const pedestals = [];
    for (const c of this.table.decor.crystals) {
      const d = defs[c.id];
      const mat = new THREE.MeshStandardMaterial({
        color: d.color, emissive: d.emissive, emissiveIntensity: 0.9, roughness: 0.04, metalness: 0.2,
        transparent: true, opacity: 0.86, flatShading: true, envMap: this.envMap, envMapIntensity: 2.2,
      });
      const m = new THREE.Mesh(mergeGeometries(d.parts.map((p) => prism(...p))), mat);
      W(c.x, c.y, d.pedestal ? 0.55 : 0.05, m.position);
      m.rotation.y = c.rot;
      m.castShadow = true;
      if (d.pedestal) {
        pedestals.push(new THREE.CylinderGeometry(0.62, 0.8, 0.55, 8).translate(c.x - OX, 0.27, OZ - c.y));
        this.gold.push(new THREE.TorusGeometry(0.66, 0.08, 6, 16).rotateX(Math.PI / 2).translate(c.x - OX, 0.56, OZ - c.y));
        this.gold.push(new THREE.TorusGeometry(0.8, 0.06, 6, 16).rotateX(Math.PI / 2).translate(c.x - OX, 0.04, OZ - c.y));
      } else {
        pedestals.push(new THREE.DodecahedronGeometry(0.75, 0).scale(1, 0.35, 1).translate(c.x - OX, 0.1, OZ - c.y));
      }
      const halo = glowSprite(this.tex.glow, new THREE.Color(d.emissive), 3.4, 0.4);
      W(c.x, c.y, 1.6, halo.position);
      const glow = floorGlow(this.tex.glow, new THREE.Color(d.emissive), 4, 0.55);
      W(c.x, c.y, 0.03, glow.position);
      this.scene.add(m, halo, glow);
      this.crystals[c.id] = { m, mat, halo, glow, hit: 0, phase: Math.random() * 6, base: new THREE.Color(d.emissive) };
    }
    this.scene.add(shadowy(new THREE.Mesh(mergeGeometries(pedestals), this.mat.stone), true, true));
  }

  _buildPotion() {
    const c = this.table.circles.find((o) => o.id === 'potion');
    const g = new THREE.Group();
    W(c.x, c.y, 0, g.position);
    const k = 1.25;
    const prof = V2([[0, 0], [0.5, 0.02], [0.62, 0.2], [0.64, 0.62], [0.5, 0.95], [0.22, 1.14], [0.18, 1.48], [0.24, 1.55], [0.2, 1.6], [0, 1.6]].map(([r, y]) => [r * k * 0.82, y * k]));
    const glass = new THREE.MeshStandardMaterial({ color: 0xe0fff4, roughness: 0.04, metalness: 0.1, transparent: true, opacity: 0.32, envMap: this.envMap, envMapIntensity: 2.6, depthWrite: false });
    const bottle = new THREE.Mesh(new THREE.LatheGeometry(prof, 28), glass);
    bottle.renderOrder = 4;
    const liq = V2([[0, 0.04], [0.47, 0.05], [0.57, 0.22], [0.58, 0.64], [0.46, 0.86], [0, 0.86]].map(([r, y]) => [r * k * 0.82, y * k]));
    this.potionLiquidMat = new THREE.MeshStandardMaterial({ color: 0xff3ad8, emissive: 0xff3ad8, emissiveIntensity: 2.2, roughness: 0.2 });
    const liquid = new THREE.Mesh(new THREE.LatheGeometry(liq, 24), this.potionLiquidMat);
    const cork = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.17, 0.3, 10), new THREE.MeshStandardMaterial({ color: 0x8a5a2a, roughness: 0.9 }));
    cork.position.y = 1.62 * k + 0.05;
    const stone = new THREE.Mesh(new THREE.DodecahedronGeometry(0.75, 0).scale(1, 0.25, 1), this.mat.stone);
    stone.position.y = 0.05;
    this.gold.push(new THREE.TorusGeometry(0.2, 0.04, 5, 12).rotateX(Math.PI / 2).translate(g.position.x, 1.45 * k, g.position.z));
    const halo = glowSprite(this.tex.glow, new THREE.Color(0xff5ae0), 3, 0.55);
    halo.position.y = 0.7;
    const glow = floorGlow(this.tex.glow, new THREE.Color(0xff5ae0), 3.6, 0.65);
    glow.position.y = 0.03;
    g.add(stone, liquid, bottle, cork, halo, glow);
    shadowy(g, true, false);
    this.scene.add(g);
    this.potion = { g, halo, glow, hit: 0, x: c.x, y: c.y };
  }

  _buildWizard() {
    const wz = this.table.decor.wizard;
    const g = new THREE.Group();
    W(wz.x, wz.y, 0, g.position);
    g.rotation.y = -0.45; // turned toward the flippers and the tower door
    g.scale.setScalar(1.45);
    const robeMat = new THREE.MeshStandardMaterial({ color: 0x2c3fa8, emissive: 0x101a50, emissiveIntensity: 0.4, roughness: 0.7 });
    const hatMat = new THREE.MeshStandardMaterial({ map: TX.hatTexture(), roughness: 0.7, emissive: 0x101a50, emissiveIntensity: 0.4 });
    const skin = new THREE.MeshStandardMaterial({ color: 0xf0c8a0, roughness: 0.8 });
    const white = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, emissive: 0x404050, emissiveIntensity: 0.3 });
    const robe = new THREE.Mesh(new THREE.LatheGeometry(V2([[0.82, 0], [0.74, 0.3], [0.56, 1.1], [0.42, 1.8], [0.3, 2.15], [0, 2.2]]), 20), robeMat);
    const sleeveGeo = new THREE.CylinderGeometry(0.13, 0.24, 0.95, 10);
    const sleeveR = new THREE.Mesh(sleeveGeo, robeMat); sleeveR.position.set(0.5, 1.75, 0.15); sleeveR.rotation.set(0.3, 0, -1.0);
    const sleeveL = new THREE.Mesh(sleeveGeo, robeMat); sleeveL.position.set(-0.42, 1.65, 0.18); sleeveL.rotation.set(0.5, 0, 0.7);
    const handR = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 8), skin); handR.position.set(0.86, 1.98, 0.25);
    const handL = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), skin); handL.position.set(-0.7, 1.32, 0.35);
    const hem = new THREE.Mesh(new THREE.TorusGeometry(0.8, 0.05, 6, 24), this.mat.gold); hem.rotation.x = Math.PI / 2; hem.position.y = 0.04;
    const belt = new THREE.Mesh(new THREE.TorusGeometry(0.47, 0.05, 6, 20), this.mat.gold); belt.rotation.x = Math.PI / 2; belt.position.y = 1.32;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.3, 18, 14), skin); head.position.y = 2.42;
    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), skin); nose.position.set(0, 2.4, 0.29);
    const beard = new THREE.Mesh(new THREE.LatheGeometry(V2([[0, -0.95], [0.12, -0.7], [0.24, -0.3], [0.3, 0], [0, 0.05]]), 14), white); beard.position.set(0, 2.32, 0.14); beard.rotation.x = 0.18;
    const hair = new THREE.Mesh(new THREE.SphereGeometry(0.34, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.62), white); hair.position.set(0, 2.42, -0.05); hair.rotation.x = 0.5;
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.66, 0.06, 24), hatMat); brim.position.y = 2.66;
    const hat = new THREE.Mesh(new THREE.LatheGeometry(V2([[0.42, 0], [0.32, 0.4], [0.2, 0.8], [0.1, 1.1], [0, 1.35]]), 18), hatMat); hat.position.y = 2.66; hat.rotation.set(-0.2, 0, 0.15);
    const eyes = new THREE.Mesh(mergeGeometries([new THREE.SphereGeometry(0.035, 6, 4).translate(-0.1, 2.48, 0.27), new THREE.SphereGeometry(0.035, 6, 4).translate(0.1, 2.48, 0.27)]), new THREE.MeshBasicMaterial({ color: 0x223355 }));
    const staffG = new THREE.Group();
    staffG.position.set(0.9, 0, 0.25);
    const staff = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 3.3, 8), this.mat.bark);
    staff.position.y = 1.65;
    this.orbMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff0a0, emissiveIntensity: 1.5, roughness: 0.1 });
    const orb = new THREE.Mesh(new THREE.OctahedronGeometry(0.17, 0), this.orbMat); orb.position.y = 3.4;
    this.orbHalo = glowSprite(this.tex.star, new THREE.Color(0xfff0a0), 1.6, 0.9); this.orbHalo.position.y = 3.4;
    staffG.add(staff, orb, this.orbHalo);
    const body = new THREE.Group();
    body.add(robe, sleeveR, sleeveL, handR, handL, hem, belt, head, nose, beard, hair, brim, hat, eyes, staffG);
    shadowy(body);
    g.add(body);
    const auraGlow = floorGlow(this.tex.glow, new THREE.Color(0x9fb8ff), 3.6, 0.35); auraGlow.position.y = 0.03;
    g.add(auraGlow);
    this.scene.add(g);
    // the rune stone in front of him is the actual target
    const [[ax, ay], [bx, by]] = wz.plate;
    this.plateMat = new THREE.MeshStandardMaterial({ map: this.tex.stone.map, normalMap: this.tex.stone.normalMap, color: 0x9a9aa6, emissive: 0x6aa8ff, emissiveIntensity: 0.3, roughness: 0.6 });
    const plate = new THREE.Mesh(mergeGeometries(wallBoxes([[ax, ay], [bx, by]], { thick: 0.24, h: 0.75 })), this.plateMat);
    plate.castShadow = true;
    this.scene.add(plate);
    this.wizard = { g, body, staffG, orb, hit: 0, charge: 0, auraGlow };
  }

  _buildTower() {
    const t = this.table.decor.tower;
    const g = new THREE.Group();
    W(t.x, t.y, 0, g.position);
    const TX0 = g.position.x, TZ0 = g.position.z;
    const stoneBase = new THREE.Mesh(new THREE.CylinderGeometry(t.r + 0.12, t.r + 0.22, 0.9, 40), this.mat.stone);
    stoneBase.position.y = 0.45;
    const tiers = [[t.r - 0.02, t.r - 0.1, 3.1], [t.r - 0.22, t.r - 0.3, 2.7], [t.r - 0.42, t.r - 0.52, 2.3]];
    const plasterGeos = [], bandGeos = [], frames = [], panes = [];
    let y = 0.9;
    const arch = (w, h) => { const s = new THREE.Shape(); s.moveTo(-w / 2, 0); s.lineTo(-w / 2, h - w / 2); s.absarc(0, h - w / 2, w / 2, Math.PI, 0, true); s.lineTo(w / 2, 0); s.lineTo(-w / 2, 0); return s; };
    tiers.forEach(([r0, r1, h], i) => {
      plasterGeos.push(new THREE.CylinderGeometry(r1, r0, h, 40).translate(0, y + h / 2, 0));
      bandGeos.push(new THREE.CylinderGeometry(r1 + 0.1, r1 + 0.1, 0.18, 40).translate(0, y + h, 0));
      const angles = i === 0 ? [-0.75, 0.75] : i === 1 ? [0, -1.2, 1.2] : [0.35, -0.6];
      for (const a of angles) {
        const ang = Math.PI / 2 + a; // +Z is the front
        const rr = (r0 + r1) / 2;
        const ww = 0.62 - i * 0.06, hh = 0.95 - i * 0.08, wy = y + h * 0.32;
        const place = (geo, push, out) => { geo.rotateY(-ang + Math.PI / 2); geo.translate(Math.cos(ang) * (rr + out), wy, Math.sin(ang) * (rr + out)); push.push(geo); };
        place(new THREE.ExtrudeGeometry(arch(ww + 0.16, hh + 0.1), { depth: 0.08, bevelEnabled: false }).translate(0, -0.05, 0), frames, -0.02);
        place(new THREE.ShapeGeometry(arch(ww, hh)), panes, 0.07);
        place(new THREE.BoxGeometry(0.05, hh * 0.9, 0.04).translate(0, hh * 0.45, 0), frames, 0.09);
        place(new THREE.BoxGeometry(ww, 0.05, 0.04).translate(0, hh * 0.45, 0), frames, 0.09);
      }
      y += h + 0.18;
    });
    const plaster = new THREE.Mesh(mergeGeometries(plasterGeos), this.mat.plaster);
    const bands = new THREE.Mesh(mergeGeometries(bandGeos), this.mat.darkBark);
    const frameMesh = new THREE.Mesh(mergeGeometries(frames), this.mat.darkBark);
    this.windowMat = new THREE.MeshStandardMaterial({ color: 0x402810, emissive: 0xffc860, emissiveIntensity: 2.6 });
    const paneMesh = new THREE.Mesh(mergeGeometries(panes), this.windowMat);
    const rt = TX.roofTexture();
    this.roofMat = new THREE.MeshStandardMaterial({ map: rt.map, emissiveMap: rt.emissiveMap, emissive: 0xffffff, emissiveIntensity: 0.9, roughness: 0.5 });
    const roof = new THREE.Mesh(new THREE.LatheGeometry(V2([[3.25, -0.25], [3.35, 0.05], [3.2, 0.42], [2.7, 1.1], [1.85, 1.75], [0.9, 2.15], [0, 2.25]]), 48), this.roofMat);
    roof.position.y = y - 0.1;
    const roofUnder = new THREE.Mesh(new THREE.CircleGeometry(3.3, 40).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x3a2418, roughness: 1 }));
    roofUnder.position.y = y - 0.25;
    const chim = new THREE.Mesh(new THREE.LatheGeometry(V2([[0.5, -0.05], [0.52, 0.1], [0.36, 0.38], [0, 0.45]]), 20), this.roofMat);
    chim.position.y = y + 2.3;
    this.gold.push(new THREE.CylinderGeometry(0.12, 0.16, 0.5, 8).translate(TX0, y + 2.25, TZ0));
    this.spireStar = glowSprite(this.tex.star, new THREE.Color(0xfff0a0), 1.8, 0.9);
    this.spireStar.position.y = y + 3.0;
    this.towerTopY = y + 3.0;
    g.add(stoneBase, plaster, bands, frameMesh, paneMesh, roof, roofUnder, chim, this.spireStar);
    // door: stone arch, wooden leaves, little stairs and lanterns (faces the player = +Z)
    const doorG = new THREE.Group();
    const front = t.r + 0.1;
    doorG.position.set(0, 0, front);
    this.doorInnerMat = new THREE.MeshBasicMaterial({ color: 0x120804 });
    const inner = new THREE.Mesh(new THREE.ShapeGeometry(arch(1.9, 2.1)), this.doorInnerMat);
    inner.position.z = -0.02;
    const archStones = [];
    for (let k = 0; k <= 10; k++) {
      const a = Math.PI - (k / 10) * Math.PI;
      archStones.push(new THREE.BoxGeometry(0.36, 0.26, 0.3).rotateZ(a - Math.PI / 2).translate(Math.cos(a) * 1.08, 1.15 + Math.sin(a) * 1.08, 0.05));
    }
    archStones.push(new THREE.BoxGeometry(0.3, 1.15, 0.3).translate(-1.08, 0.58, 0.05), new THREE.BoxGeometry(0.3, 1.15, 0.3).translate(1.08, 0.58, 0.05));
    const archMesh = new THREE.Mesh(mergeGeometries(archStones), this.mat.stone);
    const leafMat = new THREE.MeshStandardMaterial({ map: TX.doorTexture(), roughness: 0.75 });
    const leaves = [];
    for (const side of [-1, 1]) {
      const hinge = new THREE.Group();
      hinge.position.set(side * 0.95, 0, 0);
      const s = new THREE.Shape(); // each leaf is half of the arch
      s.moveTo(0, 0); s.lineTo(0, 1.15); s.absarc(-side * 0.95, 1.15, 0.95, side > 0 ? 0 : Math.PI, Math.PI / 2, side < 0); s.lineTo(-side * 0.95, 0); s.lineTo(0, 0);
      const lg = new THREE.ExtrudeGeometry(s, { depth: 0.1, bevelEnabled: false, curveSegments: 10 });
      const uv = lg.attributes.uv; for (let q = 0; q < uv.count; q++) uv.setXY(q, uv.getX(q) * 0.5 + 0.5, uv.getY(q) * 0.45);
      hinge.add(new THREE.Mesh(lg, leafMat));
      doorG.add(hinge);
      leaves.push({ hinge, side });
    }
    const steps = [];
    for (let k = 0; k < 3; k++) steps.push(new THREE.BoxGeometry(2.4 - k * 0.25, 0.035 + k * 0.03, 0.4).translate(0, (0.035 + k * 0.03) / 2, 1.05 - k * 0.38));
    const stepMesh = new THREE.Mesh(mergeGeometries(steps), this.mat.stone);
    stepMesh.receiveShadow = true;
    const lanternMat = new THREE.MeshStandardMaterial({ color: 0x302010, emissive: 0xffb040, emissiveIntensity: 3 });
    for (const sx of [-1.45, 1.45]) {
      const l = new THREE.Mesh(new THREE.OctahedronGeometry(0.16, 0), lanternMat);
      l.scale.y = 1.5; l.position.set(sx, 1.55, 0.25);
      this.gold.push(new THREE.CylinderGeometry(0.03, 0.03, 0.5, 6).translate(TX0 + sx, 1.85, TZ0 + front + 0.2));
      const lh = glowSprite(this.tex.glow, new THREE.Color(0xffb040), 1.2, 0.8); lh.position.copy(l.position);
      doorG.add(l, lh);
    }
    this.doorGlow = glowSprite(this.tex.glow, new THREE.Color(0xffd27a), 5, 0);
    this.doorGlow.position.set(0, 1.2, 0.7);
    const beam = floorGlow(this.tex.glow, new THREE.Color(0xffc040), 7, 0);
    beam.position.set(0, 0.04, 2.2);
    doorG.add(inner, archMesh, stepMesh, this.doorGlow, beam);
    g.add(doorG);
    const moss = [];
    for (let k = 0; k < 18; k++) {
      const a = (k / 18) * Math.PI * 2 + 0.2;
      if (Math.abs(Math.sin(a) - 1) < 0.25) continue; // keep the doorway clear
      moss.push(new THREE.IcosahedronGeometry(0.35 + (k % 3) * 0.1, 0).scale(1, 0.55, 1).translate(Math.cos(a) * (t.r + 0.25), 0.15, Math.sin(a) * (t.r + 0.25)));
    }
    g.add(new THREE.Mesh(mergeGeometries(moss), new THREE.MeshStandardMaterial({ color: 0x3f7a2a, roughness: 1, flatShading: true })));
    shadowy(g, true, false);
    inner.castShadow = false;
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
      uRipples: { value: [0, 1, 2, 3].map(() => new THREE.Vector4(0, 0, -99, 0)) },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.poolUniforms,
      vertexShader: 'varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `
        uniform float uTime, uR; uniform vec3 uDeep, uShallow; uniform vec4 uRipples[4]; varying vec2 vP;
        void main(){
          float r = length(vP) / uR;
          vec3 col = mix(uShallow * 1.25, uDeep, smoothstep(0.0, 0.9, 1.0 - r) * 0.8);
          float c = sin(vP.x * 3.1 + uTime * 1.3) * sin(vP.y * 2.7 - uTime * 1.1) + sin((vP.x + vP.y) * 4.3 + uTime * 1.9) * 0.5;
          col += uShallow * smoothstep(0.7, 1.4, c) * 0.8;
          float sp = fract(sin(dot(floor(vP * 9.0 + uTime * 0.6), vec2(12.9898, 78.233))) * 43758.5453);
          col += vec3(1.0) * step(0.985, sp) * 0.9;
          float rip = 0.0;
          for (int i = 0; i < 4; i++) {
            float age = uTime - uRipples[i].z;
            if (age < 0.0 || age > 2.0) continue;
            float d = length(vP - uRipples[i].xy);
            rip += smoothstep(0.18, 0.0, abs(d - age * 2.2)) * (1.0 - age / 2.0) * uRipples[i].w;
          }
          col += vec3(1.0) * rip * 0.8;
          col *= 1.0 - smoothstep(0.85, 1.0, r) * 0.6;
          gl_FragColor = vec4(col, 1.0);
        }`,
    });
    const water = new THREE.Mesh(new THREE.CircleGeometry(p.r, 48), mat);
    water.rotation.x = -Math.PI / 2;
    W(p.x, p.y, 0.012, water.position);
    this.scene.add(water);
    const N = 30; // low stone rim, instanced: one draw call
    const stones = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0), this.mat.stone, N);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3();
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2;
      const rr = p.r + 0.28;
      q.setFromEuler(new THREE.Euler(0, -a + (i % 3) * 0.3, 0));
      s.set(0.36 + (i % 4) * 0.03, 0.14 + (i % 3) * 0.03, 0.3);
      m.compose(W(p.x + Math.cos(a) * rr, p.y + Math.sin(a) * rr, 0.06, _v), q, s);
      stones.setMatrixAt(i, m);
      stones.setColorAt(i, _col.setHSL(0.25, 0.08, 0.55 + ((i * 53) % 10) / 40));
    }
    stones.receiveShadow = true;
    this.scene.add(stones);
    this.rippleIndex = 0;
  }

  _buildRamps() {
    this.rampMeshes = {};
    const up = new THREE.Vector3(0, 1, 0);
    for (const [id, ramp] of Object.entries(this.table.ramps)) {
      const isCrystal = ramp.material === 'crystal';
      const pts = ramp.path.pts.map(([x, y, z]) => W(x, y, z + 0.05, new THREE.Vector3()));
      const n = pts.length;
      const posArr = [], uvArr = [], idx = [];
      const left = [], right = [], mid = [];
      for (let i = 0; i < n; i++) {
        const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
        const tan = _v.subVectors(b, a).normalize();
        const side = new THREE.Vector3().crossVectors(tan, up).normalize();
        const L = pts[i].clone().addScaledVector(side, -0.62), Rr = pts[i].clone().addScaledVector(side, 0.62);
        posArr.push(L.x, L.y, L.z, Rr.x, Rr.y, Rr.z);
        uvArr.push(0, i / 6, 1, i / 6);
        if (i < n - 1) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
        left.push(L.clone().add(new THREE.Vector3(0, 0.42, 0)));
        right.push(Rr.clone().add(new THREE.Vector3(0, 0.42, 0)));
        mid.push(pts[i].clone().add(new THREE.Vector3(0, -0.02, 0)));
        if (i % 12 === 6 && pts[i].y > 0.8) {
          this.gold.push(new THREE.CylinderGeometry(0.05, 0.06, pts[i].y, 6).translate(L.x, pts[i].y / 2, L.z));
          this.gold.push(new THREE.CylinderGeometry(0.05, 0.06, pts[i].y, 6).translate(Rr.x, pts[i].y / 2, Rr.z));
        }
        if (isCrystal && i % 4 === 0) { // gold frame ribs between the crystal panels
          this.gold.push(tubeAlong([L.clone(), L.clone().add(new THREE.Vector3(0, 0.42, 0)), Rr.clone().add(new THREE.Vector3(0, 0.42, 0)), Rr.clone()], 0.035, 4));
        }
      }
      this.gold.push(tubeAlong(left, 0.07), tubeAlong(right, 0.07));
      let mat;
      if (isCrystal) {
        const floor = new THREE.BufferGeometry();
        floor.setAttribute('position', new THREE.Float32BufferAttribute(posArr, 3));
        floor.setAttribute('uv', new THREE.Float32BufferAttribute(uvArr, 2));
        floor.setIndex(idx);
        floor.computeVertexNormals();
        mat = new THREE.MeshStandardMaterial({ color: 0x8fdcff, emissive: 0x2ab0ff, emissiveIntensity: 0.25, roughness: 0.04, metalness: 0.3, transparent: true, opacity: 0.3, side: THREE.DoubleSide, depthWrite: false, envMap: this.envMap, envMapIntensity: 2 });
        const fm = new THREE.Mesh(floor, mat);
        fm.renderOrder = 5;
        this.scene.add(fm);
      } else {
        this.gold.push(tubeAlong(mid, 0.05)); // wire-form: a third rail underneath
        mat = null;
      }
      this.rampMeshes[id] = { mat, flash: 0 };
    }
  }

  _buildDecor() {
    // corners outside the playfield: glowing mushroom clusters, ferns and old roots, like the concept art
    const groups = { purple: [], cyan: [], stems: [] };
    const cluster = (x, y, kind, count, scale) => {
      for (let i = 0; i < count; i++) {
        const a = i * 2.4, r = 0.3 + (i % 3) * 0.35;
        const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r;
        const s = scale * (0.6 + ((i * 37) % 10) / 14);
        groups.stems.push(new THREE.CylinderGeometry(0.1 * s, 0.14 * s, 0.7 * s, 8).translate(px - OX, 0.35 * s, OZ - py));
        groups[kind].push(new THREE.SphereGeometry(0.42 * s, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.7, 1).translate(px - OX, 0.68 * s, OZ - py));
      }
    };
    cluster(1.4, 38.4, 'purple', 5, 1.3);
    cluster(2.6, 36.6, 'purple', 3, 0.9);
    cluster(19.6, 38.6, 'cyan', 5, 1.4);
    cluster(18.4, 37.0, 'cyan', 3, 0.9);
    cluster(20.6, 33.5, 'cyan', 2, 0.7);
    const purple = new THREE.MeshStandardMaterial({ color: 0xc070ff, emissive: 0xb050ff, emissiveIntensity: 1.6, roughness: 0.4 });
    const cyan = new THREE.MeshStandardMaterial({ color: 0x60f0ff, emissive: 0x30e0ff, emissiveIntensity: 1.6, roughness: 0.4 });
    const stem = new THREE.MeshStandardMaterial({ color: 0xf0ead8, emissive: 0xa0c0c0, emissiveIntensity: 0.4 });
    this.scene.add(new THREE.Mesh(mergeGeometries(groups.purple), purple), new THREE.Mesh(mergeGeometries(groups.cyan), cyan), new THREE.Mesh(mergeGeometries(groups.stems), stem));
    for (const [x, y, c] of [[1.6, 38.4, 0xb050ff], [19.4, 38.4, 0x30e0ff]]) { const gl = glowSprite(this.tex.glow, new THREE.Color(c), 6, 0.45); W(x, y, 1.0, gl.position); this.scene.add(gl); }
    const roots = [];
    const rootCurve = (pts, r) => roots.push(tubeAlong(pts.map(([x, y, h]) => W(x, y, h, new THREE.Vector3())), r, 7));
    rootCurve([[-0.6, 34, 1.6], [0.4, 36, 1.1], [1.2, 38.8, 0.4], [3.4, 40.2, 0.2]], 0.32);
    rootCurve([[-0.4, 39.5, 2.2], [1.5, 40.0, 1.2], [4.5, 40.4, 0.6]], 0.42);
    rootCurve([[21.6, 34.5, 1.6], [20.6, 36.5, 1.0], [19.6, 39.2, 0.4], [17.2, 40.3, 0.2]], 0.32);
    rootCurve([[21.4, 39.6, 2.2], [19.4, 40.1, 1.2], [16.4, 40.4, 0.6]], 0.42);
    this.scene.add(shadowy(new THREE.Mesh(mergeGeometries(roots), this.mat.bark)));
    // ferns (instanced, alpha-tested) along the frame
    const fernMat = new THREE.MeshStandardMaterial({ map: TX.fernTexture(), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.8, emissive: 0x1a4010, emissiveIntensity: 0.4 });
    const spots = [[-0.3, 38.5, 0.4], [0.2, 36.2, -0.6], [21.3, 38.2, 2.6], [20.8, 35.8, 3.4], [-0.9, -1.2, 0.8], [21.9, -1.4, 2.4], [-1.2, 8, 1.2], [22.2, 12, 2.1], [-1.1, 22, 1.4], [22.1, 26, 2.2], [3.6, 40.3, 0], [17.4, 40.3, 3.1], [0.8, -2.2, 0.3], [20.2, -2.2, 2.8]];
    const ferns = new THREE.InstancedMesh(new THREE.PlaneGeometry(1.6, 3.2).translate(0, 1.6, 0), fernMat, spots.length * 2);
    const mm = new THREE.Matrix4(), qq = new THREE.Quaternion(), ss = new THREE.Vector3();
    spots.forEach(([x, y, rot], i) => {
      for (let k = 0; k < 2; k++) {
        qq.setFromEuler(new THREE.Euler(-0.55 + k * 0.2, rot + k * 1.2, k ? 0.35 : -0.3));
        mm.compose(W(x, y, x < 0 || x > 21 ? 1.4 : 0.3, _v), qq, ss.setScalar(0.85 + ((i + k) % 3) * 0.15));
        ferns.setMatrixAt(i * 2 + k, mm);
      }
    });
    this.scene.add(ferns);
  }

  _buildBackdrop() {
    this.skyUniforms = { uTop: { value: new THREE.Color() }, uBottom: { value: new THREE.Color() } };
    const sky = new THREE.Mesh(new THREE.PlaneGeometry(110, 50), new THREE.ShaderMaterial({
      uniforms: this.skyUniforms,
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `uniform vec3 uTop, uBottom; varying vec2 vUv;
        void main(){ vec3 c = mix(uBottom, uTop, smoothstep(0.1, 0.8, vUv.y));
          c += uBottom * smoothstep(0.5, 0.0, length((vUv - vec2(0.5, 0.25)) * vec2(2.0, 1.3))) * 0.7;
          gl_FragColor = vec4(c, 1.0); }`,
      depthWrite: false,
    }));
    sky.position.set(0, 10, -OZ - 18);
    sky.renderOrder = -10;
    this.scene.add(sky);
    this.stars = createStars(260, new THREE.Vector3(0, 6, -OZ - 16), 20);
    this.scene.add(this.stars);
    this.moon = glowSprite(this.tex.glow, new THREE.Color(0xdfe8ff), 9, 0);
    this.moon.position.set(-9, 16, -OZ - 15);
    this.scene.add(this.moon);
    this.silMat = new THREE.MeshBasicMaterial({ map: TX.forestSilhouetteTexture(), color: 0x0a1a0e, transparent: true, depthWrite: false });
    const sil = new THREE.Mesh(new THREE.PlaneGeometry(80, 24), this.silMat);
    sil.position.set(0, 6, -OZ - 9);
    this.scene.add(sil);
    this.fallUniforms = { uTime: { value: 0 }, uColor: { value: new THREE.Color(0xbff7ff) } };
    const fall = new THREE.Mesh(new THREE.PlaneGeometry(4.5, 18), new THREE.ShaderMaterial({
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
          gl_FragColor = vec4(uColor * a * 1.6, a);
        }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    fall.position.set(CX - OX, 6, -OZ - 6.5);
    this.scene.add(fall);
    this.fallMist = glowSprite(this.tex.glow, new THREE.Color(0xbff7ff), 10, 0.45);
    this.fallMist.position.set(CX - OX, 0.8, -OZ - 4);
    this.scene.add(this.fallMist);
  }

  _buildInserts() {
    const I = this.table.decor.inserts;
    this.insertList = [];
    const push = (key, p, color, size = 0.34) => this.insertList.push({ key, x: p.x, y: p.y, color: new THREE.Color(color), size, level: -1 });
    I.combo.forEach((p) => push('combo:' + p.id, p, 0xffd040));
    push('kickback', I.kickback, 0x40ff70, 0.38);
    I.wizard.forEach((p, i) => push('wizard:' + i, p, 0x80b8ff, 0.3));
    push('door', I.door, 0xffb020, 0.48);
    push('rampA', I.rampA, 0x4df0ff, 0.36);
    push('rampB', I.rampB, 0xffd060, 0.36);
    push('orbitL', I.orbitL, 0xff60d0, 0.32);
    push('orbitR', I.orbitR, 0xff60d0, 0.32);
    const n = this.insertList.length;
    const disc = new THREE.InstancedMesh(new THREE.CircleGeometry(1, 6), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95 }), n);
    const glow = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: this.tex.glow, color: 0xffffff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }), n);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2), s = new THREE.Vector3();
    this.insertList.forEach((it, i) => {
      m.compose(W(it.x, it.y, 0.02, _v), q, s.setScalar(it.size)); disc.setMatrixAt(i, m);
      m.compose(W(it.x, it.y, 0.025, _v), q, s.setScalar(it.size * 5)); glow.setMatrixAt(i, m);
      disc.setColorAt(i, _col.setRGB(0.1, 0.1, 0.1)); glow.setColorAt(i, _col.setRGB(0, 0, 0));
      this.gold.push(new THREE.TorusGeometry(it.size + 0.05, 0.04, 4, 6).rotateX(Math.PI / 2).translate(it.x - OX, 0.03, OZ - it.y));
    });
    disc.renderOrder = 1; glow.renderOrder = 2;
    this.scene.add(disc, glow);
    this.insertDisc = disc; this.insertGlow = glow;
    const m3 = this.table.circles.find((c) => c.id === 'mush3');
    this.skillRing = new THREE.Mesh(new THREE.RingGeometry(1.35, 1.75, 40), new THREE.MeshBasicMaterial({ color: 0x80ff80, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    this.skillRing.rotation.x = -Math.PI / 2;
    W(m3.x, m3.y, 0.04, this.skillRing.position);
    this.scene.add(this.skillRing);
    this.laneGlow = floorGlow(this.tex.glow, new THREE.Color(0x80ff80), 2.6, 0);
    W(19.8, 4.5, 0.03, this.laneGlow.position);
    this.scene.add(this.laneGlow);
  }

  _buildPlunger() {
    const g = new THREE.Group();
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 2.4, 10), this.mat.gold);
    rod.rotation.x = Math.PI / 2; rod.position.set(0, 0.45, 1.2);
    const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.22, 16), this.mat.darkBark);
    tip.rotation.x = Math.PI / 2; tip.position.set(0, 0.45, 0);
    const coils = [];
    for (let k = 0; k < 9; k++) coils.push(new THREE.TorusGeometry(0.3, 0.05, 6, 16).translate(0, 0, 0.25 + k * 0.2));
    const spring = new THREE.Mesh(mergeGeometries(coils), new THREE.MeshStandardMaterial({ color: 0xd0d0d8, metalness: 1, roughness: 0.25, envMap: this.envMap }));
    spring.position.y = 0.45;
    const housing = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.7, 0.5, 16), this.mat.gold);
    housing.position.set(0, 0.6, 2.7);
    this.plungerGem = new THREE.Mesh(new THREE.OctahedronGeometry(0.5, 1), this.mat.emerald);
    this.plungerGem.position.set(0, 1.35, 2.7);
    this.plungerGemHalo = glowSprite(this.tex.glow, new THREE.Color(0x40ff90), 3.2, 0.6);
    this.plungerGemHalo.position.copy(this.plungerGem.position);
    g.add(rod, tip, spring, housing, this.plungerGem, this.plungerGemHalo);
    W(19.8, 0.6, 0, g.position);
    shadowy(g);
    this.scene.add(g);
    this.plungerG = g; this.plungerSpring = spring; this.plungerBaseZ = g.position.z;
  }

  _buildBalls() {
    const tex = TX.ballTexture();
    this.ballMeshes = [];
    const geo = new THREE.SphereGeometry(R, 32, 20);
    for (const b of this.sim.world.balls) {
      const mat = new THREE.MeshPhysicalMaterial({
        map: tex, color: 0xffffff, metalness: 0.2, roughness: 0.06, clearcoat: 1, clearcoatRoughness: 0.04,
        envMap: this.envMap, envMapIntensity: 2.2, emissive: 0x0e7a40, emissiveIntensity: 0.7,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.castShadow = true;
      mesh.visible = false;
      const halo = glowSprite(this.tex.glow, new THREE.Color(0x60ffb0), 1.9, 0.45);
      this.scene.add(mesh, halo);
      this.ballMeshes.push({ b, mesh, halo, mat, lastX: 0, lastZ: 0, trail: 0, spawnFx: 0 });
    }
  }

  _buildComposer() {
    const size = new THREE.Vector2();
    this.renderer.getSize(size);
    const rt = new THREE.WebGLRenderTarget(Math.max(1, size.x), Math.max(1, size.y), { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(this.renderer, rt);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.5, 0.35, 0.9);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
  }

  setBloom(on) { this.bloomEnabled = on; this._bloomAutoOff = false; }
  setShadows(on) {
    if (this.renderer.shadowMap.enabled === on) return;
    this.renderer.shadowMap.enabled = on;
    this.scene.traverse((o) => { if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => { m.needsUpdate = true; }); });
  }

  // ----------------------------------------------------------------------------------------- events
  bind(bus) {
    const P = this.particles;
    const gold = new THREE.Color(0xffd060), green = new THREE.Color(0x60ff90), cyan = new THREE.Color(0x60f0ff), pink = new THREE.Color(0xff60e0), white = new THREE.Color(0xffffff);
    bus.on('element', ({ id, x, y }) => {
      const mu = this.mushrooms[id];
      if (mu) { mu.hit = 1; W(x, y, 1, _v); P.burst(_v.x, 1.3, _v.z, mu.color, 30, 6, 0.55, 0.8); }
      const cr = this.crystals[id];
      if (cr) { cr.hit = 1; W(x, y, 1, _v); P.burst(_v.x, 1.2, _v.z, cr.base, 36, 8, 0.4, 0.6, -9, 0.3); }
      if (id === 'potion') { this.potion.hit = 1; W(this.potion.x, this.potion.y, 0, _v); for (let k = 0; k < 16; k++) P.spawn(_v.x + (Math.random() - 0.5) * 0.6, 1.4 + Math.random(), _v.z + (Math.random() - 0.5) * 0.6, (Math.random() - 0.5), 2 + Math.random() * 2, (Math.random() - 0.5), pink, 0.45, 1.2, 0.5); }
    });
    bus.on('contact', (c) => {
      if (c.kind === 'sling' && this.slingRubbers[c.id]) { const s = this.slingRubbers[c.id]; s.flash = 1; P.burst(s.mid.x, 0.6, s.mid.z, green, 14, 5, 0.35, 0.4); }
      else if (c.impact > 25 && (c.kind === 'wall' || c.kind === 'gate')) { W(c.x, c.y, 0, _v); P.burst(_v.x, 0.5, _v.z, gold, 5, 3, 0.25, 0.3); }
    });
    bus.on('wizardHit', () => { this.wizard.hit = 1; this.wizard.orb.getWorldPosition(_v); P.burst(_v.x, _v.y, _v.z, new THREE.Color(0xfff0a0), 30, 5, 0.45, 0.8, -2); });
    bus.on('wizardCharge', ({ charge }) => { this.wizard.charge = charge; });
    bus.on('doorOpen', () => {
      this.tower.target = 1;
      this.wizard.orb.getWorldPosition(_v);
      const tw = this.towerTopWorld;
      for (let k = 0; k < 40; k++) {
        const t = k / 40;
        P.spawn(_v.x + (tw.x - _v.x) * t, _v.y + (2.5 - _v.y) * t + Math.sin(t * 3) * 1.5, _v.z + (tw.z + 2.4 - _v.z) * t, 0, 0.5, 0, gold, 0.6, 0.6 + t, 0);
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
    bus.on('comboChain', ({ level }) => { if (level >= 3) this.flash = Math.max(this.flash, 0.15 + level * 0.03); });
    bus.on('poolSplash', ({ x, y, speed }) => {
      const pl = this.table.decor.pool;
      const r = this.poolUniforms.uRipples.value[this.rippleIndex++ % 4];
      r.set(x - pl.x, y - pl.y, this.time, Math.min(1, 0.3 + speed / 40));
      W(x, y, 0, _v);
      P.burst(_v.x, 0.2, _v.z, this.theme.poolShallow, 10, 3, 0.3, 0.5, -10, 1.2);
    });
    bus.on('ballDissolve', ({ x, y, z, visible }) => { if (visible) { W(x, y, z + R, _v); P.burst(_v.x, _v.y, _v.z, white, 40, 4, 0.5, 1, 1, 0.2); P.burst(_v.x, _v.y, _v.z, green, 30, 3, 0.45, 1.2, 1.5, 0.2); } });
    bus.on('ballSpawn', ({ id, where }) => { this.ballMeshes[id].spawnFx = 1; if (where === 'portal') { const p = this.table.points.portal; W(p[0], p[1], 0, _v); P.burst(_v.x, 0.6, _v.z, pink, 40, 5, 0.5, 0.8, 0); } });
    bus.on('towerEject', ({ x, y }) => { W(x, y, 0, _v); P.burst(_v.x, 0.6, _v.z, gold, 24, 5, 0.45, 0.6); });
    bus.on('ballRescue', () => { const p = this.table.points.rescue; W(p[0], p[1], 0, _v); P.burst(_v.x, 0.6, _v.z, white, 30, 4, 0.45, 0.7); });
    bus.on('multiballStart', () => { this.flash = 1; });
    bus.on('stage', ({ index, initial }) => this.setStage(index, !!initial));
    bus.on('gameStart', () => { this.tower.target = 0; this.wizard.charge = 0; });
  }

  fireworks(shells, spread) {
    this.pending = this.pending || [];
    for (let i = 0; i < shells; i++) this.pending.push({ t: i * (spread / Math.max(1, shells)), done: false });
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
    this.fieldMat.emissiveIntensity = th.floorGlow;
    this.towerLight.color.copy(th.towerLight);
    this.poolLight.color.copy(th.poolShallow);
    this.poolUniforms.uDeep.value.copy(th.poolDeep);
    this.poolUniforms.uShallow.value.copy(th.poolShallow);
    this.skyUniforms.uTop.value.copy(th.skyTop);
    this.skyUniforms.uBottom.value.copy(th.skyBottom);
    this.fallUniforms.uColor.value.copy(th.waterfall);
    this.fallMist.material.color.copy(th.waterfall);
    this.stars.material.uniforms.uOpacity.value = th.stars;
    this.moon.material.opacity = th.stars * 0.9;
    this.fireflies.material.uniforms.uColor.value.copy(th.sparkColor);
    this.fireflies.material.uniforms.uMode.value = th.sparkMode;
    this.crystalMat.emissive.copy(th.crystalColor).multiplyScalar(0.35);
    this.windowMat.emissive.copy(th.towerLight);
    this.silMat.color.copy(th.background);
    this.mat.runeGlow.emissive.copy(th.runeColor);
    this.mat.flipperTop.emissive.copy(th.runeColor);
    this.mat.slingTop.emissive.copy(th.runeColor);
    this.bloom.strength = th.bloom;
    this.renderer.toneMappingExposure = th.exposure;
  }

  // ----------------------------------------------------------------------------------------- frame
  setCameraMode(mode) { this.cameraMode = mode; this.resize(); }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.setSize(w, h, false);
    if (this.composer) {
      this.composer.setPixelRatio(this.pixelRatio);
      this.composer.setSize(w, h);
      this.bloom.setSize(Math.round((w * this.pixelRatio) / 2), Math.round((h * this.pixelRatio) / 2));
    }
    this.camera.aspect = w / h;
    this.camera.fov = this.cameraMode === 'top' ? 36 : 46;
    this.camera.updateProjectionMatrix();
    const topPx = this.getTopInset(), botPx = this.getBottomInset();
    const yTop = 1 - (2 * topPx) / h, yBot = -1 + (2 * botPx) / h;
    const avail = yTop - yBot;
    const target = new THREE.Vector3(0, 0, 1.5);
    const pts = [[-OX - 0.4, 0, OZ + 1.0], [OX + 0.4, 0, OZ + 1.0], [-OX, 1.6, -OZ], [OX, 1.6, -OZ], [-OX - 0.4, 1.6, 0], [OX + 0.4, 1.6, 0], [CX - OX, this.towerTopY - 1.5, OZ - 31.2]].map((p) => new THREE.Vector3(...p));
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
      return { m, fill: (m.maxY - m.minY) / avail };
    };
    // the lowest (most three-dimensional) camera angle that still fills the screen height on this phone
    const [p0, p1] = this.cameraMode === 'top' ? [68, 84] : [47, 62];
    const need = this.cameraMode === 'top' ? 0.965 : 0.86; // classic leaves some sky above the tower, like the concept art
    let pitch = p1;
    for (let pd = p0; pd <= p1; pd += 1) { if (fitAt(pd).fill >= need) { pitch = pd; break; } }
    const { m } = fitAt(pitch);
    this.camBase = cam.position.clone();
    this.cameraPitch = pitch;
    const shift = yBot - m.minY; // table bottom on the bottom edge; spare room goes under the HUD
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

    if (this.themeT < 1) {
      this.themeT = Math.min(1, this.themeT + dt / 3);
      lerpTheme(this.themeFrom, this.themeTo, smooth(this.themeT), this.theme);
      this._applyTheme(this.theme);
    }
    const th = this.theme;

    for (const { f, g } of this.flipperMeshes) g.rotation.y = f.angle;

    for (const bm of this.ballMeshes) {
      const b = bm.b;
      const vis = b.active && b.mode !== 'tower';
      bm.mesh.visible = bm.halo.visible = vis;
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
      const sp = Math.hypot(b.vx, b.vy);
      if ((sp > 38 || b.mode === 'rail') && (bm.trail += dt) > 0.03) {
        bm.trail = 0;
        this.particles.spawn(bm.mesh.position.x, bm.mesh.position.y, bm.mesh.position.z, 0, 0.3, 0, Math.random() < 0.5 ? th.sparkColor : _col.setRGB(1, 0.85, 0.4), 0.35, 0.35, 0);
      }
      if (bm.spawnFx > 0) bm.spawnFx = Math.max(0, bm.spawnFx - dt * 2);
      bm.mat.emissiveIntensity = 0.7 + bm.spawnFx * 2.5;
    }

    for (const mu of Object.values(this.mushrooms)) {
      mu.hit = Math.max(0, mu.hit - dt * 3.5);
      const k = mu.hit;
      mu.capGroup.scale.set(1 + k * 0.16, 1 - k * 0.22, 1 + k * 0.16);
      mu.capGroup.position.y = -k * 0.15;
      const pulse = 0.5 + 0.5 * Math.sin(t * 2 + mu.phase);
      mu.capMat.emissive.copy(mu.color).lerp(th.glowColor, 0.2);
      mu.capMat.emissiveIntensity = th.glowStrength * (0.22 + 0.12 * pulse) + k * 1.6;
      mu.light.intensity = 3 + th.glowStrength * 2.2 + k * 14;
      mu.glow.material.opacity = 0.22 + th.glowStrength * 0.1 + k * 0.6;
      mu.halo.material.opacity = 0.06 + th.glowStrength * 0.05 + k * 0.5;
    }
    for (const cr of Object.values(this.crystals)) {
      cr.hit = Math.max(0, cr.hit - dt * 4);
      const pulse = 0.5 + 0.5 * Math.sin(t * 2.6 + cr.phase);
      cr.mat.emissiveIntensity = 0.35 + th.glowStrength * 0.3 * pulse + cr.hit * 2.5;
      cr.halo.material.opacity = 0.12 + th.glowStrength * 0.08 + cr.hit * 0.6;
      cr.m.scale.setScalar(1 + cr.hit * 0.1);
    }
    this.potion.hit = Math.max(0, this.potion.hit - dt * 3);
    this.potion.g.rotation.z = Math.sin(t * 30) * 0.12 * this.potion.hit;
    this.potion.halo.material.opacity = 0.25 + 0.1 * Math.sin(t * 3) + this.potion.hit;
    this.potionLiquidMat.emissiveIntensity = 1.4 + this.potion.hit * 3 + 0.3 * Math.sin(t * 2.2);
    if (Math.random() < dt * 2.5) { W(this.potion.x, this.potion.y, 0, _v); this.particles.spawn(_v.x + (Math.random() - 0.5) * 0.2, 2.1, _v.z, 0, 1.2, 0, _col.setRGB(1, 0.4, 0.9), 0.25, 0.9, 0); }

    const wz = this.wizard;
    wz.hit = Math.max(0, wz.hit - dt * 3);
    wz.body.position.y = Math.sin(t * 1.6) * 0.04 + wz.hit * 0.25;
    wz.body.rotation.z = Math.sin(t * 0.9) * 0.035;
    wz.staffG.rotation.z = Math.sin(t * 1.3) * 0.05 - wz.hit * 0.3;
    const charged = rules.doorOpen;
    const lvl = charged ? 3 : wz.charge;
    const orbCol = _col.setHSL(0.14 - lvl * 0.02, 1, 0.65 + lvl * 0.05);
    this.orbMat.emissive.copy(orbCol);
    this.orbMat.emissiveIntensity = 1.5 + lvl * 1.2 + wz.hit * 3 + (charged ? Math.sin(t * 10) * 0.8 : 0);
    this.orbHalo.material.color.copy(orbCol);
    this.orbHalo.scale.setScalar(1.5 + lvl * 0.55 + wz.hit + 0.1 * Math.sin(t * 4));
    this.orbHalo.material.rotation = t * 0.6;
    this.plateMat.emissiveIntensity = 0.3 + lvl * 0.5 + wz.hit * 2;
    wz.auraGlow.material.opacity = 0.25 + lvl * 0.15;
    if (lvl > 0 && Math.random() < dt * (4 + lvl * 6)) {
      wz.orb.getWorldPosition(_v);
      const a = Math.random() * Math.PI * 2;
      this.particles.spawn(_v.x + Math.cos(a) * 0.6, _v.y + (Math.random() - 0.5) * 0.6, _v.z + Math.sin(a) * 0.6, -Math.sin(a) * 1.5, 0.4, Math.cos(a) * 1.5, orbCol, 0.35, 0.6, 0);
    }

    const tw = this.tower;
    tw.open += (tw.target - tw.open) * Math.min(1, dt * 5);
    for (const { hinge, side } of tw.leaves) hinge.rotation.y = side * tw.open * 1.75;
    const doorPulse = tw.target ? 0.75 + 0.25 * Math.sin(t * 6) : 0;
    this.doorGlow.material.opacity = tw.open * doorPulse;
    tw.beam.material.opacity = tw.open * 0.75 * doorPulse;
    this.doorInnerMat.color.setRGB(0.07 + tw.open * 1.6, 0.03 + tw.open * 1.15, 0.02 + tw.open * 0.4);
    this.towerLight.intensity = th.towerLightIntensity * (1 + tw.open * 2.5 * doorPulse) + (rules.multiball ? 10 * (0.5 + 0.5 * Math.sin(t * 8)) : 0);
    this.windowMat.emissiveIntensity = 1.8 + 0.4 * Math.sin(t * 1.5) + (rules.multiball ? 1.5 : 0);
    this.spireStar.material.opacity = 0.7 + 0.3 * Math.sin(t * 3);
    this.spireStar.material.rotation = -t * 0.4;
    if (tw.target && Math.random() < dt * 20) {
      W(CX, 28.6, 0, _v);
      this.particles.spawn(_v.x + (Math.random() - 0.5) * 1.6, 0.2 + Math.random() * 2, _v.z + 0.3, (Math.random() - 0.5), 1 + Math.random(), 1.5, _col.setRGB(1, 0.8, 0.35), 0.4, 0.9, 0.5);
    }

    if (this.pending && this.pending.length) {
      for (const p of this.pending) {
        p.t -= dt;
        if (!p.done && p.t <= 0) {
          p.done = true;
          const hue = Math.random(), top = this.towerTopWorld;
          this.particles.firework(top.x + (Math.random() - 0.5) * 6, top.y + 2 + Math.random() * 3, top.z + (Math.random() - 0.5) * 3, _col.setHSL(hue, 1, 0.6).clone(), 80, 6 + Math.random() * 3);
          this.particles.firework(top.x + (Math.random() - 0.5) * 6, top.y + 1 + Math.random() * 3, top.z + (Math.random() - 0.5) * 3, _col.setHSL((hue + 0.15) % 1, 1, 0.7).clone(), 40, 4);
        }
      }
      this.pending = this.pending.filter((p) => !p.done);
    }

    for (const s of Object.values(this.slingRubbers)) { s.flash = Math.max(0, s.flash - dt * 5); s.mat.emissiveIntensity = 0.15 + s.flash * 3; }
    for (const r of Object.values(this.rampMeshes)) { r.flash = Math.max(0, r.flash - dt * 1.5); if (r.mat) r.mat.emissiveIntensity = 0.22 + r.flash * 1.5 + 0.08 * Math.sin(t * 2); }

    this._updateInserts(t, rules);

    const held = !!this.sim.heldBall();
    const skill = rules.skillLit && held;
    this.skillRing.material.opacity = skill ? 0.9 : (rules.skillAvailable && held ? 0.12 : 0);
    this.skillRing.scale.setScalar(skill ? 1 + 0.08 * Math.sin(t * 12) : 1);
    this.laneGlow.material.opacity = skill ? 0.9 : 0;
    const waiting = held && !rules.multiball && rules.state === 'playing';
    this.plungerGem.rotation.y += dt * (waiting ? 2.5 : 0.6);
    this.mat.emerald.emissiveIntensity = 1.3 + (waiting ? 1.2 + Math.sin(t * 5) * 0.8 : 0);
    this.plungerGemHalo.material.opacity = 0.4 + (waiting ? 0.4 + 0.2 * Math.sin(t * 5) : 0);

    this.plungerG.position.z = this.plungerBaseZ + this.sim.plunger.pos * 1.6;
    this.plungerSpring.scale.z = 1 - this.sim.plunger.pos * 0.45;

    this.poolUniforms.uTime.value = t;
    this.fallUniforms.uTime.value = t;
    this.fireflies.material.uniforms.uTime.value = t;
    this.stars.material.uniforms.uTime.value = t;

    this.particles.update(dt);

    this.shake = Math.max(0, this.shake - dt * 1.5);
    this.flash = Math.max(0, this.flash - dt * 2);
    if (this.camBase) {
      const s = this.shake * this.shake * 0.35;
      this.camera.position.set(this.camBase.x + (Math.random() - 0.5) * s, this.camBase.y + (Math.random() - 0.5) * s, this.camBase.z);
    }
    this.renderer.toneMappingExposure = th.exposure * (1 + this.flash * 0.35);

    if (this.bloomEnabled) this.composer.render(dt);
    else this.renderer.render(this.scene, this.camera);
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
      if (rules.state !== 'playing') lvl = 0.3 + 0.7 * Math.max(0, Math.sin(t * 2.5 - i * 0.5));
      const q = Math.round(lvl * 20);
      if (q !== it.level || (kind === 'combo' && rules.rushActive)) {
        it.level = q;
        this.insertDisc.setColorAt(i, _col.copy(color).multiplyScalar(0.12 + lvl * 1.4));
        this.insertGlow.setColorAt(i, _col.copy(color).multiplyScalar(lvl * 1.1));
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
    // hold 60 FPS: lower the render resolution, then bloom, if frames get slow (and recover when there is headroom)
    this.frameTimes.push(dt);
    if (this.frameTimes.length < 90) return;
    const avg = this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length;
    this.frameTimes.length = 0;
    if (avg > 1 / 52) {
      if (this.pixelRatio > 1.25) { this.pixelRatio = Math.max(1.25, this.pixelRatio - 0.25); this.resize(); }
      else if (this.bloomEnabled) { this.bloomEnabled = false; this._bloomAutoOff = true; }
      else if (this.pixelRatio > 1) { this.pixelRatio = 1; this.resize(); }
      this.qualityTimer = 0;
    } else if (avg < 1 / 58 && (this.qualityTimer += 1) > 8) {
      this.qualityTimer = 0;
      if (this._bloomAutoOff) { this.bloomEnabled = true; this._bloomAutoOff = false; }
      else if (this.pixelRatio < this.maxPixelRatio) { this.pixelRatio = Math.min(this.maxPixelRatio, this.pixelRatio + 0.25); this.resize(); }
    }
  }
}
