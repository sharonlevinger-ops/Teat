// אתר תרגילי גיטרה – ללא שרת וללא תלויות. נפתח ישירות מהקובץ index.html.
(function () {
  'use strict';
  const DATA = window.GUITAR_DATA;
  const app = document.getElementById('app');
  const handBtn = document.getElementById('hand');

  // ---------- אחסון מקומי (לא נכשל אם הדפדפן חוסם אותו) ----------
  const load = (k, d) => {
    try {
      const v = localStorage.getItem('guitar:' + k);
      return v === null ? d : JSON.parse(v);
    } catch (e) {
      return d;
    }
  };
  const save = (k, v) => {
    try {
      localStorage.setItem('guitar:' + k, JSON.stringify(v));
    } catch (e) {
      /* מתעלמים */
    }
  };
  const S = {
    lefty: load('lefty', true),
    notesSound: load('notesSound', false),
    countIn: load('countIn', true),
    log: load('log', {}),
  };

  const allEx = DATA.levels.flatMap((l) => l.exercises || []);
  const findEx = (id) => allEx.find((e) => e.id === id);
  // רצפי מספרים ("1-2-3-4") ומונחים באנגלית נשארים בכיוון שמאל-לימין בתוך טקסט עברי
  const fx = (t) => t.replace(/\d+(?:[-–]\d+)+|[A-Za-z][A-Za-z-]*[A-Za-z]/g, (m) => `<bdi dir="ltr">${m}</bdi>`);
  const fingerName = (n) => DATA.fingers.find((f) => f.n === n).name;

  // ---------- מטרונום (Web Audio, תזמון מדויק) ----------
  const OPEN_MIDI = { 6: 40, 5: 45, 4: 50, 3: 55, 2: 59, 1: 64 }; // E2 A2 D3 G3 B3 E4
  const Met = {
    ctx: null, running: false, bpm: 60, timer: null, raf: 0, next: 0, counter: 0, queue: [], ex: null, onTick: null,
    ensureCtx() {
      if (!this.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        this.ctx = new AC();
      }
      if (this.ctx.state === 'suspended') this.ctx.resume();
    },
    click(t, accent) {
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.frequency.value = accent ? 1500 : 1000;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.5, t + 0.002);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
      o.connect(g).connect(this.ctx.destination);
      o.start(t);
      o.stop(t + 0.08);
    },
    pluck(note, t) {
      const midi = OPEN_MIDI[note.s] + note.f;
      const freq = 440 * Math.pow(2, (midi - 69) / 12);
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = 'triangle';
      o.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.28, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + Math.min(0.9, (60 / this.bpm) * 0.95));
      o.connect(g).connect(this.ctx.destination);
      o.start(t);
      o.stop(t + 1);
    },
    start(ex, bpm, onTick) {
      this.stop();
      this.ensureCtx();
      this.ex = ex;
      this.bpm = bpm;
      this.onTick = onTick;
      this.running = true;
      this.counter = S.countIn ? -4 : 0;
      this.next = this.ctx.currentTime + 0.12;
      this.timer = setInterval(() => this.schedule(), 25);
      const loop = () => {
        if (!this.running) return;
        let last = null;
        while (this.queue.length && this.queue[0].t <= this.ctx.currentTime) last = this.queue.shift();
        if (last) this.onTick(last.c);
        this.raf = requestAnimationFrame(loop);
      };
      this.raf = requestAnimationFrame(loop);
    },
    schedule() {
      while (this.next < this.ctx.currentTime + 0.12) {
        const c = this.counter;
        const accent = (((c % 4) + 4) % 4) === 0;
        this.click(this.next, accent);
        if (c >= 0 && S.notesSound) this.pluck(this.ex.steps[c % this.ex.steps.length], this.next);
        this.queue.push({ c, t: this.next });
        this.next += 60 / this.bpm;
        this.counter++;
      }
    },
    stop() {
      this.running = false;
      clearInterval(this.timer);
      cancelAnimationFrame(this.raf);
      this.queue = [];
    },
  };

  // ---------- לוח צוואר (SVG) ----------
  const STRING_NAMES = { 1: 'e', 2: 'B', 3: 'G', 4: 'D', 5: 'A', 6: 'E' };
  const STRING_W = { 1: 1, 2: 1.4, 3: 1.9, 4: 2.5, 5: 3.1, 6: 3.7 };
  const keyOf = (n) => n.s + '-' + n.f;

  function boardSvg(ex, lefty) {
    const frets = ex.frets;
    const L = 70, R = 730, top = 46, gap = 30;
    const norm = 1 - Math.pow(2, -frets / 12);
    const frac = (k) => (1 - Math.pow(2, -k / 12)) / norm;
    // לשמאלי: ראש הגיטרה (האום) מימין, והסריגים עולים שמאלה
    const xk = (k) => (lefty ? R - frac(k) * (R - L) : L + frac(k) * (R - L));
    const yS = (s) => top + (s - 1) * gap;
    const bottom = yS(6);
    let svg = `<svg viewBox="0 0 800 ${bottom + 78}" role="img" aria-label="לוח צוואר גיטרה">`;
    // גוף הצוואר
    svg += `<rect x="${L}" y="${top - 16}" width="${R - L}" height="${bottom - top + 32}" rx="6" fill="var(--wood)"/>`;
    // סימוני סריגים 3 ו-5
    for (const m of [3, 5]) {
      if (m <= frets) {
        const cx = (xk(m - 1) + xk(m)) / 2;
        svg += `<circle cx="${cx}" cy="${(top + bottom) / 2}" r="7" fill="var(--wood-dark)" opacity=".7"/>`;
      }
    }
    // חוטי סריג ואום
    for (let k = 1; k <= frets; k++) {
      svg += `<line x1="${xk(k)}" x2="${xk(k)}" y1="${top - 16}" y2="${bottom + 16}" stroke="var(--fret)" stroke-width="3"/>`;
    }
    const nutW = 9;
    svg += `<rect x="${xk(0) - nutW / 2}" y="${top - 16}" width="${nutW}" height="${bottom - top + 32}" fill="var(--nut)"/>`;
    // מיתרים
    for (let s = 1; s <= 6; s++) {
      svg += `<line x1="${L}" x2="${R}" y1="${yS(s)}" y2="${yS(s)}" stroke="var(--string)" stroke-width="${STRING_W[s]}"/>`;
    }
    // שמות מיתרים בצד האום, ומספרי סריגים למטה
    const lx = lefty ? R + 26 : L - 26;
    for (let s = 1; s <= 6; s++) {
      svg += `<text x="${lx}" y="${yS(s)}" text-anchor="middle" dominant-baseline="central" font-size="15" fill="var(--muted)">${STRING_NAMES[s]}</text>`;
    }
    svg += `<text x="${lx}" y="${top - 30}" text-anchor="middle" font-size="12" fill="var(--muted)">ראש הגיטרה</text>`;
    for (let k = 1; k <= frets; k++) {
      svg += `<text x="${(xk(k - 1) + xk(k)) / 2}" y="${bottom + 44}" text-anchor="middle" font-size="14" fill="var(--muted)">סריג ${k}</text>`;
    }
    // נקודות: מיקום קרוב לחוט הסריג, בצד שפונה לראש הגיטרה
    const seen = new Set();
    for (const n of ex.steps) {
      const key = keyOf(n);
      if (seen.has(key)) continue;
      seen.add(key);
      const cx = xk(n.f) + (xk(n.f - 1) - xk(n.f)) * 0.3;
      svg += `<g class="dot" data-key="${key}"><circle cx="${cx}" cy="${yS(n.s)}" r="12" fill="var(--f${n.fi})"/><text x="${cx}" y="${yS(n.s)}">${n.fi}</text></g>`;
    }
    return svg + '</svg>';
  }

  // ---------- דף הבית ----------
  const fmtDate = (iso) => new Date(iso).toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric' });
  function summary(id) {
    const rows = S.log[id] || [];
    if (!rows.length) return '';
    const last = rows[rows.length - 1];
    return `<span class="done">${rows.length} פעמים · אחרונה ${fmtDate(last.at)} ב-${last.bpm} BPM</span>`;
  }

  function renderHome() {
    Met.stop();
    handBtn.hidden = false;
    app.innerHTML =
      `<h1>תרגילי חימום לאצבעות</h1><p class="muted">בחר תרגיל. הלוח מציג איפה לשים כל אצבע, והמטרונום מוביל אותך תו אחרי תו.</p>` +
      DATA.levels
        .map((lv) => {
          const body = lv.exercises
            ? `<ul class="ex-list">${lv.exercises
                .map((e) => `<li><a class="ex" href="#${e.id}"><b>${fx(e.title)}</b><span>${fx(e.goal)}</span> ${summary(e.id)}</a></li>`)
                .join('')}</ul>`
            : `<ul class="soon">${lv.soon.map((t) => `<li>${fx(t)} <span class="tag">בקרוב</span></li>`).join('')}</ul>`;
          return `<section class="level"><h2>${fx(lv.name)}</h2><p>${fx(lv.desc)}</p>${body}</section>`;
        })
        .join('');
  }

  // ---------- דף תרגיל ----------
  const TIPS = [
    'לוחצים עם <b>קצה האצבע</b> (ליד הציפורן), לא עם החלק השטוח.',
    'שמים את האצבע <b>קרוב לחוט הסריג</b>, בצד שפונה לראש הגיטרה (כמו הנקודות בלוח). ככה צריך פחות כוח והצליל נקי.',
    'לוחצים בדיוק כמה שצריך: אם יש זמזום, התקרב לחוט הסריג; אם הצליל עמום, לחץ קצת יותר חזק.',
    'האגודל <b>מאחורי הצוואר</b>, בערך מול האצבע האמצעית, ולא מעל הצוואר.',
    'האצבעות <b>מקושתות</b>, כך שאצבע לא נוגעת במיתרים הסמוכים.',
    'אם יש כאב ביד או באצבעות, עוצרים ונחים.',
  ];

  function renderExercise(ex) {
    Met.stop();
    handBtn.hidden = false;
    let bpm = load('bpm:' + ex.id, ex.startBpm);
    const n = ex.steps.length;
    app.innerHTML = `
      <a class="back" href="#">‹ חזרה לרמות</a>
      <h1 class="ex-title">${fx(ex.title)}</h1>
      <p class="muted">${fx(ex.goal)}</p>
      <div class="legend">${DATA.fingers.map((f) => `<span class="fchip"><i class="f${f.n}">${f.n}</i>${f.name}</span>`).join('')}
        <span class="muted" style="font-size:.8rem">מיתר 1 = הדק ביותר (e), מיתר 6 = העבה ביותר (E)</span></div>
      <div class="board-wrap" id="board"></div>
      <div class="now" id="now">לחץ "התחל" כדי להתחיל.</div>
      <div class="controls">
        <div class="pulse" id="pulse" aria-live="off">♩</div>
        <div class="bpm">
          <button class="step" id="slower" aria-label="לאט יותר">−</button>
          <input type="range" id="bpm" min="30" max="160" value="${bpm}" aria-label="מהירות" />
          <button class="step" id="faster" aria-label="מהר יותר">+</button>
          <output id="bpmOut"></output>
        </div>
        <button class="start" id="start">▶ התחל</button>
      </div>
      <div class="opts">
        <label><input type="checkbox" id="optCount" ${S.countIn ? 'checked' : ''}/> הכנה של 4 קליקים</label>
        <label><input type="checkbox" id="optSound" ${S.notesSound ? 'checked' : ''}/> השמע גם את הצלילים</label>
      </div>
      <section class="card"><h3>איך מתרגלים</h3><ol>${ex.howTo.map((t) => `<li>${fx(t)}</li>`).join('')}</ol></section>
      <section class="card"><h3>לחיצה נכונה</h3><ul>${TIPS.map((t) => `<li>${t}</li>`).join('')}</ul></section>
      <section class="card"><h3>התקדמות</h3>
        <p class="muted" style="margin-top:0">התחל לאט. כשאתה מצליח שלוש פעמים ברצף בלי זמזום או צליל שבור, העלה 5 BPM.</p>
        <button class="save" id="save">סיימתי, שמור</button><span class="saved" id="savedMsg"></span>
        <div id="history"></div>
      </section>`;

    const board = document.getElementById('board');
    const now = document.getElementById('now');
    const pulse = document.getElementById('pulse');
    const startBtn = document.getElementById('start');
    const bpmIn = document.getElementById('bpm');
    const bpmOut = document.getElementById('bpmOut');

    const drawBoard = () => (board.innerHTML = boardSvg(ex, S.lefty));
    const setBpm = (v) => {
      bpm = Math.max(30, Math.min(160, v));
      bpmIn.value = bpm;
      bpmOut.textContent = bpm + ' BPM';
      save('bpm:' + ex.id, bpm);
      if (Met.running) Met.bpm = bpm;
    };
    const history = () => {
      const rows = S.log[ex.id] || [];
      const el = document.getElementById('history');
      if (!rows.length) return (el.innerHTML = '');
      const best = Math.max(...rows.map((r) => r.bpm));
      el.innerHTML = `<p style="margin-bottom:0">${rows.length} פעמים · השיא שלך: <b>${best} BPM</b> · אחרונות: ${rows
        .slice(-5)
        .reverse()
        .map((r) => `${fmtDate(r.at)} (${r.bpm})`)
        .join(', ')}</p>`;
    };

    const resetUi = () => {
      const svg = board.querySelector('svg');
      if (svg) {
        svg.classList.remove('running');
        svg.querySelectorAll('.dot.cur').forEach((d) => d.classList.remove('cur'));
      }
      pulse.className = 'pulse';
      pulse.textContent = '♩';
      startBtn.textContent = '▶ התחל';
      startBtn.classList.remove('on');
    };

    const onTick = (c) => {
      pulse.classList.remove('beat', 'accent', 'count');
      void pulse.offsetWidth; // מאתחל את האנימציה
      if (c < 0) {
        pulse.textContent = -c;
        pulse.classList.add('beat', 'count');
        now.innerHTML = 'מתכוננים…';
        return;
      }
      const i = c % n;
      const step = ex.steps[i];
      const inBar = (c % 4) + 1;
      pulse.textContent = inBar;
      pulse.classList.add('beat');
      if (inBar === 1) pulse.classList.add('accent');
      const svg = board.querySelector('svg');
      svg.classList.add('running');
      svg.querySelectorAll('.dot.cur').forEach((d) => d.classList.remove('cur'));
      const dot = svg.querySelector(`.dot[data-key="${keyOf(step)}"]`);
      if (dot) dot.classList.add('cur');
      now.innerHTML = `מיתר <b>${step.s}</b> (${STRING_NAMES[step.s]}) · סריג <b>${step.f}</b> · אצבע <b>${step.fi}</b> (${fingerName(step.fi)}) <span class="muted">· תו ${i + 1} מתוך ${n}</span>`;
    };

    startBtn.onclick = () => {
      if (Met.running) {
        Met.stop();
        resetUi();
        now.textContent = 'נעצר.';
      } else {
        startBtn.textContent = '■ עצור';
        startBtn.classList.add('on');
        Met.start(ex, bpm, onTick);
      }
    };
    document.getElementById('slower').onclick = () => setBpm(bpm - 5);
    document.getElementById('faster').onclick = () => setBpm(bpm + 5);
    bpmIn.oninput = () => setBpm(Number(bpmIn.value));
    document.getElementById('optCount').onchange = (e) => ((S.countIn = e.target.checked), save('countIn', S.countIn));
    document.getElementById('optSound').onchange = (e) => ((S.notesSound = e.target.checked), save('notesSound', S.notesSound));
    document.getElementById('save').onclick = () => {
      (S.log[ex.id] ||= []).push({ at: new Date().toISOString(), bpm });
      save('log', S.log);
      document.getElementById('savedMsg').textContent = 'נשמר ✓';
      history();
    };

    drawBoard();
    setBpm(bpm);
    history();
    // החלפת יד מציירת מחדש את הלוח (ושומרת על מצב הריצה)
    renderExercise.redraw = () => {
      drawBoard();
      if (Met.running) board.querySelector('svg').classList.add('running');
    };
  }

  // ---------- יד שמאלית / ימנית ----------
  function updateHandBtn() {
    handBtn.textContent = S.lefty ? 'גיטרה שמאלית ⇄' : 'גיטרה ימנית ⇄';
    handBtn.title = 'החלפת כיוון התצוגה של לוח הצוואר';
  }
  handBtn.onclick = () => {
    S.lefty = !S.lefty;
    save('lefty', S.lefty);
    updateHandBtn();
    if (renderExercise.redraw && location.hash.length > 1) renderExercise.redraw();
  };

  // ---------- ניתוב לפי hash ----------
  function route() {
    const id = location.hash.slice(1);
    const ex = id && findEx(id);
    renderExercise.redraw = null;
    if (ex) renderExercise(ex);
    else renderHome();
    window.scrollTo(0, 0);
  }
  window.addEventListener('hashchange', route);
  updateHandBtn();
  route();
})();
