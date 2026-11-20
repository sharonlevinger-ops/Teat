// The playfield of the painting, traced in painting pixels and converted to the flat physics table
// (x 0..21, y 0..40) through the perspective mapping in artmap.js. Same structure as the original engine.
import { artToFlat } from './artmap.js';

export const FLIPPER_STRETCH = 1.15;
const F = ([x, y]) => artToFlat(x, y);
const P = (pts) => pts.map(F);

/** Catmull-Rom through art points, `per` samples per span */
function spline(pts, per) {
  const out = [];
  const Q = [pts[0], ...pts, pts[pts.length - 1]];
  for (let i = 1; i < Q.length - 2; i++) {
    const [p0, p1, p2, p3] = [Q[i - 1], Q[i], Q[i + 1], Q[i + 2]];
    for (let k = 0; k < per; k++) {
      const t = k / per, t2 = t * t, t3 = t2 * t;
      const f = (j) => 0.5 * (2 * p1[j] + (-p0[j] + p2[j]) * t + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t2 + (-p0[j] + 3 * p1[j] - 3 * p2[j] + p3[j]) * t3);
      out.push([f(0), f(1)]);
    }
  }
  out.push(pts[pts.length - 1]);
  return out;
}

function arcFlat(cx, cy, r, a0, a1, n) {
  const pts = [];
  for (let i = 0; i <= n; i++) { const a = ((a0 + (a1 - a0) * (i / n)) * Math.PI) / 180; pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); }
  return pts;
}

/** A rail the ball rides: drawn exactly on the painted ramp (art points), timed in flat units. */
function rail(artPts, heights) {
  const pts = artPts.map((p, i) => { const [x, y] = F(p); return [x, y, heights[i] ?? 0]; });
  // resample evenly (about every 0.35 units) so the ball moves smoothly
  const dense = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 0.35));
    for (let k = 0; k < n; k++) { const t = k / n; dense.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]); }
  }
  dense.push(pts[pts.length - 1]);
  const cum = [0];
  for (let i = 1; i < dense.length; i++) cum.push(cum[i - 1] + Math.hypot(dense[i][0] - dense[i - 1][0], dense[i][1] - dense[i - 1][1]));
  return { pts: dense, cum, length: cum[cum.length - 1] };
}

