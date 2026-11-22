// Live UI drawn over the painted HUD frame. The layer is laid out in painting pixels (1284 x 2281)
// and scaled onto the painting, so every label sits exactly where the painting expects it.
import { ART_W, ART_H, UI } from '../core/artmap.js';

export class HudLayer {
  constructor(root, title = 'Forest Pinball Saga') {
    this.root = root;
    root.style.width = `${ART_W}px`;
    root.style.height = `${ART_H}px`;
    root.innerHTML = `
      <div class="plaque-title" style="left:${UI.plaque.cx - UI.plaque.w / 2}px;top:${UI.plaque.cy - 34}px;width:${UI.plaque.w}px">${title}</div>
      <div class="mode-scene" id="mode-scene" aria-hidden="true">${Array.from({ length: 14 }, (_, i) => `<i style="--n:${i}"></i>`).join('')}</div>
      <div class="score" id="hud-score" style="left:${UI.score.cx - 400}px;top:${UI.score.cy - 70}px">0</div>
      <div class="mode" id="hud-mode" style="left:${UI.score.cx - 400}px;top:${UI.score.cy + 52}px"></div>
      <div class="val ball" id="hud-ball" style="left:${UI.values.ball[0]}px;top:${UI.values.ball[1] - 22}px">1</div>
      <div class="val mult" id="hud-mult" style="left:${UI.values.mult[0]}px;top:${UI.values.mult[1] - 22}px">1.0X</div>
      <div class="val guests" id="hud-guests" style="left:${UI.values.guests[0]}px;top:${UI.values.guests[1] - 22}px">0</div>
      <button class="art-btn" id="btn-pause" aria-label="Pause" style="left:${UI.pause.cx - UI.pause.size / 2}px;top:${UI.pause.cy - UI.pause.size / 2}px;width:${UI.pause.size}px;height:${UI.pause.size}px;background-image:url(art/btn-pause.png)"></button>
      <button class="art-btn" id="btn-camera" aria-label="Camera view" style="left:${UI.camera.cx - UI.camera.size / 2}px;top:${UI.camera.cy - UI.camera.size / 2}px;width:${UI.camera.size}px;height:${UI.camera.size}px;background-image:url(art/btn-camera.png)"><span id="cam-num">1</span></button>
      <button class="players-btn table-btn" id="btn-table" aria-label="Choose the table" style="left:${UI.tapToPlay.cx - 300}px;top:${UI.tapToPlay.cy - 250}px;width:600px">TABLE</button>
      <button class="players-btn" id="btn-players" aria-label="Number of players" style="left:${UI.tapToPlay.cx - 160}px;top:${UI.tapToPlay.cy - 150}px">1 PLAYER</button>
      <div class="tap-to-play" id="tap-to-play" style="left:${UI.tapToPlay.cx - 590}px;top:${UI.tapToPlay.cy - 46}px">TAP FLIPPERS TO PLAY</div>
      <div class="goal hidden" id="hud-goal" style="left:120px;top:${UI.tapToPlay.cy - 50}px"><b id="goal-text"></b><small id="goal-sub"></small></div>
      <div class="touch-launch" id="touch-launch" style="left:${UI.touchToLaunch.cx - 130}px;top:${UI.touchToLaunch.cy - 205}px">
        <svg viewBox="0 0 120 150" aria-hidden="true"><path d="M60 14 V 118" fill="none" stroke="currentColor" stroke-width="13" stroke-linecap="round"/><path d="M28 88 L60 124 L92 88" fill="none" stroke="currentColor" stroke-width="13" stroke-linecap="round" stroke-linejoin="round"/></svg>
        <span>PULL DOWN<br>&amp; RELEASE</span>
      </div>`;
    this.el = (id) => root.querySelector('#' + id);
  }

  /** place the layer onto the painting (stage layout in CSS px) */
  fit({ s, left, top }) {
    this.root.style.transform = `translate(${left}px, ${top}px) scale(${s})`;
  }

  set(id, text) { const e = this.el(id); if (e && e.textContent !== text) e.textContent = text; }
}
