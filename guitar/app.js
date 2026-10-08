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
  const isGuide = (ex) => ex.type === 'guide';

  // רצפי מספרים ("1-2-3-4") ומונחים באנגלית נשארים בכיוון שמאל-לימין בתוך טקסט עברי
  const fx = (t) =>
    t.replace(/(<[^>]+>)|(\d+(?:[-–]\d+)+|[A-Za-z][A-Za-z-]*(?:[ ,]+[A-Za-z][A-Za-z-]*)*)/g, (m, tag, txt) =>
      tag ? tag : `<bdi dir="ltr">${txt}</bdi>`
    );
  const fingerName = (n) => DATA.fingers.find((f) => f.n === n).name;

  // ---------- תווים ----------
  const OPEN_MIDI = { 6: 40, 5: 45, 4: 50, 3: 55, 2: 59, 1: 64 }; // E2 A2 D3 G3 B3 E4
  const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const noteName = (s, f) => NOTE_NAMES[(OPEN_MIDI[s] + f) % 12];
  const STRING_NAMES = { 1: 'e', 2: 'B', 3: 'G', 4: 'D', 5: 'A', 6: 'E' };
  const STRING_W = { 1: 1, 2: 1.4, 3: 1.9, 4: 2.5, 5: 3.1, 6: 3.7 };
  const keyOf = (n) => n.s + '-' + n.f;

  // כמה פעימות נמשך כל צעד (אקורדים: כמה פעימות לאקורד)
  const bpsOf = (ex) => ex.beatsPerStep || 1;
  const stepIndexOf = (ex, c) => Math.floor(c / bpsOf(ex)) % ex.steps.length;

  // ---------- מטרונום (Web Audio, תזמון מדויק) ----------
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
    pluck(note, t, len) {
      const midi = OPEN_MIDI[note.s] + note.f;
      const freq = 440 * Math.pow(2, (midi - 69) / 12);
      const dur = len || Math.min(0.9, (60 / this.bpm) * 0.95);
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = 'triangle';
      o.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(note.t ? 0.12 : 0.22, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(this.ctx.destination);
      o.start(t);
      o.stop(t + dur + 0.05);
    },
    strum(step, t) {
      if (step.rest) return;
      let k = 0;
      for (let s = 6; s >= 1; s--) {
        if (step.mute.includes(s)) continue;
        const nt = step.notes.find((x) => x.s === s);
        this.pluck({ s, f: nt ? nt.f : 0 }, t + k * 0.03, 1.6);
        k++;
      }
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
      const ex = this.ex;
      const bps = bpsOf(ex);
      while (this.next < this.ctx.currentTime + 0.12) {
        const c = this.counter;
        const accent = (((c % 4) + 4) % 4) === 0;
        this.click(this.next, accent);
        if (c >= 0 && S.notesSound && c % bps === 0) {
          const step = ex.steps[stepIndexOf(ex, c)];
          if (ex.mode === 'chords') this.strum(step, this.next);
          else this.pluck(step, this.next);
        }
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
  function boardSvg(ex, lefty) {
    const frets = ex.frets;
    const startFret = ex.startFret || 1;
    const chords = ex.mode === 'chords';
    const L = 70, R = 730, top = 46, gap = 30;
    // מיקום חוט הסריג k (0 = תחילת החלון) לפי חוקי הצוואר האמיתיים
    const g = (x) => 1 - Math.pow(2, -x / 12);
    const a0 = startFret - 1;
    const frac = (k) => (g(a0 + k) - g(a0)) / (g(a0 + frets) - g(a0));
    // לשמאלי: ראש הגיטרה (האום) מימין, והסריגים עולים שמאלה
    const xk = (k) => (lefty ? R - frac(k) * (R - L) : L + frac(k) * (R - L));
    const yS = (s) => top + (s - 1) * gap;
    const bottom = yS(6);
    const side = lefty ? 1 : -1; // כיוון "מחוץ לאום"
    const xOpen = xk(0) + side * 17;
    const rel = (f) => f - startFret + 1; // סריג בחלון
    const dotX = (f) => xk(rel(f)) + (xk(rel(f) - 1) - xk(rel(f))) * 0.3;

    let svg = `<svg viewBox="0 0 800 ${bottom + 78}" role="img" aria-label="לוח צוואר גיטרה">`;
    svg += `<rect x="${L}" y="${top - 16}" width="${R - L}" height="${bottom - top + 32}" rx="6" fill="var(--wood)"/>`;
    for (const m of [3, 5, 7, 9, 12]) {
      if (m >= startFret && m < startFret + frets) {
        const cx = (xk(rel(m) - 1) + xk(rel(m))) / 2;
        svg += `<circle cx="${cx}" cy="${(top + bottom) / 2}" r="7" fill="var(--wood-dark)" opacity=".7"/>`;
      }
    }
    for (let k = 1; k <= frets; k++) {
      svg += `<line x1="${xk(k)}" x2="${xk(k)}" y1="${top - 16}" y2="${bottom + 16}" stroke="var(--fret)" stroke-width="3"/>`;
    }
    if (startFret === 1) {
      const nutW = 9;
      svg += `<rect x="${xk(0) - nutW / 2}" y="${top - 16}" width="${nutW}" height="${bottom - top + 32}" fill="var(--nut)"/>`;
    } else {
      svg += `<line x1="${xk(0)}" x2="${xk(0)}" y1="${top - 16}" y2="${bottom + 16}" stroke="var(--fret)" stroke-width="3"/>`;
    }
    for (let s = 1; s <= 6; s++) {
      svg += `<line x1="${L}" x2="${R}" y1="${yS(s)}" y2="${yS(s)}" stroke="var(--string)" stroke-width="${STRING_W[s]}"/>`;
    }
    const lx = xk(0) + side * 46;
    for (let s = 1; s <= 6; s++) {
      svg += `<text x="${lx}" y="${yS(s)}" text-anchor="middle" dominant-baseline="central" font-size="15" fill="var(--muted)">${STRING_NAMES[s]}</text>`;
    }
    svg += `<text x="${lefty ? 796 : 4}" y="${top - 30}" text-anchor="${lefty ? 'end' : 'start'}" font-size="12" fill="var(--muted)">${startFret === 1 ? 'ראש הגיטרה' : 'לכיוון ראש הגיטרה'}</text>`;
    for (let k = 1; k <= frets; k++) {
      svg += `<text x="${(xk(k - 1) + xk(k)) / 2}" y="${bottom + 44}" text-anchor="middle" font-size="14" fill="var(--muted)">סריג ${startFret + k - 1}</text>`;
    }

    const dot = (n, extra) => {
      if (n.f === 0) {
        return `<g class="dot open ${extra || ''}" data-key="${keyOf(n)}"><circle cx="${xOpen}" cy="${yS(n.s)}" r="11" fill="var(--surface)" stroke="var(--text)" stroke-width="3"/></g>`;
      }
      const cx = dotX(n.f);
      return `<g class="dot ${extra || ''}" data-key="${keyOf(n)}"><circle cx="${cx}" cy="${yS(n.s)}" r="12" fill="var(--f${n.fi})"/><text x="${cx}" y="${yS(n.s)}">${n.fi}</text></g>`;
    };

    if (chords) {
      ex.steps.forEach((st, i) => {
        svg += `<g class="chord" data-step="${i}">`;
        for (const n of st.notes) svg += dot(n);
        for (const s of st.open) svg += dot({ s, f: 0, fi: 0 });
        for (const s of st.mute) {
          svg += `<text class="mute" x="${xOpen}" y="${yS(s)}" text-anchor="middle" dominant-baseline="central" font-size="22" font-weight="700" fill="var(--muted)">×</text>`;
        }
        svg += '</g>';
      });
    } else {
      const seen = new Set();
      for (const n of ex.steps) {
        const key = keyOf(n);
        if (seen.has(key)) continue;
        seen.add(key);
        svg += dot(n);
      }
    }
    return svg + '</svg>';
  }

  // ---------- סטטיסטיקה ועידוד ----------
  const dayKey = (iso) => new Date(iso).toLocaleDateString('en-CA');
  function stats() {
    const days = new Set();
    Object.values(S.log).forEach((rows) => rows.forEach((r) => days.add(dayKey(r.at))));
    const week = [...days].filter((d) => Date.now() - Date.parse(d) < 7 * 864e5).length;
    return { total: days.size, week };
  }
  const CHEERS = [
    'כל הכבוד! עוד סבב אחד ביומן.',
    'יפה מאוד. עקביות יום אחרי יום שווה יותר מכל אימון ארוך.',
    'שמור. האצבעות שלך כבר זוכרות קצת יותר מאתמול.',
    'מעולה. אל תשכח לנוח כמה שניות עכשיו.',
  ];

  // ---------- דף הבית ----------
  const times = (n) => (n === 1 ? 'פעם אחת' : n + ' פעמים');
  const daysText = (n) => (n === 1 ? 'יום אחד' : n + ' ימים');
  const fmtDate = (iso) => new Date(iso).toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric' });
  function summary(id) {
    const rows = S.log[id] || [];
    if (!rows.length) return '';
    const last = rows[rows.length - 1];
    return `<span class="done">${times(rows.length)} · אחרונה ${fmtDate(last.at)} ב-${last.bpm} BPM</span>`;
  }

  function renderHome() {
    Met.stop();
    const st = stats();
    const statLine = st.total
      ? `תרגלת ${daysText(st.total)} בסך הכול (${st.week} בשבוע האחרון).`
      : 'עוד לא תרגלת. התרגיל הראשון לוקח חמש דקות.';
    app.innerHTML =
      `<h1>תרגילי גיטרה לאצבעות</h1>
       <p class="muted">מיועד למי שרק התחיל להחזיק גיטרה. בוחרים תרגיל, והלוח מראה איפה לשים כל אצבע. המטרונום מוביל אותך.</p>
       <div class="welcome"><b>${statLine}</b><br>חמש עד עשר דקות ביום מספיקות. זה בסדר שזה נשמע לא טוב בהתחלה, כולם מתחילים כך.</div>` +
      DATA.levels
        .map((lv) => {
          const body = `<ul class="ex-list">${lv.exercises
            .map((e) => {
              const tag = isGuide(e) ? '<span class="tag">מדריך</span>' : e.mode === 'chords' ? '<span class="tag">אקורדים</span>' : '';
              return `<li><a class="ex" href="#${e.id}" data-go="${e.id}"><b>${fx(e.title)} ${tag}</b><span>${fx(e.goal)}</span> ${summary(e.id)}</a></li>`;
            })
            .join('')}</ul>`;
          return `<section class="level"><h2>${fx(lv.name)}</h2><p>${fx(lv.desc)}</p>${body}</section>`;
        })
        .join('');
  }

  // ---------- מדריך התחלה ----------
  function guideSections(lefty) {
    const fret = lefty ? 'ימין' : 'שמאל';
    const pick = lefty ? 'שמאל' : 'ימין';
    return [
      { title: 'הכרת הגיטרה', items: [
        'לגיטרה שישה <b>מיתרים</b>. מיתר 1 הוא הדק ביותר והגבוה בצליל, מיתר 6 הוא העבה ביותר והנמוך.',
        'בצוואר יש <b>סריגים</b>: פסי המתכת הדקים. הסריג הראשון הוא הקרוב ביותר לראש הגיטרה.',
        `היד שלוחצת על המיתרים בצוואר היא <b>היד הלוחצת</b> (אצלך: ${fret}). היד השנייה פורטת ליד חור הקול (אצלך: ${pick}). ההסבר הזה מניח גיטרה ${lefty ? 'שמאלית' : 'ימנית'}. אפשר להחליף למעלה.`,
        'האצבעות ביד הלוחצת ממוספרות: <b>1 מורה, 2 אמצעית, 3 קמיצה, 4 זרת</b>. האגודל לא נספר.',
      ] },
      { title: 'איך יושבים ומחזיקים', items: [
        'יושבים על כיסא יציב בלי ידיות, עם גב ישר אבל לא דרוך. הכתפיים רפויות.',
        `גוף הגיטרה נשען על הירך (אצלך: ${lefty ? 'השמאלית' : 'הימנית'}) והצוואר מצביע לכיוון היד הלוחצת, מעט כלפי מעלה.`,
        'האגודל של היד הלוחצת <b>מאחורי הצוואר</b>, בערך מול האצבע האמצעית, לא מעל הצוואר.',
        'האצבעות מקושתות, כך שכל אצבע לוחצת בקצה ולא נוגעת במיתרים הסמוכים.',
      ] },
      { title: 'איך קוראים את הלוח באתר', items: [
        'הלוח מראה את הצוואר מלמעלה. בצד אחד נמצא ראש הגיטרה (מסומן), והאותיות E A D G B e הן שמות המיתרים.',
        'נקודה צבעונית = לוחצים שם. המספר בתוכה = איזו אצבע.',
        'עיגול ריק ליד ראש הגיטרה = <b>מיתר פתוח</b>: פורטים אותו בלי ללחוץ. סימן × = לא פורטים את המיתר.',
        'כשהמטרונום פועל, רק הנקודה הנוכחית מוארת, ומתחת כתוב באיזה מיתר, סריג ואצבע.',
      ] },
      { title: 'כיוון הגיטרה', items: [
        'גיטרה לא מכוונת נשמעת לא נכון גם כשהאצבעות במקום הנכון. לפני כל תרגול כדאי לכוון.',
        'אפשר להוריד אפליקציית כיוון חינמית לטלפון. הכיוון הרגיל, מהעבה לדק: <b>E A D G B e</b>.',
        'מיתרים חדשים נמתחים בימים הראשונים, ולכן הם יוצאים מכיוון הרבה. זה נורמלי.',
      ] },
      { title: 'כמה מתרגלים', items: [
        'חמש עד עשר דקות ביום עדיפות על שעה אחת בשבוע.',
        'אחרי כל תרגיל נחים כמה שניות. אצבעות עייפות מתרגלות פחות טוב.',
        'קצות האצבעות יכאבו קצת בימים הראשונים. זה נורמלי, ואחרי שבועיים-שלושה נוצרות יבלות והכאב נעלם.',
        'כאב חד, נימול, או כאב בשורש כף היד או בכתף: עוצרים ונחים. אם זה חוזר, כדאי להתייעץ עם מורה לגיטרה או עם רופא.',
      ] },
      { title: 'מה נורמלי', items: [
        'זמזום, צליל עמום או אצבע שלא "תופסת" הם חלק מהלימוד. זה לא סימן שאין לך כישרון.',
        'הרבה מהזמזום נעלם כשהאצבע קרובה יותר לחוט הסריג ולוחצת בקצה.',
        'אפשר לדלג על תרגיל שמתסכל ולחזור אליו אחרי כמה ימים. אין סדר חובה.',
      ] },
      { title: 'איך מתקדמים', items: [
        'מתחילים ב-40 BPM או פחות. המהירות הנכונה היא כזו שאפשר לבצע בלי לחשוב.',
        'כשהצלחת שלוש פעמים ברצף בלי זמזום או צליל שבור, מעלים 5 BPM.',
        'אם משהו קשה מדי, חוזרים לתרגיל קודם. זו לא נסיגה, זו בנייה.',
      ] },
    ];
  }

  function renderGuide(ex) {
    Met.stop();
    app.innerHTML = `
      <a class="back" href="#" data-go="">‹ חזרה לרמות</a>
      <h1 class="ex-title">${fx(ex.title)}</h1>
      <p class="muted">${fx(ex.goal)}</p>
      ${guideSections(S.lefty)
        .map((sec) => `<section class="card"><h3>${sec.title}</h3><ul>${sec.items.map((t) => `<li>${fx(t)}</li>`).join('')}</ul></section>`)
        .join('')}
      <p><a class="start link-btn" href="#open" data-go="open">מתחילים: מכירים את המיתרים ›</a></p>`;
    renderExercise.redraw = () => renderGuide(ex);
  }

  // ---------- דף תרגיל ----------
  const TIPS = [
    'לוחצים עם <b>קצה האצבע</b> (ליד הציפורן), לא עם החלק השטוח.',
    'שמים את האצבע <b>קרוב לחוט הסריג</b>, בצד שפונה לראש הגיטרה (כמו הנקודות בלוח). ככה צריך פחות כוח והצליל נקי.',
    'לוחצים בדיוק כמה שצריך: אם יש זמזום, התקרב לחוט הסריג; אם הצליל עמום, לחץ קצת יותר חזק.',
    'האגודל <b>מאחורי הצוואר</b>, בערך מול האצבע האמצעית, ולא מעל הצוואר.',
    'האצבעות <b>מקושתות</b>, כך שאצבע לא נוגעת במיתרים הסמוכים.',
    'אם יש כאב חד ביד או באצבעות, עוצרים ונחים.',
  ];
  const HARD = [
    'האט. 30 BPM זה לגמרי בסדר, ושום דבר לא נשבר אם נשארים שם שבוע.',
    'תרגל שתי דקות, נוח, וחזור. אצבעות עייפות לא לומדות.',
    'אם תרגיל מתסכל, חזור לתרגיל הקודם והמשך מכאן בעוד כמה ימים.',
    'שמעת זמזום או צליל עמום? זה נורמלי. תתקרב לחוט הסריג ותלחץ בקצה האצבע.',
  ];

  function chordHelp(ex) {
    const seen = new Set();
    const rows = [];
    for (const st of ex.steps) {
      if (st.rest || seen.has(st.name)) continue;
      seen.add(st.name);
      const fingers = st.notes.map((n) => `אצבע ${n.fi} במיתר ${n.s} בסריג ${n.f}`).join(', ');
      const mute = st.mute.length ? `. לא פורטים: מיתר ${st.mute.join(' ו-')}` : '. פורטים את כל המיתרים';
      rows.push(`<li><b><bdi dir="ltr">${st.name}</bdi></b>: ${fingers}${mute}</li>`);
    }
    return rows.length ? `<section class="card"><h3>האקורדים בתרגיל</h3><ul>${rows.join('')}</ul></section>` : '';
  }

  function renderExercise(ex) {
    Met.stop();
    let bpm = load('bpm:' + ex.id, ex.startBpm);
    const n = ex.steps.length;
    const bps = bpsOf(ex);
    const chords = ex.mode === 'chords';
    const usesOpen = ex.steps.some((st) => (chords ? st.open.length || st.mute.length : st.f === 0));
    let peak = bpm;
    let runStart = bpm;
    app.innerHTML = `
      <a class="back" href="#" data-go="">‹ חזרה לרמות</a>
      <h1 class="ex-title">${fx(ex.title)}</h1>
      <p class="muted">${fx(ex.goal)}</p>
      <div class="legend">${DATA.fingers.map((f) => `<span class="fchip"><i class="f${f.n}">${f.n}</i>${f.name}</span>`).join('')}
        ${usesOpen ? '<span class="fchip"><i class="openchip"></i>מיתר פתוח</span>' : ''}
        <span class="muted" style="font-size:.8rem">מיתר 1 = הדק ביותר (e), מיתר 6 = העבה ביותר (E)</span></div>
      <div class="board-wrap" id="board"></div>
      <div class="now" id="now">לחץ "התחל" כדי להתחיל.</div>
      <div class="controls">
        <div class="pulse" id="pulse" aria-live="off">♩</div>
        <div class="bpm">
          <button class="step" id="slower" aria-label="לאט יותר">−</button>
          <input type="range" id="bpm" min="20" max="160" value="${bpm}" aria-label="מהירות" />
          <button class="step" id="faster" aria-label="מהר יותר">+</button>
          <output id="bpmOut"></output>
        </div>
        <button class="start" id="start">▶ התחל</button>
      </div>
      <div class="opts">
        <label><input type="checkbox" id="optCount" ${S.countIn ? 'checked' : ''}/> הכנה של 4 קליקים</label>
        <label><input type="checkbox" id="optSound" ${S.notesSound ? 'checked' : ''}/> השמע גם את הצלילים</label>
      </div>
      ${ex.ramp ? `<p class="muted small">המהירות עולה מעצמה (${ex.ramp.step} BPM בכל פעם, עד ${ex.ramp.max}). עצור כשזה מתחיל להיות מלוכלך.</p>` : ''}
      <section class="card"><h3>איך מתרגלים</h3><ol>${ex.howTo.map((t) => `<li>${fx(t)}</li>`).join('')}</ol></section>
      ${chords ? chordHelp(ex) : ''}
      <section class="card"><h3>לחיצה נכונה</h3><ul>${TIPS.map((t) => `<li>${t}</li>`).join('')}</ul></section>
      <section class="card"><h3>אם זה לא יוצא</h3><ul>${HARD.map((t) => `<li>${t}</li>`).join('')}</ul></section>
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

    const showChord = (i) => {
      board.querySelectorAll('.chord').forEach((g) => g.classList.toggle('cur', Number(g.dataset.step) === i));
    };
    const drawBoard = () => {
      board.innerHTML = boardSvg(ex, S.lefty);
      if (chords) showChord(0);
    };
    const setBpm = (v, opts) => {
      bpm = Math.max(20, Math.min(160, v));
      bpmIn.value = bpm;
      bpmOut.textContent = bpm + ' BPM';
      if (!opts || opts.persist !== false) save('bpm:' + ex.id, bpm);
      if (Met.running) Met.bpm = bpm;
    };
    const history = () => {
      const rows = S.log[ex.id] || [];
      const el = document.getElementById('history');
      if (!rows.length) return (el.innerHTML = '');
      const best = Math.max(...rows.map((r) => r.bpm));
      el.innerHTML = `<p style="margin-bottom:0">${times(rows.length)} · השיא שלך: <b>${best} BPM</b> · אחרונות: ${rows
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
      if (chords) showChord(0);
      pulse.className = 'pulse';
      pulse.textContent = '♩';
      startBtn.textContent = '▶ התחל';
      startBtn.classList.remove('on');
    };

    const describe = (step, i, c) => {
      if (chords) {
        const next = ex.steps[(i + 1) % n];
        const left = bps - (c % bps);
        const nextName = next.rest ? 'מנוחה' : `<bdi dir="ltr">${next.name}</bdi>`;
        const soon = left <= 2 && n > 1 ? ` · <span class="tech">מתכוננים לעבור ל-${nextName}</span>` : '';
        if (step.rest) {
          return `<b>מנוחה</b>: הרם את האצבעות מהלוח ותן להן לנוח. הבא: ${nextName}${soon}`;
        }
        return `אקורד <b class="big"><bdi dir="ltr">${step.name}</bdi></b> <span class="muted">· הבא: ${nextName} · עוד ${left} פעימות</span>${soon}`;
      }
      const tech =
        step.t === 'h' ? ' <span class="tech">· Hammer-on: מטיחים בלי לפרוט</span>'
        : step.t === 'p' ? ' <span class="tech">· Pull-off: מושכים הצידה בלי לפרוט</span>'
        : ex.steps.some((x) => x.t) ? ' <span class="tech">· פורטים</span>' : '';
      const where = step.f === 0
        ? `מיתר <b>${step.s}</b> (${STRING_NAMES[step.s]}) · <b>פתוח</b> (בלי ללחוץ)`
        : `מיתר <b>${step.s}</b> (${STRING_NAMES[step.s]}) · סריג <b>${step.f}</b> · אצבע <b>${step.fi}</b> (${fingerName(step.fi)})`;
      return `${where} <span class="muted">· תו <bdi dir="ltr">${noteName(step.s, step.f)}</bdi> · ${i + 1} מתוך ${n}</span>${tech}`;
    };

    // במסך צר הלוח גולל אופקית; מוודאים שהנקודה הנוכחית נראית
    const keepVisible = (el) => {
      const r = el.getBoundingClientRect();
      const w = board.getBoundingClientRect();
      if (r.left < w.left + 12) board.scrollLeft -= w.left + 12 - r.left;
      else if (r.right > w.right - 12) board.scrollLeft += r.right - (w.right - 12);
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
      // מהירות עולה בתרגילים עם ramp
      if (ex.ramp && c > 0 && c % (ex.ramp.every || n * bps) === 0 && bpm < ex.ramp.max) {
        setBpm(Math.min(ex.ramp.max, bpm + ex.ramp.step), { persist: false });
        peak = Math.max(peak, bpm);
      }
      const i = stepIndexOf(ex, c);
      const step = ex.steps[i];
      const inBar = (c % 4) + 1;
      pulse.textContent = inBar;
      pulse.classList.add('beat');
      if (inBar === 1) pulse.classList.add('accent');
      const svg = board.querySelector('svg');
      svg.classList.add('running');
      if (chords) {
        showChord(i);
      } else {
        svg.querySelectorAll('.dot.cur').forEach((d) => d.classList.remove('cur'));
        const dot = svg.querySelector(`.dot[data-key="${keyOf(step)}"]`);
        if (dot) {
          dot.classList.add('cur');
          keepVisible(dot);
        }
      }
      now.innerHTML = describe(step, i, c);
    };

    startBtn.onclick = () => {
      if (Met.running) {
        Met.stop();
        resetUi();
        now.textContent = 'נעצר.';
        if (ex.ramp) setBpm(runStart);
      } else {
        runStart = bpm;
        peak = bpm;
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
      const reached = ex.ramp ? Math.max(peak, bpm) : bpm;
      (S.log[ex.id] ||= []).push({ at: new Date().toISOString(), bpm: reached });
      save('log', S.log);
      document.getElementById('savedMsg').textContent = ' ' + CHEERS[Math.floor(Math.random() * CHEERS.length)];
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
    if (renderExercise.redraw) renderExercise.redraw();
  };

  // ---------- ניתוב ----------
  let current = location.hash.slice(1);
  function go(id) {
    current = id;
    try { history.replaceState(null, '', id ? '#' + id : location.pathname + location.search); } catch (e) { /* מתעלמים */ }
    route();
  }
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[data-go]');
    if (!a) return;
    e.preventDefault();
    go(a.dataset.go);
  });
  function route() {
    const ex = current && findEx(current);
    renderExercise.redraw = null;
    if (ex && isGuide(ex)) renderGuide(ex);
    else if (ex) renderExercise(ex);
    else renderHome();
    window.scrollTo(0, 0);
  }
  window.addEventListener('hashchange', () => { current = location.hash.slice(1); route(); });
  updateHandBtn();
  route();
})();
