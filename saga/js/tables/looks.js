// Presentation data of each table (painting pixels, 1284 × 2281): where the lights, arrows, lamps, bursts and
// fireworks go, which sprites are drawn over the ball, and which pictures make the table. The table is chosen
// once at start-up (setLook) before anything is built; every presentation module reads LOOK.
import { KINGDOM } from '../core/table-kingdom.js';

const glow = (x, y, r, color) => ({ x, y, r, color });

// shared lower playfield (both tables)
const LOWER_SPOTS = {
  slingL: glow(352, 1690, 170, 0x7dff8a), slingR: glow(928, 1690, 170, 0x7dff8a),
  kickback: glow(138, 1840, 110, 0x50ff80), kickbackR: glow(1142, 1840, 110, 0x50ff80),
  plunger: glow(1186, 1760, 120, 0x40ff90),
  pool: glow(630, 1410, 250, 0x40e0ff),
};
const LANE_AT = [[207, 1692], [259, 1692], [1019, 1692], [1074, 1692]];
const POOL_LAMPS = { pts: [[548, 1488], [600, 1497], [652, 1500], [704, 1497], [756, 1488]], cls: 'pool',
  count: (r, T) => (r.poolLit ? 5 : Math.round((r.poolCharge / Math.max(1, T.POOL_PASSES)) * 5)), flash: (r) => r.poolLit };
const WIZARD_LAMPS = (pts) => ({ pts, cls: 'wizard', count: (r) => (r.doorOpen ? 3 : r.wizardCharge), flash: (r) => r.doorOpen });

