// Tab 2 – Smart tasks: urgent / today / open, synced with calendar sub-tasks.
import { state, saveTask, toggleTask, deleteTask, clearDoneTasks, isToday } from '../store.js';
import { parseInput } from '../parser.js';
import { icon } from '../icons.js';
import { esc, fmtDateShort, todayStr, toast, haptic, openSheet, confirmDialog, emptyState } from '../util.js';
import { openEventSheet } from './calendar.js';

let urgentDraft = false;
let showDone = false;

function taskRow(t) {
  const ev = t.eventId ? state.events.find((e) => e.id === t.eventId) : null;
  const overdue = !t.done && t.due && t.due < todayStr();
  return `<div class="row task-row">
    <button class="check ${t.done ? 'on' : ''} ${t.urgent ? 'urgent' : ''}" data-toggle="${t.id}" role="checkbox" aria-checked="${t.done}" aria-label="סימון">${t.done ? icon('check', 14) : ''}</button>
    <div class="grow" data-edit="${t.id}">
      <div class="${t.done ? 'done-text' : ''}">${esc(t.text)}</div>
      ${ev || t.due ? `<div class="meta" style="display:flex;gap:6px;flex-wrap:wrap;margin-top:3px">
        ${ev ? `<span class="badge" data-open-event="${ev.id}">${icon('calendar', 11)} יומן · ${esc(fmtDateShort(ev.date))}${ev.time ? ' ' + esc(ev.time) : ''}</span>` : ''}
        ${!ev && t.due ? `<span class="badge ${overdue ? 'red' : 'blue'}">${icon('clock', 11)} ${esc(fmtDateShort(t.due))}</span>` : ''}
      </div>` : ''}
    </div>
    <button class="star ${t.urgent ? 'on' : ''}" data-urgent="${t.id}" aria-label="דחוף">${icon('flame', 19)}</button>
  </div>`;
}

function section(title, ic, color, list, emptyText) {
  return `<div class="section-title"><span style="color:${color}">${icon(ic, 16)}</span> ${title}<span class="count">${list.length}</span></div>
    ${list.length ? `<div class="list">${list.map(taskRow).join('')}</div>` : `<div class="list"><div class="row plain meta" style="color:var(--text-3)">${emptyText}</div></div>`}`;
}

