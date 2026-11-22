// Table 2 – "Forest Kingdom". Same cabinet and lower playfield as the Enchanted Forest (boundary, launch lane,
// slingshots, inlanes/outlanes with the M-A-G-E lanes, flippers, kickbacks, magic pool), a new upper half laid
// out as in the approved sketch (painting pixels, 1284 × 2281):
//   wizard's tower top-left (door → locks / multiball), castle top-right (gate → Princess Rescue),
//   three mushroom bumpers top-centre, the dwarves' mine middle-left (scoop + 7 dwarf lamps),
//   the prince's three shields in the centre (drop targets), crystal ramp over the castle down the right,
//   golden wire ramp round the tower down the left, the mystery hole right of centre, a fairy spinner
//   in the left orbit.
import { buildTable, F, P, arcFlat, rail } from './table.js';

export const KINGDOM = {
  tower: [330, 700], // centre of the round tower (its door faces the flippers)
  castle: [[800, 700], [930, 612], [1060, 700], [1060, 860], [800, 860]], // castle body (solid); the peaked back sheds balls to both sides
  gate: [[880, 860], [980, 860]], // the castle gate on the front wall
  // drop targets: a slanted bank right of centre facing the left flipper (the centre stays open for the ramps and the gate)
  shields: [[[962, 1060], [986, 1112]], [[992, 1124], [1016, 1176]], [[1022, 1188], [1046, 1240]]],
  mine: [[200, 1180], [232, 1112], [292, 1090], [352, 1110], [392, 1180]], // the hill over the mine (solid)
  mineHole: [296, 1226],
  scoop: [900, 1330], // mystery hole
  spinner: [176, 1010],
  bumpers: { mush1: [560, 700], mush2: [700, 662], mush3: [662, 792] },
  wizard: [418, 928],
  prince: [1090, 1150], // decoration only (no body: it must never block the shot at the castle gate)
};

