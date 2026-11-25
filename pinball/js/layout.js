// Table layout, in "table pixels" (x → right, y → down toward the player).
// Matches the concept art: tower top-left, castle top-right, 3 mushroom bumpers top-center,
// crystal ramp on the right, magic pool in the middle, dwarf mine bottom-left,
// prince's shield bottom-right, M-A-G-E lanes and 4 flippers.

export const BALL_R = 13;
export const FIELD = { left: 40, right: 734, top: 40, bottom: 1300, laneX: 692 };
export const CX = 362; // flipper centre line
const m = (x) => 2 * CX - x; // mirror helper

export const ARC = { cx: 387, cy: 387, r: 347 };

function arcPoints(a0, a1, n) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + (a1 - a0) * (i / n);
    pts.push([ARC.cx + Math.cos(a) * ARC.r, ARC.cy + Math.sin(a) * ARC.r]);
  }
  return pts;
}

// --- static walls (polylines). kind: 'wall' (wood/metal rail), 'rubber' (bouncier)
export const walls = [];
function poly(points, opts = {}) { walls.push({ points, closed: !!opts.closed, kind: opts.kind || 'wall', vis: opts.vis !== false, h: opts.h || 26 }); }

// outer shell: left wall, top arc, right (plunger lane outer) wall
poly([[FIELD.left, 1300], [FIELD.left, ARC.cy], ...arcPoints(Math.PI, Math.PI * 2, 64).slice(1, -1), [FIELD.right, ARC.cy], [FIELD.right, 1300]]);
// plunger lane inner wall
poly([[FIELD.laneX, 1300], [FIELD.laneX, 365]]);

// --- castle footprint (solid)
export const CASTLE_POLY = [[440, 215], [482, 150], [560, 132], [606, 166], [634, 212], [634, 425], [566, 466], [452, 466], [440, 440]];
poly(CASTLE_POLY, { closed: true, vis: false });

// --- dwarf mine (solid rock mound)
export const MINE_POLY = [[150, 800], [205, 778], [262, 792], [282, 850], [274, 925], [226, 952], [172, 936], [148, 880]];
poly(MINE_POLY, { closed: true, vis: false, kind: 'rock' });

// --- prince's shield bastion (solid)
export const BASTION_POLY = [[458, 846], [520, 816], [562, 852], [560, 926], [506, 954], [460, 920]];
poly(BASTION_POLY, { closed: true, vis: false, kind: 'rock' });

// drop-target backing (behind the three shields under the castle)
poly([[566, 466], [624, 553], [634, 560], [634, 425]], { closed: true, vis: false });


// tower-ramp mouth side walls
poly([[294, 474], [294, 404]], { h: 20 });
poly([[343, 474], [343, 404]], { h: 20 });

// --- lower playfield: inlanes / outlanes / slings (left, then mirrored)
export const SLING_L = [[130, 950], [130, 1030], [200, 1072]];
export const SLING_R = SLING_L.map(([x, y]) => [m(x), y]);
const leftLower = {
  guide: [[88, 930], [88, 1050]],
  inlaneFloor: [[88, 1050], [218, 1121]],
  slingBody: SLING_L,
};
poly(leftLower.guide, { h: 22 });
poly(leftLower.inlaneFloor);
poly(leftLower.slingBody);
poly(leftLower.guide.map(([x, y]) => [m(x), y]), { h: 22 });
poly(leftLower.inlaneFloor.map(([x, y]) => [m(x), y]));
poly(leftLower.slingBody.map(([x, y]) => [m(x), y]));

// --- round posts (rubber posts)
export const posts = [
  { x: 88, y: 930, r: 6 }, { x: m(88), y: 930, r: 6 },
  { x: 130, y: 950, r: 7 }, { x: m(130), y: 950, r: 7 },
  { x: 628, y: 572, r: 8 },
  { x: 294, y: 474, r: 5 }, { x: 343, y: 474, r: 5 },
];

// --- slingshots (kicking faces)
export const slings = [
  { a: SLING_L[0], b: SLING_L[2], side: 'L' },
  { a: SLING_R[2], b: SLING_R[0], side: 'R' },
];

// --- tower (solid round base)
export const TOWER = { x: 205, y: 345, r: 80 };

// --- mushroom pop bumpers
export const bumpers = [
  { x: 322, y: 232, r: 30, color: 0xb04cff, name: 'purple' },
  { x: 398, y: 160, r: 30, color: 0xff7a1a, name: 'orange' },
  { x: 384, y: 300, r: 30, color: 0x1affc6, name: 'teal' },
];

// --- flippers. angles in radians, y-down coordinate system
const deg = Math.PI / 180;
export const flippers = [
  { id: 'LL', side: 'L', x: 228, y: 1145, len: 112, r0: 15, r1: 8, rest: 32 * deg, up: -28 * deg },
  { id: 'LR', side: 'R', x: m(228), y: 1145, len: 112, r0: 15, r1: 8, rest: Math.PI - 32 * deg, up: Math.PI + 28 * deg },
  { id: 'UL', side: 'L', x: 150, y: 604, len: 78, r0: 12, r1: 7, rest: 30 * deg, up: -24 * deg },
  { id: 'UR', side: 'R', x: 676, y: 806, len: 74, r0: 12, r1: 7, rest: Math.PI - 30 * deg, up: Math.PI + 26 * deg },
];

