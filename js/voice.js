// Smart voice / text input: Hebrew speech (he-IL) → parser → one-tap confirm.
import { parseInput } from './parser.js';
import { createFromParsed } from './store.js';
import { icon } from './icons.js';
import { esc, openSheet, toast, fmtDateLong, haptic } from './util.js';

const SR = window.SpeechRecognition || window.webkitSpeechRecognition;

const EXAMPLES = [
  'מחר בחמש פגישה עם חשמלאי ולאחר מכן לקנות חלב',
  'אימון בשעה 17:00 ולאחר מכן לקנות חלב ופירות',
  'טסט לרכב ביום שלישי 25/11 בשעה 8:30',
  'להתקשר לביטוח',
];

export function openVoice({ autoStart = true } = {}) {
  let rec = null, recording = false, finalText = '', parsed = null;
  const body = document.createElement('div');
  body.innerHTML = `
    <button class="voice-orb" data-mic aria-label="הקלטה">${icon('mic', 40)}</button>
    <div class="voice-hint" data-hint>${SR ? 'הקישו על המיקרופון ודברו בחופשיות' : 'הקלידו, או השתמשו במיקרופון של המקלדת 🎙️'}</div>
    <textarea class="textarea" data-text placeholder="מה בתוכנית? למשל: מחר בחמש פגישה עם חשמלאי ולאחר מכן לקנות חלב" style="min-height:84px"></textarea>
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
    onClose: () => stop(),
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

  /* ---- speech ---- */
  function start() {
    if (!SR) { ta.focus(); return; }
    try {
      rec = new SR();
      rec.lang = 'he-IL';
      rec.interimResults = true;
      rec.continuous = true;
      finalText = ta.value ? ta.value.trim() + ' ' : '';
      rec.onresult = (e) => {
        let interim = '';
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const r = e.results[i];
          if (r.isFinal) finalText += r[0].transcript.trim() + ' ';
          else interim += r[0].transcript;
        }
        ta.value = (finalText + interim).trim();
        renderPreview();
      };
      rec.onerror = (e) => {
        hint.textContent = e.error === 'not-allowed' ? 'אין הרשאת מיקרופון – אפשרו בהגדרות, או השתמשו במקלדת' : 'ההקלטה נעצרה – אפשר להקליד או לנסות שוב';
        setRec(false);
      };
      rec.onend = () => setRec(false);
      rec.start();
      setRec(true);
    } catch {
      hint.textContent = 'הקלטה לא זמינה – השתמשו במיקרופון של המקלדת';
      ta.focus();
    }
  }
  function stop() { try { rec?.stop(); } catch { /* ignore */ } setRec(false); }
  function setRec(on) {
    recording = on;
    orb.classList.toggle('rec', on);
    orb.innerHTML = icon(on ? 'stop' : 'mic', 40);
    if (on) hint.textContent = 'מקשיב… דברו בעברית';
    else if (hint.textContent === 'מקשיב… דברו בעברית') hint.textContent = 'הקישו שוב להמשך הקלטה';
  }
  orb.onclick = () => (recording ? stop() : start());

  if (autoStart && SR) setTimeout(start, 300);
  else setTimeout(() => ta.focus(), 350);
}
