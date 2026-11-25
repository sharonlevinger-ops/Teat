// Procedural, high-detail canvas textures (no external image files needed).
import * as THREE from 'three';
import * as L from './layout.js';

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
const lerp = (a, b, t) => a + (b - a) * t;
function mix3(a, b, t) { return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)]; }

// Tileable noise field painted with a colour ramp
function noiseCanvas(size, scale, ramp, oct = 5) {
  const [c, g] = canvas(size, size);
  const img = g.createImageData(size, size), d = img.data;
  const period = scale;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const n = fbm((x / size) * scale, (y / size) * scale, oct, period);
    const col = ramp(n, x, y);
    const i = (y * size + x) * 4;
    d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2]; d[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return c;
}

// ---------- playfield ----------
export const PF = { w: 774, h: 1340 }; // table px covered by the playfield texture
export function playfieldTexture(maxAniso) {
  const K = 2; // canvas px per table px
  const W = PF.w * K, H = PF.h * K;
  const [c, g] = canvas(W, H);

  // 1. low-res organic ground (moss / grass / dark soil)
  const lw = 258, lh = 446;
  const [lc, lg] = canvas(lw, lh);
  const li = lg.createImageData(lw, lh);
  for (let y = 0; y < lh; y++) for (let x = 0; x < lw; x++) {
    const n = fbm(x / 22, y / 22, 5, 1024), m2 = fbm(x / 7 + 40, y / 7, 3, 1024);
    let col = mix3([22, 44, 16], [64, 98, 30], n);
    col = mix3(col, [86, 66, 36], Math.max(0, (m2 - 0.58) * 2.2));
    const k = 0.75 + n * 0.5;
    const i = (y * lw + x) * 4;
    li.data[i] = col[0] * k; li.data[i + 1] = col[1] * k; li.data[i + 2] = col[2] * k; li.data[i + 3] = 255;
  }
  lg.putImageData(li, 0, 0);
  g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
  g.drawImage(lc, 0, 0, W, H);

  g.save(); g.scale(K, K);

  // 2. dirt paths (worn trails between the features, like the concept art)
  // soft (blurred) drawing that also works on Safari: draw off-canvas and let the shadow land in place
  const soft = (blur, color, draw) => {
    g.save(); g.shadowColor = color; g.shadowBlur = blur * K; g.shadowOffsetX = 20000 * K; g.translate(-20000, 0);
    draw(); g.restore();
  };
  const path = (pts, w, col) => {
    for (let pass = 0; pass < 3; pass++) soft(12 - pass * 4, col, () => {
      g.lineCap = 'round'; g.lineJoin = 'round';
      g.strokeStyle = col; g.globalAlpha = 0.25; g.lineWidth = w * (1.3 - pass * 0.3);
      g.beginPath(); g.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length - 1; i++) { const mx = (pts[i][0] + pts[i + 1][0]) / 2, my = (pts[i][1] + pts[i + 1][1]) / 2; g.quadraticCurveTo(pts[i][0], pts[i][1], mx, my); }
      g.lineTo(pts.at(-1)[0], pts.at(-1)[1]); g.stroke();
    });
  };
  path([[362, 1180], [372, 1040], [380, 900], [382, 760], [380, 600], [365, 480], [350, 380]], 120, '#7a5a35');
  path([[380, 600], [460, 520], [505, 480]], 70, '#6d5030');
  path([[380, 600], [300, 520], [250, 450]], 70, '#6d5030');
  path([[160, 640], [110, 760], [95, 900]], 50, '#5d4528');
  path([[600, 700], [650, 820], [640, 930]], 50, '#5d4528');

  // 3. grass blades + clover speckles
  for (let i = 0; i < 26000; i++) {
    const x = rand() * PF.w, y = rand() * PF.h, len = 2 + rand() * 6, a = -Math.PI / 2 + (rand() - 0.5) * 1.4;
    const l = 30 + rand() * 50;
    g.strokeStyle = `hsla(${85 + rand() * 40},${45 + rand() * 30}%,${l * 0.6}%,${0.35 + rand() * 0.4})`;
    g.lineWidth = 0.6 + rand() * 0.8;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len); g.stroke();
  }
  // tiny flowers
  for (let i = 0; i < 500; i++) {
    const x = rand() * PF.w, y = rand() * PF.h;
    g.fillStyle = ['#f6e27a', '#ffffff', '#c9a7ff', '#ff9ec7'][i % 4];
    g.globalAlpha = 0.6; g.beginPath(); g.arc(x, y, 0.9 + rand(), 0, 7); g.fill();
  }
  g.globalAlpha = 1;
  // pebbles
  for (let i = 0; i < 1100; i++) {
    const x = rand() * PF.w, y = rand() * PF.h, r = 1 + rand() * 3.5;
    const gr = g.createRadialGradient(x - r * 0.3, y - r * 0.3, 0, x, y, r);
    const v = 110 + rand() * 70;
    gr.addColorStop(0, `rgb(${v + 30},${v + 25},${v + 15})`); gr.addColorStop(1, `rgb(${v * 0.4},${v * 0.38},${v * 0.3})`);
    g.fillStyle = gr; g.beginPath(); g.ellipse(x, y, r, r * (0.6 + rand() * 0.4), rand() * 3, 0, 7); g.fill();
  }

  // 4. magic pool cobble ring
  const P = L.pool;
  for (let ring = 0; ring < 2; ring++) {
    const rr = P.r + 8 + ring * 15, n = Math.floor((2 * Math.PI * rr) / 22);
    for (let i = 0; i < n; i++) {
      const a = (i + ring * 0.5) / n * Math.PI * 2, x = P.x + Math.cos(a) * rr, y = P.y + Math.sin(a) * rr;
      g.save(); g.translate(x, y); g.rotate(a);
      const w = 9 + rand() * 3, h = 7 + rand() * 2;
      g.fillStyle = 'rgba(0,0,0,0.55)'; g.beginPath(); g.ellipse(1.5, 1.5, w, h, 0, 0, 7); g.fill();
      const gr = g.createLinearGradient(-w, -h, w, h); const v = 120 + rand() * 50;
      gr.addColorStop(0, `rgb(${v + 40},${v + 38},${v + 30})`); gr.addColorStop(1, `rgb(${v * 0.55},${v * 0.55},${v * 0.5})`);
      g.fillStyle = gr; g.beginPath(); g.ellipse(0, 0, w, h, 0, 0, 7); g.fill();
      if (rand() < 0.5) { g.fillStyle = 'rgba(70,120,40,0.55)'; g.beginPath(); g.ellipse(-w * 0.3, -h * 0.4, w * 0.5, h * 0.35, 0, 0, 7); g.fill(); }
      g.restore();
    }
  }
  // stone slabs under tower and castle bases, mine floor
  const slabArea = (cx, cy, rad) => {
    for (let i = 0; i < 70; i++) {
      const a = rand() * Math.PI * 2, d = Math.sqrt(rand()) * rad, x = cx + Math.cos(a) * d, y = cy + Math.sin(a) * d;
      const s = 7 + rand() * 9;
      g.fillStyle = 'rgba(0,0,0,0.45)'; g.fillRect(x - s / 2 + 1.5, y - s / 2 + 1.5, s, s * 0.8);
      const v = 90 + rand() * 50; g.fillStyle = `rgb(${v},${v - 4},${v - 12})`; g.fillRect(x - s / 2, y - s / 2, s, s * 0.8);
    }
  };
  slabArea(505, 505, 40); slabArea(250, 455, 34); slabArea(300, 884, 26);

  // 5. darkening / ambient occlusion around solid bodies & walls
  const fillPoly = (pts) => { g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]))); g.closePath(); g.fill(); };
  soft(14, 'rgba(0,0,0,0.75)', () => {
    g.fillStyle = '#000';
    fillPoly(L.CASTLE_POLY); fillPoly(L.MINE_POLY); fillPoly(L.BASTION_POLY);
    g.beginPath(); g.arc(L.TOWER.x, L.TOWER.y, L.TOWER.r + 6, 0, 7); g.fill();
    for (const b of L.bumpers) { g.beginPath(); g.arc(b.x, b.y, b.r + 4, 0, 7); g.fill(); }
  });
  soft(8, 'rgba(0,0,0,0.6)', () => {
    g.lineWidth = 10; g.strokeStyle = '#000'; g.lineJoin = 'round';
    for (const w of L.walls) { if (!w.vis) continue; g.beginPath(); w.points.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]))); g.stroke(); }
  });

  // 6. glowing coloured rune circles around the bumpers (like the concept art)
  for (const b of L.bumpers) {
    const col = '#' + b.color.toString(16).padStart(6, '0');
    const gr = g.createRadialGradient(b.x, b.y, b.r * 0.8, b.x, b.y, b.r + 26);
    gr.addColorStop(0, col + 'aa'); gr.addColorStop(1, col + '00');
    g.fillStyle = gr; g.beginPath(); g.arc(b.x, b.y, b.r + 26, 0, 7); g.fill();
  }

  // 7. printed playfield art: lane outlines, titles (Hebrew), MAGE
  g.textAlign = 'center'; g.textBaseline = 'middle';
  const label = (t, x, y, size, sub) => {
    g.save(); g.direction = 'rtl';
    g.font = `700 ${size}px "Times New Roman", "David", serif`;
    g.lineWidth = 4; g.strokeStyle = 'rgba(20,10,0,0.85)'; g.strokeText(t, x, y);
    const gr = g.createLinearGradient(0, y - size / 2, 0, y + size / 2);
    gr.addColorStop(0, '#fff3c4'); gr.addColorStop(0.5, '#f0c25a'); gr.addColorStop(1, '#a8741c');
    g.fillStyle = gr; g.fillText(t, x, y);
    if (sub) { g.font = `600 ${size * 0.55}px "Arial", sans-serif`; g.lineWidth = 3; g.strokeText(sub, x, y + size * 0.85); g.fillStyle = '#f7e7c0'; g.fillText(sub, x, y + size * 0.85); }
    g.restore();
  };
  label('בריכת הקסם', 382, 832, 22);
  label('מכרה הגמדים', 252, 1030, 18, 'הדליקו 7 גמדים');
  label('מגן הנסיך', 512, 985, 18, 'מטרות ומגנים');
  label('חור המסתורין', 520, 668, 13);
  label('רמפת הקריסטל', 640, 690, 12);
  label('M · A · G · E', 362, 1262, 22);

  g.restore();
  // fine-grain overlay
  const grain = noiseCanvas(256, 64, (n) => { const v = 128 + (n - 0.5) * 120; return [v, v, v]; }, 3);
  g.globalCompositeOperation = 'overlay'; g.globalAlpha = 0.35;
  g.fillStyle = g.createPattern(grain, 'repeat'); g.fillRect(0, 0, W, H);
  g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;

  const map = tex(c, { aniso: maxAniso });
  map.wrapS = map.wrapT = THREE.ClampToEdgeWrapping;
  // bump map from a blurred luminance copy
  const [bc, bg] = canvas(W / 2, H / 2);
  bg.drawImage(c, 0, 0, W / 2, H / 2);
  const bump = tex(bc, { srgb: false, aniso: maxAniso });
  bump.wrapS = bump.wrapT = THREE.ClampToEdgeWrapping;
  return { map, bump };
}

