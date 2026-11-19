// Smart voice / text input: Hebrew speech (he-IL) → parser → one-tap confirm.
import { parseInput } from './parser.js';
import { createFromParsed } from './store.js';
import { icon } from './icons.js';
import { esc, openSheet, toast, fmtDateLong, haptic } from './util.js';

const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
// On iPhone/iPad the browser speech API is unreliable (especially in a home-screen app, where it
// often returns no text at all). The keyboard's own 🎙️ dictation always works, so it is the default.
const IS_IOS = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

const EXAMPLES = [
  'מחר בחמש פגישה עם חשמלאי ולאחר מכן לקנות חלב',
  'אימון בשעה 17:00 ולאחר מכן לקנות חלב ופירות',
  'טסט לרכב ביום שלישי 25/11 בשעה 8:30',
  'להתקשר לביטוח',
];

export function openVoice({ autoStart = true } = {}) {
  let rec = null, recording = false, parsed = null;
  const keyboardMode = IS_IOS || !SR;
  const body = document.createElement('div');
  body.innerHTML = `${keyboardMode ? `
    <div class="dictate-tip">
      <span class="dt-mic">${icon('mic', 22)}</span>
      <div><strong>מדברים דרך המקלדת</strong>
        <div>הקישו על <b>🎙️ בפינה התחתונה של המקלדת</b> ודברו. הטקסט ייכתב כאן ויפוענח לבד.</div></div>
    </div>
    <textarea class="textarea" data-text placeholder="דברו או הקלידו… למשל: מחר בחמש פגישה עם חשמלאי ולאחר מכן לקנות חלב" style="min-height:76px"></textarea>
    <div class="voice-hint" data-hint style="margin:6px 0 0;font-size:12.5px">לא רואים 🎙️ במקלדת? הגדרות ← כללי ← מקלדת ← "הפעלת הכתבה"</div>
    <button class="voice-orb hidden" data-mic aria-label="הקלטה"></button>` : `
    <button class="voice-orb" data-mic aria-label="הקלטה">${icon('mic', 40)}</button>
    <div class="voice-hint" data-hint>הקישו על המיקרופון ודברו בחופשיות</div>
    <textarea class="textarea" data-text placeholder="מה בתוכנית? למשל: מחר בחמש פגישה עם חשמלאי ולאחר מכן לקנות חלב" style="min-height:84px"></textarea>`}
    <div data-preview></div>
    <div class="examples" data-examples>
      <div class="section-title" style="margin:10px 4px 0">דוגמאות</div>
      ${EXAMPLES.map((e) => `<button class="example" data-ex>${esc(e)}</button>`).join('')}
    </div>`;
  const ta = body.querySelector('[data-text]');
  const hint = body.querySelector('[data-hint]');
  const orb = body.querySelector('[data-mic]');
  const pv = body.querySelector('[data-preview]');
  const exEl = body.querySelector('[data-examples]');

  const sheet = openSheet({
    title: 'הוספה חכמה',
    body,
    full: true,
    actions: '<button class="btn-text strong" data-save disabled>שמירה</button>',
    onClose: () => stop(true),
  });
  const saveBtn = sheet.el.querySelector('[data-save]');

  const todayYmd = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

  function renderPreview() {
    const text = ta.value.trim();
    exEl.classList.toggle('hidden', !!text);
    parsed = text ? parseInput(text) : null;
    drawDraft();
  }

  function drawDraft() {
    saveBtn.disabled = !parsed;
    if (!parsed) { pv.innerHTML = ''; return; }
    if (parsed.kind === 'task') {
      pv.innerHTML = `<div class="preview">
        <div class="pv-type">${icon('tasks', 14)} משימה</div>
        <div class="pv-grid"><span class="k">משימה</span><input class="input" data-f="title" value="${esc(parsed.title || parsed.raw)}">
        ${parsed.date ? `<span class="k">יעד</span><span>${esc(fmtDateLong(parsed.date))}</span>` : ''}</div>
        <button class="btn-text" data-as-event style="margin-top:6px">${icon('calendar', 14)} להפוך לאירוע ביומן</button>
      </div>`;
      return;
    }
    pv.innerHTML = `<div class="preview">
      <div class="pv-type">${icon('calendar', 14)} אירוע ביומן${parsed.tasks.length ? ` + ${parsed.tasks.length} משימות` : ''}</div>
      <div class="pv-grid">
        <span class="k">כותרת</span><input class="input" data-f="title" value="${esc(parsed.title)}">
        <span class="k">תאריך</span><input class="input" type="date" data-f="date" value="${esc(parsed.date)}">
        <span class="k">שעה</span><input class="input" type="time" data-f="time" value="${esc(parsed.time || '')}">
      </div>
      ${parsed.tasks.length ? `<div class="section-title" style="margin:12px 0 2px">משימות מתחת לאירוע (מסונכרנות ללשונית משימות)</div>
        ${parsed.tasks.map((t, i) => `<div class="pv-task"><span class="check"></span><input data-task="${i}" value="${esc(t)}"><button data-rm="${i}" aria-label="הסרה">${icon('x', 16)}</button></div>`).join('')}` : ''}
    </div>`;
  }

  const readEdits = () => {
    if (!parsed) return;
    pv.querySelectorAll('[data-f]').forEach((i) => { parsed[i.dataset.f] = i.value || null; });
    if (parsed.kind === 'event') parsed.tasks = [...pv.querySelectorAll('[data-task]')].map((i) => i.value.trim()).filter(Boolean);
  };

  pv.addEventListener('click', (e) => {
    const rm = e.target.closest('[data-rm]');
    if (rm) { readEdits(); parsed.tasks.splice(+rm.dataset.rm, 1); drawDraft(); return; }
    if (e.target.closest('[data-as-event]')) {
      readEdits();
      parsed = { ...parsed, kind: 'event', date: parsed.date || todayYmd(), tasks: parsed.tasks || [] };
      drawDraft();
    }
  });

  ta.addEventListener('input', renderPreview);
  exEl.addEventListener('click', (e) => {
    const b = e.target.closest('[data-ex]');
    if (b) { ta.value = b.textContent; renderPreview(); }
  });

  saveBtn.onclick = async () => {
    if (!parsed) return;
    readEdits();
    if (parsed.kind === 'event' && !parsed.title) { toast('נא להזין כותרת'); return; }
    if (parsed.kind === 'event' && !parsed.date) parsed.date = todayYmd();
    const res = await createFromParsed(parsed);
    haptic(20);
    sheet.close();
    toast(res.event ? `נוסף ליומן${res.tasks.length ? ` עם ${res.tasks.length} משימות` : ''} ✓` : 'המשימה נוספה ✓');
  };

  /* ---- speech ----
   * iPhone notes:
   *  - recognition must start directly inside the tap (no setTimeout), or iOS silently refuses;
   *  - iOS often never marks results as final and may repeat earlier text, so the transcript is
   *    rebuilt from all results on every event and overlapping chunks are merged;
   *  - recording stops by itself after a short silence. */
  const SILENCE_MS = 2500;
  let base = '', heard = false, lastErr = null, silenceTimer = null, maxTimer = null;

  function mergeResults(results) {
    const parts = [];
    for (let i = 0; i < results.length; i++) {
      const t = (results[i][0]?.transcript || '').trim();
      if (!t) continue;
      const last = parts[parts.length - 1];
      if (last && t.startsWith(last)) parts[parts.length - 1] = t; // cumulative repeat
      else if (last && last.startsWith(t)) continue; // shorter duplicate
      else parts.push(t);
    }
    return parts.join(' ');
  }

  const ERRORS = {
    'not-allowed': 'אין הרשאת מיקרופון. בהגדרות האייפון: Safari ← מיקרופון ← "אפשר". בינתיים אפשר להשתמש במיקרופון של המקלדת 🎙️',
    'service-not-allowed': 'זיהוי הדיבור כבוי באייפון. בהגדרות: כללי ← מקלדת ← "הפעלת הכתבה". בינתיים השתמשו במיקרופון של המקלדת 🎙️',
    'language-not-supported': 'עברית לא מופעלת בהכתבה. בהגדרות: כללי ← מקלדת ← שפות הכתבה ← עברית',
    'audio-capture': 'המיקרופון לא זמין (אולי בשימוש בשיחה או באפליקציה אחרת)',
    'network': 'זיהוי הדיבור צריך חיבור לאינטרנט. אפשר להקליד בינתיים',
    'no-speech': 'לא נשמע דיבור. הקישו על המיקרופון ודברו קרוב לטלפון',
  };

  function start() {
    if (!SR) { keyboardFallback('ההקלטה לא נתמכת כאן. הקישו על 🎙️ במקלדת כדי להכתיב'); return; }
    stop(true);
    base = ta.value.trim();
    heard = false; lastErr = null;
    let r;
    try {
      r = new SR();
      r.lang = 'he-IL';
      r.interimResults = true;
      r.continuous = true;
      r.maxAlternatives = 1;
    } catch {
      keyboardFallback('ההקלטה לא זמינה. הקישו על 🎙️ במקלדת כדי להכתיב');
      return;
    }
    rec = r;
    r.onresult = (e) => {
      if (rec !== r) return;
      const text = mergeResults(e.results);
      if (!text) return;
      heard = true;
      ta.value = base ? `${base} ${text}` : text;
      renderPreview();
      clearTimeout(silenceTimer);
      silenceTimer = setTimeout(() => { if (rec === r) r.stop(); }, SILENCE_MS);
    };
    r.onerror = (e) => { if (rec === r && e.error !== 'aborted') lastErr = e.error; };
    r.onend = () => {
      if (rec !== r) return;
      rec = null;
      clearTimeout(silenceTimer); clearTimeout(maxTimer);
      setRec(false);
      if (lastErr && !(lastErr === 'no-speech' && heard)) hint.textContent = ERRORS[lastErr] || `ההקלטה נעצרה (${lastErr}). אפשר לנסות שוב או להקליד`;
      else if (!heard) hint.textContent = ERRORS['no-speech'];
      else hint.textContent = 'נקלט ✓ בדקו את הטקסט, תקנו אם צריך ולחצו "שמירה". הקשה על המיקרופון ממשיכה להקליט';
    };
    try {
      r.start();
    } catch {
      rec = null;
      keyboardFallback('לא ניתן להתחיל הקלטה. הקישו על 🎙️ במקלדת כדי להכתיב');
      return;
    }
    setRec(true);
    maxTimer = setTimeout(() => { if (rec === r) r.stop(); }, 60000);
  }

  function stop(silent = false) {
    clearTimeout(silenceTimer); clearTimeout(maxTimer);
    const r = rec;
    if (!r) return;
    if (silent) { rec = null; try { r.abort(); } catch { /* ignore */ } setRec(false); return; }
    try { r.stop(); } catch { rec = null; setRec(false); }
  }

  function keyboardFallback(msg) {
    hint.textContent = msg;
    ta.focus(); // inside a tap this also opens the keyboard (with its own 🎙️ dictation key)
  }

  function setRec(on) {
    recording = on;
    orb.classList.toggle('rec', on);
    orb.innerHTML = icon(on ? 'stop' : 'mic', 40);
    orb.setAttribute('aria-label', on ? 'עצירת הקלטה' : 'הקלטה');
    if (on) hint.textContent = 'מקשיב… דברו בעברית (ההקלטה נעצרת לבד אחרי שתיקה)';
  }
  orb.onclick = () => (recording ? stop() : start());

  if (keyboardMode) {
    // focus synchronously inside the tap so iOS opens the keyboard (with its 🎙️ key) right away
    ta.focus();
    return;
  }
  // must run synchronously inside the tap that opened the sheet (browser gesture rule)
  if (autoStart) start();
  else ta.focus();
}
