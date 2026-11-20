// Forest Pinball Saga – Step 1: the painted table on screen, the live HUD and the calibration overlay.
import { Stage } from './render/stage.js';
import { HudLayer } from './ui/hud.js';

async function boot() {
  if (document.fonts && document.fonts.load) await Promise.race([document.fonts.load('700 40px "Cinzel"'), new Promise((r) => setTimeout(r, 1200))]);
  const stage = await Stage.load(document.getElementById('stage'), window.__ART_BASE__ || 'art/');
  const hud = new HudLayer(document.getElementById('hud-layer'));
  if (window.__ART_URLS__) { // single-file build: images are embedded
    hud.root.querySelector('#btn-pause').style.backgroundImage = `url(${window.__ART_URLS__['btn-pause.png']})`;
    hud.root.querySelector('#btn-camera').style.backgroundImage = `url(${window.__ART_URLS__['btn-camera.png']})`;
  }

  const layout = () => { hud.fit(stage.resize()); stage.render(); };
  layout();
  window.addEventListener('resize', layout);
  window.addEventListener('orientationchange', () => setTimeout(layout, 300));

  const toggle = document.getElementById('calib-toggle');
  const setCalib = (on) => { stage.setCalibration(on); toggle.setAttribute('aria-pressed', String(on)); stage.render(); };
  toggle.addEventListener('click', () => setCalib(toggle.getAttribute('aria-pressed') !== 'true'));
  if (location.hash === '#calib') setCalib(true);

  // camera button cycles the view number (the views themselves arrive with gameplay in Step 2)
  hud.el('btn-camera').addEventListener('click', () => hud.set('cam-num', hud.el('cam-num').textContent === '1' ? '2' : '1'));

  window.__saga = { stage, hud };
}

boot().catch((e) => {
  console.error(e);
  document.body.insertAdjacentHTML('beforeend', `<p style="position:fixed;inset:auto 0 40% 0;text-align:center;color:#fff;font:16px sans-serif">Could not start: ${String(e && e.message || e)}</p>`);
});
