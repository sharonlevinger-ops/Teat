// Tab 3 – Documents & receipts vault: folders, camera/gallery/PDF upload,
// client-side compression, expiry tracking, full-screen zoomable viewer.
import { state, saveFolder, deleteFolder, saveDoc, deleteDoc, getFile, notify } from '../store.js';
import { icon } from '../icons.js';
import {
  esc, openSheet, confirmDialog, toast, compressImage, daysUntil, fmtDateShort, emptyState, uid,
} from '../util.js';

let openFolderId = null;
const thumbCache = new Map();

export function thumbURL(doc) {
  if (!doc.thumb) return null;
  const c = thumbCache.get(doc.id);
  if (c && c.blob === doc.thumb) return c.url;
  if (c) URL.revokeObjectURL(c.url);
  const url = URL.createObjectURL(doc.thumb);
  thumbCache.set(doc.id, { blob: doc.thumb, url });
  return url;
}

const EXPIRY_WARN_DAYS = 14;
export function expiryState(doc) {
  if (!doc.expiry) return null;
  const d = daysUntil(doc.expiry);
  if (d < 0) return { cls: 'expired', badge: 'red', text: `פג תוקף · ${fmtDateShort(doc.expiry)}` };
  if (d <= EXPIRY_WARN_DAYS) return { cls: 'expiring', badge: 'amber', text: d === 0 ? 'פג היום' : `פג בעוד ${d} ימים` };
  return { cls: '', badge: 'blue', text: `בתוקף עד ${fmtDateShort(doc.expiry)}` };
}

const FOLDER_ICONS = ['folder', 'home', 'shield', 'car', 'wrench', 'receipt', 'card', 'file', 'star', 'user'];
const FOLDER_COLORS = ['#0D9488', '#007AFF', '#5856D6', '#FF9500', '#34C759', '#FF3B30', '#AF52DE', '#8E8E93'];

/* ---------------- grid ---------------- */
function renderGrid(el) {
  const folders = [...state.folders].sort((a, b) => a.order - b.order);
  const attention = state.docs.filter((d) => { const s = expiryState(d); return s && s.cls; })
    .sort((a, b) => a.expiry.localeCompare(b.expiry));
  el.innerHTML = `
    ${attention.length ? `<div class="section-title" style="margin-top:4px">${icon('alert', 15)} דורש תשומת לב</div>
      <div class="list">${attention.map((d) => { const s = expiryState(d); const f = state.folders.find((x) => x.id === d.folderId); return `
        <button class="row plain tappable" data-doc="${d.id}" style="width:100%">
          <span style="color:var(--${s.badge === 'red' ? 'red' : 'amber'})">${icon('alert', 20)}</span>
          <div class="grow" style="text-align:start"><div>${esc(d.name)}</div><div class="meta">${esc(f?.name || '')}</div></div>
          <span class="badge ${s.badge}">${esc(s.text)}</span></button>`; }).join('')}</div>` : ''}
    <div class="section-title">תיקיות<span class="count">${state.docs.length} מסמכים</span></div>
    <div class="folder-grid">
      ${folders.map((f) => {
        const docs = state.docs.filter((d) => d.folderId === f.id);
        const warn = docs.some((d) => expiryState(d)?.cls);
        return `<button class="folder-card" data-folder="${f.id}">
          <span class="folder-icon" style="background:${esc(f.color)}">${icon(f.icon, 22)}</span>
          ${warn ? `<span class="warn" style="color:var(--amber)">${icon('alert', 18)}</span>` : ''}
          <div><div class="fname">${esc(f.name)}</div><div class="fcount">${docs.length} פריטים</div></div>
        </button>`;
      }).join('')}
      <button class="folder-card add" data-new-folder>${icon('folder-plus', 28)}<span>תיקייה חדשה</span></button>
    </div>`;
}

