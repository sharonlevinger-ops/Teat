// Procedural textures painted once at start-up (no image downloads).
// Every major surface gets a colour map, and where it matters a glow (emissive) map and a relief (normal) map,
// so the dynamic lights and shadows read as moss, bark, stone and plaster rather than flat colour.
import * as THREE from '../vendor/three.module.min.js';
import { TABLE_W, TABLE_H, CX } from '../core/table.js';

const FONT_TITLE = '"Cinzel Decorative", "Cinzel", Georgia, serif';

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}

// deterministic PRNG: the artwork is identical on every launch
function prng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

function toTexture(c, { repeat = false, srgb = true, aniso = 8 } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = aniso;
  t.needsUpdate = true;
  return t;
}

/** Soft multi-octave noise drawn onto ctx (smooth blobs via up-scaled random pixels). */
function noiseLayer(ctx, w, h, rnd, cells, colorFn, alpha, op = 'source-over') {
  const [nc, ng] = canvas(cells, Math.max(2, Math.round((cells * h) / w)));
  const img = ng.createImageData(nc.width, nc.height);
  for (let i = 0; i < img.data.length; i += 4) {
    const [r, g, b] = colorFn(rnd());
    img.data[i] = r; img.data[i + 1] = g; img.data[i + 2] = b; img.data[i + 3] = 255;
  }
  ng.putImageData(img, 0, 0);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.globalCompositeOperation = op;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(nc, 0, 0, w, h);
  ctx.restore();
}

/** Height (grey) canvas -> tangent-space normal map canvas. */
function normalFromHeight(hc, strength = 2.5) {
  const w = hc.width, h = hc.height;
  const src = hc.getContext('2d').getImageData(0, 0, w, h).data;
  const [nc, ng] = canvas(w, h);
  const out = ng.createImageData(w, h);
  const H = (x, y) => src[(((y + h) % h) * w + ((x + w) % w)) * 4] / 255;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = (H(x + 1, y) - H(x - 1, y)) * strength;
      const dy = (H(x, y + 1) - H(x, y - 1)) * strength;
      const inv = 1 / Math.hypot(dx, dy, 1);
      const i = (y * w + x) * 4;
      out.data[i] = (-dx * inv * 0.5 + 0.5) * 255;
      out.data[i + 1] = (dy * inv * 0.5 + 0.5) * 255;
      out.data[i + 2] = (inv * 0.5 + 0.5) * 255;
      out.data[i + 3] = 255;
    }
  }
  ng.putImageData(out, 0, 0);
  return nc;
}

function blob(g, x, y, r, rnd, pts = 9) {
  g.beginPath();
  for (let i = 0; i <= pts; i++) {
    const a = (i / pts) * Math.PI * 2;
    const rr = r * (0.7 + rnd() * 0.45);
    const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr;
    if (i === 0) g.moveTo(px, py); else g.lineTo(px, py);
  }
  g.closePath();
}

function leafShape(g, x, y, size, rot) {
  g.save();
  g.translate(x, y); g.rotate(rot);
  g.beginPath();
  g.moveTo(0, -size);
  g.quadraticCurveTo(size * 0.7, -size * 0.2, 0, size);
  g.quadraticCurveTo(-size * 0.7, -size * 0.2, 0, -size);
  g.fill();
  g.restore();
}

function fern(g, x, y, len, rot, col) {
  g.save();
  g.translate(x, y); g.rotate(rot);
  g.strokeStyle = col; g.fillStyle = col; g.lineWidth = Math.max(1, len * 0.025);
  g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(len * 0.1, -len * 0.5, 0, -len); g.stroke();
  for (let i = 1; i < 14; i++) {
    const t = i / 14, py = -len * t, l = len * 0.32 * Math.sin(Math.PI * (0.15 + t * 0.85));
    for (const s of [-1, 1]) {
      g.save(); g.translate(len * 0.05 * Math.sin(t * 3), py); g.rotate(s * (1.1 - t * 0.4));
      g.beginPath(); g.ellipse(0, -l / 2, l * 0.16, l / 2, 0, 0, Math.PI * 2); g.fill();
      g.restore();
    }
  }
  g.restore();
}

