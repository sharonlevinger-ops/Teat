// Stage: fits the painting to the iPhone screen (respecting the safe areas) and renders it with WebGL.
// Later steps add their layers (flippers, ball, glows, particles, chapter grading) to this same scene.
import * as THREE from '../vendor/three.module.min.js';
import { ART_W, ART_H, TABLE_W, TABLE_H, FEATURES, flatToArt } from '../core/artmap.js';

function loadTexture(url) {
  return new Promise((resolve, reject) => {
    new THREE.TextureLoader().load(url, (t) => { t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; resolve(t); }, undefined, reject);
  });
}

function safeInsets() {
  if (window.__SAFE__) return window.__SAFE__; // test hook: emulate a device's safe areas
  const probe = document.createElement('div');
  probe.style.cssText = 'position:fixed;top:0;left:0;visibility:hidden;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)';
  document.body.appendChild(probe);
  const cs = getComputedStyle(probe);
  const r = { top: parseFloat(cs.paddingTop) || 0, bottom: parseFloat(cs.paddingBottom) || 0 };
  probe.remove();
  return r;
}

export class Stage {
  constructor(canvas, art) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 3)); // 13 Pro Max: 3x = the painting's native pixels
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x05070a);
    this.camera = new THREE.OrthographicCamera(0, 1, 0, -1, -10, 10);
    this.layout = { s: 1, left: 0, top: 0, w: ART_W, h: ART_H };
    this.art = art;
    const mat = (tex) => new THREE.MeshBasicMaterial({ map: tex, toneMapped: false });
    this.quadArt = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat(art.playfield));
    this.quadTop = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat(art.extTop));
    this.quadBottom = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat(art.extBottom));
    this.scene.add(this.quadTop, this.quadBottom, this.quadArt);
    this.calib = this._buildCalibration();
    this.calib.visible = false;
    this.scene.add(this.calib);
  }

  static async load(canvas, base = 'art/') {
    const url = (f) => (window.__ART_URLS__ && window.__ART_URLS__[f]) || base + f; // single-file build embeds the images
    const [playfield, extTop, extBottom] = await Promise.all(['playfield.jpg', 'ext-top.jpg', 'ext-bottom.jpg'].map((f) => loadTexture(url(f))));
    return new Stage(canvas, { playfield, extTop, extBottom });
  }

  /** Fit: full width, painting top just under the Dynamic Island; spare height continues the forest below. */
  resize() {
    const W = window.innerWidth, H = window.innerHeight;
    const safe = safeInsets();
    let s = W / ART_W;
    let top = safe.top, left = 0;
    if (top + ART_H * s > H) { // shorter screens: fit the height, centre horizontally
      s = (H - safe.top) / ART_H;
      left = (W - ART_W * s) / 2;
    }
    const w = ART_W * s, h = ART_H * s;
    this.layout = { s, left, top, w, h, W, H, safe };
    this.renderer.setSize(W, H, false);
    this.camera.left = 0; this.camera.right = W; this.camera.top = 0; this.camera.bottom = -H;
    this.camera.updateProjectionMatrix();
    const place = (m, x, y, ww, hh) => { m.scale.set(ww, hh, 1); m.position.set(x + ww / 2, -(y + hh / 2), 0); };
    place(this.quadArt, left, top, w, h);
    place(this.quadTop, left, 0, w, top + 1);
    const bh = Math.max(0, H - (top + h)) + 1;
    place(this.quadBottom, left, top + h - 1, w, bh);
    // show only as much of the bottom extension as the band needs (no stretching)
    const tex = this.art.extBottom;
    const texH = (tex.image.height / tex.image.width) * w;
    tex.repeat.set(1, Math.min(1, bh / texH));
    tex.offset.set(0, 1 - Math.min(1, bh / texH));
    this.calib.scale.set(s, s, 1);
    this.calib.position.set(left, -top, 1);
    return this.layout;
  }

  /** painting pixels -> CSS pixels on screen */
  artToScreen(x, y) { const L = this.layout; return [L.left + x * L.s, L.top + y * L.s]; }

  setCalibration(on) { this.calib.visible = on; }

  render() { this.renderer.render(this.scene, this.camera); }

  // ---------------------------------------------------------------- calibration overlay (art pixels)
  _buildCalibration() {
    const g = new THREE.Group();
    const lines = (pts, color, closed = false) => {
      const arr = [];
      const P = closed ? [...pts, pts[0]] : pts;
      for (let i = 0; i < P.length - 1; i++) arr.push(P[i][0], -P[i][1], 0, P[i + 1][0], -P[i + 1][1], 0);
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
      g.add(new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.9, depthTest: false })));
    };
    const ellipse = (cx, cy, rx, ry, color) => {
      const pts = [];
      for (let i = 0; i < 40; i++) { const a = (i / 40) * Math.PI * 2; pts.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]); }
      lines(pts, color, true);
    };
    // perspective grid of the flat physics table
    for (let x = 0; x <= TABLE_W; x += 3) lines([flatToArt(x, 0), flatToArt(x, TABLE_H)], 0x3aa0ff);
    for (let y = 0; y <= TABLE_H; y += 4) lines([flatToArt(0, y), flatToArt(TABLE_W, y)], 0x3aa0ff);
    lines([flatToArt(0, 0), flatToArt(TABLE_W, 0), flatToArt(TABLE_W, TABLE_H), flatToArt(0, TABLE_H)], 0xffffff, true);
    const F = FEATURES;
    for (const f of Object.values(F.flippers)) {
      const dx = f.tip[0] - f.pivot[0], dy = f.tip[1] - f.pivot[1], len = Math.hypot(dx, dy), nx = -dy / len, ny = dx / len;
      lines([[f.pivot[0] + nx * f.r1, f.pivot[1] + ny * f.r1], [f.tip[0] + nx * f.r2, f.tip[1] + ny * f.r2], [f.tip[0] - nx * f.r2, f.tip[1] - ny * f.r2], [f.pivot[0] - nx * f.r1, f.pivot[1] - ny * f.r1]], 0xff4040, true);
    }
    for (const p of Object.values(F.slings)) lines(p, 0xffa020, true);
    for (const p of Object.values(F.guides)) lines(p, 0x40ff60);
    lines(F.drain, 0xff0000);
    ellipse(...F.tower.base, 0xffe060);
    ellipse(F.tower.door[0], F.tower.door[1], F.tower.door[2], F.tower.door[3], 0xffe060);
    ellipse(...F.pool, 0x40e0ff);
    ellipse(F.wizard.body[0], F.wizard.body[1], F.wizard.body[2], F.wizard.body[3], 0xb0c0ff);
    for (const [x, y, r] of Object.values(F.mushrooms)) ellipse(x, y, r, r * 0.8, 0xff60ff);
    for (const [x, y, r] of Object.values(F.crystals)) ellipse(x, y, r, r * 0.8, 0x60fff0);
    ellipse(F.potion[0], F.potion[1], F.potion[2], F.potion[2], 0xff60c0);
    ellipse(F.kickoutHole[0], F.kickoutHole[1], F.kickoutHole[2], F.kickoutHole[2] * 0.7, 0xffffff);
    lines(F.ramps.crystal, 0x80d0ff);
    lines(F.ramps.leftOrbit, 0xd0b060);
    ellipse(F.plunger.knob[0], F.plunger.knob[1], F.plunger.knob[2], F.plunger.knob[2], 0x40ff90);
    lines(F.plunger.spring, 0x40ff90);
    return g;
  }
}