export const LOOKS = {
  forest: {
    id: 'forest',
    title: 'Forest Pinball Saga',
    art: { playfield: 'playfield.jpg', extTop: 'ext-top.jpg', extBottom: 'ext-bottom.jpg' },
    occluders: ['tower', 'wizard', 'mush1', 'mush2', 'mush3', 'crystal1', 'crystal2', 'potion', 'pedestal', 'slingL', 'slingR'],
    spots: {
      mush1: glow(337, 1295, 120, 0xff9a3a), mush2: glow(880, 1200, 115, 0xb070ff), mush3: glow(435, 765, 110, 0x40ffd8),
      crystal1: glow(230, 1080, 150, 0x60fff0), crystal2: glow(1140, 1320, 140, 0xffe060), potion: glow(1000, 605, 140, 0xb070ff),
      wizard: glow(760, 946, 90, 0xfff2a0), scoop: glow(395, 1222, 115, 0xffc040), rampA: glow(800, 640, 125, 0x90fff8),
      ...LOWER_SPOTS,
    },
    rushIds: ['mush1', 'mush2', 'mush3', 'crystal1', 'crystal2', 'potion'],
    dragonGlow: ['mush1', 'mush2', 'mush3', 'crystal1', 'crystal2', 'potion', 'wizard', 'rampA'],
    attract: ['slingL', 'slingR', 'kickback', 'kickbackR', 'mush1', 'pool', 'crystal2', 'mush2', 'scoop', 'crystal1', 'wizard', 'rampA', 'mush3', 'potion'],
    door: { x: 636, y: 921, w: 64, h: 84 },
    pool: { x: 630, y: 1425, rx: 162, ry: 50 },
    fireworks: { x: 632, y: 610 },
    fireTower: [632, 930],
    twinkles: [[230, 1080, 60], [1140, 1320, 50], [128, 1310, 30]],
    windows: [[642, 612, 46], [600, 708, 38], [674, 710, 38], [694, 800, 30]], // flickering tower windows
    bubbles: [992, 560], // potion bubbles
    rampEntrances: { rampA: [796, 660], rampB: [494, 724] },
    goalAt: { wizard: [834, 930], door: [640, 880], mush3: [432, 712], scoop: [395, 1182], rampA: [800, 612], pool: [630, 1340], rampB: [494, 676] },
    laneAt: LANE_AT,
    lamps: [
      WIZARD_LAMPS([[808, 1152], [836, 1156], [864, 1152]]),
      POOL_LAMPS,
      { pts: [[770, 706], [796, 712], [822, 712], [848, 706]], cls: 'crystal',
        count: (r, T) => (r.crystalLit ? 4 : Math.min(4, Math.round((r.crystalSeq.count / Math.max(1, T.CRYSTAL_SEQ)) * 4))), flash: (r) => r.crystalLit },
    ],
    lockWindows: [[590, 727], [707, 690]],
    dropTargets: [],
    gate: null,
    rushIcons: [['mush1', 'mush', 190, '#ff9a3a'], ['mush2', 'mush', 252, '#b070ff'], ['mush3', 'mush', 314, '#40ffd8'],
      ['crystal1', 'gem', 970, '#60fff0'], ['crystal2', 'gem', 1032, '#ffe060'], ['potion', 'potion', 1094, '#c080ff']],
  },

  kingdom: {
    id: 'kingdom',
    title: 'Forest Kingdom',
    // prototype art drawn from the table geometry (tools/greybox_kingdom.cjs) until the painting arrives
    art: { playfield: 'kingdom/playfield.jpg', extTop: 'ext-top.jpg', extBottom: 'ext-bottom.jpg' },
    occluders: [],
    spots: {
      mush1: glow(...KINGDOM.bumpers.mush1, 110, 0xff9a3a), mush2: glow(...KINGDOM.bumpers.mush2, 110, 0xb070ff), mush3: glow(...KINGDOM.bumpers.mush3, 110, 0x40ffd8),
      shield1: glow(974, 1086, 80, 0x7aa8ff), shield2: glow(1004, 1150, 80, 0x7aa8ff), shield3: glow(1034, 1214, 80, 0x7aa8ff),
      castleGate: glow(930, 840, 130, 0xffd36a), wizard: glow(...KINGDOM.wizard, 90, 0xfff2a0),
      scoop: glow(...KINGDOM.scoop, 115, 0xffc040), mine: glow(...KINGDOM.mineHole, 115, 0x9fffd0),
      rampA: glow(744, 820, 125, 0x90fff8), spinner: glow(...KINGDOM.spinner, 90, 0xffb0f0),
      ...LOWER_SPOTS,
    },
    rushIds: ['mush1', 'mush2', 'mush3', 'shield1', 'shield2', 'shield3'],
    dragonGlow: ['mush1', 'mush2', 'mush3', 'shield1', 'shield2', 'shield3', 'wizard', 'rampA', 'castleGate'],
    attract: ['slingL', 'slingR', 'kickback', 'kickbackR', 'pool', 'mine', 'scoop', 'shield3', 'shield2', 'shield1', 'wizard', 'castleGate', 'mush1', 'mush3', 'mush2', 'rampA', 'spinner'],
    door: { x: 330, y: 790, w: 64, h: 84 },
    pool: { x: 630, y: 1425, rx: 162, ry: 50 },
    fireworks: { x: 640, y: 640 },
    fireTower: [330, 760],
    twinkles: [[930, 720, 70], [330, 640, 40], [296, 1140, 50]],
    windows: [[300, 660, 30], [360, 660, 30], [880, 760, 30], [980, 760, 30]],
    bubbles: null,
    rampEntrances: { rampA: [744, 836], rampB: [506, 792] },
    goalAt: { wizard: [418, 860], door: [330, 740], mush1: [560, 640], scoop: [900, 1290], rampA: [744, 780], pool: [630, 1340], rampB: [506, 740], castle: [930, 790], mine: [296, 1170] },
    laneAt: LANE_AT,
    lamps: [
      WIZARD_LAMPS([[390, 990], [418, 996], [446, 990]]),
      POOL_LAMPS,
      { pts: [[900, 896], [930, 900], [960, 896]], cls: 'gate', count: (r) => (r.gateOpen ? 3 : r.gateHits), flash: (r) => r.gateOpen },
      { pts: [[212, 1300], [240, 1306], [268, 1310], [296, 1312], [324, 1310], [352, 1306], [380, 1300]], cls: 'dwarf', count: (r) => r.dwarves, flash: () => false },
    ],
    lockWindows: [[300, 660], [360, 660]],
    // live parts drawn over the prototype art: the prince's shields drop, the castle gate opens
    dropTargets: KINGDOM.shields.map((seg, i) => ({ id: `shield${i + 1}`, seg })),
    gate: { seg: KINGDOM.gate, top: 792 },
    rushIcons: [['mush1', 'mush', 190, '#ff9a3a'], ['mush2', 'mush', 252, '#b070ff'], ['mush3', 'mush', 314, '#40ffd8'],
      ['shield1', 'shield', 970, '#7aa8ff'], ['shield2', 'shield', 1032, '#7aa8ff'], ['shield3', 'shield', 1094, '#7aa8ff']],
  },
};

/** the active table's look (filled by setLook before the game is built) */
export const LOOK = { ...LOOKS.forest };
export function setLook(id) {
  for (const k of Object.keys(LOOK)) delete LOOK[k];
  Object.assign(LOOK, LOOKS[id] || LOOKS.forest);
  return LOOK;
}
