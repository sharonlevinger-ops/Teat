// Tab 1 – Smart calendar: daily timeline + weekly grid, Israeli holidays, nested sub-tasks.
import { state, eventsOn, tasksOfEvent, saveEvent, deleteEvent, saveTask, deleteTask, toggleTask } from '../store.js';
import { holidaysFor, hebrewDateLabel } from '../holidays.js';
import { icon } from '../icons.js';
import {
  esc, ymd, parseYmd, addDays, startOfWeek, todayStr, HEB_DAYS, HEB_DAYS_SHORT, HEB_MONTHS,
  fmtDateLong, openSheet, confirmDialog, toast, pad, haptic,
} from '../util.js';
import { openViewer } from './documents.js';
import { openVoice } from '../voice.js';
import { openNavigate } from '../maps.js';
import { pickAddress, editAddress } from './addresses.js';

const START_H = 6, END_H = 23;
// rotating the iPhone to landscape shows the whole week automatically
const landscapeMQ = matchMedia('(orientation: landscape) and (max-height: 520px)');
landscapeMQ.addEventListener?.('change', () => import('../store.js').then((m) => m.notify()));
const viewMode = () => (landscapeMQ.matches ? 'week' : mode);
let mode = localStorage.getItem('yoman2.calMode') || 'day';
let selected = todayStr();
let nowTimer;

const holidayChips = (date) => holidaysFor(parseYmd(date))
  .map((h) => `<span class="hol ${h.type}">${esc(h.name)}</span>`).join('');

function subtasksHTML(evId, limit = 99) {
  const ts = tasksOfEvent(evId);
  if (!ts.length) return '';
  return `<div class="subtasks">${ts.slice(0, limit).map((t) => `
    <div class="subtask" data-toggle="${t.id}" role="checkbox" aria-checked="${t.done}">
      <span class="check ${t.done ? 'on' : ''}">${t.done ? icon('check', 13) : ''}</span>
      <span class="${t.done ? 'done-text' : ''}">${esc(t.text)}</span>
    </div>`).join('')}</div>`;
}

/** Current address for an event (follows edits in the addresses tab). */
export function eventPlace(e) {
  const a = e.addressId ? state.addresses.find((x) => x.id === e.addressId) : null;
  return { address: a?.address || e.location || '', name: a?.name || e.locationName || '' };
}

function eventHTML(e) {
  const docs = (e.docIds || []).length;
  const place = eventPlace(e);
  return `<div class="event" data-event="${e.id}" role="button" tabindex="0">
    ${e.time ? `<span class="ev-time">${esc(e.time)}</span>` : ''}
    <div class="ev-title">${esc(e.title)}</div>
    ${place.address ? `<div class="ev-meta ev-place" data-ev-nav="${e.id}">${icon('pin', 13)} <span>${esc(place.name || place.address)}</span> <span class="badge blue">${icon('navigation', 11)} ניווט</span></div>` : ''}
    ${e.notes ? `<div class="ev-notes">${esc(e.notes.split('\n')[0])}</div>` : ''}
    ${docs ? `<div class="ev-meta">${icon('paperclip', 13)} ${docs} מסמכים</div>` : ''}
    ${subtasksHTML(e.id)}
  </div>`;
}

/* ---------------- day view ---------------- */
function renderDay(el) {
  const d = parseYmd(selected);
  const isToday = selected === todayStr();
  const week = startOfWeek(d);
  const evs = eventsOn(selected);
  const allDay = evs.filter((e) => !e.time);
  const timed = evs.filter((e) => e.time);
  const byHour = {};
  timed.forEach((e) => {
    const h = Math.min(END_H, Math.max(START_H, parseInt(e.time, 10)));
    (byHour[h] ||= []).push(e);
  });

  el.innerHTML = `
    ${headHTML()}
    <div class="cal-nav">
      <button class="nav-btn" data-nav="-1" aria-label="יום קודם">${icon('chevron-right', 24)}</button>
      <div class="title"><strong>${esc(fmtDateLong(d))}</strong><span>${esc(hebrewDateLabel(d))}</span></div>
      <button class="nav-btn" data-nav="1" aria-label="יום הבא">${icon('chevron-left', 24)}</button>
    </div>
    <div class="week-strip">
      ${Array.from({ length: 7 }, (_, i) => {
        const day = addDays(week, i), s = ymd(day);
        const hasHol = holidaysFor(day).length > 0;
        const hasEv = state.events.some((e) => e.date === s);
        return `<button class="ws-day ${s === selected ? 'sel' : ''} ${s === todayStr() ? 'today' : ''}" data-day="${s}">
          ${HEB_DAYS_SHORT[i]}<b>${day.getDate()}</b>
          <span class="mark ${hasEv ? '' : hasHol ? 'hol' : 'none'}"></span></button>`;
      }).join('')}
    </div>
    ${isToday ? '' : '<div style="text-align:center;margin:-4px 0 10px"><button class="today-pill" data-today>חזרה להיום</button></div>'}
    <div class="holiday-chips">${holidayChips(selected)}</div>
    ${allDay.length ? `<div class="allday">${allDay.map(eventHTML).join('')}</div>` : ''}
    <div class="timeline" id="timeline">
      ${Array.from({ length: END_H - START_H + 1 }, (_, i) => {
        const h = START_H + i;
        return `<div class="hour" data-hour="${h}"><div class="hour-label">${pad(h)}:00</div>
          <div class="hour-slot">${(byHour[h] || []).map(eventHTML).join('')}</div></div>`;
      }).join('')}
      ${isToday ? '<div class="now-line" id="nowLine"></div>' : ''}
    </div>`;
  if (isToday) placeNowLine();
}

