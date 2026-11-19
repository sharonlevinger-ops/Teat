// "Updated Mushroom Tower" playfield layout – pure data shared by physics and rendering.
// Units: table units (1 ≈ 2.5 cm). x: 0 (left) → 21 (right), y: 0 (player) → 40 (back). Ball radius 0.5.

export const TABLE_W = 21;
export const TABLE_H = 40;
export const CX = 9.9; // centre line of the main playfield (shooter lane sits on the right)

const arc = (cx, cy, rx, ry, a0, a1, n) => {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const a = ((a0 + (a1 - a0) * (i / n)) * Math.PI) / 180;
    pts.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]);
  }
  return pts;
};
const mirror = (pts) => pts.map(([x, y]) => [2 * CX - x, y]);

/** Catmull-Rom resample of 3D control points into an evenly spaced polyline. */
function samplePath(ctrl, step = 0.35) {
  const dense = [];
  const P = [ctrl[0], ...ctrl, ctrl[ctrl.length - 1]];
  for (let i = 1; i < P.length - 2; i++) {
    const [p0, p1, p2, p3] = [P[i - 1], P[i], P[i + 1], P[i + 2]];
    for (let s = 0; s < 16; s++) {
      const t = s / 16, t2 = t * t, t3 = t2 * t;
      const f = (k) => 0.5 * (2 * p1[k] + (-p0[k] + p2[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3);
      dense.push([f(0), f(1), f(2)]);
    }
  }
  dense.push(ctrl[ctrl.length - 1]);
  // even spacing
  const out = [dense[0]];
  let acc = 0;
  for (let i = 1; i < dense.length; i++) {
    const a = dense[i - 1], b = dense[i];
    acc += Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    if (acc >= step) { out.push(b); acc = 0; }
  }
  const last = dense[dense.length - 1];
  if (out[out.length - 1] !== last) out.push(last);
  const cum = [0];
  for (let i = 1; i < out.length; i++) {
    const a = out[i - 1], b = out[i];
    cum.push(cum[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]));
  }
  return { pts: out, cum, length: cum[cum.length - 1] };
}

export function buildTable() {
  // ---- walls: polylines -> segments ------------------------------------------------------
  const walls = []; // { pts:[[x,y]...], kind, e, fr, id?, kick?, oneWay?, visual }
  const wall = (pts, o = {}) => walls.push({ pts, kind: 'wall', e: 0.45, fr: 0.04, visual: 'wood', ...o });

  // outer cabinet: left wall, back arc (orbit), shooter-lane outer wall
  const outerArc = arc(10.5, 31, 9.9, 8.4, 180, 0, 44);
  wall([[0.6, -3], [0.6, 31], ...outerArc.slice(1), [20.4, 0.6]], { visual: 'cabinet', h: 1.6 });
  // shooter lane floor + inner wall (doubles as the right outlane's outer wall)
  wall([[19.2, 0.6], [20.4, 0.6]], { visual: 'none' });
  wall([[19.2, -3], [19.2, 30.5]], { visual: 'wood' });
  // one-way gate at the top of the shooter lane: lets the launched ball out, deflects balls coming back
  wall([[19.2, 30.5], [20.4, 31.9]], { kind: 'gate', oneWay: true, e: 0.2, visual: 'gate' });

  // inner orbit: left orbit inner wall + inner arc around the upper playfield
  const innerArc = arc(10.2, 31, 7.6, 6.4, 180, 15, 34);
  // a slightly peaked apex: a slow ball can never balance on top of the inner orbit wall
  { let k = 0; innerArc.forEach((p, i) => { if (p[1] > innerArc[k][1]) k = i; }); innerArc[k] = [innerArc[k][0], innerArc[k][1] + 0.3]; }
  wall([[2.6, 24], [2.6, 31], ...innerArc.slice(1)], { visual: 'rail', h: 1.1 });
  // right orbit inner wall (short: the gap above it is the skill-shot opening)
  wall([[17.8, 24], [17.8, 28.2]], { visual: 'rail', h: 1.1 });

  // lower lane guides (inlane / outlane separators)
  // the guide ends just above the flipper's top surface, so the ball always rolls onto the flipper
  const guideL = [[2.0, 12.5], [2.0, 8.6], [5.6, 5.95]];
  wall(guideL, { visual: 'rail', h: 1.0 });
  wall(mirror(guideL), { visual: 'rail', h: 1.0 });

  // slingshots (two passive edges + one kicking hypotenuse)
  const slingL = { top: [3.5, 12.0], low: [3.5, 9.15], tip: [5.6, 7.55] };
  const slingR = { top: [2 * CX - 3.5, 12.0], low: [2 * CX - 3.5, 9.15], tip: [2 * CX - 5.6, 7.55] };
  for (const [s, id] of [[slingL, 'slingL'], [slingR, 'slingR']]) {
    wall([s.top, s.low, s.tip], { visual: 'sling' });
    walls.push({ pts: [s.top, s.tip], kind: 'sling', id, e: 0.6, fr: 0.02, kick: 'sling', visual: 'rubber' });
  }

  // ramp entrance channels (dead-ended behind the capture sensor so a weak shot simply rolls back)
  const rampA = { x0: 4.9, x1: 6.5, y0: 21.0, y1: 24.4 };
  const rampB = { x0: 14.0, x1: 15.6, y0: 21.2, y1: 24.6 };
  for (const r of [rampA, rampB]) {
    // peaked roof so a ball can never come to rest on top of the entrance
    wall([[r.x0, r.y0], [r.x0, r.y1], [(r.x0 + r.x1) / 2, r.y1 + 0.9], [r.x1, r.y1], [r.x1, r.y0]], { visual: 'crystalRamp', h: 1.0, e: 0.3 });
    wall([[r.x0, r.y1], [r.x1, r.y1]], { visual: 'none', e: 0.3 }); // dead end behind the capture sensor
  }

  // ---- the mushroom tower: round wall with a door opening facing the flippers -------------
  const tower = { x: CX, y: 31.2, r: 2.2, doorA0: -120, doorA1: -60 };
  wall(arc(tower.x, tower.y, tower.r, tower.r, tower.doorA1, tower.doorA0 + 360, 20), { visual: 'none', e: 0.4 });
  const doorL = [tower.x + tower.r * Math.cos((tower.doorA0 * Math.PI) / 180), tower.y + tower.r * Math.sin((tower.doorA0 * Math.PI) / 180)];
  const doorR = [tower.x + tower.r * Math.cos((tower.doorA1 * Math.PI) / 180), tower.y + tower.r * Math.sin((tower.doorA1 * Math.PI) / 180)];
  walls.push({ pts: [doorL, doorR], kind: 'door', id: 'door', e: 0.35, fr: 0.03, visual: 'none', toggle: 'doorClosed' });

  // ---- targets -----------------------------------------------------------------------------
  // wizard's staff plate (a standing target in front of the White Wizard)
  const wizard = { x: 6.5, y: 27.9, plate: [[5.5, 25.75], [7.05, 26.3]] };
  walls.push({ pts: wizard.plate, kind: 'wizard', id: 'wizard', e: 0.55, fr: 0.03, visual: 'none' });

  // crystals: sharp diamonds (polygons)
  const diamond = (x, y, rot, w = 0.55, h = 0.9) => {
    const c = Math.cos(rot), s = Math.sin(rot);
    return [[0, h], [w, 0], [0, -h], [-w, 0], [0, h]].map(([px, py]) => [x + px * c - py * s, y + px * s + py * c]);
  };
  const crystals = [
    { id: 'crystal1', x: 8.35, y: 24.4, rot: 0.35 },
    { id: 'crystal2', x: 16.6, y: 19.2, rot: -0.3 },
  ];
  for (const c of crystals) walls.push({ pts: diamond(c.x, c.y, c.rot), kind: 'element', id: c.id, e: 0.7, fr: 0.02, visual: 'none' });

  // ---- circles: pop-bumper mushrooms + potion bottle --------------------------------------
  const circles = [
    { id: 'mush1', kind: 'element', x: 4.4, y: 17.2, r: 1.0, e: 0.9, kick: 'bumper', bell: 0 },
    { id: 'mush2', kind: 'element', x: 11.6, y: 19.8, r: 1.0, e: 0.9, kick: 'bumper', bell: 1 },
    { id: 'mush3', kind: 'element', x: 15.6, y: 27.6, r: 1.0, e: 0.9, kick: 'bumper', bell: 2 },
    { id: 'potion', kind: 'element', x: 4.5, y: 28.9, r: 0.62, e: 0.55 },
    // posts at the top of the lane guides
    { id: 'postL', kind: 'post', x: 2.0, y: 12.5, r: 0.18, e: 0.5 },
    { id: 'postR', kind: 'post', x: 2 * CX - 2.0, y: 12.5, r: 0.18, e: 0.5 },
  ];

  // ---- flippers ----------------------------------------------------------------------------
  const deg = Math.PI / 180;
  const flippers = [
    { id: 'left', side: 'L', px: 5.9, py: 5.0, len: 3.4, r1: 0.55, r2: 0.27, rest: -30 * deg, up: 30 * deg },
    { id: 'right', side: 'R', px: 2 * CX - 5.9, py: 5.0, len: 3.4, r1: 0.55, r2: 0.27, rest: 210 * deg, up: 150 * deg },
  ];

  // ---- sensors (no collision; enter events) ------------------------------------------------
  const sensors = [
    { id: 'shooterExit', type: 'rect', x: 19.8, y: 32.9, w: 1.2, h: 0.9 },
    { id: 'rampA', type: 'rect', x: (rampA.x0 + rampA.x1) / 2, y: rampA.y1 - 1.0, w: 1.5, h: 0.8 },
    { id: 'rampB', type: 'rect', x: (rampB.x0 + rampB.x1) / 2, y: rampB.y1 - 1.0, w: 1.5, h: 0.8 },
    { id: 'orbitL', type: 'rect', x: 1.6, y: 25.0, w: 1.9, h: 0.6 },
    { id: 'orbitR', type: 'rect', x: 18.5, y: 25.0, w: 1.3, h: 0.6 },
    { id: 'towerIn', type: 'circle', x: tower.x, y: tower.y - 0.9, r: 0.9, toggle: 'doorOpen' },
    { id: 'outlaneL', type: 'rect', x: 1.3, y: 5.2, w: 1.3, h: 1.2 },
    { id: 'outlaneR', type: 'rect', x: 2 * CX - 1.3, y: 5.2, w: 1.3, h: 1.2 },
    { id: 'inlaneL', type: 'rect', x: 2.75, y: 10.5, w: 1.3, h: 0.8 },
    { id: 'inlaneR', type: 'rect', x: 2 * CX - 2.75, y: 10.5, w: 1.3, h: 0.8 },
    { id: 'pool', type: 'circle', x: CX, y: 13.6, r: 2.1 },
  ];

  // ---- ramps (3D rails the ball rides on; physics hands the ball over to the rail) --------
  const ramps = {
    rampA: {
      name: 'Crystal Ramp',
      material: 'crystal',
      path: samplePath([
        [5.7, 23.6, 0.0], [5.9, 26.0, 1.4], [6.8, 29.6, 2.8], [8.6, 34.6, 3.8], [11.4, 35.0, 4.2],
        [14.6, 31.6, 4.0], [16.9, 26.0, 3.3], [17.1, 19.5, 2.2], [17.05, 15.0, 0.9], [17.05, 13.1, 0.15],
      ]),
      exitVel: [0, -9],
    },
    rampB: {
      name: 'Golden Ramp',
      material: 'gold',
      path: samplePath([
        [14.8, 23.8, 0.0], [14.3, 26.4, 1.5], [12.4, 26.8, 2.7], [9.6, 23.4, 3.3], [7.6, 18.8, 3.4],
        [6.9, 15.0, 3.0], [5.3, 13.9, 2.3], [3.5, 14.4, 1.3], [2.75, 13.6, 0.4], [2.75, 13.1, 0.1],
      ]),
      exitVel: [0, -9],
    },
  };

  // ---- spawn / eject points ----------------------------------------------------------------
  const points = {
    plunger: [19.8, 1.15],
    shooterAuto: [19.8, 6.0],
    towerEject: [tower.x, 28.15],
    portal: [1.6, 28.5], // left orbit lane, used by multiball
    rescue: [1.6, 27.0],
    kickback: [1.3, 6.4],
  };

  // ---- decoration anchors for the renderer ---------------------------------------------------
  const decor = {
    tower,
    wizard,
    crystals,
    pool: { x: CX, y: 13.6, r: 2.2 },
    slings: [slingL, slingR],
    rampEntrances: { rampA, rampB },
    // insert lights painted into the playfield
    inserts: {
      combo: [
        { id: 'mush1', x: 6.5, y: 10.6 }, { id: 'mush2', x: 7.9, y: 9.6 }, { id: 'mush3', x: 9.2, y: 9.1 },
        { id: 'crystal1', x: 10.6, y: 9.1 }, { id: 'crystal2', x: 11.9, y: 9.6 }, { id: 'potion', x: 13.3, y: 10.6 },
      ],
      kickback: { x: 1.3, y: 7.6 },
      wizard: [{ x: 7.6, y: 22.2 }, { x: 8.3, y: 21.4 }, { x: 9.0, y: 20.6 }],
      door: { x: CX, y: 26.6 },
      rampA: { x: 5.7, y: 19.6 },
      rampB: { x: 14.8, y: 19.8 },
      orbitL: { x: 1.6, y: 22.4 },
      orbitR: { x: 18.5, y: 22.4 },
    },
  };

  return { walls, circles, flippers, sensors, ramps, points, decor, outerArc, innerArc };
}