// ---------- stone bricks (tower / castle) ----------
export function stoneTexture({ base = [120, 112, 100], moss = 0.25, size = 512, rows = 10, cols = 5, seed = 1, dark = 0 } = {}) {
  const [c, g] = canvas(size, size);
  const r = mulberry32(seed * 977);
  g.fillStyle = '#1d1a16'; g.fillRect(0, 0, size, size);
  const rh = size / rows;
  for (let row = 0; row < rows; row++) {
    const cw = size / cols, off = (row % 2) * cw * 0.5;
    for (let col = -1; col <= cols; col++) {
      const w = cw * (0.8 + r() * 0.35);
      const x = col * cw + off + (r() - 0.5) * 6, y = row * rh;
      const v = 0.65 + r() * 0.5 - dark;
      const cl = base.map((b) => Math.min(255, b * v + (r() - 0.5) * 18));
      const gr = g.createLinearGradient(x, y, x + w, y + rh);
      gr.addColorStop(0, `rgb(${cl[0] * 1.15},${cl[1] * 1.15},${cl[2] * 1.15})`);
      gr.addColorStop(1, `rgb(${cl[0] * 0.7},${cl[1] * 0.7},${cl[2] * 0.7})`);
      g.fillStyle = gr;
      const pad = 2.5, rr = 5;
      g.beginPath(); g.roundRect(x + pad, y + pad, w - pad * 2, rh - pad * 2, rr); g.fill();
      // wrap horizontally for tiling
      if (x + w > size) { g.beginPath(); g.roundRect(x + pad - size, y + pad, w - pad * 2, rh - pad * 2, rr); g.fill(); }
      if (x < 0) { g.beginPath(); g.roundRect(x + pad + size, y + pad, w - pad * 2, rh - pad * 2, rr); g.fill(); }
    }
  }
  // speckles, cracks
  const img = g.getImageData(0, 0, size, size), d = img.data;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const n = fbm(x / 18, y / 18, 4, size / 18), m = fbm(x / 50 + 9, y / 50, 3, size / 50);
    const i = (y * size + x) * 4;
    const k = 0.75 + n * 0.5;
    d[i] *= k; d[i + 1] *= k; d[i + 2] *= k;
    const mm = Math.max(0, (m - (1 - moss)) * 4);
    if (mm > 0) { d[i] = lerp(d[i], 50, mm); d[i + 1] = lerp(d[i + 1], 95, mm); d[i + 2] = lerp(d[i + 2], 35, mm); }
  }
  g.putImageData(img, 0, 0);
  return c;
}

