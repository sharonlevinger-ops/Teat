// Settings: theme, Face ID, PIN, encrypted backup & restore, storage info.
import * as auth from '../auth.js';
import { pinPad } from '../lock.js';
import { db, STORES } from '../db.js';
import { deriveKey, encryptBytes, decryptBytes, randBytes, b64, unb64 } from '../crypto.js';
import { icon } from '../icons.js';
import { openSheet, toast, confirmDialog, promptDialog, blobToDataURL, dataURLToBlob } from '../util.js';
import { applyTheme } from '../app.js';

const SETTINGS_KEYS = ['yoman2.theme', 'yoman2.calMode', 'yoman2.seeded'];

export async function openSettings({ highlightBio = false } = {}) {
  const body = document.createElement('div');
  const bioOk = await auth.bioSupported();
  let est = null;
  try { est = await navigator.storage?.estimate?.(); } catch { /* ignore */ }

  const draw = () => {
    const theme = localStorage.getItem('yoman2.theme') || 'light';
    const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
    body.innerHTML = `
      ${highlightBio && bioOk && !auth.bioEnrolled() ? `<div class="card" style="padding:14px;margin-bottom:6px;display:flex;gap:12px;align-items:center">
        <span style="color:var(--accent)">${icon('faceid', 34)}</span><div class="grow"><strong>פתיחה מהירה עם Face ID</strong><div class="meta">הפעילו כדי לפתוח את היומן והכספת במבט אחד</div></div></div>` : ''}

      <div class="section-title">מראה</div>
      <div class="list"><div class="row plain"><div class="segmented grow">
        <button data-theme="light" class="${theme === 'light' ? 'active' : ''}">${icon('sun', 15)} בהיר</button>
        <button data-theme="dark" class="${theme === 'dark' ? 'active' : ''}">${icon('moon', 15)} כהה</button>
        <button data-theme="auto" class="${theme === 'auto' ? 'active' : ''}">אוטומטי</button>
      </div></div></div>

      <div class="section-title">אבטחה</div>
      <div class="list">
        <div class="row"><span class="setting-icon" style="background:#34C759">${icon('faceid', 18)}</span>
          <div class="grow">Face ID<div class="meta">${bioOk ? 'פתיחת האפליקציה והכספת' : 'דורש אייפון עם Face ID ואתר HTTPS'}</div></div>
          <button class="switch ${auth.bioEnrolled() ? 'on' : ''}" data-bio ${bioOk ? '' : 'disabled style="opacity:.4"'} aria-label="Face ID"></button></div>
        <button class="row tappable" data-change-pin style="width:100%"><span class="setting-icon" style="background:#FF9500">${icon('hash', 18)}</span><span class="grow" style="text-align:start">שינוי קוד גישה</span>${icon('chevron-left', 18, 'chev')}</button>
        <button class="row tappable" data-lock style="width:100%"><span class="setting-icon" style="background:#8E8E93">${icon('lock', 18)}</span><span class="grow" style="text-align:start">נעילה עכשיו</span>${icon('chevron-left', 18, 'chev')}</button>
      </div>
      <p class="footnote">האפליקציה ננעלת אוטומטית אחרי דקה ברקע. הכספת דורשת אימות בכל כניסה.</p>

      <div class="section-title">גיבוי ושחזור</div>
      <div class="list">
        <button class="row tappable" data-export style="width:100%"><span class="setting-icon" style="background:#007AFF">${icon('upload', 18)}</span><div class="grow" style="text-align:start">ייצוא גיבוי מוצפן (.json)<div class="meta">שמרו ב-iCloud Drive דרך "שמירה בקבצים"</div></div>${icon('chevron-left', 18, 'chev')}</button>
        <button class="row tappable" data-import style="width:100%"><span class="setting-icon" style="background:#5856D6">${icon('download', 18)}</span><div class="grow" style="text-align:start">שחזור מגיבוי<div class="meta">מחליף את כל הנתונים במכשיר</div></div>${icon('chevron-left', 18, 'chev')}</button>
      </div>
      <p class="footnote">הגיבוי מוצפן בקוד הגישה הנוכחי שלכם. לשחזור במכשיר חדש תצטרכו את אותו הקוד.</p>

      <div class="section-title">מידע</div>
      <div class="list">
        <div class="row plain"><span class="grow">נפח בשימוש</span><span class="meta">${est ? `${(est.usage / 1048576).toFixed(1)} MB` : '—'}</span></div>
        <div class="row plain"><span class="grow">מצב התקנה</span><span class="meta">${standalone ? 'מותקן במסך הבית ✓' : 'בדפדפן'}</span></div>
        <div class="row plain"><span class="grow">גרסה</span><span class="meta">יומן 2.0</span></div>
      </div>
      ${standalone ? '' : `<p class="footnote">להתקנה: Safari ← כפתור השיתוף ${icon('upload', 12)} ← "הוספה למסך הבית".</p>`}
      <p class="footnote">כל המידע נשמר מקומית במכשיר בלבד. אין שרת, אין מעקב.</p>`;
  };
  draw();
  const sh = openSheet({ title: 'הגדרות', body, full: true });

  body.addEventListener('click', async (e) => {
    const t = (s) => e.target.closest(s);
    let n;
    if ((n = t('[data-theme]'))) { localStorage.setItem('yoman2.theme', n.dataset.theme); applyTheme(); draw(); return; }
    if (t('[data-bio]') && bioOk) {
      if (auth.bioEnrolled()) { await auth.disableBio(); toast('Face ID כובה'); draw(); return; }
      const pin = await pinPad({ mode: 'verify', overlay: true, subtitle: 'הזינו קוד כדי להפעיל Face ID' });
      if (!pin) return;
      try { await auth.enrollBio(pin); toast('Face ID הופעל ✓'); } catch (err) { toast(err?.name === 'NotAllowedError' ? 'ההפעלה בוטלה' : 'לא ניתן להפעיל Face ID'); }
      draw();
      return;
    }
    if (t('[data-change-pin]')) {
      const old = await pinPad({ mode: 'verify', overlay: true, subtitle: 'הזינו את הקוד הנוכחי', allowBio: false });
      if (!old) return;
      const neu = await pinPad({ mode: 'newpin', overlay: true, title: 'קוד חדש' });
      if (!neu) return;
      toast((await auth.changePin(old, neu)) ? 'הקוד עודכן ✓' : 'שינוי הקוד נכשל');
      return;
    }
    if (t('[data-lock]')) { sh.close(); document.dispatchEvent(new Event('yoman-lock')); return; }
    if (t('[data-export]')) { await exportBackup(); return; }
    if (t('[data-import]')) { await importBackup(); }
  });
}

