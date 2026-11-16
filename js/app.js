// יומן 2.0 – app shell: lock, tabs, FAB, auto-lock, service worker.
import * as auth from './auth.js';
import { pinPad } from './lock.js';
import { loadAll, subscribe } from './store.js';
import { requestPersistence } from './db.js';
import { icon } from './icons.js';
import { $, closeAllSheets, toast } from './util.js';
import calendar from './views/calendar.js';
import tasks from './views/tasks.js';
import documents from './views/documents.js';
import vault from './views/vault.js';
import addresses from './views/addresses.js';
import { openSettings, exportBackup, backupDue, snoozeBackup, lastBackupLabel } from './views/settings.js';
import { openVoice } from './voice.js';

const VIEWS = { calendar, tasks, addresses, documents, vault };
const TABS = [
  ['calendar', 'יומן', 'calendar'],
  ['tasks', 'משימות', 'tasks'],
  ['addresses', 'כתובות', 'pin'],
  ['documents', 'מסמכים', 'folder'],
  ['vault', 'סיסמאות', 'key'],
];
const AUTO_LOCK_MS = 60 * 1000;

let current = localStorage.getItem('yoman2.tab') || 'calendar';
if (!VIEWS[current]) current = 'calendar';
let locked = true;
let hiddenAt = 0;

/* ---------- theme ---------- */
export function applyTheme() {
  const t = localStorage.getItem('yoman2.theme') || 'light';
  const dark = t === 'dark' || (t === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#000000' : '#F2F2F7');
}
matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', applyTheme);

/* ---------- shell ---------- */
function renderShell() {
  $('#app').innerHTML = `
    <header class="topbar" id="topbar"></header>
    <div id="backupBanner"></div>
    <main id="view" tabindex="-1"></main>
    <button class="fab" id="fab" aria-label="הקלטה קולית">${icon('mic', 22)}<span>הקלטה</span></button>
    <nav class="tabbar" role="tablist">
      ${TABS.map(([id, label, ic]) => `<button class="tab" role="tab" data-tab="${id}">${icon(ic, 25)}<span>${label}</span></button>`).join('')}
    </nav>`;
  $('.tabbar').addEventListener('click', (e) => {
    const b = e.target.closest('[data-tab]');
    if (b) switchTab(b.dataset.tab);
  });
  $('#fab').addEventListener('click', () => openVoice({ autoStart: true }));
}

const scrollPos = {};
function switchTab(id) {
  if (id === current) { $('#view').scrollTo({ top: 0, behavior: 'smooth' }); return; }
  scrollPos[current] = $('#view').scrollTop;
  closeAllSheets();
  VIEWS[current].leave?.();
  current = id;
  localStorage.setItem('yoman2.tab', id);
  render(true);
}

export function render(tabChanged = false) {
  if (locked) return;
  const view = VIEWS[current];
  document.querySelectorAll('.tab').forEach((t) => {
    const on = t.dataset.tab === current;
    t.classList.toggle('active', on);
    t.setAttribute('aria-selected', on);
  });
  let viewEl = $('#view');
  if (tabChanged) { // fresh element → listeners from the previous tab are dropped
    const fresh = document.createElement('main');
    fresh.id = 'view';
    fresh.tabIndex = -1;
    viewEl.replaceWith(fresh);
    viewEl = fresh;
  }
  const keep = tabChanged ? (scrollPos[current] || 0) : viewEl.scrollTop;
  $('#topbar').innerHTML = `<h1>${view.title}</h1>${view.headerActions?.() || ''}<button class="icon-btn" data-settings aria-label="הגדרות">${icon('settings', 20)}</button>`;
  $('#topbar [data-settings]').onclick = () => openSettings();
  renderBackupBanner();
  view.bindHeader?.($('#topbar'));
  view.render(viewEl);
  viewEl.scrollTop = keep;
  if (tabChanged) view.enter?.(viewEl);
}

/* ---------- weekly backup reminder ---------- */
function renderBackupBanner() {
  const el = $('#backupBanner');
  if (!backupDue()) { el.innerHTML = ''; return; }
  el.innerHTML = `<div class="backup-banner" role="status">
    <span class="bb-icon">${icon('upload', 20)}</span>
    <div class="grow"><strong>הגיע הזמן לגבות</strong><div class="meta">גיבוי אחרון: ${lastBackupLabel()}</div></div>
    <button class="btn" data-bb-now>לגבות</button>
    <button class="bb-x" data-bb-later aria-label="אחר כך">${icon('x', 18)}</button></div>`;
  el.querySelector('[data-bb-now]').onclick = async () => { if (await exportBackup()) renderBackupBanner(); };
  el.querySelector('[data-bb-later]').onclick = () => { snoozeBackup(); renderBackupBanner(); };
}

/* ---------- locking ---------- */
async function lock() {
  if (locked && document.querySelector('.lock')) return;
  locked = true;
  closeAllSheets();
  document.querySelectorAll('.viewer').forEach((v) => v.remove());
  VIEWS.vault.leave?.();
  await pinPad({ mode: 'unlock' });
  locked = false;
  render(true);
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    hiddenAt = Date.now();
    VIEWS.vault.leave?.(); // vault always requires re-auth
    if (current === 'vault' && !locked) render();
  } else if (!locked && auth.isSetUp() && hiddenAt && Date.now() - hiddenAt > AUTO_LOCK_MS) {
    lock();
  }
});

document.addEventListener('yoman-lock', () => lock());

/* ---------- boot ---------- */
async function boot() {
  applyTheme();
  renderShell();
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
  requestPersistence();
  subscribe(() => render());

  if (!auth.isSetUp()) {
    await pinPad({ mode: 'setup' });
    toast('הקוד נשמר ✓');
  } else {
    await pinPad({ mode: 'unlock' });
  }
  locked = false;
  await loadAll();
  render(true);

  // offer Face ID once after first setup
  if (!auth.bioEnrolled() && !localStorage.getItem('yoman2.bioOffered') && await auth.bioSupported()) {
    localStorage.setItem('yoman2.bioOffered', '1');
    setTimeout(() => openSettings({ highlightBio: true }), 600);
  }
}

boot();