export function canvasToTex(c, opts) { return tex(c, opts); }

export function roofTexture() {
  const size = 256; const [c, g] = canvas(size, size);
  g.fillStyle = '#3a160c'; g.fillRect(0, 0, size, size);
  const rows = 12, rh = size / rows;
  for (let row = 0; row < rows; row++) {
    const n = 8, cw = size / n, off = (row % 2) * cw / 2;
    for (let i = -1; i <= n; i++) {
      const x = i * cw + off, y = row * rh, v = 0.7 + rand() * 0.5;
      const gr = g.createLinearGradient(0, y, 0, y + rh);
      gr.addColorStop(0, `rgb(${170 * v},${70 * v},${40 * v})`); gr.addColorStop(1, `rgb(${95 * v},${36 * v},${20 * v})`);
      g.fillStyle = gr; g.beginPath(); g.roundRect(x + 1, y, cw - 2, rh * 1.15, [0, 0, 8, 8]); g.fill();
    }
  }
  return c;
}

export function woodTexture({ dark = false } = {}) {
  return noiseCanvas(512, 8, (n, x, y) => {
    const grain = Math.sin((x / 512) * 6 + fbm(x / 60, y / 8, 4, 512 / 60) * 18) * 0.5 + 0.5;
    const t = grain * 0.6 + n * 0.4;
    const a = dark ? [38, 22, 12] : [92, 58, 30], b = dark ? [78, 46, 24] : [160, 108, 60];
    return mix3(a, b, t);
  }, 4);
}

