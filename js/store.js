// In-memory state mirrored to IndexedDB. Views subscribe to changes.
import { db } from './db.js';
import { uid, todayStr } from './util.js';

export const state = { events: [], tasks: [], folders: [], docs: [] };
const listeners = new Set();
export const subscribe = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
const emit = () => listeners.forEach((fn) => fn());

const DEFAULT_FOLDERS = [
  { name: 'חוזי דירה', icon: 'home', color: '#0D9488' },
  { name: 'ביטוחי רכבים', icon: 'shield', color: '#007AFF' },
  { name: 'רישיונות ומסמכי רכב', icon: 'car', color: '#5856D6' },
  { name: 'טיפולים וטסט', icon: 'wrench', color: '#FF9500' },
  { name: 'קבלות וזיכויים', icon: 'receipt', color: '#34C759' },
];

export async function loadAll() {
  const [events, tasks, folders, docs] = await Promise.all(['events', 'tasks', 'folders', 'docs'].map((s) => db.all(s)));
  Object.assign(state, { events, tasks, folders, docs });
  if (!localStorage.getItem('yoman2.seeded')) {
    const now = Date.now();
    state.folders = DEFAULT_FOLDERS.map((f, i) => ({ id: uid(), ...f, order: i, createdAt: now }));
    await db.putMany('folders', state.folders);
    localStorage.setItem('yoman2.seeded', '1');
  }
  emit();
}

const upsert = (list, item) => {
  const i = list.findIndex((x) => x.id === item.id);
  if (i >= 0) list[i] = item; else list.push(item);
};

/* ---------- events ---------- */
export const eventsOn = (date) => state.events
  .filter((e) => e.date === date)
  .sort((a, b) => (a.time || '').localeCompare(b.time || ''));
export const tasksOfEvent = (eventId) => state.tasks.filter((t) => t.eventId === eventId).sort((a, b) => a.order - b.order);

export async function saveEvent(ev) {
  const item = { duration: 60, notes: '', docIds: [], createdAt: Date.now(), ...ev, id: ev.id || uid(), updatedAt: Date.now() };
  upsert(state.events, item);
  await db.put('events', item);
  emit();
  return item;
}

export async function deleteEvent(id) {
  const linked = state.tasks.filter((t) => t.eventId === id).map((t) => t.id);
  state.events = state.events.filter((e) => e.id !== id);
  state.tasks = state.tasks.filter((t) => t.eventId !== id);
  await db.del('events', id);
  if (linked.length) await db.delMany('tasks', linked);
  emit();
}

/** Create an event plus its nested sub-tasks from parser output. */
export async function createFromParsed(p) {
  if (p.kind === 'task') {
    const t = await saveTask({ text: p.title || p.raw, due: p.date });
    return { task: t };
  }
  const ev = await saveEvent({ title: p.title, date: p.date, time: p.time || null, notes: p.notes || '' });
  let order = 0;
  const tasks = [];
  for (const text of p.tasks) {
    tasks.push(await saveTask({ text, eventId: ev.id, due: ev.date, order: order++ }, false));
  }
  emit();
  return { event: ev, tasks };
}

/* ---------- tasks ---------- */
export async function saveTask(t, notify = true) {
  const item = { done: false, urgent: false, due: null, eventId: null, order: Date.now(), createdAt: Date.now(), ...t, id: t.id || uid() };
  upsert(state.tasks, item);
  await db.put('tasks', item);
  if (notify) emit();
  return item;
}
export async function toggleTask(id) {
  const t = state.tasks.find((x) => x.id === id);
  if (!t) return;
  await saveTask({ ...t, done: !t.done, doneAt: !t.done ? Date.now() : null });
}
export async function deleteTask(id) {
  state.tasks = state.tasks.filter((t) => t.id !== id);
  await db.del('tasks', id);
  emit();
}
export async function clearDoneTasks() {
  const ids = state.tasks.filter((t) => t.done && !t.eventId).map((t) => t.id);
  state.tasks = state.tasks.filter((t) => !ids.includes(t.id));
  await db.delMany('tasks', ids);
  emit();
}
export const isToday = (t) => {
  const today = todayStr();
  if (t.due && t.due <= today) return true;
  if (t.eventId) { const e = state.events.find((x) => x.id === t.eventId); if (e && e.date <= today) return true; }
  return false;
};

/* ---------- folders & docs ---------- */
export async function saveFolder(f) {
  const item = { icon: 'folder', color: '#8E8E93', order: state.folders.length, createdAt: Date.now(), ...f, id: f.id || uid() };
  upsert(state.folders, item);
  await db.put('folders', item);
  emit();
  return item;
}
export async function deleteFolder(id) {
  const docIds = state.docs.filter((d) => d.folderId === id).map((d) => d.id);
  state.folders = state.folders.filter((f) => f.id !== id);
  state.docs = state.docs.filter((d) => d.folderId !== id);
  await db.del('folders', id);
  await db.delMany('docs', docIds);
  await db.delMany('files', docIds);
  emit();
}
export async function saveDoc(meta, blob) {
  const item = { createdAt: Date.now(), expiry: null, note: '', ...meta, id: meta.id || uid() };
  if (blob) await db.put('files', { id: item.id, blob });
  upsert(state.docs, item);
  await db.put('docs', item);
  emit();
  return item;
}
export async function deleteDoc(id) {
  state.docs = state.docs.filter((d) => d.id !== id);
  state.events.forEach((e) => { if (e.docIds?.includes(id)) { e.docIds = e.docIds.filter((x) => x !== id); db.put('events', e); } });
  await db.del('docs', id);
  await db.del('files', id);
  emit();
}
export const getFile = async (id) => (await db.get('files', id))?.blob || null;

export const notify = emit;
