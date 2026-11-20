// Live layers on the painting: flippers (cut from the painting), balls with shadows, and occluders –
// the tall painted objects redrawn over the ball whenever it passes behind them, so the flat painting
// behaves like a real 3D table. Everything is pooled and created once.
import * as THREE from '../vendor/three.module.min.js';
import { flatToArt, artToFlat, unitScaleAt } from '../core/artmap.js';
import { FLIPPER_STRETCH } from '../core/table.js';
import { SPRITES } from './sprite-meta.js';
import { PHYS } from '../core/config.js';

const R = PHYS.BALL_R;
const depth = (flatY) => -flatY * 10; // nearer the player (smaller flat y) = drawn later

function spriteMesh(tex, w, h) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false, toneMapped: false }));
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
    const names = ['tower', 'wizard', 'mush1', 'mush2', 'mush3', 'crystal1', 'crystal2', 'potion', 'pedestal'];
    const tex = {};
    await Promise.all([...names.map((n) => `sprites/${n}.png`), 'flipper-l.png', 'flipper-r.png'].map(async (f) => { tex[f] = await this.stage.texture(f); }));
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
      this.occ[n] = { mesh: m, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, base };
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
      const mesh = spriteMesh(ballTex, 1, 1);
      const shadow = spriteMesh(shadowTex, 1, 1);
      mesh.visible = shadow.visible = false;
      this.group.add(shadow, mesh);
      return { b, mesh, shadow, roll: 0, lastX: 0, lastY: 0 };
    });
  }

  _flatOf([x, y]) { return artToFlat(x, y); }

  update(alpha) {
    for (const fl of this.flippers) {
      const f = fl.f;
      const [pvx, pvy] = f.pivotArt;
      const tip = flatToArt(f.px + Math.cos(f.angle) * f.paintedLen, f.py + Math.sin(f.angle) * f.paintedLen);
      const delta = Math.atan2(tip[1] - pvy, tip[0] - pvx) - fl.restArt; // rotation in art space
      fl.spin.rotation.z = -(fl.a0 + delta);
    }
    const plungerPull = this.sim.plunger.pos;
    for (const bl of this.balls) {
      const b = bl.b;
      const vis = b.active && b.mode !== 'tower';
      bl.mesh.visible = bl.shadow.visible = vis;
      if (!vis) continue;
      const x = b.px + (b.x - b.px) * alpha, y = b.py + (b.y - b.py) * alpha, z = b.pz + (b.z - b.pz) * alpha;
      let [ax, ay] = flatToArt(x, y);
      const unit = unitScaleAt(x, y);
      if (b.mode === 'held') ay += plungerPull * 26; // pulled down with the plunger
      const size = unit * 2 * R * (1 + z * 0.06);
      bl.mesh.scale.set(size, size, 1);
      bl.mesh.position.set(ax, -ay, 0);
      const lift = z * unit * 0.5;
      bl.shadow.scale.set(size * 1.25, size * 0.8, 1);
      bl.shadow.position.set(ax + size * 0.18 + lift * 0.4, -(ay + size * 0.32 + lift), 0);
      bl.shadow.material.opacity = 1 / (1 + z * 0.4);
      bl.mesh.renderOrder = depth(y) + 2;
      bl.shadow.renderOrder = depth(y) + 1;
    }
  }
}
