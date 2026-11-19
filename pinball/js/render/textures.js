// Procedural textures painted once at start-up on canvases (no image downloads, tiny install size).
import * as THREE from '../vendor/three.module.min.js';
import { TABLE_W, TABLE_H, CX } from '../core/table.js';

const FONT_TITLE = '"Cinzel Decorative", "Cinzel", Georgia, serif';
const FONT_LABEL = '"Cinzel", Georgia, serif';

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}

// small deterministic PRNG so the art is identical on every launch
function prng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

function toTexture(c, { repeat = false, srgb = true, aniso = 4 } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = aniso;
  t.needsUpdate = true;
  return t;
}

function woodGrain(g, w, h, rnd, base = [92, 56, 30], plank = 96) {
  for (let x = 0; x < w; x += plank) {
    const v = (rnd() - 0.5) * 26;
    g.fillStyle = `rgb(${base[0] + v},${base[1] + v * 0.7},${base[2] + v * 0.4})`;
    g.fillRect(x, 0, plank, h);
    // grain
    for (let i = 0; i < 26; i++) {
      const gx = x + rnd() * plank;
      const amp = 2 + rnd() * 5, freq = 0.004 + rnd() * 0.01, ph = rnd() * 6;
      g.strokeStyle = `rgba(${30 + rnd() * 30},${15 + rnd() * 15},5,${0.08 + rnd() * 0.16})`;
      g.lineWidth = 0.6 + rnd() * 1.6;
      g.beginPath();
      for (let y = 0; y <= h; y += 16) {
        const xx = gx + Math.sin(y * freq + ph) * amp;
        if (y === 0) g.moveTo(xx, y); else g.lineTo(xx, y);
      }
      g.stroke();
    }
    // knots
    for (let k = 0; k < 2; k++) {
      if (rnd() < 0.5) continue;
      const kx = x + 20 + rnd() * (plank - 40), ky = rnd() * h, kr = 5 + rnd() * 9;
      const rg = g.createRadialGradient(kx, ky, 1, kx, ky, kr * 2.2);
      rg.addColorStop(0, 'rgba(35,18,6,0.8)');
      rg.addColorStop(0.5, 'rgba(60,32,12,0.35)');
      rg.addColorStop(1, 'rgba(60,32,12,0)');
      g.fillStyle = rg;
      g.beginPath(); g.ellipse(kx, ky, kr * 1.4, kr * 2.4, 0, 0, Math.PI * 2); g.fill();
    }
    g.fillStyle = 'rgba(20,10,4,0.55)';
    g.fillRect(x, 0, 2, h);
  }
}

function leaf(g, x, y, size, rot, color) {
  g.save();
  g.translate(x, y); g.rotate(rot);
  g.fillStyle = color;
  g.beginPath();
  g.moveTo(0, -size);
  g.quadraticCurveTo(size * 0.7, -size * 0.2, 0, size);
  g.quadraticCurveTo(-size * 0.7, -size * 0.2, 0, -size);
  g.fill();
  g.strokeStyle = 'rgba(255,240,180,0.35)';
  g.lineWidth = Math.max(1, size * 0.06);
  g.beginPath(); g.moveTo(0, -size * 0.9); g.lineTo(0, size * 0.9); g.stroke();
  g.restore();
}