/* ---------------- folder ---------------- */
function renderFolder(el) {
  const f = state.folders.find((x) => x.id === openFolderId);
  if (!f) { openFolderId = null; return renderGrid(el); }
  const docs = state.docs.filter((d) => d.folderId === f.id).sort((a, b) => b.createdAt - a.createdAt);
  el.innerHTML = `
    <div class="cal-nav" style="margin-top:2px">
      <button class="btn-text" data-back style="display:flex;align-items:center;gap:2px">${icon('chevron-right', 22)} תיקיות</button>
      <div class="title"><strong>${esc(f.name)}</strong><span>${docs.length} פריטים</span></div>
      <button class="nav-btn" data-folder-menu aria-label="אפשרויות">${icon('more', 22)}</button>
    </div>
    <button class="btn block" data-upload style="margin-bottom:14px">${icon('camera', 20)} הוספה: מצלמה · גלריה · PDF</button>
    ${docs.length ? `<div class="doc-grid">${docs.map((d) => {
      const s = expiryState(d);
      const t = thumbURL(d);
      return `<button class="doc-tile ${s?.cls || ''}" data-doc="${d.id}">
        <div class="doc-thumb">${t ? `<img src="${t}" alt="" loading="lazy">` : icon(d.type === 'pdf' ? 'file' : 'image', 34)}</div>
        <div class="doc-info"><div class="dn">${esc(d.name)}</div>${s ? `<div class="de"><span class="badge ${s.badge}">${esc(s.text)}</span></div>` : ''}</div>
      </button>`;
    }).join('')}</div>` : emptyState('folder', 'התיקייה ריקה. צלמו קבלה או בחרו קובץ.')}`;
}

/* ---------------- upload ---------------- */
function pickFiles(folderId) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*,application/pdf';
  input.multiple = true;
  input.style.display = 'none';
  document.body.appendChild(input);
  input.onchange = async () => {
    const files = [...input.files];
    input.remove();
    if (!files.length) return;
    toast(`מעבד ${files.length} קבצים…`, 10000);
    let added = 0, last = null;
    for (const file of files) {
      try {
        last = await ingestFile(file, folderId);
        added++;
      } catch (err) {
        console.error(err);
        toast(`שגיאה בקובץ ${file.name}`);
      }
    }
    toast(added === 1 ? 'המסמך נשמר' : `נשמרו ${added} מסמכים`);
    if (added === 1 && last) editDoc(last, true);
  };
  input.click();
}

async function ingestFile(file, folderId) {
  const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
  const base = file.name.replace(/\.[^.]+$/, '');
  const generic = /^(image|img|photo|IMG_\d+|\d+)$/i.test(base) || !base;
  const now = new Date();
  const name = generic ? `סריקה ${now.getDate()}/${now.getMonth() + 1} ${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')}` : base;
  if (isPdf) {
    if (file.size > 40 * 1024 * 1024) throw new Error('PDF too large');
    return saveDoc({ id: uid(), folderId, name, type: 'pdf', size: file.size, mime: 'application/pdf' }, file);
  }
  const full = await compressImage(file, 1600, 0.78);
  const thumb = await compressImage(full.blob, 360, 0.7);
  return saveDoc({ id: uid(), folderId, name, type: 'image', size: full.blob.size, mime: 'image/jpeg', width: full.width, height: full.height, thumb: thumb.blob }, full.blob);
}

/* ---------------- doc edit ---------------- */
function editDoc(doc, isNew = false) {
  const sh = openSheet({
    title: isNew ? 'פרטי מסמך' : 'עריכת מסמך',
    actions: '<button class="btn-text strong" data-save>שמירה</button>',
    body: `
      <div class="field"><label>שם</label><input class="input" name="name" value="${esc(doc.name)}"></div>
      <div class="field"><label>תאריך תפוגה (אופציונלי)</label><input class="input" type="date" name="expiry" value="${esc(doc.expiry || '')}"></div>
      <div class="field"><label>תיקייה</label><select class="input" name="folder">${state.folders.map((f) => `<option value="${f.id}" ${f.id === doc.folderId ? 'selected' : ''}>${esc(f.name)}</option>`).join('')}</select></div>
      <div class="field"><label>הערה</label><textarea class="textarea" name="note" placeholder="למשל: זיכוי בסך 120 ₪ בסופר-פארם">${esc(doc.note || '')}</textarea></div>
      <p class="footnote">מסמך עם תאריך תפוגה יודגש בכתום 14 ימים לפני התפוגה ובאדום לאחריה.</p>
      ${isNew ? '' : `<div style="margin-top:20px"><button class="btn danger block" data-del>${icon('trash', 18)} מחיקת מסמך</button></div>`}`,
  });
  const b = sh.body;
  sh.el.querySelector('[data-save]').onclick = async () => {
    await saveDoc({ ...doc, name: b.querySelector('[name="name"]').value.trim() || doc.name, expiry: b.querySelector('[name="expiry"]').value || null, folderId: b.querySelector('[name="folder"]').value, note: b.querySelector('[name="note"]').value });
    sh.close();
    document.querySelector('.viewer')?.dispatchEvent(new Event('refresh'));
  };
  b.querySelector('[data-del]')?.addEventListener('click', async () => {
    if (await confirmDialog('למחוק את המסמך לצמיתות?', { okText: 'מחיקה', danger: true })) {
      await deleteDoc(doc.id);
      sh.close();
      document.querySelector('.viewer')?.remove();
      toast('המסמך נמחק');
    }
  });
}