export function rockTexture() {
  return noiseCanvas(512, 6, (n, x, y) => {
    const m = fbm(x / 40 + 3, y / 40, 4, 512 / 40);
    let col = mix3([52, 48, 44], [150, 140, 125], n);
    if (m > 0.6) col = mix3(col, [55, 90, 35], (m - 0.6) * 2.5);
    return col;
  }, 6);
}

export function capTexture(hex) {
  const W = 512, H = 256; const [c, g] = canvas(W, H);
  const col = new THREE.Color(hex);
  const gr = g.createLinearGradient(0, 0, 0, H);
  gr.addColorStop(0, `#${col.clone().multiplyScalar(1.15).getHexString()}`);
  gr.addColorStop(1, `#${col.clone().multiplyScalar(0.45).getHexString()}`);
  g.fillStyle = gr; g.fillRect(0, 0, W, H);
  for (let i = 0; i < 26; i++) {
    const x = rand() * W, y = 15 + rand() * (H * 0.7), r = 6 + rand() * 14;
    const sg = g.createRadialGradient(x, y, 0, x, y, r);
    sg.addColorStop(0, 'rgba(255,255,240,1)'); sg.addColorStop(0.7, 'rgba(255,250,230,0.9)'); sg.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = sg; g.beginPath(); g.ellipse(x, y, r * 1.4, r, 0, 0, 7); g.fill();
    if (x < 30) { g.beginPath(); g.ellipse(x + W, y, r * 1.4, r, 0, 0, 7); g.fill(); }
  }
  return tex(c);
}