function flower(g, e, x, y, r, col, glow, rnd) {
  for (const [ctx, c, k] of [[g, col, 1], [e, glow, 0.5]]) {
    if (!ctx) continue;
    ctx.save();
    ctx.translate(x * k, y * k);
    ctx.fillStyle = c;
    for (let i = 0; i < 5; i++) {
      ctx.rotate((Math.PI * 2) / 5);
      ctx.beginPath(); ctx.ellipse(0, -r * k * 0.6, r * k * 0.38, r * k * 0.6, 0, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = k === 1 ? '#fff6b0' : '#fffbe0';
    ctx.beginPath(); ctx.arc(0, 0, r * k * 0.3, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
  void rnd;
}

/**
 * The enchanted forest floor: moss, soil, cobblestone paths, roots, ferns, flowers and glowing runes.
 * Returns { map, emissiveMap, normalMap }.
 */
export function forestFloor(table) {
  const W = 1280, H = Math.round((W * TABLE_H) / TABLE_W);
  const S = W / TABLE_W;
  const X = (x) => x * S, Y = (y) => (TABLE_H - y) * S;
  const rnd = prng(7771);
  const [c, g] = canvas(W, H); // colour
  const [ec, e] = canvas(W / 2, H / 2); // glow (half res)
  const [hc, h] = canvas(W / 2, H / 2); // height (half res)
  e.fillStyle = '#000'; e.fillRect(0, 0, ec.width, ec.height);
  h.fillStyle = 'rgb(110,110,110)'; h.fillRect(0, 0, hc.width, hc.height);
  const HX = (x) => X(x) / 2, HY = (y) => Y(y) / 2;

  // --- soil + moss base
  g.fillStyle = '#16301a'; g.fillRect(0, 0, W, H);
  noiseLayer(g, W, H, rnd, 48, (v) => [20 + v * 40, 50 + v * 70, 18 + v * 25], 1);
  noiseLayer(g, W, H, rnd, 140, (v) => (v > 0.55 ? [70 + v * 60, 120 + v * 70, 30 + v * 20] : [40 + v * 30, 30 + v * 25, 15 + v * 10]), 0.45, 'overlay');
  noiseLayer(h, hc.width, hc.height, rnd, 160, (v) => [90 + v * 60, 90 + v * 60, 90 + v * 60], 0.8);
  // moss cushions
  for (let i = 0; i < 260; i++) {
    const x = rnd() * W, y = rnd() * H, r = 10 + rnd() * 46;
    const rg = g.createRadialGradient(x, y, 0, x, y, r);
    const lit = rnd();
    rg.addColorStop(0, `rgba(${80 + lit * 70},${140 + lit * 70},${40 + lit * 20},0.55)`);
    rg.addColorStop(1, 'rgba(40,90,30,0)');
    g.fillStyle = rg; blob(g, x, y, r, rnd); g.fill();
    const hg = h.createRadialGradient(x / 2, y / 2, 0, x / 2, y / 2, r / 2);
    hg.addColorStop(0, 'rgba(190,190,190,0.6)'); hg.addColorStop(1, 'rgba(190,190,190,0)');
    h.fillStyle = hg; h.beginPath(); h.arc(x / 2, y / 2, r / 2, 0, Math.PI * 2); h.fill();
  }
  // moss / grass micro detail
  g.lineCap = 'round';
  for (let i = 0; i < 26000; i++) {
    const x = rnd() * W, y = rnd() * H, l = 2 + rnd() * 6, a = rnd() * Math.PI * 2;
    const v = rnd();
    g.strokeStyle = `rgba(${60 + v * 110},${110 + v * 110},${30 + v * 40},${0.25 + rnd() * 0.3})`;
    g.lineWidth = 1 + rnd() * 1.2;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
  }

  // --- cobblestone paths: flippers -> pool -> tower stairs, ring around the pool, side trails to the ramps
  const pool = table.decor.pool, tw = table.decor.tower;
  const paths = [
    { pts: [[CX, 2.5], [CX - 0.3, 6], [CX, 9], [CX, 11.2]], w: 1.4 },
    { pts: [[CX, 16], [CX - 0.6, 19], [CX - 0.2, 22.5], [CX, 25.5], [CX, 28.2]], w: 1.25 },
    { pts: [[7.2, 15.5], [6.2, 18.4], [5.7, 20.6]], w: 0.9 },
    { pts: [[12.6, 15.5], [13.9, 18.5], [14.8, 20.8]], w: 0.9 },
  ];
  const ring = [];
  for (let i = 0; i <= 40; i++) { const a = (i / 40) * Math.PI * 2; ring.push([pool.x + Math.cos(a) * (pool.r + 0.75), pool.y + Math.sin(a) * (pool.r + 0.75)]); }
  paths.push({ pts: ring, w: 0.95 });
  const stone = (x, y, r) => {
    const n = 6 + Math.floor(rnd() * 3), rot = rnd() * 6;
    const pts = [];
    for (let k = 0; k < n; k++) { const a = rot + (k / n) * Math.PI * 2; const rr = r * (0.75 + rnd() * 0.35); pts.push([x + Math.cos(a) * rr, y + Math.sin(a) * rr * 0.85]); }
    const shade = 90 + rnd() * 55;
    const sg = g.createLinearGradient(x - r, y - r, x + r, y + r);
    sg.addColorStop(0, `rgb(${shade + 30},${shade + 32},${shade + 26})`);
    sg.addColorStop(1, `rgb(${shade - 30},${shade - 26},${shade - 28})`);
    g.fillStyle = sg;
    g.strokeStyle = 'rgba(12,18,10,0.85)'; g.lineWidth = 2.5;
    g.beginPath(); pts.forEach(([px, py], k) => (k ? g.lineTo(px, py) : g.moveTo(px, py))); g.closePath(); g.fill(); g.stroke();
    // moss in the cracks / on top
    if (rnd() < 0.5) { g.fillStyle = 'rgba(80,140,40,0.35)'; blob(g, x + (rnd() - 0.5) * r, y + (rnd() - 0.5) * r, r * 0.5, rnd); g.fill(); }
    h.fillStyle = `rgb(${190 + rnd() * 50},${190},${190})`;
    h.beginPath(); pts.forEach(([px, py], k) => (k ? h.lineTo(px / 2, py / 2) : h.moveTo(px / 2, py / 2))); h.closePath(); h.fill();
  };
  for (const p of paths) {
    for (let i = 0; i < p.pts.length - 1; i++) {
      const [ax, ay] = p.pts[i], [bx, by] = p.pts[i + 1];
      const len = Math.hypot(bx - ax, by - ay), steps = Math.ceil(len / 0.42);
      const nx = -(by - ay) / len, ny = (bx - ax) / len;
      for (let s = 0; s < steps; s++) {
        const t = s / steps;
        for (let k = -1; k <= 1; k++) {
          if (rnd() < 0.15) continue;
          const off = (k * p.w) / 2.4 + (rnd() - 0.5) * 0.2;
          const x = ax + (bx - ax) * t + nx * off, y = ay + (by - ay) * t + ny * off;
          stone(X(x), Y(y), S * (0.2 + rnd() * 0.08));
        }
      }
    }
  }

  // --- tree roots crawling across the floor
  const root = (pts, w0) => {
    for (const [ctx, k, col, lw] of [[g, 1, '#1a0f07', 1.35], [g, 1, '#4a2e17', 1], [g, 1, 'rgba(150,105,60,0.55)', 0.28], [h, 0.5, 'rgb(220,220,220)', 1]]) {
      ctx.strokeStyle = col; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      for (let i = 0; i < pts.length - 1; i++) {
        const t = i / (pts.length - 1);
        ctx.lineWidth = Math.max(1, w0 * (1 - t * 0.85) * lw * k * S);
        ctx.beginPath();
        ctx.moveTo(X(pts[i][0]) * k - (lw < 0.5 ? 2 : 0), Y(pts[i][1]) * k - (lw < 0.5 ? 2 : 0));
        ctx.lineTo(X(pts[i + 1][0]) * k - (lw < 0.5 ? 2 : 0), Y(pts[i + 1][1]) * k - (lw < 0.5 ? 2 : 0));
        ctx.stroke();
      }
    }
  };
  const wander = (x, y, a, len, n) => {
    const pts = [[x, y]];
    for (let i = 0; i < n; i++) { a += (rnd() - 0.5) * 0.9; x += Math.cos(a) * (len / n); y += Math.sin(a) * (len / n); pts.push([x, y]); }
    return pts;
  };
  // around the tower base, the pool and from the cabinet edges
  for (let i = 0; i < 9; i++) { const a = Math.PI * (1.05 + rnd() * 0.9); root(wander(tw.x + Math.cos(a) * tw.r, tw.y + Math.sin(a) * tw.r, a, 2.5 + rnd() * 2.5, 9), 0.32); }
  for (let i = 0; i < 10; i++) { const a = rnd() * Math.PI * 2; root(wander(pool.x + Math.cos(a) * (pool.r + 1.1), pool.y + Math.sin(a) * (pool.r + 1.1), a, 1.5 + rnd() * 2, 7), 0.22); }
  for (let i = 0; i < 14; i++) {
    const left = rnd() < 0.5, y0 = 3 + rnd() * 30;
    root(wander(left ? 0.4 : 20.6, y0, left ? 0.2 * (rnd() - 0.5) : Math.PI + 0.2 * (rnd() - 0.5), 1.5 + rnd() * 2.5, 7), 0.26);
  }

  // --- leaf litter, clover, ferns
  const leafCols = ['rgba(60,120,40,0.85)', 'rgba(100,160,50,0.8)', 'rgba(150,120,40,0.7)', 'rgba(120,60,30,0.7)', 'rgba(40,90,40,0.9)'];
  for (let i = 0; i < 520; i++) { g.fillStyle = leafCols[Math.floor(rnd() * leafCols.length)]; leafShape(g, rnd() * W, rnd() * H, 4 + rnd() * 9, rnd() * 6.3); }
  for (let i = 0; i < 26; i++) {
    const left = rnd() < 0.5;
    fern(g, left ? rnd() * S * 2.2 : W - rnd() * S * 2.2, rnd() * H, S * (1.4 + rnd() * 1.6), (left ? 0.6 : -0.6) + (rnd() - 0.5) * 1.5, `rgba(${50 + rnd() * 40},${120 + rnd() * 60},${40},0.9)`);
  }

  // --- contact shadows (painted ambient occlusion) under the big objects
  const ao = (x, y, r, a = 0.75) => {
    const rg = g.createRadialGradient(X(x), Y(y), 0, X(x), Y(y), r * S);
    rg.addColorStop(0, `rgba(0,0,0,${a})`); rg.addColorStop(0.55, `rgba(0,0,0,${a * 0.45})`); rg.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = rg; g.beginPath(); g.arc(X(x), Y(y), r * S, 0, Math.PI * 2); g.fill();
  };
  ao(tw.x, tw.y, tw.r + 1.8, 0.85);
  for (const cc of table.circles) if (cc.kind === 'element') ao(cc.x, cc.y, cc.r + 1.1, 0.7);
  for (const cr of table.decor.crystals) ao(cr.x, cr.y, 1.7, 0.6);
  ao(table.decor.wizard.x, table.decor.wizard.y, 1.6, 0.65);
  for (const s of table.decor.slings) ao((s.top[0] + s.tip[0]) / 2, (s.top[1] + s.low[1]) / 2, 2.2, 0.5);
  // darker edges along the cabinet
  for (const [x0, x1] of [[0, 1.6], [TABLE_W, TABLE_W - 1.6]]) {
    const lg = g.createLinearGradient(X(x0), 0, X(x1), 0);
    lg.addColorStop(0, 'rgba(0,0,0,0.75)'); lg.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = lg; g.fillRect(Math.min(X(x0), X(x1)), 0, Math.abs(X(x1) - X(x0)), H);
  }
  // wet, dark earth around the pool
  { const rg = g.createRadialGradient(X(pool.x), Y(pool.y), pool.r * S * 0.9, X(pool.x), Y(pool.y), pool.r * S * 1.5);
    rg.addColorStop(0, 'rgba(5,15,12,0.9)'); rg.addColorStop(1, 'rgba(5,15,12,0)');
    g.fillStyle = rg; g.beginPath(); g.arc(X(pool.x), Y(pool.y), pool.r * S * 1.5, 0, Math.PI * 2); g.fill(); }

  // --- glowing flowers and tiny glowing mushrooms (these light up in the glow map)
  const flowerCols = [['#4fa8ff', '#3a8cff'], ['#ff7ad8', '#ff4ad0'], ['#c08aff', '#9a5aff'], ['#ffffff', '#c8f0ff']];
  for (let i = 0; i < 46; i++) {
    const nearEdge = rnd() < 0.7;
    const x = nearEdge ? (rnd() < 0.5 ? 0.7 + rnd() * 2.2 : 18.1 + rnd() * 2.2) : 2 + rnd() * 17;
    const y = 2 + rnd() * 35;
    const [col, gl] = flowerCols[Math.floor(rnd() * flowerCols.length)];
    flower(g, e, X(x), Y(y), S * (0.12 + rnd() * 0.12), col, gl, rnd);
  }
  for (let i = 0; i < 22; i++) {
    const x = rnd() < 0.5 ? 0.8 + rnd() * 2 : 18.3 + rnd() * 2, y = 3 + rnd() * 33, s = S * (0.12 + rnd() * 0.12);
    const col = rnd() < 0.5 ? '#3ff0ff' : '#b06aff';
    for (const [ctx, k] of [[g, 1], [e, 0.5]]) {
      ctx.fillStyle = k === 1 ? '#e8e0c8' : 'rgba(120,255,255,0.6)'; ctx.fillRect(X(x) * k - s * k * 0.2, Y(y) * k, s * k * 0.4, s * k * 0.9);
      ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(X(x) * k, Y(y) * k, s * k, s * k * 0.6, 0, Math.PI, 0); ctx.fill();
    }
  }

  // --- glowing rune circle in front of the tower and rune trails along the lanes
  const runes = 'ᚠᚢᚦᚨᚱᚲᚷᚹᚺᚾᛁᛃᛇᛈᛉᛊᛏᛒᛖᛗᛚᛜᛞᛟ';
  for (const [ctx, k, col, lw] of [[g, 1, 'rgba(230,190,90,0.55)', 3], [e, 0.5, 'rgba(255,200,90,0.9)', 2]]) {
    ctx.strokeStyle = col; ctx.lineWidth = lw;
    for (const rr of [1.55, 1.85]) { ctx.beginPath(); ctx.arc(X(tw.x) * k, Y(tw.y - 0.3) * k, (tw.r + rr) * S * k, Math.PI * 0.12, Math.PI * 0.88); ctx.stroke(); }
    ctx.fillStyle = col; ctx.font = `bold ${Math.round(20 * k)}px serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (let i = 0; i < 13; i++) {
      const a = Math.PI * (0.16 + (i / 12) * 0.68);
      ctx.fillText(runes[i], (X(tw.x) + Math.cos(a) * (tw.r + 1.7) * S) * k, (Y(tw.y - 0.3) + Math.sin(a) * (tw.r + 1.7) * S) * k);
    }
  }
  for (const sx of [1, -1]) { // glowing lane lines (inlanes / outlanes)
    const xx = (x) => (sx === 1 ? x : 2 * CX - x);
    for (const [x0, y0, x1, y1] of [[1.3, 3.5, 1.3, 12], [2.75, 9, 2.75, 12.2]]) {
      for (const [ctx, k, col, lw] of [[g, 1, 'rgba(120,255,140,0.35)', 3], [e, 0.5, 'rgba(90,255,120,0.9)', 2.5]]) {
        ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.setLineDash([12 * k, 10 * k]);
        ctx.beginPath(); ctx.moveTo(X(xx(x0)) * k, Y(y0) * k); ctx.lineTo(X(xx(x1)) * k, Y(y1) * k); ctx.stroke();
        ctx.setLineDash([]);
      }
    }
  }

  // --- compass rose between the flippers (like a carved medallion)
  { const x = X(CX), y = Y(2.1), r = S * 0.85;
    g.fillStyle = 'rgba(30,22,12,0.85)'; g.beginPath(); g.arc(x, y, r * 1.15, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(220,180,90,0.9)'; g.lineWidth = 3; g.stroke();
    g.fillStyle = 'rgba(230,195,110,0.95)';
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2, rr = i % 2 ? r * 0.55 : r;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a - 0.18) * rr * 0.3, y + Math.sin(a - 0.18) * rr * 0.3); g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); g.lineTo(x + Math.cos(a + 0.18) * rr * 0.3, y + Math.sin(a + 0.18) * rr * 0.3); g.fill();
    }
    h.fillStyle = 'rgb(200,200,200)'; h.beginPath(); h.arc(x / 2, y / 2, r * 0.57, 0, Math.PI * 2); h.fill(); }

  // subtle vignette in the colour map
  const vg = g.createRadialGradient(W / 2, H * 0.55, W * 0.3, W / 2, H * 0.55, H * 0.75);
  vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.55)');
  g.fillStyle = vg; g.fillRect(0, 0, W, H);

  const normal = toTexture(normalFromHeight(hc, 3.2), { srgb: false });
  return { map: toTexture(c, { aniso: 8 }), emissiveMap: toTexture(ec), normalMap: normal };
}

/** Carved bark / dark wood with deep grain. Returns { map, normalMap }. */
export function barkTexture(seed = 3, base = [70, 42, 22], size = 512) {
  const rnd = prng(seed);
  const [c, g] = canvas(size, size);
  const [hc, h] = canvas(size / 2, size / 2);
  g.fillStyle = `rgb(${base[0]},${base[1]},${base[2]})`; g.fillRect(0, 0, size, size);
  h.fillStyle = 'rgb(128,128,128)'; h.fillRect(0, 0, size / 2, size / 2);
  noiseLayer(g, size, size, rnd, 16, (v) => [base[0] * (0.7 + v * 0.6), base[1] * (0.7 + v * 0.6), base[2] * (0.7 + v * 0.6)], 0.8);
  for (let i = 0; i < 90; i++) {
    const x = rnd() * size, amp = 2 + rnd() * 6, f = 0.01 + rnd() * 0.02, ph = rnd() * 6, w = 1 + rnd() * 3.5;
    const dark = rnd() < 0.6;
    for (const [ctx, k, col] of [[g, 1, dark ? `rgba(15,8,3,${0.35 + rnd() * 0.4})` : `rgba(150,100,60,${0.15 + rnd() * 0.2})`], [h, 0.5, dark ? 'rgba(20,20,20,0.6)' : 'rgba(230,230,230,0.4)']]) {
      ctx.strokeStyle = col; ctx.lineWidth = w * k;
      ctx.beginPath();
      for (let y = 0; y <= size; y += 8) { const xx = (x + Math.sin(y * f + ph) * amp) * k; if (y === 0) ctx.moveTo(xx, y * k); else ctx.lineTo(xx, y * k); }
      ctx.stroke();
    }
  }
  return { map: toTexture(c, { repeat: true }), normalMap: toTexture(normalFromHeight(hc, 4), { repeat: true, srgb: false }) };
}

/** Cream plaster with cracks and exposed stones (the tower). Returns { map, normalMap }. */
export function plasterTexture() {
  const rnd = prng(41), size = 512;
  const [c, g] = canvas(size, size);
  const [hc, h] = canvas(size / 2, size / 2);
  g.fillStyle = '#efe3c6'; g.fillRect(0, 0, size, size);
  h.fillStyle = 'rgb(160,160,160)'; h.fillRect(0, 0, size / 2, size / 2);
  noiseLayer(g, size, size, rnd, 24, (v) => [220 + v * 30, 205 + v * 30, 170 + v * 30], 0.6);
  noiseLayer(h, size / 2, size / 2, rnd, 40, (v) => [130 + v * 50, 130 + v * 50, 130 + v * 50], 0.7);
  for (let i = 0; i < 14; i++) { // exposed stones
    const x = rnd() * size, y = rnd() * size, r = 10 + rnd() * 18;
    g.fillStyle = `rgb(${130 + rnd() * 30},${120 + rnd() * 25},${105})`; blob(g, x, y, r, rnd, 7); g.fill();
    g.strokeStyle = 'rgba(80,60,40,0.6)'; g.lineWidth = 2; g.stroke();
    h.fillStyle = 'rgb(90,90,90)'; blob(h, x / 2, y / 2, r / 2, rnd, 7); h.fill();
  }
  g.strokeStyle = 'rgba(110,85,55,0.5)'; h.strokeStyle = 'rgb(60,60,60)';
  for (let i = 0; i < 16; i++) { // cracks
    let x = rnd() * size, y = rnd() * size;
    g.lineWidth = 1 + rnd(); h.lineWidth = 1;
    g.beginPath(); g.moveTo(x, y); h.beginPath(); h.moveTo(x / 2, y / 2);
    for (let k = 0; k < 6; k++) { x += (rnd() - 0.5) * 30; y += rnd() * 20; g.lineTo(x, y); h.lineTo(x / 2, y / 2); }
    g.stroke(); h.stroke();
  }
  // moss creeping up from the bottom of the texture
  const lg = g.createLinearGradient(0, size, 0, size * 0.7);
  lg.addColorStop(0, 'rgba(60,110,40,0.55)'); lg.addColorStop(1, 'rgba(60,110,40,0)');
  g.fillStyle = lg; g.fillRect(0, 0, size, size);
  return { map: toTexture(c, { repeat: true }), normalMap: toTexture(normalFromHeight(hc, 3), { repeat: true, srgb: false }) };
}

/** Old mossy stone. Returns { map, normalMap }. */
export function stoneTexture() {
  const rnd = prng(57), size = 256;
  const [c, g] = canvas(size, size);
  const [hc, h] = canvas(size, size);
  g.fillStyle = '#6d6f68'; g.fillRect(0, 0, size, size);
  noiseLayer(g, size, size, rnd, 20, (v) => [80 + v * 70, 82 + v * 70, 76 + v * 60], 0.9);
  noiseLayer(g, size, size, rnd, 60, (v) => (v > 0.6 ? [70, 120, 40] : [90, 90, 85]), 0.35, 'overlay');
  noiseLayer(h, size, size, rnd, 30, (v) => [80 + v * 120, 80 + v * 120, 80 + v * 120], 1);
  return { map: toTexture(c, { repeat: true }), normalMap: toTexture(normalFromHeight(hc, 3), { repeat: true, srgb: false }) };
}

/** Dark carved wood with glowing green runes (flippers, slingshots, lane guides). Returns { map, emissiveMap }. */
export function runeWoodTexture(seed = 9) {
  const rnd = prng(seed), w = 512, hh = 128;
  const [c, g] = canvas(w, hh);
  const [ec, e] = canvas(w, hh);
  const bark = barkTexture(seed, [74, 44, 24], 128).map.image;
  for (let x = 0; x < w; x += 128) g.drawImage(bark, x, 0, 128, hh);
  e.fillStyle = '#000'; e.fillRect(0, 0, w, hh);
  const runes = 'ᚠᚢᚦᚨᚱᚲᚷᚹᚺᚾᛁᛃᛇᛈᛉᛊᛏᛒᛖᛗᛚᛜᛞᛟ';
  for (const [ctx, col, blur] of [[g, 'rgba(120,255,140,0.9)', 0], [e, 'rgba(120,255,150,1)', 1]]) {
    ctx.fillStyle = col; ctx.font = 'bold 54px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (let i = 0; i < 6; i++) ctx.fillText(runes[Math.floor(rnd() * runes.length)], 50 + i * 82, hh / 2 + 4);
    ctx.strokeStyle = col; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(10, 14); ctx.bezierCurveTo(150, 4, 360, 24, 502, 12); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(10, hh - 14); ctx.bezierCurveTo(150, hh - 4, 360, hh - 24, 502, hh - 12); ctx.stroke();
    void blur;
  }
  return { map: toTexture(c, { repeat: true }), emissiveMap: toTexture(ec, { repeat: true }) };
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

export function starTexture() {
  const [c, g] = canvas(128, 128);
  const rg = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  rg.addColorStop(0, 'rgba(255,255,255,1)'); rg.addColorStop(0.2, 'rgba(255,255,255,0.5)'); rg.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = rg; g.fillRect(0, 0, 128, 128);
  g.fillStyle = 'rgba(255,255,255,0.9)';
  for (const a of [0, Math.PI / 2]) { g.save(); g.translate(64, 64); g.rotate(a); g.beginPath(); g.ellipse(0, 0, 62, 4, 0, 0, Math.PI * 2); g.fill(); g.restore(); }
  return toTexture(c, { srgb: false });
}

export function shadowTexture() {
  const [c, g] = canvas(64, 64);
  const rg = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  rg.addColorStop(0, 'rgba(0,0,0,0.6)'); rg.addColorStop(0.6, 'rgba(0,0,0,0.25)'); rg.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = rg; g.fillRect(0, 0, 64, 64);
  return toTexture(c, { srgb: false });
}

/** Emerald crystal ball with golden veins. */
export function ballTexture() {
  const [c, g] = canvas(256, 128);
  const rnd = prng(99);
  const lg = g.createLinearGradient(0, 0, 0, 128);
  lg.addColorStop(0, '#3df0a0'); lg.addColorStop(0.5, '#0c9a55'); lg.addColorStop(1, '#055c33');
  g.fillStyle = lg; g.fillRect(0, 0, 256, 128);
  for (let i = 0; i < 10; i++) {
    g.strokeStyle = `rgba(255,${200 + rnd() * 40},${80 + rnd() * 60},${0.6 + rnd() * 0.4})`;
    g.lineWidth = 1 + rnd() * 3;
    g.beginPath();
    let x = rnd() * 256, y = rnd() * 128;
    g.moveTo(x, y);
    for (let k = 0; k < 6; k++) { x += (rnd() - 0.3) * 60; y += (rnd() - 0.5) * 40; g.lineTo(x, y); }
    g.stroke();
  }
  return toTexture(c, { repeat: true });
}

/** Glossy mushroom cap with raised spots and its number painted on the front. */
export function mushroomCapTexture(base, number = null, spot = '#fff8e6') {
  const [c, g] = canvas(512, 256);
  const [ec, e] = canvas(512, 256);
  const rnd = prng(base.charCodeAt(1) * 97 + (number || 0));
  const lg = g.createLinearGradient(0, 0, 0, 256);
  const top = new THREE.Color(base).lerp(new THREE.Color('#ffffff'), 0.3).getStyle();
  lg.addColorStop(0, top); lg.addColorStop(0.25, base); lg.addColorStop(0.8, base); lg.addColorStop(1, '#22060a');
  g.fillStyle = lg; g.fillRect(0, 0, 512, 256);
  e.fillStyle = '#000'; e.fillRect(0, 0, 512, 256);
  const elg = e.createLinearGradient(0, 0, 0, 256);
  elg.addColorStop(0, 'rgba(255,255,255,0.12)'); elg.addColorStop(1, 'rgba(255,255,255,0.02)');
  e.fillStyle = elg; e.fillRect(0, 0, 512, 256);
  for (let i = 0; i < 26; i++) {
    const x = rnd() * 512, y = 30 + rnd() * 170, r = 6 + rnd() * 12;
    if (number && Math.abs(x - 128) < 70 && y > 70 && y < 190) continue; // keep the number clear
    for (const ctx of [g, e]) {
      const rg = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, 0, x, y, r);
      rg.addColorStop(0, spot); rg.addColorStop(0.8, spot); rg.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = rg; ctx.beginPath(); ctx.ellipse(x, y, r * 0.6, r, 0, 0, Math.PI * 2); ctx.fill();
    }
  }
  if (number) {
    // u = 0.25 faces the camera; the cap's circumference stretches u, so squash the glyph horizontally
    for (const [ctx, col] of [[g, '#fff6e0'], [e, '#ffffff']]) {
      ctx.save();
      ctx.translate(128, 128); ctx.scale(0.42, 1);
      ctx.font = `700 120px ${FONT_TITLE}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.lineWidth = 12; ctx.strokeStyle = 'rgba(40,10,10,0.85)';
      if (ctx === g) ctx.strokeText(String(number), 0, 6);
      ctx.fillStyle = col; ctx.fillText(String(number), 0, 6);
      ctx.restore();
    }
  }
  return { map: toTexture(c), emissiveMap: toTexture(ec) };
}

/** Brown mushroom roof with glowing golden dashes (tower). */
export function roofTexture() {
  const [c, g] = canvas(512, 256);
  const [ec, e] = canvas(512, 256);
  const rnd = prng(12);
  const lg = g.createLinearGradient(0, 0, 0, 256);
  lg.addColorStop(0, '#a77a5a'); lg.addColorStop(0.4, '#6e4a3a'); lg.addColorStop(1, '#3a2030');
  g.fillStyle = lg; g.fillRect(0, 0, 512, 256);
  noiseLayer(g, 512, 256, rnd, 40, (v) => [90 + v * 60, 60 + v * 40, 60 + v * 40], 0.35, 'overlay');
  e.fillStyle = '#000'; e.fillRect(0, 0, 512, 256);
  for (let i = 0; i < 70; i++) {
    const x = rnd() * 512, y = 40 + rnd() * 190, l = 8 + rnd() * 10, a = (rnd() - 0.5) * 0.6;
    for (const [ctx, col] of [[g, '#ffd27a'], [e, '#ffc850']]) {
      ctx.save(); ctx.translate(x, y); ctx.rotate(a);
      ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(0, 0, l * 0.35, l, Math.PI / 2, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
  }
  return { map: toTexture(c), emissiveMap: toTexture(ec) };
}

/** Planks for the tower door. */
export function doorTexture() {
  const [c, g] = canvas(256, 256);
  const rnd = prng(31);
  for (let i = 0; i < 5; i++) {
    const v = rnd() * 20;
    g.fillStyle = `rgb(${110 + v},${70 + v * 0.6},${38})`; g.fillRect(i * 52, 0, 52, 256);
    g.fillStyle = 'rgba(30,15,5,0.9)'; g.fillRect(i * 52, 0, 3, 256);
    for (let k = 0; k < 8; k++) { g.strokeStyle = `rgba(40,20,8,${0.2 + rnd() * 0.3})`; g.lineWidth = 1; g.beginPath(); const x = i * 52 + 6 + rnd() * 40; g.moveTo(x, 0); g.lineTo(x + (rnd() - 0.5) * 8, 256); g.stroke(); }
  }
  g.fillStyle = '#2a1a0a'; g.fillRect(0, 60, 256, 14); g.fillRect(0, 180, 256, 14);
  g.fillStyle = '#d8b050';
  for (const y of [67, 187]) for (const x of [20, 236]) { g.beginPath(); g.arc(x, y, 6, 0, Math.PI * 2); g.fill(); }
  return toTexture(c);
}

/** Wizard hat with little stars. */
export function hatTexture() {
  const [c, g] = canvas(256, 256);
  g.fillStyle = '#2a3a9a'; g.fillRect(0, 0, 256, 256);
  const rnd = prng(5);
  g.fillStyle = '#ffe9a0';
  for (let i = 0; i < 22; i++) {
    const x = rnd() * 256, y = rnd() * 256, r = 3 + rnd() * 6;
    g.save(); g.translate(x, y); g.beginPath();
    for (let k = 0; k < 10; k++) { const a = (k / 10) * Math.PI * 2, rr = k % 2 ? r * 0.45 : r; g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
    g.fill(); g.restore();
  }
  return toTexture(c, { repeat: true });
}

/** Fern frond with alpha (for 3D decoration). */
export function fernTexture() {
  const [c, g] = canvas(256, 512);
  fern(g, 128, 505, 480, 0, 'rgba(70,150,60,1)');
  fern(g, 128, 505, 480, 0, 'rgba(110,190,80,0.35)');
  return toTexture(c);
}

/** Background forest silhouettes (alpha). */
export function forestSilhouetteTexture() {
  const [c, g] = canvas(1024, 512);
  const rnd = prng(5);
  for (let layer = 0; layer < 3; layer++) {
    g.fillStyle = `rgba(0,0,0,${0.35 + layer * 0.3})`;
    for (let i = 0; i < 24; i++) {
      const x = rnd() * 1024, w = 20 + rnd() * 40, top = 60 + layer * 60 + rnd() * 120;
      g.fillRect(x - w * 0.15, top, w * 0.3, 512 - top);
      g.beginPath(); g.ellipse(x, top, w * 1.6, w * 1.3, 0, 0, Math.PI * 2); g.fill();
      g.beginPath(); g.ellipse(x - w, top + w, w * 1.2, w, 0, 0, Math.PI * 2); g.fill();
      g.beginPath(); g.ellipse(x + w, top + w * 0.8, w * 1.2, w, 0, 0, Math.PI * 2); g.fill();
    }
  }
  g.fillRect(0, 440, 1024, 72);
  return toTexture(c, { srgb: false });
}

export async function waitForFonts(timeoutMs = 1500) {
  if (!document.fonts || !document.fonts.load) return;
  const loads = [`700 40px "Cinzel Decorative"`, `700 22px "Cinzel"`, `800 20px "Orbitron"`].map((f) => document.fonts.load(f).catch(() => {}));
  await Promise.race([Promise.all(loads), new Promise((r) => setTimeout(r, timeoutMs))]);
}
