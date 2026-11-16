// Tab – Addresses: kids' classes, friends' parents, family, doctors… with one-tap navigation & call.
import { state, saveAddress, deleteAddress } from '../store.js';
import { openNavigate } from '../maps.js';
import { icon } from '../icons.js';
import { esc, openSheet, confirmDialog, toast, emptyState } from '../util.js';

export const ADDR_CATS = {
  family: { label: 'משפחה', icon: 'home', color: '#FF9500' },
  friends: { label: 'חברים והורים של חברים', icon: 'users', color: '#5856D6' },
  classes: { label: 'חוגים ובית ספר', icon: 'star', color: '#0D9488' },
  health: { label: 'רופאים ובריאות', icon: 'heart', color: '#FF3B30' },
  work: { label: 'עבודה ושירותים', icon: 'briefcase', color: '#007AFF' },
  other: { label: 'אחר', icon: 'pin', color: '#8E8E93' },
};

let query = '';
let catFilter = 'all';

const telHref = (p) => `tel:${String(p).replace(/[^\d+]/g, '')}`;

function card(a) {
  const c = ADDR_CATS[a.cat] || ADDR_CATS.other;
  return `<div class="card vault-card">
    <div class="vc-head">
      <span class="vc-icon" style="background:${c.color}">${icon(c.icon, 20)}</span>
      <div class="vc-title">${esc(a.name)}<div class="vc-sub">${esc(c.label)}</div></div>
      <button class="nav-btn" data-edit="${a.id}" aria-label="עריכה">${icon('pencil', 18)}</button>
    </div>
    <button class="vfield" data-nav="${a.id}" style="width:100%;text-align:start">
      <span style="color:var(--red)">${icon('pin', 19)}</span>
      <div class="grow" style="font-size:15px">${esc(a.address)}</div>
      <span class="badge blue">${icon('navigation', 12)} ניווט</span>
    </button>
    ${a.phone ? `<a class="vfield" href="${esc(telHref(a.phone))}" style="color:inherit;text-decoration:none">
      <span style="color:var(--green)">${icon('phone', 18)}</span><div class="grow" style="direction:ltr;text-align:right;font-weight:600">${esc(a.phone)}</div>
      <span class="badge" style="background:rgba(52,199,89,.14);color:var(--green)">חיוג</span></a>` : ''}
    ${a.notes ? `<div class="footnote" style="white-space:pre-wrap">${esc(a.notes)}</div>` : ''}
  </div>`;
}

export function editAddress(addr, preset = {}, onSaved) {
  const a = addr ? { ...addr } : { cat: 'classes', name: '', address: '', phone: '', notes: '', ...preset };
  const body = document.createElement('div');
  const draw = () => {
    body.innerHTML = `
      <div class="field"><label>קטגוריה</label><div style="display:flex;flex-wrap:wrap;gap:6px">${Object.entries(ADDR_CATS).map(([k, c]) => `
        <button class="badge" data-cat="${k}" style="font-size:13px;padding:7px 11px;${a.cat === k ? `background:${c.color};color:#fff` : 'background:var(--card-2);color:var(--text-2)'}">${icon(c.icon, 13)} ${esc(c.label)}</button>`).join('')}</div></div>
      <div class="field"><label>שם</label><input class="input" name="name" value="${esc(a.name)}" placeholder="למשל: חוג התעמלות של נועה"></div>
      <div class="field"><label>כתובת</label><input class="input" name="address" value="${esc(a.address)}" placeholder="רחוב, מספר, עיר" autocomplete="street-address"></div>
      <div class="field"><label>טלפון (אופציונלי)</label><input class="input" name="phone" type="tel" inputmode="tel" dir="ltr" style="text-align:right" value="${esc(a.phone)}"></div>
      <div class="field"><label>הערות</label><textarea class="textarea" name="notes" placeholder="למשל: קומה 2, קוד לשער 1234#, חניה מאחור">${esc(a.notes)}</textarea></div>
      ${addr ? `<div style="margin-top:20px"><button class="btn danger block" data-del>${icon('trash', 18)} מחיקה</button></div>` : ''}`;
  };
  const sync = () => body.querySelectorAll('[name]').forEach((i) => { a[i.name] = i.value.trim(); });
  draw();
  const sh = openSheet({ title: addr ? 'עריכת כתובת' : 'כתובת חדשה', body, full: true, actions: '<button class="btn-text strong" data-save>שמירה</button>' });
  body.addEventListener('click', async (e) => {
    const c = e.target.closest('[data-cat]');
    if (c) { sync(); a.cat = c.dataset.cat; draw(); return; }
    if (e.target.closest('[data-del]')) {
      if (await confirmDialog('למחוק את הכתובת?', { okText: 'מחיקה', danger: true })) { await deleteAddress(addr.id); sh.close(); toast('נמחקה'); }
    }
  });
  sh.el.querySelector('[data-save]').onclick = async () => {
    sync();
    if (!a.name || !a.address) { toast('נא להזין שם וכתובת'); return; }
    const saved = await saveAddress(a);
    sh.close();
    toast('הכתובת נשמרה');
    onSaved?.(saved);
  };
  if (!addr) setTimeout(() => body.querySelector('[name="name"]')?.focus(), 350);
}