function placeNowLine() {
  clearInterval(nowTimer);
  const set = () => {
    const line = document.getElementById('nowLine');
    if (!line) return clearInterval(nowTimer);
    const n = new Date();
    const h = n.getHours();
    if (h < START_H || h > END_H) { line.style.display = 'none'; return; }
    const row = document.querySelector(`.hour[data-hour="${h}"]`);
    if (!row) return;
    line.style.top = `${row.offsetTop + (n.getMinutes() / 60) * row.offsetHeight}px`;
  };
  requestAnimationFrame(set);
  nowTimer = setInterval(set, 60000);
}

/* ---------------- week view ---------------- */
function renderWeek(el) {
  const d = parseYmd(selected);
  const week = startOfWeek(d);
  const end = addDays(week, 6);
  const title = week.getMonth() === end.getMonth()
    ? `${week.getDate()}–${end.getDate()} ב${HEB_MONTHS[week.getMonth()]} ${end.getFullYear()}`
    : `${week.getDate()} ב${HEB_MONTHS[week.getMonth()]} – ${end.getDate()} ב${HEB_MONTHS[end.getMonth()]}`;
  const thisWeek = ymd(startOfWeek(new Date())) === ymd(week);

  el.innerHTML = `
    ${headHTML()}
    <div class="cal-nav">
      <button class="nav-btn" data-nav="-7" aria-label="שבוע קודם">${icon('chevron-right', 24)}</button>
      <div class="title"><strong>${esc(title)}</strong><span>${esc(hebrewDateLabel(week))} – ${esc(hebrewDateLabel(end))}</span></div>
      <button class="nav-btn" data-nav="7" aria-label="שבוע הבא">${icon('chevron-left', 24)}</button>
    </div>
    ${thisWeek ? '' : '<div style="text-align:center;margin:-4px 0 10px"><button class="today-pill" data-today>השבוע</button></div>'}
    <div class="week-grid">
      ${Array.from({ length: 7 }, (_, i) => {
        const day = addDays(week, i), s = ymd(day);
        const hols = holidaysFor(day);
        return `<div class="wg-col ${s === todayStr() ? 'today' : ''} ${i >= 5 ? 'weekend' : ''}">
          <button class="wg-head" data-open-day="${s}"><div class="d">${HEB_DAYS_SHORT[i]}</div><div class="n">${day.getDate()}</div></button>
          ${hols.map((h) => `<div class="wg-hol">${esc(h.name)}</div>`).join('')}
          ${eventsOn(s).map((e) => {
            const ts = tasksOfEvent(e.id);
            const open = ts.filter((t) => !t.done).length;
            return `<button class="wg-ev" data-event="${e.id}">${e.time ? `<span class="t">${esc(e.time)}</span>` : ''}<span class="n">${esc(e.title)}</span>${eventPlace(e).address ? `<div class="tk">${icon('pin', 10)} ${esc(eventPlace(e).name || eventPlace(e).address)}</div>` : ''}${ts.length ? `<div class="tk">✓ ${ts.length - open}/${ts.length}</div>` : ''}</button>`;
          }).join('')}
          <button class="wg-add" data-add-day="${s}" aria-label="הוספה ביום ${HEB_DAYS[i]}">${icon('plus', 16)}</button>
        </div>`;
      }).join('')}
    </div>`;
}

