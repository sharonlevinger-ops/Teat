// Tab 4 – Passwords & vehicle codes vault. Every entry is AES-GCM encrypted with
// the vault data key; entering the tab always requires Face ID or PIN again.
import { db } from '../db.js';
import { encryptJSON, decryptJSON, randBytes } from '../crypto.js';
import { pinPad } from '../lock.js';
import { icon } from '../icons.js';
import { notify } from '../store.js';
import { esc, uid, openSheet, confirmDialog, toast, haptic, emptyState } from '../util.js';

let key = null;
let entries = []; // decrypted, memory only
let query = '';
const revealed = new Set();
let viewEl = null;
let prompting = false;

const CATS = {
  car: { label: 'רכב', icon: 'car', color: '#5856D6' },
  login: { label: 'כניסה לאתר / אפליקציה', icon: 'globe', color: '#007AFF' },
  pin: { label: 'קוד / PIN', icon: 'hash', color: '#FF9500' },
  card: { label: 'כרטיס', icon: 'card', color: '#34C759' },
  other: { label: 'אחר', icon: 'key', color: '#8E8E93' },
};
const FIELDS = {
  car: [['plate', 'מספר רישוי'], ['secret', 'קוד רכב / אימובילייזר', true], ['username', 'דגם / פרטים']],
  login: [['username', 'שם משתמש / מייל'], ['secret', 'סיסמה', true], ['url', 'אתר']],
  pin: [['secret', 'קוד', true], ['username', 'עבור']],
  card: [['username', 'מספר כרטיס'], ['secret', 'קוד / CVV', true]],
  other: [['username', 'פרט'], ['secret', 'סוד', true]],
};

async function unlock() {
  if (prompting) return;
  prompting = true;
  try {
    const k = await pinPad({ mode: 'vault', overlay: true, subtitle: 'אימות נוסף לכניסה לכספת' });
    if (!k) return;
    key = k;
    const rows = await db.all('vault');
    entries = [];
    for (const r of rows) {
      try { entries.push({ id: r.id, updatedAt: r.updatedAt, ...(await decryptJSON(key, r.enc)) }); } catch { /* skip corrupt */ }
    }
  } finally {
    prompting = false;
    notify(); // redraw header (+ button) and body
  }
}

async function persist(entry) {
  const { id, updatedAt: _u, ...data } = entry;
  const rec = { id: id || uid(), updatedAt: Date.now(), enc: await encryptJSON(key, data) };
  await db.put('vault', rec);
  const full = { ...data, id: rec.id, updatedAt: rec.updatedAt };
  const i = entries.findIndex((e) => e.id === rec.id);
  if (i >= 0) entries[i] = full; else entries.push(full);
  return full;
}

let clipTimer;
async function copy(text) {
  try {
    await navigator.clipboard.writeText(text);
    haptic();
    toast('הועתק ✓ · יימחק מהלוח בעוד 30 שניות');
    clearTimeout(clipTimer);
    clipTimer = setTimeout(() => { navigator.clipboard.writeText(' ').catch(() => {}); }, 30000);
  } catch {
    toast('לא ניתן להעתיק');
  }
}

function card(e) {
  const c = CATS[e.cat] || CATS.other;
  const fields = (FIELDS[e.cat] || FIELDS.other).filter(([k]) => e[k]);
  return `<div class="card vault-card">
    <div class="vc-head">
      <span class="vc-icon" style="background:${c.color}">${icon(c.icon, 21)}</span>
      <div class="vc-title">${esc(e.title)}<div class="vc-sub">${esc(c.label)}</div></div>
      <button class="nav-btn" data-edit="${e.id}" aria-label="עריכה">${icon('pencil', 18)}</button>
    </div>
    ${fields.map(([k, label, secret]) => {
      const show = !secret || revealed.has(e.id);
      return `<div class="vfield"><div class="grow"><div class="lbl">${esc(label)}</div>
        <div class="val">${show ? esc(e[k]) : '••••••••'}</div></div>
        ${secret ? `<button data-reveal="${e.id}" aria-label="${show ? 'הסתרה' : 'הצגה'}">${icon(show ? 'eye-off' : 'eye', 19)}</button>` : ''}
        <button data-copy="${e.id}" data-field="${k}" aria-label="העתק">${icon('copy', 18)}</button></div>`;
    }).join('')}
    ${e.notes ? `<div class="footnote" style="white-space:pre-wrap">${esc(e.notes)}</div>` : ''}
  </div>`;
}

function render(el) {
  viewEl = el;
  if (!key) {
    el.innerHTML = `<div class="vault-locked">${icon('lock', 46)}
      <div><strong style="color:var(--text);font-size:18px">הכספת נעולה</strong><br>נדרש אימות Face ID או קוד בכל כניסה</div>
      <button class="btn" data-unlock>${icon('faceid', 20)} פתיחת הכספת</button></div>`;
    return;
  }
  const q = query.trim().toLowerCase();
  const list = entries
    .filter((e) => !q || [e.title, e.username, e.plate, e.url, e.notes].some((v) => (v || '').toLowerCase().includes(q)))
    .sort((a, b) => (a.cat === 'car' ? 0 : 1) - (b.cat === 'car' ? 0 : 1) || a.title.localeCompare(b.title, 'he'));
  el.innerHTML = `
    <label class="search">${icon('search', 17)}<input type="search" placeholder="חיפוש" value="${esc(query)}" data-search></label>
    <div style="height:10px"></div>
    ${entries.length === 0 ? `${emptyState('key', 'הכספת ריקה')}
      <div style="display:flex;flex-direction:column;gap:8px">
        <button class="btn secondary" data-template="car-a">${icon('car', 18)} הוספת רכב א׳ – פרטי רכב וקוד</button>
        <button class="btn secondary" data-template="car-b">${icon('car', 18)} הוספת רכב ב׳ – פרטי רכב וקוד</button>
        <button class="btn secondary" data-template="login">${icon('globe', 18)} הוספת סיסמה</button>
      </div>` : list.map(card).join('') || '<div class="empty"><p>לא נמצאו תוצאות</p></div>'}
    <p class="footnote" style="text-align:center;margin-top:16px">${icon('shield', 13)} מוצפן במכשיר (AES-256-GCM). הכספת ננעלת ביציאה מהלשונית.</p>`;
}

