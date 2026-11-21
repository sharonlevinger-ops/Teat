// "Report a problem": freezes what the player saw at the moment of pausing (screenshot of the table,
// every ball's position / speed / mode, the rules state, the last game events and the version) and hands
// it to the iPhone share sheet. Nothing is sent anywhere by the game itself.

const SKIP = new Set(['contact', 'flipper', 'score']); // too frequent to be useful in a report
const LOG_SIZE = 60;
const r2 = (v) => (typeof v === 'number' ? Math.round(v * 100) / 100 : v);

/** Keeps the last game events (type + small payload) with the simulation tick they happened on. */
export class EventLog {
  constructor(sim) {
    this.sim = sim;
    this.items = [];
    sim.bus.on('*', (type, p) => {
      if (SKIP.has(type)) return;
      const e = { tick: sim.tick, type };
      if (p && typeof p === 'object') {
        for (const [k, v] of Object.entries(p)) if (v === null || ['number', 'string', 'boolean'].includes(typeof v)) e[k] = r2(v);
      }
      this.items.push(e);
      if (this.items.length > LOG_SIZE) this.items.shift();
    });
  }
}

/** Plain-data snapshot of the game, safe to JSON-encode. */
export function buildReport(sim, extra = {}) {
  const r = sim.rules;
  return {
    app: 'Forest Pinball Saga',
    version: extra.version || '',
    time: new Date().toISOString(),
    device: extra.device || {},
    view: extra.view || 1,
    tick: sim.tick,
    rules: {
      state: r.state, score: r.score, ball: r.ball, chapter: r.stage.id, multiplier: r2(r.multiplier),
      wizardCharge: r.wizardCharge, doorOpenSec: r2(r.doorTicks / 120), multiball: r.multiball, mbSec: r2(r.mbTicks / 120),
      rushSec: r2(r.rushTicks / 120), combo: [...r.combo], chain: r.chain, kickbacks: { ...r.kickLit },
      ballSaveSec: r2(r.saveTicks / 120), skillArmed: r.skillArmed, goal: r.goal ? r.goal.text : null,
    },
    balls: sim.world.balls.filter((b) => b.active).map((b) => ({
      id: b.id, mode: b.mode, x: r2(b.x), y: r2(b.y), vx: r2(b.vx), vy: r2(b.vy), speed: r2(Math.hypot(b.vx, b.vy)),
      ...(b.mode === 'rail' ? { rail: b.railId, railS: r2(b.railS) } : {}),
    })),
    flippers: sim.world.flippers.map((f) => ({ side: f.side, pressed: !!f.pressed, angle: r2(f.angle) })),
    plunger: { pulling: sim.plunger.pulling, power: r2(sim.plunger.power) },
    events: extra.events || [],
  };
}

/** One-line human summary that goes into the share text. */
export function summary(rep) {
  const b = rep.balls.map((x) => `#${x.id} ${x.mode} (${x.x}, ${x.y}) v=${x.speed}`).join('; ') || 'no ball';
  return `Forest Pinball Saga ${rep.version} – problem report\nScore ${rep.rules.score}, ball ${rep.rules.ball}, chapter ${rep.rules.chapter}\nBalls: ${b}`;
}

function dataUrlToFile(url, name) {
  const [head, body] = url.split(',');
  const mime = head.slice(5, head.indexOf(';'));
  const bin = atob(body);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new File([bytes], name, { type: mime });
}

/** Called from the button tap (keeps the user gesture: no awaits before navigator.share). */
export function shareReport(rep, screenshotUrl) {
  const stamp = rep.time.replace(/[:.]/g, '-').slice(0, 19);
  const json = new File([JSON.stringify(rep, null, 2)], `saga-report-${stamp}.json`, { type: 'application/json' });
  const files = [json];
  if (screenshotUrl) { try { files.unshift(dataUrlToFile(screenshotUrl, `saga-report-${stamp}.jpg`)); } catch { /* no screenshot */ } }
  const text = summary(rep);
  if (navigator.share && navigator.canShare && navigator.canShare({ files })) return navigator.share({ files, text, title: 'Pinball report' }).then(() => 'shared', () => 'cancelled');
  if (navigator.share && navigator.canShare && navigator.canShare({ files: [json] })) return navigator.share({ files: [json], text }).then(() => 'shared', () => 'cancelled');
  // fallback (desktop browsers): download the files
  for (const f of files) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(f);
    a.download = f.name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
  return Promise.resolve('downloaded');
}