const headHTML = () => `
  <div class="cal-head">
    <div class="segmented" role="tablist">
      <button class="${viewMode() === 'day' ? 'active' : ''}" data-mode="day">${icon('rows', 15)} יומית</button>
      <button class="${viewMode() === 'week' ? 'active' : ''}" data-mode="week">${icon('columns', 15)} שבועית</button>
    </div>
  </div>`;

/* ---------------- event sheet ---------------- */
export function openEventSheet(evOrDraft = {}) {
  const existing = evOrDraft.id ? state.events.find((e) => e.id === evOrDraft.id) : null;
  const ev = existing ? { ...existing } : { title: '', date: selected, time: null, notes: '', docIds: [], ...evOrDraft };
  let subs = existing ? tasksOfEvent(existing.id).map((t) => ({ ...t })) : (evOrDraft.subtasks || []).map((text) => ({ text, done: false }));
  let docIds = [...(ev.docIds || [])];

  const body = document.createElement('div');
  const draw = () => {
    const hols = holidayChips(ev.date || selected);
    body.innerHTML = `
      <div class="field"><label>כותרת</label><input class="input" name="title" value="${esc(ev.title)}" placeholder="למשל: פגישה עם חשמלאי" autocomplete="off"></div>
      <div class="field-row">
        <div class="field"><label>תאריך</label><input class="input" type="date" name="date" value="${esc(ev.date || selected)}"></div>
        <div class="field"><label>שעה</label><input class="input" type="time" name="time" value="${esc(ev.time || '')}"></div>
      </div>
      <div class="field"><label>כתובת</label>
        <div style="display:flex;gap:8px"><input class="input" name="location" value="${esc(eventPlace(ev).address)}" placeholder="כתובת, או בחירה מהכתובות שלי" autocomplete="street-address">
        <button class="btn secondary" data-pick-addr style="height:46px;padding:0 12px;white-space:nowrap">${icon('pin', 17)} שמורות</button></div>
        ${eventPlace(ev).address ? `<div style="display:flex;gap:14px;align-items:center;margin:6px 4px 0;flex-wrap:wrap">
          ${eventPlace(ev).name ? `<span class="badge">${icon('pin', 11)} ${esc(eventPlace(ev).name)}</span>` : ''}
          <button class="btn-text" data-nav-ev style="display:flex;gap:4px;align-items:center">${icon('navigation', 15)} ניווט</button>
          ${ev.addressId ? '' : `<button class="btn-text" data-save-addr style="display:flex;gap:4px;align-items:center">${icon('plus', 15)} שמירה בכתובות</button>`}
        </div>` : ''}</div>
      ${hols ? `<div class="holiday-chips">${hols}</div>` : ''}
      <div class="field"><label>הערות</label><textarea class="textarea" name="notes" placeholder="למשל: לשאול לגבי שקע כוח">${esc(ev.notes || '')}</textarea></div>

      <div class="section-title">${icon('tasks', 15)} משימות מקושרות <span class="count">${subs.filter((s) => s.done).length}/${subs.length}</span></div>
      <div class="list">
        ${subs.map((s, i) => `<div class="row plain">
          <button class="check ${s.done ? 'on' : ''}" data-sub-toggle="${i}" aria-label="סימון">${s.done ? icon('check', 14) : ''}</button>
          <input class="grow input" style="background:transparent;padding:4px 0" data-sub-text="${i}" value="${esc(s.text)}">
          <button class="chev" data-sub-del="${i}" aria-label="מחיקה">${icon('x', 18)}</button></div>`).join('')}
        <div class="row plain"><span style="color:var(--accent)">${icon('plus', 20)}</span>
          <input class="grow input" style="background:transparent;padding:4px 0" data-sub-new placeholder="הוספת משימה…" enterkeyhint="done"></div>
      </div>

      <div class="section-title">${icon('paperclip', 15)} מסמכים מצורפים</div>
      <div class="list">
        ${docIds.map((id) => state.docs.find((d) => d.id === id)).filter(Boolean).map((d) => `<div class="row plain tappable" data-doc="${d.id}">
          ${icon(d.type === 'pdf' ? 'file' : 'image', 20)}<div class="grow">${esc(d.name)}</div>
          <button class="chev" data-doc-del="${d.id}" aria-label="הסרה">${icon('x', 18)}</button></div>`).join('')}
        <button class="row plain tappable" data-attach style="width:100%;color:var(--accent)">${icon('plus', 20)}<span>צירוף מסמך מהכספת</span></button>
      </div>
      ${existing ? `<div style="margin-top:24px"><button class="btn danger block" data-delete>${icon('trash', 18)} מחיקת אירוע</button></div>` : ''}`;
  };
  const sync = () => {
    const f = (n) => body.querySelector(`[name="${n}"]`);
    ev.title = f('title').value.trim();
    ev.date = f('date').value || selected;
    ev.time = f('time').value || null;
    ev.notes = f('notes').value;
    const loc = f('location').value.trim();
    if (loc !== eventPlace(ev).address) { ev.location = loc; ev.addressId = null; ev.locationName = ''; }
    body.querySelectorAll('[data-sub-text]').forEach((inp) => { subs[+inp.dataset.subText].text = inp.value; });
    const n = body.querySelector('[data-sub-new]');
    if (n && n.value.trim()) { subs.push({ text: n.value.trim(), done: false }); n.value = ''; }
  };
  draw();

  const sheet = openSheet({
    title: existing ? 'פרטי אירוע' : 'אירוע חדש',
    body,
    full: true,
    actions: '<button class="btn-text strong" data-save>שמירה</button>',
  });
  sheet.el.querySelector('[data-save]').onclick = async () => {
    sync();
    if (!ev.title) { toast('נא להזין כותרת'); return; }
    const saved = await saveEvent({ ...ev, docIds });
    const keep = new Set();
    let order = 0;
    for (const s of subs) {
      if (!s.text.trim()) continue;
      const t = await saveTask({ ...s, text: s.text.trim(), eventId: saved.id, due: saved.date, order: order++ }, false);
      keep.add(t.id);
    }
    for (const t of tasksOfEvent(saved.id)) if (!keep.has(t.id)) await deleteTask(t.id);
    await saveEvent(saved); // emit once more so views refresh
    sheet.close();
    toast(existing ? 'האירוע עודכן' : 'האירוע נוסף ליומן');
  };

  body.addEventListener('click', async (e) => {
    const tg = e.target.closest('[data-sub-toggle]');
    if (tg) { sync(); const s = subs[+tg.dataset.subToggle]; s.done = !s.done; haptic(); draw(); return; }
    const del = e.target.closest('[data-sub-del]');
    if (del) { sync(); subs.splice(+del.dataset.subDel, 1); draw(); return; }
    const dd = e.target.closest('[data-doc-del]');
    if (dd) { e.stopPropagation(); sync(); docIds = docIds.filter((x) => x !== dd.dataset.docDel); draw(); return; }
    const doc = e.target.closest('[data-doc]');
    if (doc) { const d = state.docs.find((x) => x.id === doc.dataset.doc); if (d) openViewer(d); return; }
    if (e.target.closest('[data-pick-addr]')) {
      sync();
      pickAddress((a) => { if (!a) return; ev.addressId = a.id; ev.location = a.address; ev.locationName = a.name; draw(); });
      return;
    }
    if (e.target.closest('[data-nav-ev]')) { sync(); const pl = eventPlace(ev); openNavigate(pl.address, pl.name || ev.title); return; }
    if (e.target.closest('[data-save-addr]')) {
      sync();
      editAddress(null, { address: ev.location, name: '' }, (a) => { ev.addressId = a.id; ev.location = a.address; ev.locationName = a.name; draw(); });
      return;
    }
    if (e.target.closest('[data-attach]')) {
      sync();
      pickDocs(docIds, (ids) => { docIds = ids; draw(); });
      return;
    }
    if (e.target.closest('[data-delete]')) {
      if (await confirmDialog('למחוק את האירוע ואת המשימות המקושרות אליו?', { okText: 'מחיקה', danger: true })) {
        await deleteEvent(existing.id);
        sheet.close();
        toast('האירוע נמחק');
      }
    }
  });
  body.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.matches('[data-sub-new]')) { e.preventDefault(); sync(); draw(); body.querySelector('[data-sub-new]')?.focus(); }
  });
  if (!existing) setTimeout(() => body.querySelector('[name="title"]')?.focus(), 350);
}