export function glitterTexture() {
  const size = 256; const [c, g] = canvas(size, size);
  const gr = g.createLinearGradient(0, 0, size, size);
  gr.addColorStop(0, '#2a9dff'); gr.addColorStop(0.5, '#7fe6ff'); gr.addColorStop(1, '#2f6bff');
  g.fillStyle = gr; g.fillRect(0, 0, size, size);
  for (let i = 0; i < 900; i++) {
    const x = rand() * size, y = rand() * size, r = rand() * 1.8 + 0.3;
    g.fillStyle = `rgba(255,255,255,${0.4 + rand() * 0.6})`; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
  }
  return tex(c);
}

export function runeTexture(color = '#7fd4ff') {
  const s = 256; const [c, g] = canvas(s, s);
  g.translate(s / 2, s / 2);
  const glow = g.createRadialGradient(0, 0, 10, 0, 0, 128);
  glow.addColorStop(0, color); glow.addColorStop(0.55, color + '66'); glow.addColorStop(1, '#00000000');
  g.fillStyle = glow; g.beginPath(); g.arc(0, 0, 128, 0, 7); g.fill();
  g.strokeStyle = '#ffffff'; g.lineWidth = 5;
  g.beginPath(); g.arc(0, 0, 86, 0, 7); g.stroke();
  g.beginPath(); g.arc(0, 0, 60, 0, 7); g.stroke();
  g.lineWidth = 3;
  for (let i = 0; i < 12; i++) { g.save(); g.rotate((i / 12) * Math.PI * 2); g.beginPath(); g.moveTo(0, -64); g.lineTo(6, -82); g.lineTo(-6, -82); g.closePath(); g.stroke(); g.restore(); }
  g.beginPath(); for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2 - Math.PI / 2; g[i ? 'lineTo' : 'moveTo'](Math.cos(a) * 44, Math.sin(a) * 44); } g.closePath(); g.stroke();
  g.beginPath(); for (let i = 0; i < 3; i++) { const a = (i / 3) * Math.PI * 2 - Math.PI / 2; g[i ? 'lineTo' : 'moveTo'](Math.cos(a) * 44, Math.sin(a) * 44); } g.closePath(); g.stroke();
  return tex(c);
}

export function arrowTexture() {
  const s = 128; const [c, g] = canvas(s, s);
  g.fillStyle = '#fff';
  g.beginPath(); g.moveTo(64, 6); g.lineTo(118, 118); g.quadraticCurveTo(64, 96, 10, 118); g.closePath(); g.fill();
  g.globalCompositeOperation = 'destination-out'; g.globalAlpha = 0.4;
  g.beginPath(); g.moveTo(64, 38); g.lineTo(94, 102); g.lineTo(34, 102); g.closePath(); g.fill();
  return tex(c, { srgb: true });
}

export function letterTexture(ch) {
  const s = 128; const [c, g] = canvas(s, s);
  g.fillStyle = '#fff'; g.beginPath(); g.arc(64, 64, 60, 0, 7); g.fill();
  g.globalCompositeOperation = 'destination-out';
  g.font = '900 80px Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(ch, 64, 70);
  return tex(c);
}

export function softDot() {
  const s = 64; const [c, g] = canvas(s, s);
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.3, 'rgba(255,255,255,0.7)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, s, s);
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