/** Picker used by the event sheet. */
export function pickAddress(onPick) {
  const body = document.createElement('div');
  let q = '';
  const draw = () => {
    const list = state.addresses.filter((a) => !q || `${a.name} ${a.address}`.includes(q)).sort((x, y) => x.name.localeCompare(y.name, 'he'));
    body.innerHTML = `
      <label class="search">${icon('search', 17)}<input type="search" placeholder="חיפוש כתובת" value="${esc(q)}" data-q></label>
      <div class="list" style="margin-top:10px">
        ${list.map((a) => { const c = ADDR_CATS[a.cat] || ADDR_CATS.other; return `<button class="row tappable" data-pick="${a.id}" style="width:100%">
          <span class="setting-icon" style="background:${c.color}">${icon(c.icon, 16)}</span>
          <div class="grow" style="text-align:start"><div>${esc(a.name)}</div><div class="meta">${esc(a.address)}</div></div></button>`; }).join('')}
        <button class="row tappable" data-new style="width:100%;color:var(--accent)">${icon('plus', 20)}<span>כתובת חדשה</span></button>
      </div>`;
  };
  draw();
  const sh = openSheet({ title: 'בחירת כתובת', body, full: true });
  body.addEventListener('input', (e) => {
    if (!e.target.matches('[data-q]')) return;
    q = e.target.value.trim();
    const pos = e.target.selectionStart;
    draw();
    const i = body.querySelector('[data-q]'); i.focus(); i.setSelectionRange(pos, pos);
  });
  body.addEventListener('click', (e) => {
    const p = e.target.closest('[data-pick]');
    if (p) { onPick(state.addresses.find((a) => a.id === p.dataset.pick)); sh.close(); return; }
    if (e.target.closest('[data-new]')) { sh.close(); editAddress(null, {}, onPick); }
  });
}

export default {
  title: 'כתובות',
  headerActions: () => `<button class="icon-btn" data-add aria-label="כתובת חדשה">${icon('plus', 22)}</button>`,
  bindHeader(h) { h.querySelector('[data-add]').onclick = () => editAddress(null); },
  render(el) {
    const q = query.trim();
    const used = Object.keys(ADDR_CATS).filter((k) => state.addresses.some((a) => a.cat === k));
    const list = state.addresses
      .filter((a) => (catFilter === 'all' || a.cat === catFilter) && (!q || `${a.name} ${a.address} ${a.phone} ${a.notes}`.includes(q)))
      .sort((x, y) => x.name.localeCompare(y.name, 'he'));
    el.innerHTML = state.addresses.length === 0 ? `
      ${emptyState('pin', 'עוד אין כתובות. שמרו כתובות של חוגים, משפחה וחברים – ונווטו אליהן בהקשה')}
      <div style="display:flex;flex-direction:column;gap:8px">
        <button class="btn secondary" data-tpl="classes">${icon('star', 18)} הוספת חוג / בית ספר</button>
        <button class="btn secondary" data-tpl="friends">${icon('users', 18)} הוספת הורים של חבר/ה</button>
        <button class="btn secondary" data-tpl="family">${icon('home', 18)} הוספת משפחה</button>
      </div>` : `
      <label class="search">${icon('search', 17)}<input type="search" placeholder="חיפוש שם, כתובת או טלפון" value="${esc(query)}" data-search></label>
      ${used.length > 1 ? `<div style="display:flex;gap:6px;overflow-x:auto;padding:10px 0 2px;-webkit-overflow-scrolling:touch">
        <button class="badge" data-filter="all" style="font-size:13px;padding:7px 12px;${catFilter === 'all' ? 'background:var(--accent);color:#fff' : 'background:var(--card);color:var(--text-2)'}">הכול</button>
        ${used.map((k) => `<button class="badge" data-filter="${k}" style="font-size:13px;padding:7px 12px;${catFilter === k ? `background:${ADDR_CATS[k].color};color:#fff` : 'background:var(--card);color:var(--text-2)'}">${esc(ADDR_CATS[k].label)}</button>`).join('')}
      </div>` : ''}
      <div style="height:10px"></div>
      ${list.map(card).join('') || '<div class="empty"><p>לא נמצאו תוצאות</p></div>'}`;

    if (el.dataset.bound) return;
    el.dataset.bound = '1';
    el.addEventListener('click', (e) => {
      const t = (s) => e.target.closest(s);
      let n;
      if ((n = t('[data-nav]'))) { const a = state.addresses.find((x) => x.id === n.dataset.nav); if (a) openNavigate(a.address, a.name); return; }
      if ((n = t('[data-edit]'))) { editAddress(state.addresses.find((x) => x.id === n.dataset.edit)); return; }
      if ((n = t('[data-filter]'))) { catFilter = n.dataset.filter; this.render(el); return; }
      if ((n = t('[data-tpl]'))) editAddress(null, { cat: n.dataset.tpl });
    });
    el.addEventListener('input', (e) => {
      if (!e.target.matches('[data-search]')) return;
      query = e.target.value;
      const pos = e.target.selectionStart;
      this.render(el);
      const s = el.querySelector('[data-search]'); s.focus(); s.setSelectionRange(pos, pos);
    });
  },
  leave() { query = ''; },
};
