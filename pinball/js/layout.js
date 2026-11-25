// Table layout in the pixel coordinates of the concept art (768 × 1376, x → right, y → down).
// The playfield texture IS the concept art, so every collider below sits on the drawn element.

export const IMG = { w: 768, h: 1376 };
export const BALL_R = 14;
export const CX = 360; // mirror line of the lower playfield
const m = (x) => 2 * CX - x;
export const FIELD = { left: 45, right: 731, top: 30, bottom: 1376, laneIn: 697, laneOut: 731 };

export const walls = [];
function poly(points, opts = {}) { walls.push({ points, closed: !!opts.closed, kind: opts.kind || 'wall' }); }

// ---- outer shell -----------------------------------------------------------------------
poly([[45, 1080], [45, 290], [152, 290]]);               // left wall + cap above the left orbit lane
poly([[FIELD.laneIn, 1240], [FIELD.laneIn, 255]]);      // plunger lane inner rail
poly([[FIELD.laneOut, 1240], [FIELD.laneOut, 200]]);    // plunger lane outer rail
poly([[FIELD.laneIn, 1240], [FIELD.laneOut, 1240]]);    // lane bottom (under the plunger tip)
// right side: rocks / wireforms beside the crystal ramp, then the right outlane wall
poly([[655, 605], [655, 850], [680, 892], [680, 1077]]);
// drain funnel under the flippers (the wooden rails of the art)
poly([[45, 1080], [362, 1252]]);
poly([[680, 1077], [362, 1252]]);

// ---- wizard tower (solid footprint) ----------------------------------------------------
export const TOWER_POLY = [[150, 296], [285, 300], [292, 432], [262, 468], [205, 468], [150, 380]];
poly(TOWER_POLY, { closed: true, kind: 'rock' });
// tower ramp mouth side walls
poly([[290, 474], [290, 400]]);
poly([[372, 474], [372, 404]]);
// top rail closing the mushroom glade
poly([[290, 300], [286, 205], [322, 166], [382, 150], [442, 150], [474, 172]]);

// ---- castle (open at the gate, gate pocket behind it) -----------------------------------
export const CASTLE_POLY = [[505, 458], [476, 452], [458, 430], [460, 400], [466, 330], [482, 176], [560, 135], [645, 175], [655, 470], [655, 605], [638, 605], [584, 478], [548, 458]];
poly(CASTLE_POLY, { kind: 'rock' });
poly([[505, 458], [505, 428], [548, 428], [548, 458]]); // gate pocket

// ---- dwarf mine (rock mound with the timber doorway notch) ------------------------------
export const MINE_POLY = [[180, 810], [245, 775], [322, 792], [336, 850], [322, 905], [300, 905], [300, 880], [232, 880], [228, 905], [195, 900], [178, 860]];
poly(MINE_POLY, { closed: true, kind: 'rock' });

// ---- prince's shield: the three drawn shields are round stand-up targets (sword art is flat) --
// ---- slings, inlanes, outlanes ----------------------------------------------------------
export const SLING_L = [[162, 896], [150, 1000], [222, 1040]];
export const SLING_R = SLING_L.map(([x, y]) => [m(x), y]);
poly([SLING_L[0], SLING_L[1], SLING_L[2]]);
poly([SLING_R[0], SLING_R[1], SLING_R[2]]);
poly([[100, 875], [100, 1040], [228, 1111]]);               // left inlane guide + MA strip
poly([[618, 945], [618, 1040], [492, 1111]]);               // right inlane guide + GE strip

export const posts = [
  { x: 100, y: 875, r: 6 }, { x: 618, y: 945, r: 6 },
  { x: 162, y: 896, r: 7 }, { x: 212, y: 1032, r: 6 }, { x: m(162), y: 896, r: 7 }, { x: m(212), y: 1032, r: 6 },
  { x: 290, y: 474, r: 5 }, { x: 372, y: 474, r: 5 }, { x: 655, y: 605, r: 6 },
];
export const slings = [
  { a: SLING_L[0], b: SLING_L[2], side: 'L' },
  { a: SLING_R[2], b: SLING_R[0], side: 'R' },
];

// ---- mushroom pop bumpers (cap centres in the art) --------------------------------------
export const bumpers = [
  { x: 346, y: 272, r: 24, color: 0xb04cff, cap: [336, 250] },
  { x: 406, y: 248, r: 24, color: 0xff7a1a, cap: [418, 224] },
  { x: 388, y: 326, r: 24, color: 0x1affc6, cap: [386, 302] },
];

// ---- flippers: lower pair + upper-left (right-middle and castle flippers removed) ---------
const deg = Math.PI / 180;
export const flippers = [
  { id: 'LL', side: 'L', x: 239, y: 1135, len: 86, r0: 14, r1: 9, rest: 31.6 * deg, up: -28 * deg },
  { id: 'LR', side: 'R', x: m(239), y: 1135, len: 86, r0: 14, r1: 9, rest: Math.PI - 31.6 * deg, up: Math.PI + 28 * deg },
  { id: 'UL', side: 'L', x: 185, y: 619, len: 70, r0: 12, r1: 8, rest: 27 * deg, up: -25 * deg },
];

// ---- drop targets: the 3 shields under the castle ---------------------------------------
export const dropTargets = [[579, 501], [599, 538], [616, 576]].map(([cx, cy], i) => {
  const ux = 0.434, uy = 0.901, half = 17;
  return { i, cx, cy, a: [cx - ux * half, cy - uy * half], b: [cx + ux * half, cy + uy * half], nx: -uy, ny: ux };
});
export const TARGET_SPRITE = { x0: 552, y0: 470, x1: 640, y1: 604 };