export function buildTable() {
  const walls = [];
  const wall = (artPts, o = {}) => walls.push({ pts: P(artPts), kind: 'wall', e: 0.45, fr: 0.04, ...o });

  // outer boundary: left wall, the arc over the top (behind the tower), right wall of the launch lane.
  // A smooth spline (not a few straight pieces) so a launched ball rides round the arc without losing speed.
  const boundary = spline([[98, 2240], [96, 1700], [95, 1300], [100, 1000], [118, 820], [150, 680], [205, 575], [290, 505], [420, 458],
    [560, 441], [720, 441], [860, 456], [990, 490], [1095, 540], [1172, 602], [1222, 680], [1244, 780], [1245, 1000], [1245, 1400], [1245, 1725]], 6);
  walls.push({ pts: P(boundary), kind: 'wall', e: 0.45, fr: 0.004 });
  // launch lane: floor under the ball, inner wall, one-way gate at the top
  wall([[1185, 1724], [1245, 1724]]);
  wall([[1185, 1724], [1185, 745]]);
  walls.push({ pts: P([[1185, 745], [1238, 700]]), kind: 'gate', oneWay: true, e: 0.2, fr: 0.04 });

  // slingshots: the painted bottom edge runs parallel to the rune rail (keeps the inlane wide open)
  // measured on the painted slingshots: the long inner edge (top -> tip) is the kicking rubber
  const slingL = { top: [333, 1572], low: [290, 1752], tip: [406, 1778] };
  const slingR = { top: [945, 1572], low: [988, 1752], tip: [872, 1778] };
  for (const [s, id] of [[slingL, 'slingL'], [slingR, 'slingR']]) {
    // passive sides only (top -> low -> tip); the inner edge is the kicking rubber below, never a plain wall
    wall([s.top, s.low, s.tip], { solidPoly: P([s.top, s.low, s.tip]) });
    walls.push({ pts: P([s.top, s.tip]), kind: 'sling', id, e: 0.6, fr: 0.02, kick: 'sling' });
  }

  // the clear crystal on its pedestal, joined to the left wall with a sloped top
  wall([[95, 1392], [168, 1424], [170, 1462], [95, 1494]], { e: 0.5, solidPoly: P([[95, 1392], [168, 1424], [170, 1462], [95, 1494]]) });
  // the yellow crystal: a wedge attached to the launch-lane wall (its faces count as crystal hits)
  walls.push({ pts: P([[1185, 1268], [1098, 1328], [1092, 1398], [1185, 1424]]), kind: 'element', id: 'crystal2', e: 0.7, fr: 0.02, solidPoly: P([[1185, 1268], [1098, 1328], [1092, 1398], [1185, 1424]]) });

  // the mushroom tower: a round wall with a door facing the flippers
  const [tx, ty] = F([632, 968]);
  const tower = { x: tx, y: ty, r: 2.15, doorA0: -118, doorA1: -62 };
  walls.push({ pts: arcFlat(tower.x, tower.y, tower.r, tower.doorA1, tower.doorA0 + 360, 22), kind: 'wall', e: 0.4, fr: 0.04 });
  const rad = (a) => (a * Math.PI) / 180;
  const doorL = [tower.x + tower.r * Math.cos(rad(tower.doorA0)), tower.y + tower.r * Math.sin(rad(tower.doorA0))];
  const doorR = [tower.x + tower.r * Math.cos(rad(tower.doorA1)), tower.y + tower.r * Math.sin(rad(tower.doorA1))];
  walls.push({ pts: [doorL, doorR], kind: 'door', id: 'door', e: 0.35, fr: 0.03, toggle: 'doorClosed' });

  // circles: pop-bumper mushrooms (at their stems), crystals, potion, the wizard, posts
  const C = (id, kind, art, r, o = {}) => { const [x, y] = F(art); return { id, kind, x, y, r, e: 0.6, ...o }; };
  const circles = [
    C('mush1', 'element', [337, 1370], 0.95, { e: 0.9, kick: 'bumper' }),
    C('mush2', 'element', [398, 1146], 0.9, { e: 0.9, kick: 'bumper' }),
    C('mush3', 'element', [440, 832], 0.85, { e: 0.9, kick: 'bumper' }),
    C('crystal1', 'element', [232, 1136], 1.0, { e: 0.7 }),
    C('potion', 'element', [1000, 655], 0.85, { e: 0.55 }),
    C('wizard', 'wizard', [850, 1098], 0.85, { e: 0.55 }),
    C('postL', 'post', [180, 1640], 0.18, { e: 0.5 }),
    C('postR', 'post', [1100, 1640], 0.18, { e: 0.5 }),
    C('cone', 'post', [330, 1036], 0.3, { e: 0.5 }),
  ];

  // flippers: pivot/tip measured from the painted flippers; they swing up by the same angle
  const flipper = (id, side, pivotArt, tipArt) => {
    const [px, py] = F(pivotArt), [qx, qy] = F(tipArt);
    let rest = Math.atan2(qy - py, qx - px);
    if (side === 'R' && rest < 0) rest += Math.PI * 2; // keep the right flipper's swing short (through 180°)
    const up = side === 'L' ? -rest : Math.PI * 2 - rest; // mirrored across the horizontal
    const paintedLen = Math.hypot(qx - px, qy - py);
    // 15% longer than painted: keeps the centre drain about 1.8 balls wide (the sprite is stretched to match)
    return { id, side, px, py, len: paintedLen * FLIPPER_STRETCH, paintedLen, r1: 0.5, r2: 0.26, rest, up, pivotArt, tipArt };
  };
  const flippers = [flipper('left', 'L', [378, 1937], [550, 2060]), flipper('right', 'R', [902, 1937], [730, 2060])];

  // inlane / outlane guides (the carved rune rails). Each ends just above its flipper's top surface, so a
  // ball always rolls onto the flipper instead of settling in a notch beside the pivot.
  // the vertical-to-diagonal bend is rounded (like a real inlane) so a falling ball keeps its speed
  const bendL = [[180, 1640], [181, 1700], [184, 1735], [194, 1760], [214, 1777]];
  const bendR = bendL.map(([x, y]) => [1280 - x, y]);
  for (const [f, top, bend] of [[flippers[0], bendL, null], [flippers[1], bendR, null]]) {
    const s = f.side === 'L' ? 1 : -1;
    const ca = Math.cos(f.rest), sa = Math.sin(f.rest);
    const nx = -sa * s, ny = ca * s; // upward normal of the flipper's top surface
    const sx = f.px + nx * f.r1, sy = f.py + ny * f.r1; // top surface at the pivot
    const end = [sx - ca * 0.35 + nx * 0.14, sy - sa * 0.35 + ny * 0.14];
    walls.push({ pts: [...P(top), end], kind: 'wall', e: 0.45, fr: 0.04 });
  }

  const R = (id, art, w, h, o = {}) => { const [x, y] = F(art); return { id, type: 'rect', x, y, w, h, ...o }; };
  const sensors = [
    R('shooterExit', [1213, 860], 1.2, 0.9),
    R('skillTurn', [215, 700], 4.2, 1.2),
    R('rampA', [1012, 1262], 1.5, 0.8),
    R('rampB', [286, 1048], 1.4, 0.8),
    R('orbitL', [190, 900], 2.4, 0.6),
    R('orbitR', [1142, 900], 1.6, 0.6),
    { id: 'towerIn', type: 'circle', x: tower.x, y: tower.y - 0.9, r: 0.9, toggle: 'doorOpen' },
    R('outlaneL', [138, 1880], 1.4, 1.2),
    R('outlaneR', [1142, 1880], 1.4, 1.2),
    (() => { const [x, y] = F([630, 1408]); return { id: 'pool', type: 'circle', x, y, r: 2.4 }; })(),
  ];

  // ramps: the crystal ramp climbs to the potion, the wire orbit on the left climbs past mushroom 3
  const ramps = {
    rampA: { name: 'Crystal Ramp', path: rail([[1012, 1255], [1030, 1150], [1046, 1000], [1052, 850], [1040, 750], [1012, 712]], [0, 1, 2, 2.6, 2.4, 1.6]), exitVel: [0, 5] },
    rampB: { name: 'Golden Orbit', path: rail([[286, 1045], [264, 950], [262, 860], [290, 760], [350, 685], [440, 630], [520, 628]], [0, 1, 1.8, 2.4, 2.6, 2.2, 1.4]), exitVel: [3, -7] },
  };

  const pt = (art) => F(art);
  const laneBottom = F([1185, 1600]);
  const points = {
    plunger: pt([1213, 1694]),
    shooterAuto: pt([1213, 1500]),
    towerEject: [tower.x, tower.y - tower.r - 1.0],
    portal: pt([200, 760]),
    rescue: pt([200, 820]),
    kickback: pt([138, 1900]),
  };

  return {
    walls, circles, flippers, sensors, ramps, points,
    plungerZone: { minX: laneBottom[0], maxY: laneBottom[1] },
    bounds: { minX: -2, maxX: 24, maxY: 42 }, // the launch lane runs past x = 22 in flat units (perspective)
    centerX: 10.5,
    decor: { tower },
  };
}