/* ---------------- backup ---------------- */
async function exportBackup() {
  const pin = await pinPad({ mode: 'verify', overlay: true, subtitle: 'הגיבוי יוצפן בקוד הגישה', allowBio: false });
  if (!pin) return;
  toast('מכין גיבוי…', 20000);
  const data = { stores: {}, auth: auth.exportAuth(), settings: {} };
  for (const s of STORES) {
    if (s === 'kv') continue; // device-bound keys are never exported
    const rows = await db.all(s);
    data.stores[s] = await Promise.all(rows.map(async (r) => {
      const o = { ...r };
      if (o.blob instanceof Blob) o.blob = { __blob: await blobToDataURL(o.blob) };
      if (o.thumb instanceof Blob) o.thumb = { __blob: await blobToDataURL(o.thumb) };
      return o;
    }));
  }
  SETTINGS_KEYS.forEach((k) => { data.settings[k] = localStorage.getItem(k); });
  const salt = randBytes(16);
  const key = await deriveKey(pin, salt);
  const enc = await encryptBytes(key, new TextEncoder().encode(JSON.stringify(data)));
  const file = JSON.stringify({ app: 'yoman2', type: 'backup', v: 1, createdAt: new Date().toISOString(), salt: b64(salt), ...enc });
  const d = new Date();
  const name = `yoman2-backup-${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}.json`;
  const blob = new Blob([file], { type: 'application/json' });
  const f = new File([blob], name, { type: 'application/json' });
  if (navigator.canShare?.({ files: [f] })) {
    try { await navigator.share({ files: [f], title: 'גיבוי יומן 2.0' }); toast('הגיבוי מוכן ✓'); return; } catch (err) { if (err?.name === 'AbortError') { toast('בוטל'); return; } }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  toast('הגיבוי הורד ✓');
}

async function importBackup() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'application/json,.json';
  input.onchange = async () => {
    const file = input.files[0];
    if (!file) return;
    let pkg;
    try { pkg = JSON.parse(await file.text()); } catch { toast('קובץ לא תקין'); return; }
    if (pkg.app !== 'yoman2' || pkg.type !== 'backup') { toast('זה לא קובץ גיבוי של יומן 2.0'); return; }
    const pin = await promptDialog('קוד הגישה של הגיבוי', '', { type: 'password', inputmode: 'numeric', okText: 'פתיחה' });
    if (!pin) return;
    let data;
    try {
      const key = await deriveKey(pin, unb64(pkg.salt));
      data = JSON.parse(new TextDecoder().decode(await decryptBytes(key, pkg)));
    } catch { toast('קוד שגוי או קובץ פגום'); return; }
    if (!(await confirmDialog(`לשחזר גיבוי מ-${new Date(pkg.createdAt).toLocaleDateString('he-IL')}? כל הנתונים הנוכחיים במכשיר יוחלפו.`, { okText: 'שחזור', danger: true }))) return;
    toast('משחזר…', 20000);
    for (const s of STORES) {
      if (s === 'kv') continue;
      await db.clear(s);
      const rows = await Promise.all((data.stores[s] || []).map(async (r) => {
        const o = { ...r };
        if (o.blob?.__blob) o.blob = await dataURLToBlob(o.blob.__blob);
        if (o.thumb?.__blob) o.thumb = await dataURLToBlob(o.thumb.__blob);
        return o;
      }));
      if (rows.length) await db.putMany(s, rows);
    }
    await db.clear('kv');
    auth.importAuth(data.auth);
    Object.entries(data.settings || {}).forEach(([k, v]) => { if (v != null) localStorage.setItem(k, v); });
    toast('השחזור הושלם ✓ (הפעילו מחדש Face ID בהגדרות)');
    setTimeout(() => location.reload(), 1500);
  };
  input.click();
}