function pickDocs(current, onDone) {
  const sel = new Set(current);
  const body = document.createElement('div');
  const draw = () => {
    if (!state.docs.length) { body.innerHTML = '<div class="empty"><p>אין עדיין מסמכים. הוסיפו מסמכים בלשונית "מסמכים".</p></div>'; return; }
    body.innerHTML = state.folders.map((f) => {
      const docs = state.docs.filter((d) => d.folderId === f.id);
      if (!docs.length) return '';
      return `<div class="section-title">${esc(f.name)}</div><div class="list">${docs.map((d) => `
        <button class="row plain tappable" data-pick="${d.id}" style="width:100%">
          <span class="check ${sel.has(d.id) ? 'on' : ''}">${sel.has(d.id) ? icon('check', 14) : ''}</span>
          <span class="grow" style="text-align:start">${esc(d.name)}</span></button>`).join('')}</div>`;
    }).join('');
  };
  draw();
  const sh = openSheet({ title: 'צירוף מסמכים', body, actions: '<button class="btn-text strong" data-ok>סיום</button>' });
  body.addEventListener('click', (e) => {
    const p = e.target.closest('[data-pick]');
    if (p) { sel.has(p.dataset.pick) ? sel.delete(p.dataset.pick) : sel.add(p.dataset.pick); draw(); }
  });
  sh.el.querySelector('[data-ok]').onclick = () => { onDone([...sel]); sh.close(); };
}

