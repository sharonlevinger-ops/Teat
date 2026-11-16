// Shared helpers: DOM, dates, dialogs, toasts.
import { icon } from './icons.js';

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

export const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));

export const pad = (n) => String(n).padStart(2, '0');
export const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const parseYmd = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
export const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
export const startOfWeek = (d) => addDays(d, -d.getDay());
export const todayStr = () => ymd(new Date());

export const HEB_DAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
export const HEB_DAYS_SHORT = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'];
export const HEB_MONTHS = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];

export function fmtDateLong(s) {
  const d = typeof s === 'string' ? parseYmd(s) : s;
  return `יום ${HEB_DAYS[d.getDay()]}, ${d.getDate()} ב${HEB_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}
export function fmtDateShort(s) {
  const d = typeof s === 'string' ? parseYmd(s) : s;
  const t = todayStr();
  const ds = ymd(d);
  if (ds === t) return 'היום';
  if (ds === ymd(addDays(new Date(), 1))) return 'מחר';
  if (ds === ymd(addDays(new Date(), -1))) return 'אתמול';
  return `${HEB_DAYS_SHORT[d.getDay()]} ${d.getDate()}/${d.getMonth() + 1}`;
}
export const daysUntil = (s) => Math.round((parseYmd(s) - parseYmd(todayStr())) / 86400000);

export function haptic(ms = 10) { try { navigator.vibrate?.(ms); } catch { /* iOS ignores */ } }

/* ---------- toast ---------- */
let toastTimer;
export function toast(msg, ms = 2200) {
  let el = $('#toast');
  if (!el) { el = document.createElement('div'); el.id = 'toast'; el.setAttribute('role', 'status'); document.body.appendChild(el); }
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), ms);
}

/* ---------- bottom sheet ---------- */
const sheetStack = [];
export function openSheet({ title = '', body = '', actions = '', onClose, full = false, className = '' } = {}) {
  const wrap = document.createElement('div');
  wrap.className = 'sheet-backdrop';
  wrap.innerHTML = `
    <div class="sheet ${full ? 'sheet-full' : ''} ${className}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <div class="sheet-grabber"></div>
      <div class="sheet-head">
        <button class="btn-text sheet-close" data-close>${actions ? 'ביטול' : 'סגירה'}</button>
        <h2 class="sheet-title">${esc(title)}</h2>
        <div class="sheet-actions">${actions}</div>
      </div>
      <div class="sheet-body"></div>
    </div>`;
  const bodyEl = wrap.querySelector('.sheet-body');
  if (typeof body === 'string') bodyEl.innerHTML = body; else if (body) bodyEl.appendChild(body);
  document.body.appendChild(wrap);
  requestAnimationFrame(() => wrap.classList.add('open'));
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    wrap.classList.remove('open');
    const i = sheetStack.indexOf(api); if (i >= 0) sheetStack.splice(i, 1);
    setTimeout(() => wrap.remove(), 260);
    onClose?.();
  };
  wrap.addEventListener('click', (e) => {
    if (e.target === wrap || e.target.closest('[data-close]')) close();
  });
  // swipe down on grabber/head to close
  const head = wrap.querySelector('.sheet-head');
  const grab = wrap.querySelector('.sheet-grabber');
  let y0 = null;
  const sheetEl = wrap.querySelector('.sheet');
  [head, grab].forEach((h) => {
    h.addEventListener('touchstart', (e) => { y0 = e.touches[0].clientY; }, { passive: true });
    h.addEventListener('touchmove', (e) => {
      if (y0 == null) return;
      const dy = Math.max(0, e.touches[0].clientY - y0);
      sheetEl.style.transform = `translateY(${dy}px)`;
    }, { passive: true });
    h.addEventListener('touchend', (e) => {
      const dy = e.changedTouches[0].clientY - (y0 ?? 0);
      sheetEl.style.transform = '';
      y0 = null;
      if (dy > 90) close();
    });
  });
  const api = { el: wrap, body: bodyEl, sheet: sheetEl, close };
  sheetStack.push(api);
  return api;
}
export const closeAllSheets = () => [...sheetStack].forEach((s) => s.close());

/* ---------- dialogs ---------- */
export function confirmDialog(message, { okText = 'אישור', danger = false } = {}) {
  return new Promise((resolve) => {
    const wrap = document.createElement('div');
    wrap.className = 'alert-backdrop';
    wrap.innerHTML = `<div class="alert" role="alertdialog" aria-modal="true">
      <p>${esc(message)}</p>
      <div class="alert-btns"><button class="alert-btn" data-v="0">ביטול</button><button class="alert-btn ${danger ? 'danger' : 'strong'}" data-v="1">${esc(okText)}</button></div>
    </div>`;
    document.body.appendChild(wrap);
    requestAnimationFrame(() => wrap.classList.add('open'));
    wrap.addEventListener('click', (e) => {
      const b = e.target.closest('[data-v]');
      if (!b) return;
      wrap.remove();
      resolve(b.dataset.v === '1');
    });
  });
}

export function promptDialog(title, value = '', { placeholder = '', okText = 'שמירה', type = 'text', inputmode = '' } = {}) {
  return new Promise((resolve) => {
    const wrap = document.createElement('div');
    wrap.className = 'alert-backdrop';
    wrap.innerHTML = `<form class="alert" role="alertdialog" aria-modal="true">
      <p><strong>${esc(title)}</strong></p>
      <input class="input" name="v" type="${esc(type)}" ${inputmode ? `inputmode="${esc(inputmode)}"` : ''} value="${esc(value)}" placeholder="${esc(placeholder)}" autocomplete="off">
      <div class="alert-btns"><button type="button" class="alert-btn" data-cancel>ביטול</button><button class="alert-btn strong">${esc(okText)}</button></div>
    </form>`;
    document.body.appendChild(wrap);
    requestAnimationFrame(() => wrap.classList.add('open'));
    const input = wrap.querySelector('input');
    setTimeout(() => input.focus(), 50);
    wrap.querySelector('[data-cancel]').onclick = () => { wrap.remove(); resolve(null); };
    wrap.querySelector('form').onsubmit = (e) => { e.preventDefault(); const v = input.value.trim(); wrap.remove(); resolve(v || null); };
  });
}

export function emptyState(iconName, text) {
  return `<div class="empty">${icon(iconName, 36)}<p>${esc(text)}</p></div>`;
}

/* ---------- image compression ---------- */
export async function compressImage(file, maxW = 1600, quality = 0.78) {
  const bmp = await loadImage(file);
  const scale = Math.min(1, maxW / bmp.width);
  const w = Math.round(bmp.width * scale), h = Math.round(bmp.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(bmp, 0, 0, w, h);
  bmp.close?.();
  const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', quality));
  return { blob, width: w, height: h };
}

async function loadImage(file) {
  if (window.createImageBitmap) {
    try { return await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch { /* fall through */ }
  }
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = (e) => { URL.revokeObjectURL(url); reject(e); };
    img.src = url;
  });
}

export function blobToDataURL(blob) {
  return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(blob); });
}
export async function dataURLToBlob(url) { return (await fetch(url)).blob(); }
