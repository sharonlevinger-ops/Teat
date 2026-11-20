// Where everything is in the painting (art pixels, 1284 x 2281). Pure data, no DOM.
// Step 1 uses it for the calibration overlay; Step 2 turns it into physics colliders through the
// perspective mapping below (flat table units <-> painting pixels).

export const ART_W = 1284;
export const ART_H = 2281;

// Flat table used by the physics: x 0..21 (left -> right), y 0..40 (player -> back).
export const TABLE_W = 21;
export const TABLE_H = 40;

// Four corners of the playable table as painted (perspective trapezoid).
export const CORNERS = {
  bl: [62, 2150],   // flat (0, 0)
  br: [1232, 2150], // flat (21, 0)
  tr: [1122, 452],  // flat (21, 40)
  tl: [160, 452],   // flat (0, 40)
};

// Painted features. circles: [x, y, r]; ellipse: [cx, cy, rx, ry]; poly / line: [[x, y], ...]
export const FEATURES = {
  flippers: {
    left: { pivot: [378, 1937], tip: [550, 2060], r1: 26, r2: 15 },
    right: { pivot: [902, 1937], tip: [730, 2060], r1: 26, r2: 15 },
  },
  slings: {
    left: [[300, 1592], [288, 1786], [414, 1806]],
    right: [[972, 1592], [986, 1786], [858, 1806]],
  },
  guides: { // carved rune rails feeding the flippers (inlane / outlane separators)
    left: [[132, 1690], [150, 1760], [372, 1925]],
    right: [[1092, 1690], [1078, 1760], [908, 1925]],
  },
  drain: [[560, 2085], [720, 2085]],
  tower: { base: [632, 978, 112, 44], door: [640, 926, 46, 62], roofTop: [632, 428] },
  wizard: { body: [834, 1010, 62, 96], staffOrb: [760, 946] },
  pool: [630, 1408, 212, 96],
  mushrooms: { mush1: [335, 1300, 56], mush2: [405, 1086, 50], mush3: [432, 770, 46] },
  crystals: { crystal1: [240, 1084, 72], crystal2: [1142, 1300, 62] },
  potion: [1000, 600, 58],
  kickoutHole: [372, 1226, 42],
  ramps: {
    crystal: [[1062, 690], [1088, 860], [1062, 1060], [1012, 1232], [1062, 1500]],
    leftOrbit: [[262, 1040], [236, 880], [292, 724], [420, 630], [540, 600]],
  },
  plunger: { knob: [1186, 1760, 48], spring: [[1200, 1820], [1200, 2000]], gem: [1206, 2080] },
};

// UI anchors inside the painted HUD frame / bottom of the painting.
export const UI = {
  plaque: { cx: 648, cy: 88, w: 600 },
  score: { cx: 643, cy: 240 },
  values: { ball: [340, 361], mult: [738, 361], guests: [1050, 361] },
  pause: { cx: 122, cy: 510, size: 160 },
  camera: { cx: 1162, cy: 510, size: 160 },
  tapToPlay: { cx: 643, cy: 2205 },
  touchToLaunch: { cx: 1160, cy: 2212 },
};

// ---------------------------------------------------------------- perspective (homography)
function solve(A, b) { // Gaussian elimination, 8x8
  const n = b.length;
  for (let i = 0; i < n; i++) {
    let p = i;
    for (let r = i + 1; r < n; r++) if (Math.abs(A[r][i]) > Math.abs(A[p][i])) p = r;
    [A[i], A[p]] = [A[p], A[i]]; [b[i], b[p]] = [b[p], b[i]];
    for (let r = i + 1; r < n; r++) {
      const f = A[r][i] / A[i][i];
      for (let c = i; c < n; c++) A[r][c] -= f * A[i][c];
      b[r] -= f * b[i];
    }
  }
  const x = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) { let s = b[i]; for (let c = i + 1; c < n; c++) s -= A[i][c] * x[c]; x[i] = s / A[i][i]; }
  return x;
}

function homography(src, dst) {
  const A = [], b = [];
  for (let i = 0; i < 4; i++) {
    const [x, y] = src[i], [u, v] = dst[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); b.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); b.push(v);
  }
  const h = solve(A, b);
  return [h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1];
}

const FLAT = [[0, 0], [TABLE_W, 0], [TABLE_W, TABLE_H], [0, TABLE_H]];
const ART = [CORNERS.bl, CORNERS.br, CORNERS.tr, CORNERS.tl];
const H_FLAT_TO_ART = homography(FLAT, ART);
const H_ART_TO_FLAT = homography(ART, FLAT);
const apply = (H, x, y) => { const w = H[6] * x + H[7] * y + H[8]; return [(H[0] * x + H[1] * y + H[2]) / w, (H[3] * x + H[4] * y + H[5]) / w]; };

/** flat table units -> painting pixels */
export const flatToArt = (x, y) => apply(H_FLAT_TO_ART, x, y);
/** painting pixels -> flat table units */
export const artToFlat = (x, y) => apply(H_ART_TO_FLAT, x, y);
/** how big one table unit looks at a given flat depth (for sizing the ball etc.) */
export const unitScaleAt = (x, y) => { const a = flatToArt(x, y), b = flatToArt(x + 1, y); return Math.hypot(b[0] - a[0], b[1] - a[1]); };