/* ---------------- viewer ---------------- */
export async function openViewer(doc) {
  const blob = await getFile(doc.id);
  if (!blob) { toast('הקובץ לא נמצא'); return; }
  const url = URL.createObjectURL(blob);
  const v = document.createElement('div');
  v.className = 'viewer';
  const draw = () => {
    const d = state.docs.find((x) => x.id === doc.id) || doc;
    const s = expiryState(d);
    v.innerHTML = `
      <div class="viewer-bar">
        <button data-close aria-label="סגירה">${icon('x', 22)}</button>
        <div class="vt">${esc(d.name)}</div>
        ${navigator.share ? `<button data-share aria-label="שיתוף">${icon('upload', 20)}</button>` : ''}
        <button data-edit aria-label="עריכה">${icon('pencil', 19)}</button>
      </div>
      <div class="viewer-stage">${d.type === 'pdf' ? `<iframe src="${url}#view=FitH" title="${esc(d.name)}"></iframe>` : `<img src="${url}" alt="${esc(d.name)}" draggable="false">`}</div>
      <div class="viewer-foot">
        <span>${s ? `<span class="badge ${s.badge}">${esc(s.text)}</span>` : ''} ${esc(d.note || '')}</span>
        ${d.type === 'pdf' ? `<button class="btn secondary" data-open-pdf style="height:34px">${icon('external', 16)} פתיחה</button>` : '<span style="opacity:.7">צביטה להגדלה · הקשה כפולה</span>'}
      </div>`;
    const img = v.querySelector('.viewer-stage img');
    if (img) enableZoom(v.querySelector('.viewer-stage'), img);
  };
  draw();
  document.body.appendChild(v);
  v.addEventListener('refresh', draw);
  v.addEventListener('click', async (e) => {
    if (e.target.closest('[data-close]')) { v.remove(); URL.revokeObjectURL(url); }
    else if (e.target.closest('[data-edit]')) editDoc(state.docs.find((x) => x.id === doc.id) || doc);
    else if (e.target.closest('[data-open-pdf]')) window.open(url, '_blank');
    else if (e.target.closest('[data-share]')) {
      const ext = doc.type === 'pdf' ? 'pdf' : 'jpg';
      const file = new File([blob], `${doc.name}.${ext}`, { type: blob.type || (ext === 'pdf' ? 'application/pdf' : 'image/jpeg') });
      try { await navigator.share({ files: [file], title: doc.name }); } catch { /* cancelled */ }
    }
  });
}

