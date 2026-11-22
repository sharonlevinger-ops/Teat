// Live layers on the painting: flippers (cut from the painting), balls with shadows, and occluders –
// the tall painted objects redrawn over the ball whenever it passes behind them, so the flat painting
// behaves like a real 3D table. Everything is pooled and created once.
import * as THREE from '../vendor/three.module.min.js';
import { flatToArt, artToFlat, unitScaleAt, ART_W, ART_H } from '../core/artmap.js';
import { FLIPPER_STRETCH } from '../core/table.js';
import { SPRITES } from './sprite-meta.js';
import { PHYS } from '../core/config.js';
import { applyGrade, gradeUniforms } from './grade.js';

const R = PHYS.BALL_R;
const KNOB = [1190, 1709]; // top of the plunger gem at rest (painting pixels): the waiting ball sits here
const PULL_PX = 38; // how far the plunger travels at full pull (painting pixels)
// squash-and-stretch springs: what bounces when it is hit, and how hard
const BOUNCE = { mush1: 1, mush2: 1, mush3: 1, crystal1: 0.6, crystal2: 0.6, potion: 0.8, wizard: 0.45, slingL: 0.5, slingR: 0.5, tower: 0.25 };
const BREATHE = { mush1: 0.012, mush2: 0.014, mush3: 0.011, potion: 0.008, wizard: 0.006 }; // idle "alive" motion
const depth = (flatY) => -flatY * 10; // nearer the player (smaller flat y) = drawn later

function spriteMesh(tex, w, h) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), applyGrade(new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false, toneMapped: false })));
  return m;
}