/* ---------------- view contract ---------------- */
export function showDate(date) { selected = date; mode = 'day'; localStorage.setItem('yoman2.calMode', mode); }

let swipeX = null, swipeY = null;
export default {
  title: 'יומן',
  headerActions: () => `<button class="icon-btn" data-add aria-label="אירוע חדש">${icon('plus', 22)}</button>`,
  bindHeader(h) {
    h.querySelector('[data-add]').onclick = () => openVoice({ autoStart: false });
  },
  render(el) {
    if (viewMode() === 'week') renderWeek(el); else renderDay(el);
    if (el.dataset.calBound) return;
    el.dataset.calBound = '1';
    el.addEventListener('click', onClick);
    el.addEventListener('touchstart', (e) => { if (!el.querySelector('.cal-head')) return; swipeX = e.touches[0].clientX; swipeY = e.touches[0].clientY; }, { passive: true });
    el.addEventListener('touchend', (e) => {
      if (swipeX == null || !el.querySelector('.cal-head')) return;
      const dx = e.changedTouches[0].clientX - swipeX, dy = e.changedTouches[0].clientY - swipeY;
      swipeX = null;
      if (Math.abs(dx) > 70 && Math.abs(dy) < 50) {
        const step = viewMode() === 'week' ? 7 : 1;
        // RTL: swipe right → previous, swipe left → next
        selected = ymd(addDays(parseYmd(selected), dx > 0 ? -step : step));
        this.render(el);
      }
    });
  },
  enter(el) {
    if (mode === 'day' && selected === todayStr()) {
      const h = Math.max(START_H, new Date().getHours() - 1);
      const row = el.querySelector(`.hour[data-hour="${h}"]`);
      if (row) el.scrollTop = row.offsetTop - 60;
    }
  },
  leave() { clearInterval(nowTimer); },
};

async function onClick(e) {
  const el = e.currentTarget;
  if (!el.querySelector('.cal-head')) return; // another tab owns the view
  const rerender = () => (viewMode() === 'week' ? renderWeek(el) : renderDay(el));
  const t = (sel) => e.target.closest(sel);
  let n;
  if ((n = t('[data-toggle]'))) { e.stopPropagation(); haptic(); await toggleTask(n.dataset.toggle); return; }
  if ((n = t('[data-ev-nav]'))) { const ev = state.events.find((x) => x.id === n.dataset.evNav); if (ev) { const pl = eventPlace(ev); openNavigate(pl.address, pl.name || ev.title); } return; }
  if ((n = t('[data-event]'))) { openEventSheet({ id: n.dataset.event }); return; }
  if ((n = t('[data-mode]'))) { mode = n.dataset.mode; localStorage.setItem('yoman2.calMode', mode); rerender(); return; }
  if ((n = t('[data-nav]'))) { selected = ymd(addDays(parseYmd(selected), +n.dataset.nav)); rerender(); return; }
  if ((n = t('[data-day]'))) { selected = n.dataset.day; rerender(); return; }
  if (t('[data-today]')) { selected = todayStr(); rerender(); return; }
  if ((n = t('[data-open-day]'))) { selected = n.dataset.openDay; mode = 'day'; localStorage.setItem('yoman2.calMode', mode); rerender(); el.scrollTop = 0; return; }
  if ((n = t('[data-add-day]'))) { openEventSheet({ date: n.dataset.addDay }); return; }
  if ((n = t('.hour-slot'))) {
    if (e.target === n) openEventSheet({ date: selected, time: `${pad(+n.parentElement.dataset.hour)}:00` });
  }
}