function enableZoom(stage, img) {
  let scale = 1, tx = 0, ty = 0;
  let start = null, lastTap = 0;
  const apply = () => { img.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`; };
  const dist = (t) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
  stage.addEventListener('touchstart', (e) => {
    if (e.touches.length === 2) start = { d: dist(e.touches), scale, tx, ty, mx: (e.touches[0].clientX + e.touches[1].clientX) / 2, my: (e.touches[0].clientY + e.touches[1].clientY) / 2 };
    else if (e.touches.length === 1) {
      const now = Date.now();
      if (now - lastTap < 280) { // double tap
        if (scale > 1) { scale = 1; tx = ty = 0; } else {
          const r = stage.getBoundingClientRect();
          scale = 2.5;
          tx = (r.width / 2 - (e.touches[0].clientX - r.left)) * 1.5;
          ty = (r.height / 2 - (e.touches[0].clientY - r.top)) * 1.5;
        }
        img.style.transition = 'transform .2s'; apply(); setTimeout(() => { img.style.transition = ''; }, 220);
        lastTap = 0; return;
      }
      lastTap = now;
      start = { x: e.touches[0].clientX, y: e.touches[0].clientY, tx, ty };
    }
  }, { passive: true });
  stage.addEventListener('touchmove', (e) => {
    if (!start) return;
    e.preventDefault();
    if (e.touches.length === 2 && start.d) {
      scale = Math.min(6, Math.max(1, start.scale * (dist(e.touches) / start.d)));
      const mx = (e.touches[0].clientX + e.touches[1].clientX) / 2, my = (e.touches[0].clientY + e.touches[1].clientY) / 2;
      tx = start.tx + (mx - start.mx); ty = start.ty + (my - start.my);
    } else if (e.touches.length === 1 && start.x != null && scale > 1) {
      tx = start.tx + (e.touches[0].clientX - start.x);
      ty = start.ty + (e.touches[0].clientY - start.y);
    }
    apply();
  }, { passive: false });
  stage.addEventListener('touchend', (e) => {
    if (e.touches.length === 0) { start = null; if (scale <= 1.02) { scale = 1; tx = ty = 0; apply(); } }
    else if (e.touches.length === 1) start = { x: e.touches[0].clientX, y: e.touches[0].clientY, tx, ty };
  });
}

/* ---------------- folder edit ---------------- */
function editFolder(folder) {
  const f = folder ? { ...folder } : { name: '', icon: 'folder', color: FOLDER_COLORS[0] };
  const body = document.createElement('div');
  const draw = () => {
    body.innerHTML = `
      <div class="field"><label>שם התיקייה</label><input class="input" name="name" value="${esc(f.name)}" placeholder="למשל: אחריות למוצרים"></div>
      <div class="field"><label>סמל</label><div style="display:flex;flex-wrap:wrap;gap:8px">${FOLDER_ICONS.map((i) => `<button class="folder-icon" data-icon="${i}" style="background:${i === f.icon ? f.color : 'var(--card-2)'};color:${i === f.icon ? '#fff' : 'var(--text-2)'}">${icon(i, 20)}</button>`).join('')}</div></div>
      <div class="field"><label>צבע</label><div style="display:flex;flex-wrap:wrap;gap:10px">${FOLDER_COLORS.map((c) => `<button data-color="${c}" aria-label="צבע" style="width:34px;height:34px;border-radius:17px;background:${c};outline:${c === f.color ? '3px solid var(--text)' : 'none'};outline-offset:2px"></button>`).join('')}</div></div>
      ${folder ? `<div style="margin-top:20px"><button class="btn danger block" data-del>${icon('trash', 18)} מחיקת תיקייה</button></div>` : ''}`;
  };
  draw();
  const sh = openSheet({ title: folder ? 'עריכת תיקייה' : 'תיקייה חדשה', body, actions: '<button class="btn-text strong" data-save>שמירה</button>' });
  body.addEventListener('click', async (e) => {
    const n = body.querySelector('[name="name"]');
    f.name = n.value;
    const i = e.target.closest('[data-icon]');
    if (i) { f.icon = i.dataset.icon; draw(); return; }
    const c = e.target.closest('[data-color]');
    if (c) { f.color = c.dataset.color; draw(); return; }
    if (e.target.closest('[data-del]')) {
      const count = state.docs.filter((d) => d.folderId === folder.id).length;
      if (await confirmDialog(count ? `למחוק את התיקייה ואת ${count} המסמכים שבה?` : 'למחוק את התיקייה?', { okText: 'מחיקה', danger: true })) {
        await deleteFolder(folder.id);
        openFolderId = null;
        sh.close();
      }
    }
  });
  sh.el.querySelector('[data-save]').onclick = async () => {
    f.name = body.querySelector('[name="name"]').value.trim();
    if (!f.name) { toast('נא להזין שם'); return; }
    await saveFolder(f);
    sh.close();
  };
}

/* ---------------- view contract ---------------- */
export default {
  title: 'מסמכים',
  headerActions: () => (openFolderId ? `<button class="icon-btn" data-up aria-label="הוספת מסמך">${icon('plus', 22)}</button>` : `<button class="icon-btn" data-nf aria-label="תיקייה חדשה">${icon('folder-plus', 20)}</button>`),
  bindHeader(h) {
    h.querySelector('[data-up]')?.addEventListener('click', () => pickFiles(openFolderId));
    h.querySelector('[data-nf]')?.addEventListener('click', () => editFolder(null));
  },
  render(el) {
    if (openFolderId) renderFolder(el); else renderGrid(el);
    if (el.dataset.bound) return;
    el.dataset.bound = '1';
    el.addEventListener('click', async (e) => {
      const t = (s) => e.target.closest(s);
      let n;
      if ((n = t('[data-folder]'))) { openFolderId = n.dataset.folder; rerenderAll(); el.scrollTop = 0; return; }
      if (t('[data-back]')) { openFolderId = null; rerenderAll(); return; }
      if (t('[data-new-folder]')) { editFolder(null); return; }
      if (t('[data-upload]')) { pickFiles(openFolderId); return; }
      if (t('[data-folder-menu]')) { editFolder(state.folders.find((f) => f.id === openFolderId)); return; }
      if ((n = t('[data-doc]'))) { const d = state.docs.find((x) => x.id === n.dataset.doc); if (d) openViewer(d); }
    });
  },
  leave() { openFolderId = null; },
};

// header actions depend on folder state, so ask the shell to redraw everything
const rerenderAll = () => notify();