/** A classic chrome pinball: steel body, the dark playfield reflected below the horizon, sky above, hot highlights. */
function steelBallTexture() {
  const N = 128, c = document.createElement('canvas');
  c.width = c.height = N;
  const g = c.getContext('2d');
  g.save();
  g.beginPath(); g.arc(N / 2, N / 2, N / 2 - 1, 0, Math.PI * 2); g.clip();
  const body = g.createLinearGradient(0, 0, 0, N); // sky -> horizon -> reflected playfield
  body.addColorStop(0, '#f4f6fa'); body.addColorStop(0.38, '#aeb6c2'); body.addColorStop(0.5, '#3e4652');
  body.addColorStop(0.56, '#5d6a5a'); body.addColorStop(0.8, '#2c3428'); body.addColorStop(1, '#151a14');
  g.fillStyle = body; g.fillRect(0, 0, N, N);
  const shade = g.createRadialGradient(N * 0.4, N * 0.36, N * 0.1, N / 2, N / 2, N * 0.52); // spherical falloff
  shade.addColorStop(0, 'rgba(255,255,255,0.15)'); shade.addColorStop(0.7, 'rgba(0,0,0,0.05)'); shade.addColorStop(1, 'rgba(0,0,0,0.6)');
  g.fillStyle = shade; g.fillRect(0, 0, N, N);
  const hot = g.createRadialGradient(N * 0.36, N * 0.28, 0, N * 0.36, N * 0.28, N * 0.2); // key light
  hot.addColorStop(0, 'rgba(255,255,255,1)'); hot.addColorStop(0.35, 'rgba(255,255,255,0.75)'); hot.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = hot; g.fillRect(0, 0, N, N);
  g.fillStyle = 'rgba(255,255,255,0.55)'; // small secondary highlight
  g.beginPath(); g.ellipse(N * 0.66, N * 0.2, N * 0.05, N * 0.025, -0.5, 0, Math.PI * 2); g.fill();
  const rim = g.createRadialGradient(N / 2, N / 2, N * 0.42, N / 2, N / 2, N * 0.5); // warm bounce light from the forest
  rim.addColorStop(0, 'rgba(255,220,150,0)'); rim.addColorStop(1, 'rgba(255,220,150,0.35)');
  g.fillStyle = rim; g.fillRect(0, 0, N, N);
  g.restore();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/**
 * The steel ball material: the chrome texture plus a live reflection of the painted table around the ball
 * (fish-eye, mirrored, slightly blurred), so it picks up the forest green, the potion purple, the fire of
 * chapter 3… The chapter grade is applied on top, like every other painted thing.
 */
function reflectiveBallMaterial(steelTex, fieldTex) {
  const mat = new THREE.MeshBasicMaterial({ map: steelTex, transparent: true, depthTest: false, depthWrite: false, toneMapped: false });
  const u = { uField: { value: fieldTex }, uPos: { value: new THREE.Vector2(0, 0) }, uRad: { value: 20 }, uArt: { value: new THREE.Vector2(ART_W, ART_H) } };
  mat.userData.u = u;
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, gradeUniforms, u);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform float uSat, uContrast, uBright; uniform vec3 uShadow, uHigh;
        uniform sampler2D uField; uniform vec2 uPos, uArt; uniform float uRad;`)
      .replace('#include <map_fragment>', `#include <map_fragment>
        {
          vec2 q = vMapUv * 2.0 - 1.0;                       // -1..1 across the ball, y up
          float r2 = dot(q, q);
          vec3 n = vec3(q, sqrt(max(0.0, 1.0 - r2)));        // sphere normal
          vec2 off = n.xy / (n.z + 0.35) * uRad * 1.7;       // fish-eye: the rim sees far away
          vec2 p = uPos + vec2(-off.x, off.y);               // mirrored (painting y runs down)
          vec3 env = texture2D(uField, vec2(p.x / uArt.x, 1.0 - p.y / uArt.y), 2.0).rgb;
          vec3 steel = diffuseColor.rgb;
          float lum = dot(steel, vec3(0.2126, 0.7152, 0.0722));
          float rim = smoothstep(0.35, 1.0, sqrt(r2));
          vec3 c = mix(steel * 0.8, env * 1.4 + steel * 0.12, 0.55 + 0.3 * rim); // the table in the steel, stronger at the rim
          c += pow(max(lum - 0.62, 0.0), 1.4) * 2.2;          // keep the hot highlights
          // chapter grade (same as the painting)
          float gl = dot(c, vec3(0.2126, 0.7152, 0.0722));
          c = mix(vec3(gl), c, uSat);
          c = (c - 0.18) * uContrast + 0.18;
          c *= uBright * mix(uShadow, uHigh, smoothstep(0.0, 0.6, gl));
          diffuseColor.rgb = max(c, 0.0);
        }`);
  };
  mat.customProgramCacheKey = () => 'ball-reflect';
  return mat;
}

function shadowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const rg = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  rg.addColorStop(0, 'rgba(0,0,0,0.75)'); rg.addColorStop(0.55, 'rgba(0,0,0,0.35)'); rg.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = rg; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

export class TableLayers {
  constructor(stage, sim) {
    this.stage = stage;
    this.sim = sim;
    this.group = stage.artGroup;
  }

  async load() {
    const names = ['tower', 'wizard', 'mush1', 'mush2', 'mush3', 'crystal1', 'crystal2', 'potion', 'pedestal', 'slingL', 'slingR'];
    const tex = {};
    await Promise.all([...names.map((n) => `sprites/${n}.png`), 'sprites/knob.png', 'sprites/spring.png', 'flipper-l.png', 'flipper-r.png'].map(async (f) => { tex[f] = await this.stage.texture(f); }));
    this.occ = {};
    // occluders
    for (const n of names) {
      const { box, base } = SPRITES[n];
      const [x0, y0, x1, y1] = box;
      const m = spriteMesh(tex[`sprites/${n}.png`], x1 - x0, y1 - y0);
      m.position.set((x0 + x1) / 2, -(y0 + y1) / 2, 0);
      const flat = this._flatOf(base);
      m.renderOrder = depth(flat[1]);
      this.group.add(m);
      this.occ[n] = { mesh: m, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, base, k: 0, v: 0, phase: Math.random() * 6.28 };
    }
    // the plunger: gem + brass cap (moves) and the coil spring (compresses), cut from the painting
    {
      const kb = SPRITES.knob.box, sb = SPRITES.spring.box;
      const knob = spriteMesh(tex['sprites/knob.png'], kb[2] - kb[0], kb[3] - kb[1]);
      const spring = spriteMesh(tex['sprites/spring.png'], sb[2] - sb[0], sb[3] - sb[1]);
      const order = depth(artToFlat(1189, 1900)[1]);
      knob.renderOrder = order + 1; spring.renderOrder = order;
      this.group.add(spring, knob);
      this.plunger = { knob, spring, kb, sb, disp: 0, vel: 0, order };
    }
    // flippers: the painted flipper sprite, rotated about its pivot (and stretched to the physics length)
    this.flippers = this.sim.world.flippers.map((f) => {
      const key = f.side === 'L' ? 'flipper-l' : 'flipper-r';
      const [x0, y0, x1, y1] = SPRITES[key].box;
      const [pvx, pvy] = f.pivotArt;
      const [tpx, tpy] = f.tipArt;
      const a0 = Math.atan2(tpy - pvy, tpx - pvx); // painted axis angle (art space, y down)
      const mesh = spriteMesh(tex[`${key}.png`], x1 - x0, y1 - y0);
      mesh.geometry.translate((x0 + x1) / 2 - pvx, -((y0 + y1) / 2 - pvy), 0); // pivot at the origin
      const spin = new THREE.Group(); // rotates to the current axis
      const stretch = new THREE.Group(); // stretches along the axis
      const unrot = new THREE.Group(); // undoes the painted axis
      unrot.rotation.z = a0; // (y is flipped: +a0 here = -a0 in art space)
      stretch.scale.set(FLIPPER_STRETCH, 1, 1);
      unrot.add(mesh);
      stretch.add(unrot);
      spin.add(stretch);
      spin.position.set(pvx, -pvy, 0);
      spin.renderOrder = mesh.renderOrder = depth(f.py) - 1;
      this.group.add(spin);
      const restTip = flatToArt(f.px + Math.cos(f.rest) * f.paintedLen, f.py + Math.sin(f.rest) * f.paintedLen);
      return { f, spin, mesh, a0, restArt: Math.atan2(restTip[1] - pvy, restTip[0] - pvx) };
    });
    // balls + shadows (pooled: one per physics ball)
    const shadowTex = shadowTexture();
    const ballTex = steelBallTexture();
    this.balls = this.sim.world.balls.map((b) => {
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), reflectiveBallMaterial(ballTex, this.stage.art.playfield));
      const shadow = spriteMesh(shadowTex, 1, 1);
      mesh.visible = shadow.visible = false;
      this.group.add(shadow, mesh);
      return { b, mesh, shadow, roll: 0, lastX: 0, lastY: 0, ox: 0, oy: 0 };
    });
    // every hit makes the object bounce (squash, then wobble back)
    const kick = (id, amount) => { const o = this.occ[id]; if (o) o.v += 2.6 * amount * (BOUNCE[id] || 0.5); };
    this.sim.bus.on('element', ({ id }) => kick(id, 1));
    this.sim.bus.on('wizardHit', () => kick('wizard', 1));
    this.sim.bus.on('doorThud', () => kick('tower', 1));
    this.sim.bus.on('superJackpot', () => kick('tower', 2));
    this.sim.bus.on('contact', (c) => { if (c.kind === 'sling') kick(c.id, Math.min(1.4, c.impact / 20)); });
    this.time = 0;
    this.lastNow = 0;
  }

  _animateOccluders(dt) {
    this.time += dt;
    if (!this.occList) this.occList = Object.entries(this.occ);
    for (const [id, o] of this.occList) {
      if (o.k !== 0 || o.v !== 0) { // damped spring: k'' = -w²k - 2ζw k'
        const w = 26, z = 0.32;
        o.v += (-w * w * o.k - 2 * z * w * o.v) * dt;
        o.k += o.v * dt;
        if (Math.abs(o.k) < 1e-4 && Math.abs(o.v) < 1e-3) { o.k = 0; o.v = 0; }
      }
      const br = BREATHE[id] ? Math.sin(this.time * 1.6 + o.phase) * BREATHE[id] : 0;
      if (o.k === 0 && br === 0 && !o.moved) continue;
      const sx = 1 + o.k * 0.9 - br * 0.5, sy = 1 - o.k + br;
      o.mesh.scale.set(sx, sy, 1);
      // scale about the object's base so it squashes onto the table
      o.mesh.position.set(o.base[0] + (o.cx - o.base[0]) * sx, -(o.base[1] + (o.cy - o.base[1]) * sy), 0);
      o.moved = o.k !== 0 || br !== 0;
    }
  }

  _flatOf([x, y]) { return artToFlat(x, y); }

  /** plunger travel on screen: follows the pull, snaps back past rest on release and settles (spring-damper) */
  _animatePlunger(dt) {
    const pl = this.plunger, target = this.sim.plunger.pos * PULL_PX;
    if (target >= pl.disp - 0.5 && this.sim.plunger.pulling) { pl.disp += (target - pl.disp) * Math.min(1, dt * 30); pl.vel = 0; }
    else {
      const k = 1400, c = 26;
      pl.vel += (k * (target - pl.disp) - c * pl.vel) * dt;
      pl.disp = Math.max(-9, pl.disp + pl.vel * dt);
      if (Math.abs(pl.disp - target) < 0.05 && Math.abs(pl.vel) < 0.5) { pl.disp = target; pl.vel = 0; }
    }
    const { kb, sb } = pl;
    pl.knob.position.set((kb[0] + kb[2]) / 2, -((kb[1] + kb[3]) / 2 + pl.disp), 0);
    const h0 = sb[3] - sb[1], h = Math.max(h0 * 0.45, h0 - pl.disp); // the spring is pressed between the cap and its bottom ring
    pl.spring.scale.set(1, h / h0, 1);
    pl.spring.position.set((sb[0] + sb[2]) / 2, -(sb[3] - h / 2), 0);
    this.plungerDisp = pl.disp;
  }

  update(alpha, dt = 1 / 60) {
    this._animateOccluders(Math.min(dt, 0.05));
    this._animatePlunger(Math.min(Math.max(dt, 1 / 240), 0.05));
    for (const fl of this.flippers) {
      const f = fl.f;
      const [pvx, pvy] = f.pivotArt;
      const tip = flatToArt(f.px + Math.cos(f.angle) * f.paintedLen, f.py + Math.sin(f.angle) * f.paintedLen);
      const delta = Math.atan2(tip[1] - pvy, tip[0] - pvx) - fl.restArt; // rotation in art space
      fl.spin.rotation.z = -(fl.a0 + delta);
    }
    for (const bl of this.balls) {
      const b = bl.b;
      const vis = b.active && b.mode !== 'tower';
      bl.mesh.visible = bl.shadow.visible = vis;
      if (!vis) continue;
      const x = b.px + (b.x - b.px) * alpha, y = b.py + (b.y - b.py) * alpha, z = b.pz + (b.z - b.pz) * alpha;
      let [ax, ay] = flatToArt(x, y);
      const unit = unitScaleAt(x, y);
      const size = unit * 2 * R * (1 + z * 0.06) * (b.mode === 'scoop' ? 0.82 : 1); // sunk in the Mystery Scoop
      // the waiting ball sits centred on the painted plunger gem; after launch it blends back onto its physics path
      if (b.mode === 'held') { bl.ox = KNOB[0] - ax; bl.oy = KNOB[1] + Math.max(0, this.plungerDisp || 0) - size * 0.48 - ay; }
      else if (bl.ox !== 0 || bl.oy !== 0) {
        const f = Math.exp(-dt * 14);
        bl.ox *= f; bl.oy *= f;
        if (Math.abs(bl.ox) < 0.2 && Math.abs(bl.oy) < 0.2) bl.ox = bl.oy = 0;
      }
      ax += bl.ox; ay += bl.oy;
      bl.mesh.scale.set(size, size, 1);
      bl.mesh.position.set(ax, -ay, 0);
      bl.mesh.material.userData.u.uPos.value.set(ax, ay);
      bl.mesh.material.userData.u.uRad.value = size / 2;
      const lift = z * unit * 0.5;
      if (b.mode === 'held') { // seated in the cup on top of the gem: a tight contact shadow right under it
        bl.shadow.scale.set(size * 0.95, size * 0.32, 1);
        bl.shadow.position.set(ax, -(ay + size * 0.44), 0);
      } else {
        bl.shadow.scale.set(size * 1.25, size * 0.8, 1);
        bl.shadow.position.set(ax + size * 0.18 + lift * 0.4, -(ay + size * 0.32 + lift), 0);
      }
      bl.shadow.material.opacity = b.mode === 'scoop' ? 0 : 1 / (1 + z * 0.4);
      // a ball riding a ramp is above the table and everything on it
      const po = this.plunger.order;
      bl.mesh.renderOrder = b.mode === 'rail' ? 9e4 : b.mode === 'held' ? po + 4 : depth(y) + 2;
      bl.shadow.renderOrder = b.mode === 'rail' ? 9e4 - 1 : b.mode === 'held' ? po + 3 : depth(y) + 1;
    }
  }
}