export default {
  title: 'משימות',
  render(el) {
    const open = state.tasks.filter((t) => !t.done);
    const sortFn = (a, b) => (a.due || '9999').localeCompare(b.due || '9999') || a.createdAt - b.createdAt;
    const urgent = open.filter((t) => t.urgent).sort(sortFn);
    const today = open.filter((t) => !t.urgent && isToday(t)).sort(sortFn);
    const rest = open.filter((t) => !t.urgent && !isToday(t)).sort(sortFn);
    const done = state.tasks.filter((t) => t.done).sort((a, b) => (b.doneAt || 0) - (a.doneAt || 0));

    el.innerHTML = `
      <form class="quick-add" data-quick>
        <button type="button" class="urgent-toggle ${urgentDraft ? 'on' : ''}" data-urgent-draft aria-label="דחוף">${icon('flame', 20)}</button>
        <input name="q" placeholder="משימה חדשה… (למשל: מחר להתקשר לביטוח)" autocomplete="off" enterkeyhint="send">
        <button class="icon-btn" aria-label="הוספה">${icon('plus', 20)}</button>
      </form>
      ${state.tasks.length === 0 ? emptyState('inbox', 'אין משימות. הוסיפו משימה או הקליטו "ולאחר מכן" ביומן') : ''}
      ${section('משימות דחופות', 'flame', 'var(--red)', urgent, 'אין משימות דחופות')}
      ${section('משימות להיום', 'sun', 'var(--amber)', today, 'הכול נקי להיום ✨')}
      ${section('משימות פתוחות', 'inbox', 'var(--blue)', rest, 'אין משימות פתוחות')}
      ${done.length ? `<div class="section-title"><button class="btn-text" data-show-done>${showDone ? 'הסתרת' : 'הצגת'} משימות שהושלמו (${done.length})</button>
        ${showDone ? '<button class="btn-text danger" data-clear-done style="margin-inline-start:auto">ניקוי</button>' : ''}</div>
        ${showDone ? `<div class="list">${done.map(taskRow).join('')}</div>` : ''}` : ''}`;

    el.querySelector('[data-quick]').onsubmit = async (e) => {
      e.preventDefault();
      const input = e.target.q;
      const raw = input.value.trim();
      if (!raw) return;
      let text = raw.replace(/^!\s*/, '');
      const urgent = urgentDraft || raw.startsWith('!');
      const p = parseInput(text);
      let due = null;
      if (p.kind === 'task' && p.date) { due = p.date; text = p.title || text; }
      await saveTask({ text, urgent, due });
      urgentDraft = false;
      haptic();
      toast('המשימה נוספה');
      setTimeout(() => el.querySelector('[data-quick] input')?.focus(), 30);
    };

    if (el.dataset.bound) return;
    el.dataset.bound = '1';
    el.addEventListener('click', async (e) => {
      const t = (s) => e.target.closest(s);
      let n;
      if ((n = t('[data-toggle]'))) { haptic(); await toggleTask(n.dataset.toggle); return; }
      if ((n = t('[data-urgent]'))) { const task = state.tasks.find((x) => x.id === n.dataset.urgent); await saveTask({ ...task, urgent: !task.urgent }); return; }
      if (t('[data-urgent-draft]')) { urgentDraft = !urgentDraft; t('[data-urgent-draft]').classList.toggle('on', urgentDraft); return; }
      if ((n = t('[data-open-event]'))) { openEventSheet({ id: n.dataset.openEvent }); return; }
      if (t('[data-show-done]')) { showDone = !showDone; this.render(el); return; }
      if (t('[data-clear-done]')) { if (await confirmDialog('למחוק את כל המשימות שהושלמו?', { okText: 'מחיקה', danger: true })) await clearDoneTasks(); return; }
      if ((n = t('[data-edit]'))) editTask(n.dataset.edit);
    });
  },
};

function editTask(id) {
  const task = state.tasks.find((x) => x.id === id);
  if (!task) return;
  const ev = task.eventId ? state.events.find((e) => e.id === task.eventId) : null;
  const sh = openSheet({
    title: 'עריכת משימה',
    actions: '<button class="btn-text strong" data-save>שמירה</button>',
    body: `
      <div class="field"><label>משימה</label><input class="input" name="text" value="${esc(task.text)}"></div>
      ${ev ? `<div class="field"><label>מקושרת לאירוע</label><button class="row plain tappable list" data-ev style="width:100%">${icon('calendar', 18)}<span class="grow" style="text-align:start">${esc(ev.title)} · ${esc(fmtDateShort(ev.date))}</span>${icon('chevron-left', 18, 'chev')}</button></div>`
        : `<div class="field"><label>תאריך יעד</label><input class="input" type="date" name="due" value="${esc(task.due || '')}"></div>`}
      <div class="list"><div class="row plain"><span class="grow">דחוף</span><button class="switch ${task.urgent ? 'on' : ''}" data-sw aria-label="דחוף"></button></div></div>
      <div style="margin-top:24px"><button class="btn danger block" data-del>${icon('trash', 18)} מחיקה</button></div>`,
  });
  const b = sh.body;
  let urgent = task.urgent;
  b.querySelector('[data-sw]').onclick = (e) => { urgent = !urgent; e.currentTarget.classList.toggle('on', urgent); };
  b.querySelector('[data-ev]')?.addEventListener('click', () => { sh.close(); openEventSheet({ id: ev.id }); });
  b.querySelector('[data-del]').onclick = async () => { await deleteTask(id); sh.close(); toast('נמחקה'); };
  sh.el.querySelector('[data-save]').onclick = async () => {
    const text = b.querySelector('[name="text"]').value.trim();
    if (!text) return;
    const due = b.querySelector('[name="due"]')?.value || task.due || null;
    await saveTask({ ...task, text, urgent, due });
    sh.close();
  };
}