// --- drop targets (3 shields under the castle)
export const dropTargets = [0, 1, 2].map((i) => {
  const t0 = [548, 478], t1 = [612, 568];
  const f = (i + 0.5) / 3;
  const cx = t0[0] + (t1[0] - t0[0]) * f, cy = t0[1] + (t1[1] - t0[1]) * f;
  const dx = t1[0] - t0[0], dy = t1[1] - t0[1], L = Math.hypot(dx, dy);
  const ux = dx / L, uy = dy / L, half = 15;
  return { i, cx, cy, a: [cx - ux * half, cy - uy * half], b: [cx + ux * half, cy + uy * half], nx: -uy, ny: ux };
});

// --- prince's shield stand-up targets (on bastion faces)
function onSeg(a, b, f) { return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]; }
export const shieldTargets = [
  { a: onSeg(BASTION_POLY[5], BASTION_POLY[0], 0.15), b: onSeg(BASTION_POLY[5], BASTION_POLY[0], 0.55) },
  { a: onSeg(BASTION_POLY[0], BASTION_POLY[1], 0.1), b: onSeg(BASTION_POLY[0], BASTION_POLY[1], 0.5) },
  { a: onSeg(BASTION_POLY[0], BASTION_POLY[1], 0.55), b: onSeg(BASTION_POLY[0], BASTION_POLY[1], 0.95) },
].map((t, i) => {
  const dx = t.b[0] - t.a[0], dy = t.b[1] - t.a[1], L = Math.hypot(dx, dy);
  return { ...t, i, cx: (t.a[0] + t.b[0]) / 2, cy: (t.a[1] + t.b[1]) / 2, nx: dy / L, ny: -dx / L };
});

// --- castle gate (stand-up until open, then a scoop)
export const castleGate = { a: [478, 466], b: [532, 466], x: 505, y: 482 };

// --- saucers / holes
export const holes = [
  { id: 'tower', x: 246, y: 438, r: 17, kick: { vx: 420, vy: 900 } },
  { id: 'castle', x: 505, y: 484, r: 18, kick: { vx: -250, vy: 950 } },
  { id: 'mystery', x: 524, y: 632, r: 16, kick: { vx: -650, vy: 500 } },
  { id: 'mine', x: 298, y: 882, r: 16, kick: { vx: 420, vy: -620 } },
];

// --- spinner (left orbit)
export const spinner = { x: 84, y: 400, half: 40, a: [44, 400], b: [124, 400] };

// --- sensors (rollovers)
export const rollovers = [
  { id: 'M', x: 64, y: 1000, r: 14 },
  { id: 'A', x: 109, y: 1000, r: 14 },
  { id: 'G', x: m(109), y: 1000, r: 14 },
  { id: 'E', x: m(64), y: 1000, r: 14 },
];
export const kickbacks = [
  { side: 'L', x: 64, y: 1080 },
  { side: 'R', x: m(64), y: 1080 },
];
export const pool = { x: 382, y: 712, r: 96 };

// --- one-way gates: a ball crossing from the "back" side passes, from the front it bounces.
// normal (nx,ny) points to the blocking side.
export const gates = [
  // plunger lane exit: lets the launched ball out, deflects orbiting balls into the right channel
  { a: [721, 289], b: [676, 366], nx: -0.86, ny: -0.5 },
];

// --- ramps (3D wire / crystal paths). points: [x, y, height]
export const ramps = {
  tower: {
    entry: { x: 318, y: 452, w: 44, dirx: 0, diry: -1 },
    minSpeed: 760,
    exit: { vx: 120, vy: 520 },
    pts: [
      [318, 452, 0], [318, 380, 30], [312, 290, 70], [292, 205, 100], [240, 160, 118], [170, 168, 122],
      [118, 212, 118], [92, 300, 108], [118, 420, 96],
      // spiral (corkscrew) near the left side
      [150, 520, 88], [130, 590, 80], [80, 560, 74], [92, 500, 70], [146, 520, 64], [140, 600, 56],
      [100, 700, 46], [94, 820, 34], [104, 900, 20], [109, 960, 4],
    ],
  },
  crystal: {
    entry: { x: 660, y: 600, w: 64, dirx: 0, diry: -1 },
    minSpeed: 820,
    exit: { vx: -60, vy: 380 },
    pts: [
      [660, 600, 0], [662, 530, 26], [664, 420, 70], [662, 280, 104], [640, 175, 124], [580, 112, 134],
      [510, 98, 136], [460, 120, 128], [440, 170, 108], [432, 220, 70], [428, 252, 30], [424, 262, 2],
    ],
  },
};

// orbit return wireforms (one-way, downward): feed the inlanes like a real machine
ramps.leftReturn = {
  entry: { x: 84, y: 448, w: 84, dirx: 0, diry: 1 }, minSpeed: 0, ret: true,
  exit: { vx: 30, vy: 420 },
  pts: [[84, 448, 2], [70, 520, 24], [58, 640, 34], [56, 780, 34], [60, 880, 26], [86, 940, 12], [108, 968, 2]],
};
ramps.rightReturn = {
  entry: { x: 678, y: 700, w: 28, dirx: 0, diry: 1 }, minSpeed: 0, ret: true,
  exit: { vx: -30, vy: 420 },
  pts: [[678, 700, 2], [680, 760, 22], [680, 870, 30], [664, 930, 16], [636, 962, 6], [616, 976, 2]],
};

// visual-only habitrails (orbit guide wires)
export const decoRails = [
  // left orbit wire over the outside edge
  { pts: [[58, 880, 18], [56, 600, 18], [58, 420, 18]], r: 2.4 },
];

export const PLUNGER = { x: 713, y: 1228 };
export const DRAIN_Y = 1224;