export function buildKingdomTable() {
  const t = buildTable(); // the shared cabinet and lower playfield
  const K = KINGDOM;
  // remove what belongs to the Enchanted Forest only
  t.walls = t.walls.filter((w) => !w.forest);
  t.circles = t.circles.filter((c) => !['mush1', 'mush2', 'mush3', 'crystal1', 'potion', 'wizard', 'cone'].includes(c.id));
  t.sensors = t.sensors.filter((s) => !['rampA', 'rampB', 'towerIn', 'scoop', 'skillTurn'].includes(s.id));

  // the wizard's tower: round wall with a door facing the flippers (same mechanism as table 1)
  const [tx, ty] = F(K.tower);
  const tower = { x: tx, y: ty, r: 2.1, doorA0: -118, doorA1: -62 };
  t.walls.push({ pts: arcFlat(tower.x, tower.y, tower.r, tower.doorA1, tower.doorA0 + 360, 22), kind: 'wall', e: 0.4, fr: 0.04 });
  const rad = (a) => (a * Math.PI) / 180;
  const doorL = [tower.x + tower.r * Math.cos(rad(tower.doorA0)), tower.y + tower.r * Math.sin(rad(tower.doorA0))];
  const doorR = [tower.x + tower.r * Math.cos(rad(tower.doorA1)), tower.y + tower.r * Math.sin(rad(tower.doorA1))];
  t.walls.push({ pts: [doorL, doorR], kind: 'door', id: 'door', e: 0.35, fr: 0.03, toggle: 'doorClosed' });
  t.sensors.push({ id: 'towerIn', type: 'circle', x: tower.x, y: tower.y - 0.9, r: 0.9, toggle: 'doorOpen' });

  // the castle: a solid body; the gate is a target (closed) and opens to let the ball in
  const body = K.castle, n = body.length; // last two points: front-right, front-left
  t.walls.push({ pts: P([body[n - 1], ...body.slice(0, n - 1)]), kind: 'wall', e: 0.45, fr: 0.04, solidPoly: P(body) });
  t.walls.push({ pts: P([body[n - 1], K.gate[0]]), kind: 'wall', e: 0.45, fr: 0.04 });
  t.walls.push({ pts: P([K.gate[1], body[n - 2]]), kind: 'wall', e: 0.45, fr: 0.04 });
  t.walls.push({ pts: P(K.gate), kind: 'element', id: 'castleGate', e: 0.4, fr: 0.03, toggle: 'gateClosed' });
  const [gx, gy] = F([(K.gate[0][0] + K.gate[1][0]) / 2, K.gate[0][1] - 40]);
  t.sensors.push({ id: 'castleIn', type: 'circle', x: gx, y: gy, r: 0.8, toggle: 'gateOpen' });

  // the prince's shields: three drop targets (each disappears when hit, until the bank is reset)
  K.shields.forEach((seg, i) => t.walls.push({ pts: P(seg), kind: 'element', id: `shield${i + 1}`, e: 0.35, fr: 0.03, toggle: `shield${i + 1}Up`, drop: true }));

  // the dwarves' mine: a solid hill with the mine hole in front of it
  t.walls.push({ pts: P(K.mine), kind: 'wall', e: 0.45, fr: 0.05, solidPoly: P([...K.mine]) });
  const [mx, my] = F(K.mineHole);
  t.sensors.push({ id: 'mine', type: 'circle', x: mx, y: my, r: 0.8 });
  t.points.mine = [mx, my];

  // mystery hole (same Mystery Scoop rules as table 1)
  const [sx, sy] = F(K.scoop);
  t.sensors.push({ id: 'scoop', type: 'circle', x: sx, y: sy, r: 0.8 });
  t.points.scoop = [sx, sy];

  // fairy spinner in the left orbit (counts spins from the ball's speed)
  const [px, py] = F(K.spinner);
  t.sensors.push({ id: 'spinner', type: 'rect', x: px, y: py, w: 2.0, h: 0.5 });

  // skill shot: as the launched ball comes down round the top-left of the arc it is steered at mushroom 1
  const [kx, ky] = F([430, 492]);
  t.sensors.push({ id: 'skillTurn', type: 'rect', x: kx, y: ky, w: 3.4, h: 1.4 });

  // ramps: the crystal ramp climbs over the castle and runs down the right; the golden wire wraps the tower
  const [ax, ay] = F([744, 836]);
  t.sensors.push({ id: 'rampA', type: 'rect', x: ax, y: ay, w: 2.6, h: 1.2 });
  const [bx, by] = F([506, 792]);
  t.sensors.push({ id: 'rampB', type: 'rect', x: bx, y: by, w: 2.4, h: 1.2 });
  t.ramps = {
    rampA: {
      name: 'Crystal Ramp',
      path: rail([[744, 836], [760, 720], [810, 600], [930, 560], [1050, 590], [1100, 690], [1108, 830], [1094, 960], [1070, 1100], [1050, 1250],
        [1040, 1330], [1062, 1420], [1074, 1500], [1068, 1572]], [0.3, 1.2, 2.2, 2.8, 2.8, 2.6, 2.4, 2.1, 1.8, 1.5, 1.1, 0.7, 0.35, 0.1]),
      exitVel: [-0.5, -8],
    },
    rampB: {
      name: 'Golden Ramp',
      path: rail([[506, 792], [478, 650], [432, 560], [340, 528], [252, 560], [206, 662], [200, 820], [204, 1000], [214, 1200], [224, 1400], [232, 1560]],
        [0.3, 1.4, 2.4, 2.8, 2.8, 2.4, 2.0, 1.6, 1.1, 0.5, 0.1]),
      exitVel: [0.6, -8],
    },
  };

  // circles: mushroom bumpers, the wizard (charges the tower), the prince (a post)
  const C = (id, kind, art, r, o = {}) => { const [x, y] = F(art); return { id, kind, x, y, r, e: 0.6, ...o }; };
  t.circles.push(
    C('mush1', 'element', K.bumpers.mush1, 0.95, { e: 0.9, kick: 'bumper' }),
    C('mush2', 'element', K.bumpers.mush2, 0.95, { e: 0.9, kick: 'bumper' }),
    C('mush3', 'element', K.bumpers.mush3, 0.95, { e: 0.9, kick: 'bumper' }),
    C('wizard', 'wizard', K.wizard, 0.8, { e: 0.55 }),
  );

  t.points.towerEject = [tower.x, tower.y - tower.r - 1.0];
  t.points.castleEject = F([930, 920]);
  t.decor = { tower };
  t.id = 'kingdom';
  t.rules = {
    skillTarget: 'mush1',
    rushElements: ['mush1', 'mush2', 'mush3', 'shield1', 'shield2', 'shield3'],
    dragonTargets: ['mush1', 'mush2', 'mush3', 'shield1', 'shield2', 'shield3', 'wizard', 'rampA', 'rampB', 'tower', 'castleGate'],
  };
  return t;
}