/** The painted playfield: carved wood, moss, magical paths, runes, labels. Returns the texture. */
export function playfieldTexture(table) {
  const W = 1024, H = 2048;
  const [c, g] = canvas(W, H);
  const rnd = prng(20251119);
  const X = (x) => (x / TABLE_W) * W;
  const Y = (y) => ((TABLE_H - y) / TABLE_H) * H;
  const S = W / TABLE_W; // px per unit

  woodGrain(g, W, H, rnd);

  // forest vignette: deep green towards the edges, warm light in the centre
  let rg = g.createRadialGradient(X(CX), Y(18), 80, X(CX), Y(18), 1150);
  rg.addColorStop(0, 'rgba(255,214,140,0.18)');
  rg.addColorStop(0.45, 'rgba(30,70,30,0.10)');
  rg.addColorStop(1, 'rgba(6,28,12,0.78)');
  g.fillStyle = rg; g.fillRect(0, 0, W, H);

  // moss patches
  for (let i = 0; i < 70; i++) {
    const mx = rnd() * W, my = rnd() * H, mr = 20 + rnd() * 70;
    const m = g.createRadialGradient(mx, my, 2, mx, my, mr);
    m.addColorStop(0, `rgba(${50 + rnd() * 30},${110 + rnd() * 50},${40 + rnd() * 20},0.35)`);
    m.addColorStop(1, 'rgba(40,90,30,0)');
    g.fillStyle = m; g.beginPath(); g.arc(mx, my, mr, 0, Math.PI * 2); g.fill();
  }

  // glowing magic path from the flippers to the tower
  g.save();
  g.globalCompositeOperation = 'lighter';
  const path = (pts, width, col) => {
    g.strokeStyle = col; g.lineWidth = width; g.lineCap = 'round'; g.lineJoin = 'round';
    g.beginPath();
    pts.forEach(([x, y], i) => (i ? g.lineTo(X(x), Y(y)) : g.moveTo(X(x), Y(y))));
    g.stroke();
  };
  const trail = [[CX, 6.5], [CX, 11], [CX, 16.5], [9.4, 22], [CX, 27.6]];
  path(trail, 70, 'rgba(255,200,90,0.05)');
  path(trail, 34, 'rgba(255,215,120,0.08)');
  path(trail, 10, 'rgba(255,235,170,0.12)');
  g.restore();
  // stepping stones along the path
  for (let i = 0; i < 9; i++) {
    const t = i / 8, y = 17.5 + t * 8.5, x = CX + Math.sin(t * 5) * 0.6;
    g.fillStyle = 'rgba(120,112,100,0.55)';
    g.beginPath(); g.ellipse(X(x), Y(y), 18 + rnd() * 6, 12 + rnd() * 4, rnd(), 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(40,36,30,0.5)'; g.lineWidth = 2; g.stroke();
  }

  // stone plaza + rune circle under the tower
  const tw = table.decor.tower;
  rg = g.createRadialGradient(X(tw.x), Y(tw.y), 10, X(tw.x), Y(tw.y), tw.r * 2.2 * S);
  rg.addColorStop(0, 'rgba(150,140,120,0.9)');
  rg.addColorStop(0.7, 'rgba(110,100,85,0.7)');
  rg.addColorStop(1, 'rgba(90,80,70,0)');
  g.fillStyle = rg; g.beginPath(); g.arc(X(tw.x), Y(tw.y), tw.r * 2.2 * S, 0, Math.PI * 2); g.fill();
  g.strokeStyle = 'rgba(255,215,120,0.75)'; g.lineWidth = 3;
  for (const rr of [1.75, 2.05]) { g.beginPath(); g.arc(X(tw.x), Y(tw.y), tw.r * rr * S, 0, Math.PI * 2); g.stroke(); }
  g.fillStyle = 'rgba(255,225,150,0.85)';
  g.font = `bold 22px ${FONT_LABEL}`; g.textAlign = 'center'; g.textBaseline = 'middle';
  const runes = 'ᚠᚢᚦᚨᚱᚲᚷᚹᚺᚾᛁᛃᛇᛈᛉᛊᛏᛒᛖᛗᛚᛜᛞᛟ';
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    g.fillText(runes[i], X(tw.x) + Math.cos(a) * tw.r * 1.9 * S, Y(tw.y) + Math.sin(a) * tw.r * 1.9 * S);
  }

  // pool surround (flat flagstones are meshes; this is the dark damp earth + log rim painting)
  const pl = table.decor.pool;
  rg = g.createRadialGradient(X(pl.x), Y(pl.y), pl.r * S * 0.8, X(pl.x), Y(pl.y), pl.r * S * 1.9);
  rg.addColorStop(0, 'rgba(20,30,20,0.9)');
  rg.addColorStop(1, 'rgba(20,30,20,0)');
  g.fillStyle = rg; g.beginPath(); g.arc(X(pl.x), Y(pl.y), pl.r * S * 1.9, 0, Math.PI * 2); g.fill();
  for (const side of [-1, 1]) { // painted fallen logs either side of the pool
    g.save();
    g.translate(X(pl.x + side * 3.05), Y(pl.y - 0.2)); g.rotate(side * 0.25);
    const lg = g.createLinearGradient(-14, 0, 14, 0);
    lg.addColorStop(0, '#3b2414'); lg.addColorStop(0.5, '#6d4325'); lg.addColorStop(1, '#2e1b0e');
    g.fillStyle = lg; g.fillRect(-13, -70, 26, 140);
    g.fillStyle = '#8a5a32'; g.beginPath(); g.ellipse(0, -70, 13, 6, 0, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#4a2c16'; g.lineWidth = 2;
    for (const r of [4, 8, 11]) { g.beginPath(); g.ellipse(0, -70, r, r * 0.45, 0, 0, Math.PI * 2); g.stroke(); }
    g.restore();
  }

  // lane outlines (gold leaf inlay)
  g.strokeStyle = 'rgba(230,190,90,0.55)'; g.lineWidth = 3; g.setLineDash([10, 8]);
  for (const sx of [1, -1]) {
    const xx = (x) => (sx === 1 ? x : 2 * CX - x);
    g.beginPath(); g.moveTo(X(xx(1.3)), Y(4)); g.lineTo(X(xx(1.3)), Y(12)); g.stroke();
    g.beginPath(); g.moveTo(X(xx(2.75)), Y(8.2)); g.lineTo(X(xx(2.75)), Y(12)); g.stroke();
  }
  g.setLineDash([]);

  // scattered leaves
  const leafCols = ['rgba(70,140,50,0.75)', 'rgba(110,170,60,0.7)', 'rgba(200,160,60,0.65)', 'rgba(160,90,40,0.6)'];
  for (let i = 0; i < 90; i++) leaf(g, rnd() * W, rnd() * H, 8 + rnd() * 16, rnd() * Math.PI * 2, leafCols[Math.floor(rnd() * 4)]);

  // painted toadstools around the field
  for (let i = 0; i < 16; i++) {
    const mx = rnd() < 0.5 ? 30 + rnd() * 120 : W - 200 + rnd() * 120;
    const my = 300 + rnd() * (H - 900);
    const s = 8 + rnd() * 10;
    g.fillStyle = 'rgba(240,230,200,0.7)'; g.fillRect(mx - s * 0.25, my, s * 0.5, s);
    g.fillStyle = 'rgba(200,50,40,0.75)';
    g.beginPath(); g.ellipse(mx, my, s, s * 0.6, 0, Math.PI, 0); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.8)';
    g.beginPath(); g.arc(mx - s * 0.4, my - s * 0.25, s * 0.13, 0, 7); g.arc(mx + s * 0.3, my - s * 0.35, s * 0.1, 0, 7); g.fill();
  }

  // labels
  const label = (txt, x, y, size = 22, rot = 0, col = 'rgba(255,226,150,0.92)') => {
    g.save();
    g.translate(X(x), Y(y)); g.rotate(rot);
    g.font = `700 ${size}px ${FONT_LABEL}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.shadowColor = 'rgba(0,0,0,0.8)'; g.shadowBlur = 6;
    g.fillStyle = col; g.fillText(txt, 0, 0);
    g.restore();
  };
  label('RUSH  COMBO', CX, 11.75, 24);
  label('KICKBACK', 1.3, 8.9, 15, -Math.PI / 2);
  label('WIZARD', 7.6, 20.0, 18, -0.85);
  label('CRYSTAL RAMP', 5.7, 18.5, 15);
  label('GOLDEN RAMP', 14.8, 18.7, 15);
  label('SKILL', 15.6, 25.8, 16);
  label('LOOP', 1.6, 21.3, 15);
  label('LOOP', 18.5, 21.3, 15);
  label('TOWER', CX, 25.45, 18);

  // title emblem above the drain
  g.save();
  g.translate(X(CX), Y(2.3));
  g.font = `700 40px ${FONT_TITLE}`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.shadowColor = 'rgba(0,0,0,0.9)'; g.shadowBlur = 10;
  const tg = g.createLinearGradient(0, -24, 0, 24);
  tg.addColorStop(0, '#fff3c4'); tg.addColorStop(0.5, '#e8b44c'); tg.addColorStop(1, '#9a6a1c');
  g.fillStyle = tg; g.fillText('Forest Saga', 0, 0);
  g.restore();

  // dark edge around the whole field
  g.strokeStyle = 'rgba(10,6,2,0.85)'; g.lineWidth = 18; g.strokeRect(0, 0, W, H);
  return toTexture(c, { aniso: 8 });
}

export function woodTexture(seed = 7, base = [100, 60, 32]) {
  const [c, g] = canvas(256, 256);
  woodGrain(g, 256, 256, prng(seed), base, 256);
  return toTexture(c, { repeat: true });
}

export function glowTexture() {
  const [c, g] = canvas(128, 128);
  const rg = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  rg.addColorStop(0, 'rgba(255,255,255,1)');
  rg.addColorStop(0.25, 'rgba(255,255,255,0.55)');
  rg.addColorStop(0.6, 'rgba(255,255,255,0.12)');
  rg.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = rg; g.fillRect(0, 0, 128, 128);
  return toTexture(c, { srgb: false });
}

export function shadowTexture() {
  const [c, g] = canvas(64, 64);
  const rg = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  rg.addColorStop(0, 'rgba(0,0,0,0.6)');
  rg.addColorStop(0.6, 'rgba(0,0,0,0.25)');
  rg.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = rg; g.fillRect(0, 0, 64, 64);
  return toTexture(c, { srgb: false });
}

/** Emerald crystal ball with golden veins. */
export function ballTexture() {
  const [c, g] = canvas(256, 128);
  const rnd = prng(99);
  const lg = g.createLinearGradient(0, 0, 0, 128);
  lg.addColorStop(0, '#2dd88a'); lg.addColorStop(0.5, '#0c8a4e'); lg.addColorStop(1, '#055c33');
  g.fillStyle = lg; g.fillRect(0, 0, 256, 128);
  for (let i = 0; i < 9; i++) {
    g.strokeStyle = `rgba(255,${200 + rnd() * 40},${80 + rnd() * 60},${0.55 + rnd() * 0.4})`;
    g.lineWidth = 1 + rnd() * 3;
    g.beginPath();
    let x = rnd() * 256, y = rnd() * 128;
    g.moveTo(x, y);
    for (let k = 0; k < 6; k++) { x += (rnd() - 0.3) * 60; y += (rnd() - 0.5) * 40; g.lineTo(x, y); }
    g.stroke();
  }
  for (let i = 0; i < 30; i++) {
    g.fillStyle = 'rgba(255,240,170,0.8)';
    g.beginPath(); g.arc(rnd() * 256, rnd() * 128, rnd() * 1.6, 0, 7); g.fill();
  }
  return toTexture(c, { repeat: true });
}

/** Mushroom cap with glowing spots (spots are bright so they also work as an emissive map). */
export function mushroomCapTexture(base, spot = '#fff6d8') {
  const [c, g] = canvas(256, 128);
  const rnd = prng(base.length * 31 + base.charCodeAt(1));
  const lg = g.createLinearGradient(0, 0, 0, 128);
  lg.addColorStop(0, base); lg.addColorStop(1, '#2a0b10');
  g.fillStyle = lg; g.fillRect(0, 0, 256, 128);
  for (let i = 0; i < 22; i++) {
    const x = rnd() * 256, y = 8 + rnd() * 70, r = 4 + rnd() * 9;
    const rg = g.createRadialGradient(x, y, 0, x, y, r);
    rg.addColorStop(0, spot); rg.addColorStop(0.7, spot); rg.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = rg; g.beginPath(); g.ellipse(x, y, r * 1.3, r, 0, 0, 7); g.fill();
  }
  return toTexture(c);
}

/** Backdrop silhouettes: distant forest + hills, alpha only. */
export function forestSilhouetteTexture() {
  const [c, g] = canvas(1024, 256);
  const rnd = prng(5);
  g.fillStyle = 'rgba(0,0,0,0.55)';
  g.beginPath(); g.moveTo(0, 256);
  for (let x = 0; x <= 1024; x += 32) g.lineTo(x, 150 + Math.sin(x * 0.01) * 30 + rnd() * 10);
  g.lineTo(1024, 256); g.fill();
  g.fillStyle = 'rgba(0,0,0,1)';
  for (let i = 0; i < 70; i++) {
    const x = rnd() * 1024, h = 60 + rnd() * 150, w = 18 + rnd() * 26;
    g.beginPath(); g.moveTo(x, 256 - h); g.lineTo(x - w, 256); g.lineTo(x + w, 256); g.fill();
  }
  g.fillRect(0, 236, 1024, 20);
  return toTexture(c, { srgb: false });
}

export async function waitForFonts(timeoutMs = 1500) {
  if (!document.fonts || !document.fonts.load) return;
  const loads = [`700 40px "Cinzel Decorative"`, `700 22px "Cinzel"`, `700 20px "Orbitron"`].map((f) => document.fonts.load(f).catch(() => {}));
  await Promise.race([Promise.all(loads), new Promise((r) => setTimeout(r, timeoutMs))]);
}