function editEntry(entry, preset = {}) {
  const e = entry ? { ...entry } : { cat: 'login', title: '', ...preset };
  const body = document.createElement('div');
  const draw = () => {
    body.innerHTML = `
      <div class="field"><label>סוג</label><div class="segmented" style="grid-auto-columns:auto">${Object.entries(CATS).map(([k, c]) => `<button data-cat="${k}" class="${e.cat === k ? 'active' : ''}">${icon(c.icon, 15)}</button>`).join('')}</div>
        <div class="footnote">${esc(CATS[e.cat].label)}</div></div>
      <div class="field"><label>כותרת</label><input class="input" name="title" value="${esc(e.title || '')}" placeholder="${e.cat === 'car' ? 'רכב א׳ – טויוטה' : 'למשל: בנק'}"></div>
      ${FIELDS[e.cat].map(([k, label, secret]) => `<div class="field"><label>${esc(label)}</label>
        <div style="display:flex;gap:8px"><input class="input" name="${k}" value="${esc(e[k] || '')}" dir="ltr" style="text-align:right" autocomplete="off" autocapitalize="off" spellcheck="false" ${secret ? 'type="text"' : ''}>
        ${secret ? `<button class="btn secondary" data-gen="${k}" style="height:46px;padding:0 12px" aria-label="יצירת סיסמה">${icon('key', 18)}</button>` : ''}</div></div>`).join('')}
      <div class="field"><label>הערות</label><textarea class="textarea" name="notes">${esc(e.notes || '')}</textarea></div>
      ${entry ? `<div style="margin-top:20px"><button class="btn danger block" data-del>${icon('trash', 18)} מחיקה</button></div>` : ''}`;
  };
  const sync = () => body.querySelectorAll('input[name], textarea[name]').forEach((i) => { e[i.name] = i.value.trim(); });
  draw();
  const sh = openSheet({ title: entry ? 'עריכה' : 'פריט חדש', body, full: true, actions: '<button class="btn-text strong" data-save>שמירה</button>' });
  body.addEventListener('click', async (ev) => {
    const c = ev.target.closest('[data-cat]');
    if (c) { sync(); e.cat = c.dataset.cat; draw(); return; }
    const g = ev.target.closest('[data-gen]');
    if (g) {
      const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%&*';
      const bytes = randBytes(16);
      body.querySelector(`[name="${g.dataset.gen}"]`).value = Array.from(bytes, (b) => chars[b % chars.length]).join('');
      return;
    }
    if (ev.target.closest('[data-del]')) {
      if (await confirmDialog('למחוק את הפריט מהכספת?', { okText: 'מחיקה', danger: true })) {
        await db.del('vault', entry.id);
        entries = entries.filter((x) => x.id !== entry.id);
        sh.close();
        render(viewEl);
      }
    }
  });
  sh.el.querySelector('[data-save]').onclick = async () => {
    sync();
    if (!e.title) { toast('נא להזין כותרת'); return; }
    if (!key) { toast('הכספת ננעלה'); sh.close(); return; }
    await persist(e);
    sh.close();
    render(viewEl);
    toast('נשמר בכספת');
  };
}

export default {
  title: 'סיסמאות',
  headerActions: () => (key ? `<button class="icon-btn" data-add aria-label="פריט חדש">${icon('plus', 22)}</button>` : ''),
  bindHeader(h) { h.querySelector('[data-add]')?.addEventListener('click', () => editEntry(null)); },
  render(el) {
    render(el);
    if (el.dataset.bound) return;
    el.dataset.bound = '1';
    el.addEventListener('click', (ev) => {
      const t = (s) => ev.target.closest(s);
      let n;
      if (t('[data-unlock]')) { unlock(); return; }
      if ((n = t('[data-reveal]'))) { const id = n.dataset.reveal; revealed.has(id) ? revealed.delete(id) : revealed.add(id); render(el); return; }
      if ((n = t('[data-copy]'))) { const e = entries.find((x) => x.id === n.dataset.copy); if (e) copy(e[n.dataset.field] || ''); return; }
      if ((n = t('[data-edit]'))) { editEntry(entries.find((x) => x.id === n.dataset.edit)); return; }
      if ((n = t('[data-template]'))) {
        const tpl = { 'car-a': { cat: 'car', title: 'רכב א׳' }, 'car-b': { cat: 'car', title: 'רכב ב׳' }, login: { cat: 'login', title: '' } }[n.dataset.template];
        editEntry(null, tpl);
      }
    });
    el.addEventListener('input', (ev) => {
      if (ev.target.matches('[data-search]')) {
        query = ev.target.value;
        const pos = ev.target.selectionStart;
        render(el);
        const s = el.querySelector('[data-search]'); s.focus(); s.setSelectionRange(pos, pos);
      }
    });
  },
  enter(el) { if (!key) { viewEl = el; unlock(); } },
  leave() {
    key = null; entries = []; revealed.clear(); query = '';
  },
};
