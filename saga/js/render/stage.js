// Stage: fits the painting to the iPhone screen (respecting the safe areas) and renders it with WebGL.
// `artGroup` is a group laid out in painting pixels; every live layer (flippers, ball, occluders, effects)
// is added to it, so it lines up with the painting at any screen size.
import * as THREE from '../vendor/three.module.min.js';
import { ART_W, ART_H, flatToArt } from '../core/artmap.js';

const artUrl = (base, f) => (window.__ART_URLS__ && window.__ART_URLS__[f]) || base + f; // single-file build embeds images

export function loadTexture(url) {
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
  constructor(canvas, art, base) {
    this.base = base;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 3)); // 13 Pro Max: 3x = the painting's own pixels
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x05070a);
    this.camera = new THREE.OrthographicCamera(0, 1, 0, -1, -1000, 1000);
    this.layout = { s: 1, left: 0, top: 0, w: ART_W, h: ART_H };
    this.art = art;
    const mat = (tex) => new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, depthTest: false, depthWrite: false });
    this.quadTop = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat(art.extTop));
    this.quadBottom = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat(art.extBottom));
    this.quadTop.renderOrder = this.quadBottom.renderOrder = -1e6;
    this.scene.add(this.quadTop, this.quadBottom);
    // everything below lives in painting pixels (x right, y down -> placed at -y)
    this.artGroup = new THREE.Group();
    this.scene.add(this.artGroup);
    const field = new THREE.Mesh(new THREE.PlaneGeometry(ART_W, ART_H), mat(art.playfield));
    field.position.set(ART_W / 2, -ART_H / 2, 0);
    field.renderOrder = -1e6;
    this.artGroup.add(field);
    this.calib = null;
  }

  static async load(canvas, base = 'art/') {
    const [playfield, extTop, extBottom] = await Promise.all(['playfield.jpg', 'ext-top.jpg', 'ext-bottom.jpg'].map((f) => loadTexture(artUrl(base, f))));
    return new Stage(canvas, { playfield, extTop, extBottom }, base);
  }

  texture(file) { return loadTexture(artUrl(this.base, file)); }

  /** Fit: full width, painting top just under the Dynamic Island; spare height continues the forest below. */
  resize() {
    const W = window.innerWidth, H = window.innerHeight;
    const safe = safeInsets();
    let s = W / ART_W;
    let top = safe.top, left = 0;
    if (top + ART_H * s > H) { s = (H - safe.top) / ART_H; left = (W - ART_W * s) / 2; } // shorter screens
    const w = ART_W * s, h = ART_H * s;
    this.layout = { s, left, top, w, h, W, H, safe };
    this.renderer.setSize(W, H, false);
    this.camera.left = 0; this.camera.right = W; this.camera.top = 0; this.camera.bottom = -H;
    this.camera.updateProjectionMatrix();
    const place = (m, x, y, ww, hh) => { m.scale.set(ww, hh, 1); m.position.set(x + ww / 2, -(y + hh / 2), 0); };
    place(this.quadTop, left, 0, w, top + 1);
    const bh = Math.max(0, H - (top + h)) + 1;
    place(this.quadBottom, left, top + h - 1, w, bh);
    const tex = this.art.extBottom;
    const texH = (tex.image.height / tex.image.width) * w;
    tex.repeat.set(1, Math.min(1, bh / texH));
    tex.offset.set(0, 1 - Math.min(1, bh / texH));
    this.artGroup.scale.set(s, s, 1);
    this.artGroup.position.set(left, -top, 0);
    return this.layout;
  }

  /** painting pixels -> CSS pixels on screen, and back */
  artToScreen(x, y) { const L = this.layout; return [L.left + x * L.s, L.top + y * L.s]; }
  screenToArt(x, y) { const L = this.layout; return [(x - L.left) / L.s, (y - L.top) / L.s]; }

  render() { this.renderer.render(this.scene, this.camera); }

  // ---------------------------------------------------------------- calibration overlay: the actual physics
  setCalibration(on, table) {
    if (on && !this.calib) { this.calib = this._buildCalibration(table); this.artGroup.add(this.calib); }
    if (this.calib) this.calib.visible = on;
  }

  _buildCalibration(table) {
    const g = new THREE.Group();
    const lines = (flatPts, color, closed = false) => {
      const P = (closed ? [...flatPts, flatPts[0]] : flatPts).map(([x, y]) => flatToArt(x, y));
      const arr = [];
      for (let i = 0; i < P.length - 1; i++) arr.push(P[i][0], -P[i][1], 0, P[i + 1][0], -P[i + 1][1], 0);
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
      const l = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color, depthTest: false, transparent: true, opacity: 0.95 }));
      l.renderOrder = 1e6;
      g.add(l);
    };
    const circle = (x, y, r, color) => { const pts = []; for (let i = 0; i < 32; i++) { const a = (i / 32) * Math.PI * 2; pts.push([x + Math.cos(a) * r, y + Math.sin(a) * r]); } lines(pts, color, true); };
    const colors = { wall: 0xffffff, gate: 0x40ff40, sling: 0xff40ff, door: 0xffa020, element: 0x40fff0 };
    for (const w of table.walls) lines(w.pts, colors[w.kind] || 0xffffff);
    for (const c of table.circles) circle(c.x, c.y, c.r, c.kind === 'element' ? 0x40fff0 : c.kind === 'wizard' ? 0xb0c0ff : 0xffff40);
    for (const s of table.sensors) {
      if (s.type === 'rect') lines([[s.x - s.w / 2, s.y - s.h / 2], [s.x + s.w / 2, s.y - s.h / 2], [s.x + s.w / 2, s.y + s.h / 2], [s.x - s.w / 2, s.y + s.h / 2]], 0x30ff60, true);
      else circle(s.x, s.y, s.r, 0x30ff60);
    }
    for (const r of Object.values(table.ramps)) lines(r.path.pts.map(([x, y]) => [x, y]), 0xffb040);
    for (const f of table.flippers) {
      for (const a of [f.rest, f.up]) lines([[f.px, f.py], [f.px + Math.cos(a) * f.len, f.py + Math.sin(a) * f.len]], 0xff4040);
    }
    return g;
  }
}
