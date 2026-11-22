// The problem report's snapshot: the WebGL table with the live HUD drawn on top (score, values, mode line,
// goal line, goal arrow) + the game state, exactly as the player saw it when pausing.
import { UI } from '../core/artmap.js';
import { GOAL_AT } from './messages.js';
import { buildReport } from './report.js';

function composeShot(stage, sim, hud) {
  const gl = stage.renderer.domElement, c = document.createElement('canvas');
  c.width = gl.width; c.height = gl.height;
  const g = c.getContext('2d');
  g.drawImage(gl, 0, 0);
  const L = stage.layout, k = gl.width / L.W; // CSS px -> canvas px
  const at = (x, y) => [(L.left + x * L.s) * k, (L.top + y * L.s) * k];
  const text = (str, x, y, px, color, align = 'center') => {
    if (!str) return;
    const [sx, sy] = at(x, y);
    g.font = `700 ${px * L.s * k}px Cinzel, Georgia, serif`;
    g.textAlign = align; g.textBaseline = 'middle';
    g.lineWidth = 3 * L.s * k; g.strokeStyle = 'rgba(0,0,0,0.85)'; g.strokeText(str, sx, sy);
    g.fillStyle = color; g.fillText(str, sx, sy);
  };
  const r = sim.rules;
  text('Forest Pinball Saga', UI.plaque.cx, UI.plaque.cy, 46, '#edc35c');
  text(r.score.toLocaleString('en-US'), UI.score.cx, 226, 104, '#f6cf5a');
  text(hud.el('hud-mode').textContent, UI.score.cx, 304, 27, '#c8f2ff');
  text(String(r.ball), UI.values.ball[0], UI.values.ball[1], 36, '#c6ecb0', 'left');
  text(r.chapterMult.toFixed(1) + 'X', UI.values.mult[0], UI.values.mult[1], 36, '#f6e2a8', 'left');
  text(String(r.guests), UI.values.guests[0], UI.values.guests[1], 36, '#9fb6ff', 'left');
  const goal = r.goal;
  if (goal) {
    text(goal.text, 565, UI.tapToPlay.cy - 26, 36, '#f3dda2');
    text(goal.sub, 565, UI.tapToPlay.cy + 16, 28, '#c8f2ff');
    if (goal.target && GOAL_AT[goal.target]) {
      const [ax, ay] = stage.artToScreen(...GOAL_AT[goal.target]), s = stage.tableXf.s * k; // the arrow rides on the table
      g.save(); g.translate(ax * k, ay * k); g.scale(s, s);
      g.beginPath(); g.moveTo(0, 0); g.lineTo(-34, -44); g.lineTo(-14, -44); g.lineTo(-14, -92); g.lineTo(14, -92); g.lineTo(14, -44); g.lineTo(34, -44); g.closePath();
      g.fillStyle = '#ffe27a'; g.fill(); g.lineWidth = 4; g.strokeStyle = '#3a2208'; g.stroke(); g.restore();
    }
  }
  return c.toDataURL('image/jpeg', 0.82);
}

/** { shot: data URL or null, data: plain report object } */
export function captureProblemReport({ stage, sim, hud, eventLog, view, version }) {
  let shot = null;
  try { stage.render(); shot = composeShot(stage, sim, hud); } catch { /* screenshot unavailable */ }
  const L = stage.layout;
  return {
    shot,
    data: buildReport(sim, {
      version, view, events: eventLog.items.slice(),
      device: { ua: navigator.userAgent, screen: `${window.innerWidth}x${window.innerHeight}@${window.devicePixelRatio}`, safe: L.safe, pixelRatio: stage.renderer.getPixelRatio() },
    }),
  };
}