// ---- prince shields (stand-ups) on the drawn shields of the lower-right structure ----------
export const shieldTargets = [[480, 947, 16], [538, 967, 16], [432, 878, 15]].map(([x, y, r], i) => ({ i, x, y, r, cx: x, cy: y, lamp: i === 2 ? [495, 902] : [x, y] }));

export const castleGate = { a: [505, 461], b: [548, 461], x: 527, y: 450 };

export const holes = [
  { id: 'tower', x: 228, y: 488, r: 16, kick: { vx: -40, vy: 650 }, out: [230, 494] },
  { id: 'castle', x: 527, y: 446, r: 18, kick: { vx: -320, vy: 900 }, out: [527, 488] },
  { id: 'mystery', x: 538, y: 652, r: 18, kick: { vx: -620, vy: 520 } },
  { id: 'mystery2', x: 466, y: 1010, r: 18, kick: { vx: 0, vy: 260 }, out: [590, 946], tunnel: true },
  { id: 'mine', x: 266, y: 898, r: 18, kick: { vx: 0, vy: 260 }, out: [126, 942], tunnel: true },
];

export const spinner = { x: 86, y: 397, a: [47, 397], b: [150, 397] };

export const rollovers = [
  { id: 'M', x: 72, y: 998, r: 15 }, { id: 'A', x: 127, y: 972, r: 15 },
  { id: 'G', x: 590, y: 985, r: 15 }, { id: 'E', x: 650, y: 1012, r: 15 },
];
export const kickbacks = [{ side: 'L', x: 72, y: 1050 }, { side: 'R', x: 650, y: 1052 }];
export const pool = { x: 376, y: 726, rx: 102, ry: 72, r: 80 };

// ---- rails: one-way wireforms/ramps following the drawn ramps. points [x, y, height]
export const ramps = {
  tower: { // grey ramp behind the tower → spiral → left wires → left inlane
    entry: { x: 331, y: 466, w: 78, diry: -1 }, minSpeed: 520, exit: { vx: 0, vy: 380 },
    pts: [[321, 466, 0], [330, 390, 30], [336, 300, 66], [305, 238, 92], [235, 205, 106], [160, 235, 104], [118, 310, 96], [100, 410, 88], [94, 470, 82],
      [62, 535, 76], [72, 608, 70], [140, 628, 64], [186, 568, 58], [150, 505, 52], [96, 528, 48], [104, 590, 44], [150, 582, 40], [140, 548, 37],
      [72, 640, 32], [64, 750, 26], [82, 850, 18], [108, 900, 10], [126, 940, 3]],
  },
  crystal: { // right leg up, over the castle, down the left leg into the mushrooms
    entry: { x: 621, y: 722, w: 62, diry: -1 }, side: { x: 592, y0: 665, y1: 800 }, minSpeed: 640, exit: { vx: -70, vy: 340 },
    pts: [[621, 722, 0], [628, 640, 30], [640, 520, 60], [660, 385, 90], [668, 262, 110], [640, 190, 122], [580, 155, 126], [500, 160, 122], [455, 205, 108], [444, 265, 76], [440, 322, 38], [438, 360, 3]],
  },
  orbit: { // left orbit: up the lane, over the top wires, down the right wires → right inlane
    entry: { x: 97, y: 330, w: 100, diry: -1 }, minSpeed: 520, exit: { vx: 0, vy: 380 },
    pts: [[86, 330, 0], [76, 250, 22], [100, 160, 36], [180, 112, 46], [300, 92, 50], [420, 90, 50], [540, 104, 50], [630, 150, 48], [690, 240, 44], [702, 350, 40], [692, 480, 36], [682, 620, 32], [662, 760, 26], [622, 850, 16], [596, 905, 8], [590, 948, 2]],
  },
  launch: { // plunger lane → top → drops into the mushroom glade
    entry: { x: 714, y: 255, w: 34, diry: -1 }, minSpeed: 0, noScore: true, exit: { vx: -120, vy: 260 },
    pts: [[714, 255, 0], [713, 150, 24], [684, 82, 38], [600, 58, 44], [490, 62, 44], [410, 96, 34], [372, 150, 14], [364, 192, 2]],
  },
};

export const PLUNGER = { x: 714, y: 1212 };
export const DRAIN_Y = 1226;

// outlanes: once a ball is below the inlane guides on the outside it rolls under the flippers to the drain
export function inOutlane(b) {
  return (b.x < 100 && b.y > 1045) || (b.x > 618 && b.x < FIELD.laneIn && b.y > 1048);
}

// ---- lamp overlays on the drawn lights (image px) ---------------------------------------
export const LAMPS = {
  dwarf: [[102, 676], [124, 676], [146, 676], [168, 676], [189, 676], [210, 676], [231, 676]],
  lowerRow: [[253, 1008], [276, 1008], [300, 1008], [322, 1008], [346, 1008]],
  arrows: { towerHole: [265, 530], towerRamp: [290, 592], orbit: [251, 645], castle: [493, 550], crystal: [469, 594] },
  kick: { L: [80, 915], R: [635, 920] },
  mage: { M: [155, 1078], A: [200, 1100], G: [518, 1107], E: [558, 1080] },
  towerLocks: [[287, 432], [305, 395], [352, 418]],
  towerRune: [210, 258],
  flame: [182, 92],
  castleGate: [[466, 492], [527, 422], [548, 492]],
};
