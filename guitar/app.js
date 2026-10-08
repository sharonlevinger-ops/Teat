// אתר תרגילי גיטרה – ללא שרת וללא תלויות. נפתח ישירות מהקובץ index.html.
(function () {
  'use strict';
  const DATA = window.GUITAR_DATA;
  const SONGS = window.GUITAR_SONGS || [];
  const T = DATA.theory;
  const app = document.getElementById('app');
  const tabsEl = document.getElementById('tabs');
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
    tab: load('tab', 'l1'),
    custom: load('custom', []),
    query: '',
  };

  // כל התרגילים הקבועים (לשוניות שלב, פנטטוני, אקורדים)
  const allEx = [
    ...DATA.levels.flatMap((l) => l.exercises),
    ...DATA.penta.sections.flatMap((s) => s.exercises),
    ...DATA.chords.sections.flatMap((s) => s.exercises),
  ];
  const findEx = (id) => {
    const fixed = allEx.find((e) => e.id === id);
    if (fixed) return fixed;
    const m = /^g-(\w+)-(\d+)-(\d+)-([fs])$/.exec(id); // תרגיל שנוצר לפי מפתח וסולם
    if (m) {
      try {
        return T.genExercise(m[1], Number(m[2]), Number(m[3]), m[4] === 'f');
      } catch (e) {
        return null;
      }
    }
    return null;
  };

  // רצפי מספרים ("1-2-3-4") ורצפים באנגלית נשארים בכיוון שמאל-לימין בתוך טקסט עברי (בלי לגעת בתגיות HTML)
  const fx = (t) =>
    String(t).replace(/(<[^>]+>)|(\d+(?:[-–]\d+)+|[A-Za-z][A-Za-z0-9#'’/&-]*(?:[ ,.]+[A-Za-z][A-Za-z0-9#'’/&-]*)*)/g, (m, tag, txt) =>
      tag ? tag : `<bdi dir="ltr">${txt.replace(/[ ,.]+$/, '')}</bdi>${txt.match(/[ ,.]+$/) ? txt.match(/[ ,.]+$/)[0] : ''}`
    );
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const fingerName = (n) => DATA.fingers.find((f) => f.n === n).name;

  // ---------- תווים ----------
  const OPEN_MIDI = { 6: 40, 5: 45, 4: 50, 3: 55, 2: 59, 1: 64 }; // E2 A2 D3 G3 B3 E4
  const noteName = (s, f, flats) => T.noteNameOf(OPEN_MIDI[s] + f, flats);
  const STRING_NAMES = { 1: 'e', 2: 'B', 3: 'G', 4: 'D', 5: 'A', 6: 'E' };
  const STRING_W = { 1: 1, 2: 1.4, 3: 1.9, 4: 2.5, 5: 3.1, 6: 3.7 };
  const keyOf = (n) => `${n.s}-${n.f}-${n.fi}`;
  const bpsOf = (ex) => ex.beatsPerStep || 1;
  const stepIndexOf = (ex, c) => Math.floor(c / bpsOf(ex)) % ex.steps.length;
  const midiFreq = (m) => 440 * Math.pow(2, (m - 69) / 12);

  // ---------- שמע: מטרונום ותווים ----------
  const Audio_ = {
    ctx: null,
    ensure() {
      if (!this.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        this.ctx = new AC();
      }
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return this.ctx;
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
    // note: {s,f,t}; prev: התו הקודם (לסלייד); len: משך בשניות
    pluck(note, t, len, prev) {
      const midi = OPEN_MIDI[note.s] + note.f;
      const freq = midiFreq(midi);
      const dur = len;
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = 'triangle';
      if (note.t === 'b') {
        o.frequency.setValueAtTime(freq, t);
        o.frequency.linearRampToValueAtTime(freq * Math.pow(2, 2 / 12), t + dur * 0.5);
      } else if (note.t === 'r') {
        o.frequency.setValueAtTime(freq * Math.pow(2, 2 / 12), t);
        o.frequency.linearRampToValueAtTime(freq, t + dur * 0.6);
      } else if (note.t === 's' && prev && prev.s === note.s) {
        o.frequency.setValueAtTime(midiFreq(OPEN_MIDI[prev.s] + prev.f), t);
        o.frequency.linearRampToValueAtTime(freq, t + dur * 0.4);
      } else {
        o.frequency.value = freq;
      }
      if (note.t === 'v') {
        const lfo = this.ctx.createOscillator();
        const lg = this.ctx.createGain();
        lfo.frequency.value = 5.5;
        lg.gain.value = freq * 0.012;
        lfo.connect(lg).connect(o.frequency);
        lfo.start(t);
        lfo.stop(t + dur + 0.05);
      }
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(note.t === 'h' || note.t === 'p' ? 0.12 : 0.22, t + 0.01);
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
  };

  // מטרונום של תרגיל
  const Met = {
    running: false, bpm: 60, timer: null, raf: 0, next: 0, counter: 0, queue: [], ex: null, onTick: null,
    start(ex, bpm, onTick) {
      this.stop();
      const ctx = Audio_.ensure();
      this.ex = ex;
      this.bpm = bpm;
      this.onTick = onTick;
      this.running = true;
      this.counter = S.countIn ? -4 : 0;
      this.next = ctx.currentTime + 0.12;
      this.timer = setInterval(() => this.schedule(), 25);
      const loop = () => {
        if (!this.running) return;
        let last = null;
        while (this.queue.length && this.queue[0].t <= ctx.currentTime) last = this.queue.shift();
        if (last) this.onTick(last.c);
        this.raf = requestAnimationFrame(loop);
      };
      this.raf = requestAnimationFrame(loop);
    },
    schedule() {
      const ex = this.ex;
      const bps = bpsOf(ex);
      const ctx = Audio_.ctx;
      while (this.next < ctx.currentTime + 0.12) {
        const c = this.counter;
        const accent = (((c % 4) + 4) % 4) === 0;
        Audio_.click(this.next, accent);
        if (c >= 0 && S.notesSound && c % bps === 0) {
          const i = stepIndexOf(ex, c);
          const step = ex.steps[i];
          if (ex.mode === 'chords') Audio_.strum(step, this.next);
          else Audio_.pluck(step, this.next, Math.min(0.9, (60 / this.bpm) * 0.95), ex.steps[(i + ex.steps.length - 1) % ex.steps.length]);
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

  // רקע הרמוני פשוט לאלתור (לא ההקלטה של השיר)
  const Backing = {
    running: false, bpm: 80, timer: null, raf: 0, next: 0, counter: 0, queue: [], chords: [], bpc: 4, click: true, onChord: null,
    start(chords, bpm, bpc, click, onChord) {
      this.stop();
      const ctx = Audio_.ensure();
      this.chords = chords.map((c) => T.parseChord(c));
      this.bpm = bpm;
      this.bpc = bpc;
      this.click = click;
      this.onChord = onChord;
      this.running = true;
      this.counter = 0;
      this.next = ctx.currentTime + 0.12;
      this.timer = setInterval(() => this.schedule(), 25);
      const loop = () => {
        if (!this.running) return;
        let last = null;
        while (this.queue.length && this.queue[0].t <= ctx.currentTime) last = this.queue.shift();
        if (last) this.onChord(last.i, last.c);
        this.raf = requestAnimationFrame(loop);
      };
      this.raf = requestAnimationFrame(loop);
    },
    schedule() {
      const ctx = Audio_.ctx;
      while (this.next < ctx.currentTime + 0.12) {
        const c = this.counter;
        const i = Math.floor(c / this.bpc) % this.chords.length;
        if (c % this.bpc === 0) this.chord(this.chords[i], this.next, (60 / this.bpm) * this.bpc);
        if (this.click) Audio_.click(this.next, c % this.bpc === 0);
        this.queue.push({ i, c, t: this.next });
        this.next += 60 / this.bpm;
        this.counter++;
      }
    },
    chord(ch, t, dur) {
      if (!ch) return;
      const ctx = Audio_.ctx;
      const voice = (midi, gainV, type, delay) => {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = type;
        o.frequency.value = midiFreq(midi);
        g.gain.setValueAtTime(0.0001, t + delay);
        g.gain.exponentialRampToValueAtTime(gainV, t + delay + 0.02);
        g.gain.exponentialRampToValueAtTime(gainV * 0.6, t + dur * 0.7);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        o.connect(g).connect(ctx.destination);
        o.start(t + delay);
        o.stop(t + dur + 0.05);
      };
      voice(36 + ch.root, 0.14, 'sine', 0); // בס
      ch.tones.forEach((pc, k) => voice(55 + (((pc - 55) % 12) + 12) % 12, 0.06, 'triangle', 0.01 + k * 0.012));
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
    const g = (x) => 1 - Math.pow(2, -x / 12);
    const a0 = startFret - 1;
    const frac = (k) => (g(a0 + k) - g(a0)) / (g(a0 + frets) - g(a0));
    // לשמאלי: ראש הגיטרה (האום) מימין, והסריגים עולים שמאלה
    const xk = (k) => (lefty ? R - frac(k) * (R - L) : L + frac(k) * (R - L));
    const yS = (s) => top + (s - 1) * gap;
    const bottom = yS(6);
    const side = lefty ? 1 : -1;
    const xOpen = xk(0) + side * 17;
    const rel = (f) => f - startFret + 1;
    const dotX = (f) => xk(rel(f)) + (xk(rel(f) - 1) - xk(rel(f))) * 0.3;

    let svg = `<svg viewBox="0 0 800 ${bottom + 78}" role="img" aria-label="לוח צוואר גיטרה" class="${ex.dynamicFingers ? 'only-cur' : ''}">`;
    svg += `<rect x="${L}" y="${top - 16}" width="${R - L}" height="${bottom - top + 32}" rx="6" fill="var(--wood)"/>`;
    for (const m of [3, 5, 7, 9, 12, 15, 17]) {
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
      const fretNo = startFret + k - 1;
      svg += `<text x="${(xk(k - 1) + xk(k)) / 2}" y="${bottom + 44}" text-anchor="middle" font-size="14" fill="var(--muted)">${frets > 7 ? fretNo : 'סריג ' + fretNo}</text>`;
    }

    const dot = (n) => {
      if (n.f === 0) {
        return `<g class="dot open" data-key="${keyOf(n)}"><circle cx="${xOpen}" cy="${yS(n.s)}" r="11" fill="var(--surface)" stroke="var(--text)" stroke-width="3"/></g>`;
      }
      const cx = dotX(n.f);
      const blue = n.blue ? ' stroke="var(--text)" stroke-width="3" stroke-dasharray="4 3"' : '';
      return `<g class="dot" data-key="${keyOf(n)}"><circle cx="${cx}" cy="${yS(n.s)}" r="12" fill="var(--f${n.fi})"${blue}/><text x="${cx}" y="${yS(n.s)}">${n.fi}</text></g>`;
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
  const times = (n) => (n === 1 ? 'פעם אחת' : n + ' פעמים');
  const daysText = (n) => (n === 1 ? 'יום אחד' : n + ' ימים');
  const fmtDate = (iso) => new Date(iso).toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric' });
  function summary(id) {
    const rows = S.log[id] || [];
    if (!rows.length) return '';
    const last = rows[rows.length - 1];
    return `<span class="done">${times(rows.length)} · אחרונה ${fmtDate(last.at)} ב-${last.bpm} BPM</span>`;
  }

  // ---------- לשוניות ----------
  let lastSong = null; // השיר שממנו נפתח תרגיל (לכפתור החזרה)

  function renderTabs(active) {
    tabsEl.innerHTML = DATA.tabs
      .map((t) => `<button class="tab ${t.id === active ? 'on' : ''}" data-tab="${t.id}" role="tab" aria-selected="${t.id === active}">${t.label}</button>`)
      .join('');
  }
  tabsEl.addEventListener('click', (e) => {
    const b = e.target.closest('[data-tab]');
    if (!b) return;
    S.tab = b.dataset.tab;
    save('tab', S.tab);
    lastSong = null;
    go('');
  });

  const exItem = (e) => {
    const tags = [
      e.diff ? `<span class="tag d-${e.diff === 'קל' ? 1 : e.diff === 'בינוני' ? 2 : 3}">${e.diff}</span>` : '',
      e.style ? '<span class="tag">בסגנון נגנים</span>' : '',
      e.mode === 'chords' ? '<span class="tag">אקורדים</span>' : '',
    ].join(' ');
    return `<li><a class="ex" href="#${e.id}" data-go="${e.id}"><b>${fx(e.title)} ${tags}</b><span>${fx(e.goal)}</span> ${summary(e.id)}</a></li>`;
  };
  const exList = (list) => `<ul class="ex-list">${list.map(exItem).join('')}</ul>`;

  function statLine() {
    const st = stats();
    return st.total ? `תרגלת ${daysText(st.total)} בסך הכול (${st.week} בשבוע האחרון).` : 'עוד לא תרגלת. תתחיל מחימום קצר.';
  }

  function renderTabView() {
    Met.stop();
    Backing.stop();
    const tab = DATA.tabs.find((t) => t.id === S.tab) || DATA.tabs[0];
    renderTabs(tab.id);
    let html = '';
    if (tab.kind === 'level') {
      const lv = DATA.levels.find((l) => l.id === tab.level);
      html = `<h1>${fx(lv.name)}</h1><p class="muted">${fx(lv.desc)}</p>${exList(lv.exercises)}`;
    } else if (tab.kind === 'sections') {
      const d = DATA[tab.ref];
      html =
        `<h1>${fx(d.title)}</h1><p class="muted">${fx(d.desc)}</p>` +
        d.sections.map((sec) => `<section class="level"><h2>${fx(sec.title)}</h2><p>${fx(sec.desc)}</p>${exList(sec.exercises)}</section>`).join('');
    } else {
      renderImprov();
      return;
    }
    app.innerHTML = `<div class="welcome small"><b>${statLine()}</b> התחל כל תרגיל לאט. אם הוא נשמע נקי שלוש פעמים ברצף, העלה 5 BPM.</div>${html}`;
  }

  // ---------- אלתור: חיפוש שיר, מפתח וסולמות ----------
  const MINOR_SCALES = ['minorPent', 'blues', 'naturalMinor', 'dorian', 'harmonicMinor', 'phrygianDominant'];
  const allSongs = () => [...SONGS, ...S.custom.map((c) => ({ ...c, custom: true }))];
  const searchSongs = (q) => SONGS.search(allSongs(), q);
  const keyLabel = (key) => `${key.root} ${key.mode === 'minor' ? 'מינור' : 'מז׳ור'}`;
  const scaleRoot = (song, sc) => sc.root || song.key.root;
  const scaleFlats = (rootName, scale) => T.useFlats(rootName, MINOR_SCALES.includes(scale) ? 'minor' : 'major');
  const CONF = { high: ['ודאות גבוהה', 'c-high'], medium: ['ודאות בינונית: בדוק באוזן', 'c-med'], user: ['נוסף על ידך', 'c-med'] };

  // כרטיס סולמות: לכל סולם קישורים לתנוחות (מציגות לוח + מטרונום)
  function scalesCard(song) {
    return `<section class="card"><h3>הסולמות לאלתור</h3>${song.scales
      .map((sc, i) => {
        const rootName = scaleRoot(song, sc);
        const pc = T.ROOT_PC[rootName];
        const flats = scaleFlats(rootName, sc.scale);
        const links = [];
        for (let p = 1; p <= T.POSITIONS(sc.scale); p++) {
          const ex = T.genExercise(sc.scale, pc, p, flats);
          const fr = ex.steps.map((x) => x.f).filter((f) => f > 0);
          links.push(`<a class="chip" href="#${ex.id}" data-go="${ex.id}">תנוחה ${p} · סריגים ${Math.min(...fr)}-${Math.max(...fr)}</a>`);
        }
        return `<div class="scale-row"><b>${i === 0 ? '★ ' : ''}${fx(rootName)} ${T.SCALE_HE[sc.scale]}</b>
          <p class="small">${fx(sc.why)}</p><p class="muted small">${fx(T.SCALE_CHAR[sc.scale])}</p><div class="chips">${links.join('')}</div></div>`;
      })
      .join('')}</section>`;
  }

  function chordTonesCard(song) {
    const main = song.scales[0];
    const mainRoot = T.ROOT_PC[scaleRoot(song, main)];
    const inScale = new Set(T.SCALE_IV[main.scale].map((i) => (mainRoot + i) % 12));
    const flats = T.useFlats(song.key.root, song.key.mode);
    const uniq = [...new Set(song.chords)];
    const rows = uniq
      .map((c) => {
        const ch = T.parseChord(c);
        if (!ch) return '';
        const tones = ch.tones.map((pc) => `<span class="${inScale.has(pc) ? '' : 'out'}">${T.noteNameOf(pc, flats)}${inScale.has(pc) ? '' : '×'}</span>`).join(' ');
        return `<tr><td><b>${fx(c)}</b></td><td>${tones}</td></tr>`;
      })
      .join('');
    return `<table class="tones"><thead><tr><th>אקורד</th><th>תווי האקורד</th></tr></thead><tbody>${rows}</tbody></table>
      <p class="muted small">תו עם × לא נמצא בסולם הראשי (${fx(scaleRoot(song, main))} ${T.SCALE_HE[main.scale]}): אפשר להשתמש בו כתו מעבר, או לעבור לסולם אחר מהרשימה.</p>`;
  }

  const HOW_IMPROV = (song) => {
    const main = song.scales[0];
    return [
      `התחל מ-${fx(scaleRoot(song, main))} ${T.SCALE_HE[main.scale]} בתנוחה 1. זו הקופסה הבטוחה: כל התווים בה מתאימים לשיר.`,
      'נגן את הסולם מעל הרקע בלי לנסות ליצור משהו, רק כדי להכיר את הצליל.',
      'בנה משפט קצר: שלושה עד חמישה תווים, ואז שקט. חזור על המשפט עם שינוי קטן (תו אחד או קצב).',
      'סיים משפטים על השורש או על תו מהאקורד, כדי שהם ישמעו "גמורים".',
      'רק כשהסולם הראשון נוח, הוסף תווי צבע מהסולם הבא ברשימה.',
    ];
  };

  function songPage(song) {
    const conf = CONF[song.conf] || CONF.medium;
    const flats = T.useFlats(song.key.root, song.key.mode);
    const hasChords = song.chords && song.chords.length;
    return `
      <a class="back" href="#" data-go="">‹ חזרה לאלתור</a>
      <h1 class="ex-title">${fx(song.titleHe && song.titleHe !== song.title ? song.titleHe + ' · ' + song.title : song.title)}</h1>
      <p class="muted">${fx(song.artistHe && song.artistHe !== song.artist ? song.artistHe + ' · ' + song.artist : song.artist || '')}</p>
      <div class="chips"><span class="chip static">מפתח: ${fx(keyLabel(song.key))}</span><span class="chip static ${conf[1]}">${conf[0]}</span></div>
      ${song.tuning === 'halfDown' ? '<section class="card style"><p style="margin:0"><b>כיוון חצי טון למטה.</b> ההקלטה מכוונת חצי טון נמוך, ולכן הצורות על הצוואר (כמו שכתוב כאן) נשמעות חצי טון נמוך מהשם. כדי לנגן עם ההקלטה, כוון את כל המיתרים חצי טון למטה.</p></section>' : ''}
      ${hasChords ? `<section class="card"><h3>האקורדים העיקריים</h3><div class="chips">${song.chords.map((c) => `<span class="chip static">${fx(c)}</span>`).join('')}</div>${chordTonesCard(song)}</section>` : ''}
      ${scalesCard(song)}
      <section class="card"><h3>איך לאלתר על השיר</h3><ol>${HOW_IMPROV(song).map((t) => `<li>${t}</li>`).join('')}</ol>
        ${(song.tips || []).length ? `<h3 style="margin-top:14px">טיפים לשיר הזה</h3><ul>${song.tips.map((t) => `<li>${fx(t)}</li>`).join('')}</ul>` : ''}</section>
      ${hasChords ? `<section class="card"><h3>רקע לאלתור</h3>
        <p class="muted small" style="margin-top:0">רצף האקורדים בצליל פשוט, לא ההקלטה של השיר. נגן מעליו את הסולם.</p>
        <div class="bk-now" id="bkNow">—</div>
        <div class="controls bk"><div class="bpm"><button class="step" id="bkSlower" aria-label="לאט יותר">−</button><input type="range" id="bkBpm" min="40" max="160" value="${load('bk:' + song.id, 80)}" aria-label="מהירות" /><button class="step" id="bkFaster" aria-label="מהר יותר">+</button><output id="bkOut"></output></div>
        <button class="start" id="bkStart">▶ נגן רקע</button></div>
        <label class="small"><input type="checkbox" id="bkClick" checked /> קליק מטרונום</label></section>` : ''}
      <section class="card"><p class="muted small" style="margin:0">הסולמות הם המלצות לאלתור שמתאימות לשיר, ולא תמלול של הסולו המקורי. ${song.src ? 'מקורות: ' + fx(song.src) + ' ' : ''}קיימות גרסאות שונות של שירים, חלקן מכוונות חצי טון למטה, ולכן כדאי לוודא באוזן מול ההקלטה. ${flats ? '' : ''}</p></section>`;
  }

  function bindBacking(song) {
    const startBtn = document.getElementById('bkStart');
    if (!startBtn) return;
    const bpmIn = document.getElementById('bkBpm');
    const out = document.getElementById('bkOut');
    const now = document.getElementById('bkNow');
    const setBpm = (v) => {
      const b = Math.max(40, Math.min(160, v));
      bpmIn.value = b;
      out.textContent = b + ' BPM';
      save('bk:' + song.id, b);
      if (Backing.running) Backing.bpm = b;
    };
    setBpm(Number(bpmIn.value));
    bpmIn.oninput = () => setBpm(Number(bpmIn.value));
    document.getElementById('bkSlower').onclick = () => setBpm(Number(bpmIn.value) - 5);
    document.getElementById('bkFaster').onclick = () => setBpm(Number(bpmIn.value) + 5);
    startBtn.onclick = () => {
      if (Backing.running) {
        Backing.stop();
        startBtn.textContent = '▶ נגן רקע';
        startBtn.classList.remove('on');
        now.textContent = '—';
        return;
      }
      startBtn.textContent = '■ עצור';
      startBtn.classList.add('on');
      Backing.start(song.chords, Number(bpmIn.value), 4, document.getElementById('bkClick').checked, (i) => {
        const next = song.chords[(i + 1) % song.chords.length];
        now.innerHTML = `<b class="big">${fx(song.chords[i])}</b> <span class="muted">· הבא: ${fx(next)}</span>`;
      });
    };
  }

  // מפתח שמופיע בשיר שהמשתמש הוסיף, או בכלי המפתחות
  function defaultScales(mode) {
    return mode === 'minor'
      ? [
          { scale: 'minorPent', why: 'הסולם הבטוח ביותר לאלתור מעל שיר במינור.' },
          { scale: 'naturalMinor', why: 'מוסיף שני תווי צבע לפנטטוני.' },
          { scale: 'blues', why: 'תו מתח לצליל בלוזי.' },
          { scale: 'dorian', why: 'מינורי "פתוח" יותר, מתאים כשהשיר נשמע פחות עצוב.' },
        ]
      : [
          { scale: 'majorPent', why: 'הסולם הבטוח ביותר לאלתור מעל שיר במז׳ור.' },
          { scale: 'major', why: 'מוסיף שני תווי צבע לפנטטוני.' },
          { scale: 'mixolydian', why: 'מתאים כשיש אקורד שנשמע "רוקי" (כמו אקורד על התו השביעי).' },
          { scale: 'minorPent', root: null, why: 'בלוז-רוק: פנטטוני מינורי של אותו שורש על שיר במז׳ור.' },
        ];
  }
  const rootOptions = ['C', 'C#', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];

  function renderImprov() {
    Met.stop();
    renderTabs('improv');
    app.innerHTML = `
      <h1>אלתור על שירים</h1>
      <p class="muted">כתוב שם של שיר או להקה (בעברית או באנגלית) וקבל את המפתח, האקורדים והסולמות לאלתור, עם לוח ורקע.</p>
      <div class="searchbox"><input id="impQ" type="search" placeholder="למשל: Don't Cry, גאנז אנד רוזס, בלוז…" autocomplete="off" value="${esc(S.query)}" aria-label="חיפוש שיר או להקה" /></div>
      <div id="impResults"></div>
      <section class="card"><h3>השיר לא ברשימה?</h3>
        <p class="muted small" style="margin-top:0">לא ניתן לחפש בכל המוזיקה בעולם מתוך האתר, כי הוא לא מתחבר לשום מאגר חיצוני. אם אתה יודע באיזה מפתח השיר, בחר אותו ותקבל את הסולמות. אפשר גם להוסיף את השיר לרשימה שלך, או לבקש ממני בשיחה להוסיף אותו לאתר.</p>
        <div class="form-row"><label>מפתח <select id="kfRoot">${rootOptions.map((r) => `<option ${r === 'A' ? 'selected' : ''}>${r}</option>`).join('')}</select></label>
          <label>סוג <select id="kfMode"><option value="minor">מינור</option><option value="major">מז׳ור</option></select></label>
          <button class="secondary" id="kfShow">הצג סולמות</button></div>
        <div id="kfOut"></div>
        <details class="mysong"><summary>הוספת שיר לרשימה שלי</summary>
          <div class="form-row"><label>שם השיר <input id="msName" type="text" maxlength="60" /></label>
          <label>אקורדים (אופציונלי, עם רווחים) <input id="msChords" type="text" placeholder="Am G C F" /></label>
          <button class="secondary" id="msAdd">שמור שיר</button></div>
          <p class="muted small" id="msMsg"></p></details>
      </section>`;
    const results = document.getElementById('impResults');
    const q = document.getElementById('impQ');

    const row = (s) =>
      `<li><a class="ex" href="#song-${s.id}" data-go="song-${s.id}"><b>${fx(s.titleHe && s.titleHe !== s.title ? s.titleHe + ' · ' + s.title : s.title)} ${s.custom ? '<span class="tag">שלי</span>' : ''}</b>
        <span>${fx(s.artistHe && s.artistHe !== s.artist ? s.artistHe + ' · ' + s.artist : s.artist || '')} · ${fx(keyLabel(s.key))}</span></a>${s.custom ? `<button class="del" data-del="${s.id}" aria-label="מחיקת השיר">מחק</button>` : ''}</li>`;
    const draw = () => {
      const list = searchSongs(S.query);
      results.innerHTML = list.length
        ? `<p class="muted small">${list.length} ${S.query.trim() ? 'תוצאות' : 'שירים ברשימה'}</p><ul class="ex-list">${list.map(row).join('')}</ul>`
        : '<p class="empty">לא נמצא שיר כזה. נסה שם אחר, או הוסף אותו למטה.</p>';
    };
    q.oninput = () => {
      S.query = q.value;
      draw();
    };
    results.addEventListener('click', (e) => {
      const d = e.target.closest('[data-del]');
      if (!d) return;
      S.custom = S.custom.filter((c) => c.id !== d.dataset.del);
      save('custom', S.custom);
      draw();
    });
    draw();

    document.getElementById('kfShow').onclick = () => {
      const root = document.getElementById('kfRoot').value;
      const mode = document.getElementById('kfMode').value;
      const fake = { key: { root, mode }, scales: defaultScales(mode).map((s) => ({ ...s, root: root })) };
      // השורש של הסולם המינורי על שיר במז׳ור הוא המינורי היחסי של אותו מפתח
      document.getElementById('kfOut').innerHTML = scalesCard(fake);
    };
    document.getElementById('msAdd').onclick = () => {
      const name = document.getElementById('msName').value.trim();
      const msg = document.getElementById('msMsg');
      if (!name) {
        msg.textContent = 'כתוב שם לשיר.';
        return;
      }
      const root = document.getElementById('kfRoot').value;
      const mode = document.getElementById('kfMode').value;
      const chords = document.getElementById('msChords').value.split(/\s+/).filter(Boolean);
      const bad = chords.filter((c) => !T.parseChord(c));
      if (bad.length) {
        msg.textContent = 'אקורד לא מוכר: ' + bad.join(', ') + '. כתוב בצורה כמו Am, G7, Dm7, E5.';
        return;
      }
      S.custom.push({
        id: 'my-' + Date.now(), title: name, artist: 'השירים שלי', key: { root, mode }, chords, conf: 'user',
        scales: defaultScales(mode).map((s) => ({ ...s, root: root })), tips: [],
      });
      save('custom', S.custom);
      document.getElementById('msName').value = '';
      document.getElementById('msChords').value = '';
      msg.textContent = 'נשמר. השיר מופיע ברשימה למעלה.';
      draw();
    };
  }

  function renderSong(id) {
    Met.stop();
    Backing.stop();
    const song = allSongs().find((s) => s.id === id);
    renderTabs('improv');
    if (!song) {
      app.innerHTML = '<a class="back" href="#" data-go="">‹ חזרה</a><p class="empty">השיר לא נמצא.</p>';
      return;
    }
    lastSong = song.id;
    app.innerHTML = songPage(song);
    bindBacking(song);
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
    Backing.stop();
    renderTabs(ex.id.startsWith('g-') ? 'improv' : tabOf(ex.id));
    let bpm = load('bpm:' + ex.id, ex.startBpm);
    const n = ex.steps.length;
    const bps = bpsOf(ex);
    const chords = ex.mode === 'chords';
    const usesOpen = ex.steps.some((st) => (chords ? st.open.length || st.mute.length : st.f === 0));
    const usesBlue = ex.steps.some((st) => st.blue);
    const flats = !!ex.flats;
    const back = ex.id.startsWith('g-') && lastSong ? 'song-' + lastSong : '';
    let peak = bpm;
    let runStart = bpm;
    const styleCard = ex.style
      ? `<section class="card style"><h3>${fx(ex.style.title)}</h3><p>${fx(ex.style.text)}</p>${ex.style.note ? `<p class="muted small">${fx(ex.style.note)}</p>` : ''}</section>`
      : '';
    app.innerHTML = `
      <a class="back" href="#" data-go="${back}">‹ ${back ? 'חזרה לשיר' : 'חזרה'}</a>
      <h1 class="ex-title">${fx(ex.title)}</h1>
      <p class="muted">${fx(ex.goal)}</p>
      <div class="legend">${DATA.fingers.map((f) => `<span class="fchip"><i class="f${f.n}">${f.n}</i>${f.name}</span>`).join('')}
        ${usesOpen ? '<span class="fchip"><i class="openchip"></i>מיתר פתוח</span>' : ''}
        ${usesBlue ? '<span class="fchip"><i class="bluechip"></i>תו מתח (b5)</span>' : ''}
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
      ${styleCard}
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

    const showChord = (i) => board.querySelectorAll('.chord').forEach((g) => g.classList.toggle('cur', Number(g.dataset.step) === i));
    const markCur = (step) => {
      const svg = board.querySelector('svg');
      svg.querySelectorAll('.dot.cur').forEach((d) => d.classList.remove('cur'));
      const dot = svg.querySelector(`.dot[data-key="${keyOf(step)}"]`);
      if (dot) dot.classList.add('cur');
      return dot;
    };
    const drawBoard = () => {
      board.innerHTML = boardSvg(ex, S.lefty);
      if (chords) showChord(0);
      else if (ex.dynamicFingers) markCur(ex.steps[0]);
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
        if (chords) showChord(0);
        else if (ex.dynamicFingers) markCur(ex.steps[0]);
      }
      pulse.className = 'pulse';
      pulse.textContent = '♩';
      startBtn.textContent = '▶ התחל';
      startBtn.classList.remove('on');
    };

    const TECH = {
      h: 'Hammer-on: מטיחים בלי לפרוט',
      p: 'Pull-off: מושכים הצידה בלי לפרוט',
      b: 'בנד: דוחפים את המיתר עד שהצליל עולה טון',
      r: 'שחרור: מחזירים את המיתר לאט למקומו',
      s: 'סלייד: מחליקים את האצבע לאורך המיתר, בלי להרים',
      v: 'ויברטו: מנדנדים את הלחיצה',
    };
    const describe = (step, i, c) => {
      if (chords) {
        const next = ex.steps[(i + 1) % n];
        const left = bps - (c % bps);
        const nextName = next.rest ? 'מנוחה' : `<bdi dir="ltr">${next.name}</bdi>`;
        const soon = left <= 2 && n > 1 && next.name !== step.name ? ` · <span class="tech">מתכוננים לעבור ל-${nextName}</span>` : '';
        if (step.rest) return `<b>מנוחה</b>: הרם את האצבעות מהלוח ותן להן לנוח. הבא: ${nextName}${soon}`;
        return `אקורד <b class="big"><bdi dir="ltr">${step.name}</bdi></b> <span class="muted">· הבא: ${nextName} · עוד ${left} פעימות</span>${soon}`;
      }
      const hasTech = ex.steps.some((x) => x.t === 'h' || x.t === 'p');
      const tech = step.t ? ` <span class="tech">· ${TECH[step.t]}</span>` : hasTech ? ' <span class="tech">· פורטים</span>' : '';
      const blue = step.blue ? ' <span class="tech">· תו המתח (b5)</span>' : '';
      const where = step.f === 0
        ? `מיתר <b>${step.s}</b> (${STRING_NAMES[step.s]}) · <b>פתוח</b> (בלי ללחוץ)`
        : `מיתר <b>${step.s}</b> (${STRING_NAMES[step.s]}) · סריג <b>${step.f}</b> · אצבע <b>${step.fi}</b> (${fingerName(step.fi)})`;
      return `${where} <span class="muted">· תו <bdi dir="ltr">${noteName(step.s, step.f, flats)}</bdi> · ${i + 1} מתוך ${n}</span>${tech}${blue}`;
    };
    const keepVisible = (el) => {
      const r = el.getBoundingClientRect();
      const w = board.getBoundingClientRect();
      if (r.left < w.left + 12) board.scrollLeft -= w.left + 12 - r.left;
      else if (r.right > w.right - 12) board.scrollLeft += r.right - (w.right - 12);
    };
    const onTick = (c) => {
      pulse.classList.remove('beat', 'accent', 'count');
      void pulse.offsetWidth;
      if (c < 0) {
        pulse.textContent = -c;
        pulse.classList.add('beat', 'count');
        now.innerHTML = 'מתכוננים…';
        return;
      }
      if (ex.ramp && c > 0 && c % (ex.ramp.every || n) === 0 && bpm < ex.ramp.max) {
        setBpm(Math.min(ex.ramp.max, bpm + ex.ramp.step), { persist: false });
        peak = Math.max(peak, bpm);
      }
      const i = stepIndexOf(ex, c);
      const step = ex.steps[i];
      const inBar = (c % 4) + 1;
      pulse.textContent = inBar;
      pulse.classList.add('beat');
      if (inBar === 1) pulse.classList.add('accent');
      board.querySelector('svg').classList.add('running');
      if (chords) showChord(i);
      else {
        const dot = markCur(step);
        if (dot) keepVisible(dot);
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
    renderExercise.redraw = () => {
      drawBoard();
      if (Met.running) board.querySelector('svg').classList.add('running');
    };
  }

  // לשונית שאליה שייך תרגיל (לסימון בסרגל)
  function tabOf(id) {
    for (const t of DATA.tabs) {
      if (t.kind === 'level' && DATA.levels.find((l) => l.id === t.level).exercises.some((e) => e.id === id)) return t.id;
      if (t.kind === 'sections' && DATA[t.ref].sections.some((s) => s.exercises.some((e) => e.id === id))) return t.id;
    }
    return S.tab;
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
    renderExercise.redraw = null;
    if (current.startsWith('song-')) renderSong(current.slice(5));
    else {
      const ex = current && findEx(current);
      if (ex) renderExercise(ex);
      else renderTabView();
    }
    window.scrollTo(0, 0);
  }
  window.addEventListener('hashchange', () => { current = location.hash.slice(1); route(); });
  updateHandBtn();
  route();
})();
