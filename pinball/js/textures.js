// Procedural, high-detail canvas textures (no external image files needed).
import * as THREE from 'three';

// ---------- noise ----------
function mulberry32(a) { return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
export const rand = mulberry32(1337);
const perm = new Uint8Array(512);
{ const p = [...Array(256).keys()]; for (let i = 255; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; } for (let i = 0; i < 512; i++) perm[i] = p[i & 255]; }
const fade = (t) => t * t * (3 - 2 * t);
function vnoise(x, y, period = 256) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const X0 = ((xi % period) + period) % period, Y0 = ((yi % period) + period) % period;
  const X1 = (X0 + 1) % period, Y1 = (Y0 + 1) % period;
  const h = (a, b) => perm[(perm[a & 255] + b) & 511] / 255;
  const u = fade(xf), v = fade(yf);
  const a = h(X0, Y0), b = h(X1, Y0), c = h(X0, Y1), d = h(X1, Y1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export function fbm(x, y, oct = 5, period = 256) {
  let s = 0, amp = 0.5, f = 1, norm = 0;
  for (let i = 0; i < oct; i++) { s += vnoise(x * f, y * f, period * f) * amp; norm += amp; amp *= 0.5; f *= 2; }
  return s / norm;
}

function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; }
function tex(c, { repeat = [1, 1], srgb = true, aniso = 8 } = {}) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat[0], repeat[1]);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = aniso;
  t.needsUpdate = true;
  return t;
}
export function canvasToTex(c, opts) { return tex(c, opts); }

export function softDot() {
  const s = 64; const [c, g] = canvas(s, s);
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.3, 'rgba(255,255,255,0.7)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, s, s);
  return tex(c);
}

// thin glowing ring (for hole lights: lights the rim without covering the art)
export function ringTexture() {
  const s = 128; const [c, g] = canvas(s, s);
  const gr = g.createRadialGradient(64, 64, 30, 64, 64, 62);
  gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.45, 'rgba(255,255,255,0.9)'); gr.addColorStop(0.62, 'rgba(255,255,255,0.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, s, s);
  return tex(c);
}

// chevron arrow (points to the top of the texture) with a soft glow
export function chevronTexture() {
  const s = 128; const [c, g] = canvas(s, s);
  const path = () => { g.beginPath(); g.moveTo(20, 92); g.lineTo(64, 36); g.lineTo(108, 92); };
  g.lineCap = 'round'; g.lineJoin = 'round';
  g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 34; path(); g.stroke();
  g.strokeStyle = 'rgba(255,255,255,0.6)'; g.lineWidth = 22; path(); g.stroke();
  g.strokeStyle = '#ffffff'; g.lineWidth = 11; path(); g.stroke();
  return tex(c);
}

// ---------- forest / mountain backdrop panorama ----------
export function backdropTexture() {
  const W = 2048, H = 1024; const [c, g] = canvas(W, H);
  const sky = g.createLinearGradient(0, 0, 0, H * 0.62);
  sky.addColorStop(0, '#0d1d2e'); sky.addColorStop(0.45, '#2c4d5c'); sky.addColorStop(0.8, '#c79a62'); sky.addColorStop(1, '#e8c58a');
  g.fillStyle = sky; g.fillRect(0, 0, W, H);
  // stars + moon glow
  for (let i = 0; i < 300; i++) { g.fillStyle = `rgba(255,255,255,${rand() * 0.7})`; g.fillRect(rand() * W, rand() * H * 0.35, 1.5, 1.5); }
  const mg = g.createRadialGradient(W * 0.68, H * 0.2, 0, W * 0.68, H * 0.2, 220);
  mg.addColorStop(0, 'rgba(255,240,210,0.9)'); mg.addColorStop(0.08, 'rgba(255,240,210,0.6)'); mg.addColorStop(1, 'rgba(255,240,210,0)');
  g.fillStyle = mg; g.fillRect(0, 0, W, H);
  // mountain ranges with atmospheric perspective
  const ranges = [
    { y: 0.5, amp: 0.2, col: [96, 112, 128], f: 3 },
    { y: 0.56, amp: 0.15, col: [62, 82, 92], f: 5 },
    { y: 0.62, amp: 0.1, col: [38, 58, 56], f: 8 },
  ];
  for (const r of ranges) {
    g.fillStyle = `rgb(${r.col})`; g.beginPath(); g.moveTo(0, H);
    for (let x = 0; x <= W; x += 4) {
      const n = fbm((x / W) * r.f, r.y * 10, 5, r.f);
      const ridge = 1 - Math.abs(n * 2 - 1);
      g.lineTo(x, H * (r.y - ridge * r.amp));
    }
    g.lineTo(W, H); g.closePath(); g.fill();
    // snow caps on the furthest range
    if (r === ranges[0]) { g.globalCompositeOperation = 'source-atop'; const sg = g.createLinearGradient(0, H * 0.3, 0, H * 0.42); sg.addColorStop(0, 'rgba(240,245,255,0.8)'); sg.addColorStop(1, 'rgba(240,245,255,0)'); g.fillStyle = sg; g.fillRect(0, 0, W, H * 0.45); g.globalCompositeOperation = 'source-over'; }
  }
  // mist
  const mist = g.createLinearGradient(0, H * 0.55, 0, H * 0.75);
  mist.addColorStop(0, 'rgba(210,200,170,0)'); mist.addColorStop(0.5, 'rgba(210,200,170,0.35)'); mist.addColorStop(1, 'rgba(210,200,170,0)');
  g.fillStyle = mist; g.fillRect(0, 0, W, H);
  // tree line silhouettes (2 layers)
  const trees = (baseY, hgt, col, n) => {
    g.fillStyle = col;
    for (let i = 0; i < n; i++) {
      const x = rand() * W, h = hgt * (0.6 + rand() * 0.7), w = h * 0.32;
      g.beginPath(); g.moveTo(x, baseY - h);
      for (let k = 1; k <= 5; k++) { const yy = baseY - h + (h * k) / 5; const ww = (w * k) / 5; g.lineTo(x + ww, yy); g.lineTo(x + ww * 0.45, yy); }
      for (let k = 5; k >= 1; k--) { const yy = baseY - h + (h * k) / 5; const ww = (w * k) / 5; g.lineTo(x - ww * 0.45, yy); g.lineTo(x - ww, yy); }
      g.closePath(); g.fill();
    }
    g.fillRect(0, baseY - 4, W, H - baseY + 4);
  };
  trees(H * 0.7, 110, '#1e3326', 220);
  trees(H * 0.78, 170, '#0f1d14', 160);
  g.fillStyle = '#0a140d'; g.fillRect(0, H * 0.78, W, H);
  const t = tex(c);
  t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}
