// אתר תרגילי גיטרה – ללא שרת וללא תלויות. נפתח ישירות מהקובץ index.html.
(function () {
  'use strict';
  const DATA = window.GUITAR_DATA;
  const SONGS = window.GUITAR_SONGS || [];
  const T = DATA.theory;
  const F = window.GUITAR_FUN;
  const TUNER = window.GUITAR_TUNER;
  const RHYTHM = window.GUITAR_RHYTHM;
  const RIFFS = window.GUITAR_RIFFS.RIFFS;
  const SYNC = window.GUITAR_SYNC;
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
  const saveLocal = (k, v) => {
    try {
      localStorage.setItem('guitar:' + k, JSON.stringify(v));
    } catch (e) {
      /* מתעלמים */
    }
  };
  // שמירה מקומית, ואם הנתון משתתף בסנכרון: דחיפה לשרת בעוד כמה שניות
  const save = (k, v) => {
    saveLocal(k, v);
    if (SYNC_KEYS.has(k)) schedulePush();
  };
  const S = {
    lefty: load('lefty', true),
    notesSound: load('notesSound', false),
    countIn: load('countIn', true),
    log: load('log', {}),
    tab: load('tab', 'today'),
    custom: load('custom', []),
    active: load('active', []),
    today: load('today', { date: '', done: [] }),
    jams: load('jams', 0),
    customDeleted: load('customDeleted', []),
    lvl: 0,
    query: '',
  };

  // כל התרגילים הקבועים (לשוניות שלב, פנטטוני, אקורדים)
  const allEx = [
    ...DATA.levels.flatMap((l) => l.exercises),
    ...DATA.penta.sections.flatMap((s) => s.exercises),
    ...DATA.chords.sections.flatMap((s) => s.exercises),
    ...RIFFS,
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
        this.out = this.ctx.createGain();
        this.out.connect(this.ctx.destination);
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
      o.connect(g).connect(this.out);
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
      const muted = note.t === 'm';
      const end = muted ? Math.min(dur, 0.09) : dur;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(note.t === 'h' || note.t === 'p' ? 0.12 : muted ? 0.3 : 0.22, t + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t + end);
      o.connect(g).connect(this.out);
      o.start(t);
      o.stop(t + end + 0.05);
    },
    // פריטה של אקורד לפי שמו: dir 'D' למטה (מהבס לדק), 'U' למעלה (מהדק לבס, רק המיתרים העליונים), 'M' למטה מושתק
    strumChord(sym, t, dir, vol) {
      const ch = T.parseChord(sym);
      if (!ch) return;
      const muted = dir === 'M';
      const notes = [36 + ch.root, ...ch.tones.map((pc) => 48 + (((pc - 48) % 12) + 12) % 12), ...ch.tones.map((pc) => 60 + (((pc - 60) % 12) + 12) % 12)];
      const list = dir === 'U' ? notes.slice(-4).reverse() : notes;
      list.forEach((m, k) => {
        const o = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        o.type = 'triangle';
        o.frequency.value = midiFreq(m);
        const st = t + k * 0.012;
        const len = muted ? 0.1 : dir === 'U' ? 0.35 : 0.7;
        g.gain.setValueAtTime(0.0001, st);
        g.gain.exponentialRampToValueAtTime((dir === 'U' ? 0.07 : 0.1) * (vol || 1), st + 0.008);
        g.gain.exponentialRampToValueAtTime(0.0001, st + len);
        o.connect(g).connect(this.out);
        o.start(st);
        o.stop(st + len + 0.05);
      });
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
      this.counter = S.countIn ? -4 * (ex.sub || 1) : 0;
      this.next = ctx.currentTime + 0.12;
      this.timer = setInterval(() => this.schedule(), 25);
      const loop = () => {
        if (!this.running) return;
        while (this.queue.length && this.queue[0].t <= ctx.currentTime) this.onTick(this.queue.shift().c);
        this.raf = requestAnimationFrame(loop);
      };
      this.raf = requestAnimationFrame(loop);
    },
    schedule() {
      const ex = this.ex;
      const bps = bpsOf(ex);
      const sub = ex.sub || 1;
      const ctx = Audio_.ctx;
      while (this.next < ctx.currentTime + 0.12) {
        const c = this.counter;
        const period = 60 / this.bpm / sub;
        if (((c % sub) + sub) % sub === 0 && (c < 0 || ex.click !== false)) {
          const beat = Math.floor(c / sub);
          Audio_.click(this.next, ((beat % 4) + 4) % 4 === 0);
        }
        if (ex.sched) ex.sched(c, this.next, period);
        else if (c >= 0 && S.notesSound && c % bps === 0) {
          const i = stepIndexOf(ex, c);
          const step = ex.steps[i];
          if (ex.mode === 'chords') Audio_.strum(step, this.next);
          else if (!step.rest) Audio_.pluck(step, this.next, Math.min(0.9, period * 0.95), ex.steps[(i + ex.steps.length - 1) % ex.steps.length]);
        }
        this.queue.push({ c, t: this.next });
        this.next += period;
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

  // סינתזה: תופים וצליל התייחסות
  Object.assign(Audio_, {
    noiseBuf: null,
    noise() {
      if (!this.noiseBuf) {
        const c = this.ctx;
        const b = c.createBuffer(1, Math.floor(c.sampleRate * 0.5), c.sampleRate);
        const d = b.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
        this.noiseBuf = b;
      }
      return this.noiseBuf;
    },
    tone(midi, dur) {
      const ctx = this.ensure();
      const t = ctx.currentTime;
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = midiFreq(midi);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.3, t + 0.05);
      g.gain.setValueAtTime(0.3, t + Math.max(0.1, dur - 0.4));
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(Audio_.out);
      o.start(t);
      o.stop(t + dur + 0.05);
    },
    kick(t, v = 1) {
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.frequency.setValueAtTime(150, t);
      o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
      g.gain.setValueAtTime(0.9 * v, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
      o.connect(g).connect(this.out);
      o.start(t);
      o.stop(t + 0.3);
    },
    noiseHit(t, freq, gain, dur) {
      const src = this.ctx.createBufferSource();
      const f = this.ctx.createBiquadFilter();
      const g = this.ctx.createGain();
      src.buffer = this.noise();
      f.type = 'highpass';
      f.frequency.value = freq;
      g.gain.setValueAtTime(gain, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      src.connect(f).connect(g).connect(this.out);
      src.start(t);
      src.stop(t + dur + 0.02);
    },
    snare(t, v = 1) {
      this.noiseHit(t, 1500, 0.35 * v, 0.16);
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = 'triangle';
      o.frequency.value = 190;
      g.gain.setValueAtTime(0.2 * v, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
      o.connect(g).connect(this.out);
      o.start(t);
      o.stop(t + 0.12);
    },
    hat(t, v = 1) {
      this.noiseHit(t, 7000, 0.12 * v, 0.05);
    },
  });

  // רקע הרמוני פשוט לאלתור (לא ההקלטה של השיר), עם סגנון תופים
  const Backing = {
    running: false, bpm: 80, timer: null, raf: 0, next: 0, counter: 0, queue: [], chords: [], bpc: 4, style: 'click', onChord: null,
    start(chords, bpm, bpc, style, onChord) {
      this.stop();
      const ctx = Audio_.ensure();
      this.chords = chords.map((c) => T.parseChord(c));
      this.bpm = bpm;
      this.bpc = bpc;
      this.style = style;
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
        const t = this.next;
        const h = 60 / this.bpm;
        if (c % this.bpc === 0) this.chord(this.chords[i], t, h * this.bpc);
        this.drum(t, c % 4, h);
        this.queue.push({ i, c, t });
        this.next += h;
        this.counter++;
      }
    },
    drum(t, beat, h) {
      const st = this.style;
      if (st === 'rock') {
        if (beat === 0 || beat === 2) Audio_.kick(t);
        if (beat === 1 || beat === 3) Audio_.snare(t);
        Audio_.hat(t, 0.8);
        Audio_.hat(t + h / 2, 0.5);
        if (beat === 2) Audio_.kick(t + h / 2, 0.7);
      } else if (st === 'shuffle') {
        if (beat === 0 || beat === 2) Audio_.kick(t);
        if (beat === 1 || beat === 3) Audio_.snare(t, 0.9);
        Audio_.hat(t, 0.8);
        Audio_.hat(t + (h * 2) / 3, 0.5);
      } else if (st === 'ballad') {
        if (beat === 0) Audio_.kick(t);
        if (beat === 2) Audio_.snare(t, 0.8);
        Audio_.hat(t, 0.5);
      } else {
        Audio_.click(t, beat === 0);
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
        o.connect(g).connect(Audio_.out);
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
      return `<g class="dot" data-key="${keyOf(n)}"><circle cx="${cx}" cy="${yS(n.s)}" r="12" fill="var(--f${n.fi})"${blue}/><text x="${cx}" y="${yS(n.s)}">${n.fi === 5 ? '?' : n.fi}</text></g>`;
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
        if (n.rest) continue;
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
  let lastRoute = null; // המסך שממנו נפתח תרגיל שנוצר (שיר או ג׳אם), לכפתור החזרה
  const todayKey = () => new Date().toLocaleDateString('en-CA');

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
    lastRoute = null;
    go('');
  });

  const exItem = (e) => {
    const tags = [
      e.diff ? `<span class="tag d-${e.diff === 'קל' ? 1 : e.diff === 'בינוני' ? 2 : 3}">${e.diff}</span>` : '',
      e.mode === 'riff' ? `<span class="tag">${e.styleName}</span>` : e.style ? '<span class="tag">בסגנון נגנים</span>' : '',
      e.mode === 'chords' ? '<span class="tag">אקורדים</span>' : '',
    ].join(' ');
    return `<li><a class="ex" href="#${e.id}" data-go="${e.id}"><b>${fx(e.title)} ${tags}</b><span>${fx(e.goal)}</span> ${summary(e.id)}</a></li>`;
  };
  const exList = (list) => `<ul class="ex-list">${list.map(exItem).join('')}</ul>`;

  // ---------- ימי תרגול, רצף והישגים ----------
  function markActive() {
    const k = todayKey();
    if (!S.active.includes(k)) {
      S.active.push(k);
      save('active', S.active);
    }
  }
  function allDays() {
    const days = new Set(S.active);
    Object.values(S.log).forEach((rows) => rows.forEach((r) => days.add(dayKey(r.at))));
    return days;
  }
  function fullStats() {
    const days = allDays();
    const bests = {};
    for (const [id, rows] of Object.entries(S.log)) bests[id] = Math.max(...rows.map((r) => r.bpm));
    return { totalDays: days.size, streak: F.computeStreak([...days], todayKey()), uniqueExercises: Object.keys(S.log).length, bests, jams: S.jams, riffs: Object.keys(S.log).filter((k) => k.startsWith('riff-')).length, rhythms: Object.keys(S.log).filter((k) => k.startsWith('rh-')).length };
  }

  // ג׳אם: שם המפתח (עם במולים לפי סימן המפתח) ושיר-דמה שממנו נבנה העמוד
  const MAJOR_FLAT_KEYS = new Set([5, 10, 3, 8, 1]);
  const MINOR_FLAT_KEYS = new Set([2, 7, 0, 5, 10, 3]);
  const jamFlats = (preset, rootPc) => (preset.mode === 'major' ? MAJOR_FLAT_KEYS : MINOR_FLAT_KEYS).has(rootPc);
  function jamSong(presetId, rootPc) {
    const preset = F.JAM.find((p) => p.id === presetId);
    if (!preset) return null;
    const flats = jamFlats(preset, rootPc);
    const rootName = T.noteNameOf(rootPc, flats);
    return {
      id: `jam-${preset.id}-${rootPc}`, jam: true, presetId: preset.id, rootPc,
      title: `${preset.name} ב-${rootName}`, artist: 'ג׳אם חופשי', key: { root: rootName, mode: preset.mode },
      chords: F.jamChords(preset, rootPc, flats), conf: 'high', drums: preset.drums, bpm: preset.bpm,
      scales: preset.scales.map(([scale, why]) => ({ scale, root: rootName, why })), tips: preset.tips, desc: preset.desc,
    };
  }

  function renderToday() {
    Met.stop();
    Backing.stop();
    renderTabs('today');
    const tk = todayKey();
    if (S.today.date !== tk) {
      S.today = { date: tk, done: [] };
      save('today', S.today);
    }
    const seed = Math.floor(Date.parse(tk + 'T12:00:00Z') / 864e5);
    const plan = F.dailyPlan(seed, DATA, { riffs: RIFFS, rhythms: RHYTHM.PATTERNS });
    const jam = jamSong(plan.jam.preset.id, plan.jam.rootPc);
    const items = [
      { id: 'w1', kind: 'חימום', title: plan.warm[0].title, sub: plan.warm[0].goal, go: plan.warm[0].id },
      { id: 'w2', kind: 'חימום', title: plan.warm[1].title, sub: plan.warm[1].goal, go: plan.warm[1].id },
      { id: 'tech', kind: 'טכניקה או סולם', title: plan.tech.title, sub: plan.tech.goal, go: plan.tech.id },
      plan.riff && { id: 'riff', kind: 'ריף', title: plan.riff.title, sub: plan.riff.goal, go: plan.riff.id },
      plan.rhythm && { id: 'rhy', kind: 'קצב', title: plan.rhythm.name, sub: plan.rhythm.desc, go: 'rh-' + plan.rhythm.id },
      { id: 'jam', kind: 'ג׳אם', title: jam.title, sub: jam.desc, go: jam.id },
      { id: 'chal', kind: 'אתגר יצירתי', title: plan.challenge, sub: 'נסה אותו בזמן הג׳אם.', go: null },
    ].filter(Boolean);
    const done = new Set(S.today.done);
    const st = fullStats();
    const ach = F.ACHIEVEMENTS.map((a) => ({ ...a, ok: a.check(st) }));
    app.innerHTML = `
      <h1>האימון של היום</h1>
      <p class="muted">חמש דקות לכל חלק, בערך 40 דקות בסך הכול. אפשר לעשות רק חלק מהם. כל סימון נחשב ליום תרגול.</p>
      <div class="welcome"><b>${st.streak ? `🔥 ${daysText(st.streak)} ברצף` : 'מתחילים רצף חדש היום'}</b>${st.totalDays ? ` · ${daysText(st.totalDays)} תרגול בסך הכול` : ''}<br>
        <span class="small">סימנת ${done.size} מתוך ${items.length}.</span></div>
      <ul class="ex-list today">${items
        .map(
          (it) => `<li class="${done.has(it.id) ? 'is-done' : ''}"><label class="td"><input type="checkbox" data-td="${it.id}" ${done.has(it.id) ? 'checked' : ''} aria-label="עשיתי: ${esc(it.title)}" />
            <span class="td-body"><span class="muted small">${it.kind}</span><br>${it.go ? `<a href="#${it.go}" data-go="${it.go}"><b>${fx(it.title)}</b></a>` : `<b>${fx(it.title)}</b>`}<br><span class="small muted">${fx(it.sub)}</span></span></label></li>`
        )
        .join('')}</ul>
      <section class="card"><h3>הישגים</h3><div class="ach">${ach
        .map((a) => `<div class="ach-i ${a.ok ? 'ok' : ''}" title="${esc(a.desc)}"><span class="ach-ic">${a.ok ? a.icon : '🔒'}</span><b>${esc(a.name)}</b><span class="small muted">${esc(a.desc)}</span></div>`)
        .join('')}</div></section>`;
    app.querySelectorAll('[data-td]').forEach((cb) => {
      cb.onchange = () => {
        const id = cb.dataset.td;
        const set = new Set(S.today.done);
        if (cb.checked) set.add(id);
        else set.delete(id);
        S.today.done = [...set];
        save('today', S.today);
        if (cb.checked) markActive();
        renderToday();
      };
    });
  }

  // ---------- כוונון עם מיקרופון ----------
  let stopTuner = null;
  const micConstraints = { audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } };
  const micError = (e) => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return 'הדפדפן לא מאפשר גישה למיקרופון בכתובת הזו. נדרשת כתובת מאובטחת (https) ודפדפן עדכני.';
    if (e && (e.name === 'NotAllowedError' || e.name === 'SecurityError')) return 'הגישה למיקרופון נחסמה. אשר אותה בהגדרות הדפדפן (סמל המנעול ליד הכתובת) ונסה שוב.';
    if (e && e.name === 'NotFoundError') return 'לא נמצא מיקרופון במכשיר.';
    return 'לא הצלחתי להפעיל את המיקרופון.';
  };

  function renderTuner() {
    Met.stop();
    Backing.stop();
    renderTabs('tuner');
    const tunId = load('tuning', 'standard');
    app.innerHTML = `
      <h1>לכוונן גיטרה</h1>
      <p class="muted">האתר מקשיב לגיטרה דרך המיקרופון ומראה אם המיתר גבוה או נמוך מדי. פורטים מיתר פתוח אחד בכל פעם, ומסובבים את הכפתור עד שהמחוג באמצע.</p>
      <section class="card tuner-card">
        <div class="form-row"><label>כיוון <select id="tunSel">${F.TUNINGS.map((t) => `<option value="${t.id}" ${t.id === tunId ? 'selected' : ''}>${t.name}</option>`).join('')}</select></label>
          <button class="start" id="tunGo">🎤 הפעל מיקרופון</button></div>
        <div class="tn-read"><div class="tn-note" id="tnNote">–</div><div class="tn-sub muted" id="tnSub">&nbsp;</div></div>
        <div class="tn-meter" id="tnMeter" aria-hidden="true"><span class="tn-zone"></span><span class="tn-mid"></span><span class="tn-needle" id="tnNeedle"></span>
          <span class="tn-l">נמוך ♭</span><span class="tn-r">♯ גבוה</span></div>
        <p class="tn-msg" id="tnMsg" aria-live="polite">לחץ "הפעל מיקרופון" ופרוט מיתר.</p>
        <div class="tn-strings" id="tnStrings"></div>
        <p class="muted small">אפשר ללחוץ על מיתר כדי לכוון בדיוק אליו, גם כשהוא רחוק מהכיוון. לחיצה נוספת מבטלת. הכיוון נשמר בדפדפן.</p>
      </section>
      <section class="card"><h3>איך מכוונים</h3><ol>
        <li>התחל מהמיתר העבה (6). פרוט אותו פתוח ותן לו להישמע.</li>
        <li>אם המחוג שמאלה: המיתר נמוך מדי, מותחים אותו. ימינה: גבוה מדי, מרפים.</li>
        <li>תמיד מגיעים לתו <b>מלמטה</b>: אם עברת אותו, הרפה מעט ומתח שוב. כך הכיוון יציב יותר.</li>
        <li>אחרי שכיוונת את כל המיתרים, עבור עליהם שוב: כיוון של מיתר אחד משפיע קצת על האחרים.</li>
        <li>ברעש רב, או עם גיטרה חשמלית ממוסכנת, קרב את הגיטרה למכשיר.</li></ol></section>`;
    const sel = document.getElementById('tunSel');
    const strBox = document.getElementById('tnStrings');
    const noteEl = document.getElementById('tnNote');
    const subEl = document.getElementById('tnSub');
    const msgEl = document.getElementById('tnMsg');
    const needle = document.getElementById('tnNeedle');
    const goBtn = document.getElementById('tunGo');
    let locked = -1;
    const tuned = new Set();
    const tuning = () => F.TUNINGS.find((t) => t.id === sel.value);
    const flatsOn = () => sel.value === 'half';
    const drawStrings = () => {
      strBox.innerHTML = tuning().midi
        .map((m, i) => `<button class="tbtn ${locked === i ? 'lock' : ''} ${tuned.has(i) ? 'ok' : ''}" data-i="${i}"><span class="small muted">מיתר ${6 - i}</span><b>${T.noteNameOf(m, flatsOn())}</b><span class="tk">${tuned.has(i) ? '✓' : '&nbsp;'}</span></button>`)
        .join('');
    };
    sel.onchange = () => {
      save('tuning', sel.value);
      tuned.clear();
      locked = -1;
      drawStrings();
    };
    strBox.onclick = (e) => {
      const b = e.target.closest('[data-i]');
      if (!b) return;
      const i = Number(b.dataset.i);
      locked = locked === i ? -1 : i;
      drawStrings();
    };
    drawStrings();

    const show = (reading) => {
      if (!reading) {
        needle.style.left = '50%';
        needle.className = 'tn-needle idle';
        return;
      }
      const { name, cents, i } = reading;
      noteEl.textContent = name;
      const clamped = Math.max(-50, Math.min(50, cents));
      needle.style.left = 50 + clamped + '%';
      const good = Math.abs(cents) <= 5;
      needle.className = 'tn-needle' + (good ? ' good' : '');
      noteEl.className = 'tn-note' + (good ? ' good' : '');
      subEl.textContent = `${cents > 0 ? '+' : ''}${cents} סנט`;
      if (good) {
        msgEl.textContent = 'מכוון ✓';
        if (!tuned.has(i)) {
          tuned.add(i);
          drawStrings();
        }
      } else if (Math.abs(cents) > 200) msgEl.textContent = locked >= 0 ? (cents > 0 ? 'גבוה בהרבה: הרפה את המיתר' : 'נמוך בהרבה: מתח את המיתר') : 'לא ברור לאיזה מיתר הכוונה. פרוט מיתר פתוח אחד, או לחץ על המיתר שאתה מכוון.';
      else msgEl.textContent = cents > 0 ? 'גבוה מדי: הרפה את המיתר' : 'נמוך מדי: מתח את המיתר';
    };

    goBtn.onclick = async () => {
      if (stopTuner) {
        stopTuner();
        return;
      }
      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia(micConstraints);
      } catch (e) {
        msgEl.textContent = micError(e);
        return;
      }
      const ctx = Audio_.ensure();
      const src = ctx.createMediaStreamSource(stream);
      const an = ctx.createAnalyser();
      an.fftSize = 4096;
      src.connect(an);
      const buf = new Float32Array(an.fftSize);
      const recent = [];
      let lastGood = 0;
      let timer = setInterval(() => {
        an.getFloatTimeDomainData(buf);
        const r = TUNER.detectPitch(buf, ctx.sampleRate, { minFreq: 55, maxFreq: 500 });
        const now = performance.now();
        if (r && r.clarity > 0.85) {
          recent.push(r.freq);
          if (recent.length > 5) recent.shift();
          if (recent.length >= 3) {
            const med = [...recent].sort((a, b) => a - b)[Math.floor(recent.length / 2)];
            const tg = tuning().midi;
            let i;
            let cents;
            if (locked >= 0) {
              i = locked;
              cents = Math.round((TUNER.midiOfFreq(med) - tg[i]) * 100);
            } else {
              const ns = TUNER.nearestString(med, tg);
              i = ns.index;
              cents = ns.cents;
            }
            show({ name: T.noteNameOf(tg[i], flatsOn()), cents, i });
            lastGood = now;
          }
        } else {
          recent.length = 0;
          if (now - lastGood > 1500) {
            show(null);
            noteEl.textContent = '–';
            noteEl.className = 'tn-note';
            subEl.innerHTML = '&nbsp;';
            msgEl.textContent = 'מקשיב… פרוט מיתר.';
          }
        }
      }, 60);
      stopTuner = () => {
        clearInterval(timer);
        stream.getTracks().forEach((t) => t.stop());
        try {
          src.disconnect();
        } catch (e) { /* מתעלמים */ }
        stopTuner = null;
        const b = document.getElementById('tunGo');
        if (b) {
          b.textContent = '🎤 הפעל מיקרופון';
          b.classList.remove('on');
        }
      };
      goBtn.textContent = '■ עצור';
      goBtn.classList.add('on');
      msgEl.textContent = 'מקשיב… פרוט מיתר.';
    };
  }

  // ---------- קצב וסטרומינג ----------
  const PROGS = [
    { id: 'Em', name: 'אקורד אחד: Em', chords: ['Em'] },
    { id: 'Am', name: 'אקורד אחד: Am', chords: ['Am'] },
    { id: 'D', name: 'אקורד אחד: D', chords: ['D'] },
    { id: 'G', name: 'אקורד אחד: G', chords: ['G'] },
    { id: 'pop', name: 'Am G C F', chords: ['Am', 'G', 'C', 'F'] },
    { id: 'folk', name: 'G D Em C', chords: ['G', 'D', 'Em', 'C'] },
    { id: 'rockm', name: 'Em C G D', chords: ['Em', 'C', 'G', 'D'] },
  ];
  const ARROW = { D: '↓', U: '↑', M: '↓', '-': '·' };

  function renderRhythmList() {
    const lv = ['', 'קל', 'בינוני', 'מתקדם'];
    return `<h1>קצב וסטרומינג</h1>
      <p class="muted">איך פורטים אקורדים בקצב: חיצים שזזים עם המטרונום מראים מתי היד יורדת (↓) ומתי עולה (↑). בחר תבנית והתחל לאט.</p>
      <div class="welcome small">הכלל החשוב: <b>היד לא עוצרת</b>. היא נעה למטה ולמעלה כל הזמן, ופוגשת את המיתרים רק במקומות שמסומנים.</div>
      <ul class="ex-list">${RHYTHM.PATTERNS.map((p) => `<li><a class="ex" href="#rh-${p.id}" data-go="rh-${p.id}"><b>${fx(p.name)} <span class="tag d-${p.level}">${lv[p.level]}</span></b><span>${fx(p.desc)}</span> <span class="pat-prev">${p.pattern.map((x) => ARROW[x]).join(' ')}</span> ${summary('rh-' + p.id)}</a></li>`).join('')}</ul>`;
  }

  function renderRhythm(id) {
    Met.stop();
    Backing.stop();
    const pat = RHYTHM.PATTERNS.find((p) => p.id === id);
    renderTabs('rhythm');
    if (!pat) {
      app.innerHTML = '<a class="back" href="#" data-go="">‹ חזרה</a><p class="empty">התבנית לא נמצאה.</p>';
      return;
    }
    const logId = 'rh-' + pat.id;
    let bpm = load('bpm:' + logId, pat.startBpm);
    const sub = pat.sub;
    const labels = { 1: ['1', '2', '3', '4'], 2: ['1', '&', '2', '&', '3', '&', '4', '&'], 3: ['1', 'la', 'li', '2', 'la', 'li', '3', 'la', 'li', '4', 'la', 'li'] }[sub];
    const progId = load('rhprog', 'Em');
    app.innerHTML = `
      <a class="back" href="#" data-go="">‹ חזרה</a>
      <h1 class="ex-title">${fx(pat.name)}</h1>
      <p class="muted">${fx(pat.desc)}</p>
      <div class="rhy-wrap"><div class="rhy" id="rhy" style="--cols:${pat.pattern.length}">${pat.pattern
        .map((x, i) => `<div class="rc ${x === '-' ? 'skip' : x === 'U' ? 'up' : x === 'M' ? 'mute' : 'down'} ${i % sub === 0 ? 'beat' : ''}" data-i="${i}"><span class="rl">${labels[i]}</span><b>${ARROW[x]}</b>${x === 'M' ? '<i>מושתק</i>' : '<i>&nbsp;</i>'}</div>`)
        .join('')}</div></div>
      <div class="now" id="now">לחץ "התחל" והיד נעה עם החיצים.</div>
      <div class="controls">
        <div class="pulse" id="pulse">♩</div>
        <div class="bpm"><button class="step" id="slower" aria-label="לאט יותר">−</button><input type="range" id="bpm" min="40" max="140" value="${bpm}" aria-label="מהירות" /><button class="step" id="faster" aria-label="מהר יותר">+</button><output id="bpmOut"></output></div>
        <button class="start" id="start">▶ התחל</button>
      </div>
      <div class="form-row"><label>אקורדים <select id="rhProg">${PROGS.map((p) => `<option value="${p.id}" ${p.id === progId ? 'selected' : ''}>${p.name}</option>`).join('')}</select></label>
        <label class="inl"><input type="checkbox" id="rhClick" checked /> מטרונום</label></div>
      <section class="card"><h3>איך מתרגלים</h3><ol>
        <li>${fx(pat.tip)}</li>
        <li>התחל בלי אקורד: הנח את היד השמאלית קלות על כל המיתרים (כך הם מושתקים) ופרוט רק את הקצב.</li>
        <li>אחר כך הוסף אקורד אחד. כשהקצב יציב, עבור לרצף של כמה אקורדים (בחירה למעלה): תיבה אחת לכל אקורד.</li>
        <li>כשאתה מצליח שלוש פעמים ברצף בלי לעצור, העלה 5 BPM.</li></ol></section>
      <section class="card"><h3>התקדמות</h3><button class="save" id="save">סיימתי, שמור</button><span class="saved" id="savedMsg"></span><div id="history"></div></section>`;
    const cells = [...app.querySelectorAll('.rc')];
    const now = document.getElementById('now');
    const pulse = document.getElementById('pulse');
    const startBtn = document.getElementById('start');
    const bpmIn = document.getElementById('bpm');
    const bpmOut = document.getElementById('bpmOut');
    const prog = () => PROGS.find((p) => p.id === document.getElementById('rhProg').value);
    const ex = {
      id: logId, mode: 'rhythm', sub, steps: pat.pattern.map((x) => ({ x })), click: true,
      sched(c, t, period) {
        if (c < 0) return;
        const slot = pat.pattern[c % pat.pattern.length];
        if (slot === '-') return;
        const bar = Math.floor(c / pat.pattern.length);
        const chords = prog().chords;
        Audio_.strumChord(chords[bar % chords.length], t, slot, c % pat.pattern.length === 0 ? 1.3 : 1);
      },
    };
    const setBpm = (v) => {
      bpm = Math.max(40, Math.min(140, v));
      bpmIn.value = bpm;
      bpmOut.textContent = bpm + ' BPM';
      save('bpm:' + logId, bpm);
      if (Met.running) Met.bpm = bpm;
    };
    const onTick = (c) => {
      const si = ((c % sub) + sub) % sub;
      if (c < 0) {
        if (si !== 0) return;
        pulse.className = 'pulse beat count';
        pulse.textContent = -Math.floor(c / sub);
        now.innerHTML = 'מתכוננים…';
        return;
      }
      const slot = c % pat.pattern.length;
      cells.forEach((el, i) => el.classList.toggle('cur', i === slot));
      pulse.className = 'pulse beat' + (slot === 0 ? ' accent' : si ? ' off' : '');
      pulse.textContent = si === 0 ? Math.floor(slot / sub) + 1 : labels[slot];
      const bar = Math.floor(c / pat.pattern.length);
      const chords = prog().chords;
      const nx = chords[(bar + 1) % chords.length];
      now.innerHTML = `אקורד <b class="big"><bdi dir="ltr">${chords[bar % chords.length]}</bdi></b> ${chords.length > 1 ? `<span class="muted">· הבא: <bdi dir="ltr">${nx}</bdi></span>` : ''}`;
    };
    const resetUi = () => {
      cells.forEach((el) => el.classList.remove('cur'));
      pulse.className = 'pulse';
      pulse.textContent = '♩';
      startBtn.textContent = '▶ התחל';
      startBtn.classList.remove('on');
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
    document.getElementById('rhClick').onchange = (e) => (ex.click = e.target.checked);
    document.getElementById('rhProg').onchange = (e) => save('rhprog', e.target.value);
    document.getElementById('slower').onclick = () => setBpm(bpm - 5);
    document.getElementById('faster').onclick = () => setBpm(bpm + 5);
    bpmIn.oninput = () => setBpm(Number(bpmIn.value));
    const history = () => {
      const rows = S.log[logId] || [];
      const el = document.getElementById('history');
      if (!rows.length) return (el.innerHTML = '');
      el.innerHTML = `<p style="margin-bottom:0">${times(rows.length)} · השיא שלך: <b>${Math.max(...rows.map((r) => r.bpm))} BPM</b></p>`;
    };
    document.getElementById('save').onclick = () => {
      (S.log[logId] ||= []).push({ at: new Date().toISOString(), bpm });
      save('log', S.log);
      markActive();
      document.getElementById('savedMsg').textContent = ' ' + CHEERS[Math.floor(Math.random() * CHEERS.length)];
      history();
    };
    setBpm(bpm);
    history();
  }

  function renderRiffList() {
    const sorted = [...RIFFS].sort((a, b) => a.level - b.level);
    return `<h1>ריפים בסגנונות</h1>
      <p class="muted">ריפים קצרים שנכתבו לצורך תרגול, בסגנונות שונים, מהקל לקשה. כל ריף מחולק לתיבות ולפעימות, והצעדים זזים עם המטרונום.</p>
      <div class="welcome small">אלה לא ציטוטים של שירים מסוימים אלא תבניות שמכירים מהסגנון. הספירה מוצגת על העיגול: למשל "1 &amp; 2 &amp;".</div>
      ${exList(sorted)}`;
  }

  // ---------- סנכרון בין מכשירים ----------
  const SYNC_KEYS = new Set(['log', 'active', 'jams', 'custom', 'customDeleted']);
  const creds = () => load('sync', null);
  let syncTimer = 0;
  let syncState = { text: '', ok: null };
  const setFoot = () => {
    const el = document.getElementById('footMsg');
    if (!el) return;
    const c = creds();
    el.textContent = c ? `מחובר כ-${c.user}. ${syncState.text || 'ההתקדמות נשמרת גם בשרת.'}` : 'ההתקדמות נשמרת בדפדפן הזה. כדי לראות אותה בכל מכשיר: לשונית "חשבון וסנכרון".';
  };
  async function syncNow(silent) {
    const c = creds();
    if (!c) return { ok: false, error: 'לא מחובר' };
    try {
      const r = await fetch('api/sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user: c.user, pin: c.pin, data: SYNC.pick(S) }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw Object.assign(new Error(j.error || 'שגיאה'), { status: r.status });
      const m = SYNC.merge(SYNC.pick(S), j.data);
      S.log = m.log;
      S.active = m.active;
      S.jams = m.jams;
      S.custom = m.custom;
      S.customDeleted = m.customDeleted;
      for (const k of SYNC_KEYS) saveLocal(k, S[k]);
      syncState = { text: 'סונכרן ' + new Date().toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' }) + '.', ok: true };
      setFoot();
      return { ok: true, created: j.created, name: j.name };
    } catch (e) {
      syncState = { text: e.status ? e.message : 'אין חיבור לשרת. ההתקדמות נשמרת במכשיר ותסונכרן אחר כך.', ok: false };
      setFoot();
      if (!silent) return { ok: false, error: e.status ? e.message : 'אין שרת בכתובת הזו (למשל כשהאתר נפתח כקובץ או מאחסון סטטי).' };
      return { ok: false };
    }
  }
  const schedulePush = () => {
    if (!creds()) return;
    clearTimeout(syncTimer);
    syncTimer = setTimeout(() => syncNow(true), 4000);
  };

  function renderSync() {
    Met.stop();
    Backing.stop();
    renderTabs('sync');
    const c = creds();
    app.innerHTML = `
      <h1>חשבון וסנכרון</h1>
      <p class="muted">שם וקוד סודי פשוטים, בלי אימייל ובלי סיסמה מורכבת. עם אותם פרטים בכל מכשיר, ההתקדמות, הרצף והשירים שלך נשמרים ומתמזגים.</p>
      <section class="card" id="syncCard">${
        c
          ? `<h3>מחובר כ-${esc(c.user)}</h3><p class="muted small" id="syncInfo">${esc(syncState.text || '')}</p>
             <button class="start" id="syncNow">סנכרן עכשיו</button> <button class="secondary" id="syncOut">התנתק</button>`
          : `<h3>התחברות או יצירת פרופיל</h3>
             <div class="form-row"><label>שם <input id="syUser" maxlength="30" autocomplete="username" /></label>
             <label>קוד סודי (4 תווים לפחות) <input id="syPin" type="password" maxlength="64" autocomplete="current-password" /></label>
             <button class="start" id="syGo">התחבר</button></div>
             <p class="muted small">אם השם לא קיים עדיין, ייווצר פרופיל חדש. אחר כך אפשר להיכנס ממכשיר אחר עם אותם פרטים. שכחת את הקוד? אי אפשר לשחזר אותו.</p>`
      }<p class="tn-msg" id="syMsg" aria-live="polite"></p></section>
      <section class="card"><h3>העברה ידנית בין מכשירים</h3>
        <p class="muted small" style="margin-top:0">עובד בכל מקום, גם בלי שרת. מעתיקים את הקוד ממכשיר אחד ומדביקים בשני. הנתונים מתמזגים ולא נמחקים.</p>
        <label class="blk">הקוד שלי<textarea id="exCode" readonly rows="3"></textarea></label>
        <button class="secondary" id="exCopy">העתק</button>
        <label class="blk" style="margin-top:12px">להדביק קוד ממכשיר אחר<textarea id="imCode" rows="3"></textarea></label>
        <button class="secondary" id="imGo">ייבא ומזג</button> <span class="muted small" id="imMsg"></span></section>`;
    const msg = document.getElementById('syMsg');
    document.getElementById('exCode').value = SYNC.toCode(S);
    document.getElementById('exCopy').onclick = async () => {
      const t = document.getElementById('exCode');
      t.select();
      try {
        await navigator.clipboard.writeText(t.value);
        document.getElementById('imMsg').textContent = 'הועתק.';
      } catch (e) {
        document.getElementById('imMsg').textContent = 'סימנתי את הקוד: העתק ידנית.';
      }
    };
    document.getElementById('imGo').onclick = () => {
      const out = document.getElementById('imMsg');
      try {
        const m = SYNC.merge(SYNC.pick(S), SYNC.fromCode(document.getElementById('imCode').value));
        Object.assign(S, m);
        for (const k of SYNC_KEYS) save(k, S[k]);
        out.textContent = 'מוזג בהצלחה.';
        document.getElementById('exCode').value = SYNC.toCode(S);
      } catch (e) {
        out.textContent = 'הקוד לא תקין.';
      }
    };
    const go_ = document.getElementById('syGo');
    if (go_) {
      go_.onclick = async () => {
        const user = document.getElementById('syUser').value.trim();
        const pin = document.getElementById('syPin').value;
        if (user.length < 2 || pin.length < 4) {
          msg.textContent = 'שם של 2 תווים לפחות וקוד של 4 תווים לפחות.';
          return;
        }
        save('sync', { user, pin });
        msg.textContent = 'מתחבר…';
        const r = await syncNow(false);
        if (r.ok) {
          renderSync();
          document.getElementById('syMsg').textContent = r.created ? 'נוצר פרופיל חדש וההתקדמות נשמרה בו.' : 'מחובר. ההתקדמות מוזגה עם מה ששמור בשרת.';
        } else {
          save('sync', null);
          msg.textContent = r.error;
        }
      };
    } else {
      document.getElementById('syncNow').onclick = async () => {
        msg.textContent = 'מסנכרן…';
        const r = await syncNow(false);
        msg.textContent = r.ok ? 'הסנכרון הושלם.' : r.error;
        if (r.ok) renderSync();
      };
      document.getElementById('syncOut').onclick = () => {
        save('sync', null);
        syncState = { text: '', ok: null };
        setFoot();
        renderSync();
      };
    }
  }

  // ---------- הקלטה: שומעים את האלתור יחד עם הרקע ----------
  const Rec = { items: [], mr: null, stream: null, dest: null, src: null };
  function recMime() {
    if (typeof MediaRecorder === 'undefined') return null;
    return ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm', 'audio/ogg'].find((m) => MediaRecorder.isTypeSupported(m)) || '';
  }
  async function recStart() {
    const mime = recMime();
    if (mime === null) throw Object.assign(new Error('הדפדפן לא תומך בהקלטה.'), { custom: true });
    const stream = await navigator.mediaDevices.getUserMedia(micConstraints);
    const ctx = Audio_.ensure();
    const dest = ctx.createMediaStreamDestination();
    const src = ctx.createMediaStreamSource(stream);
    src.connect(dest);
    Audio_.out.connect(dest);
    const chunks = [];
    const mr = new MediaRecorder(dest.stream, mime ? { mimeType: mime } : undefined);
    mr.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    const done = new Promise((resolve) => {
      mr.onstop = () => resolve(new Blob(chunks, { type: mr.mimeType || mime || 'audio/webm' }));
    });
    mr.start();
    Object.assign(Rec, { mr, stream, dest, src, done });
  }
  async function recStop() {
    const { mr, stream, dest, src, done } = Rec;
    if (!mr) return null;
    mr.stop();
    const blob = await done;
    stream.getTracks().forEach((t) => t.stop());
    try {
      src.disconnect();
      Audio_.out.disconnect(dest);
    } catch (e) { /* מתעלמים */ }
    Rec.mr = null;
    return blob;
  }

  function renderTabView() {
    Met.stop();
    Backing.stop();
    const tab = DATA.tabs.find((t) => t.id === S.tab) || DATA.tabs[0];
    renderTabs(tab.id);
    let html = '';
    if (tab.kind === 'today') return renderToday();
    if (tab.kind === 'tuner') return renderTuner();
    if (tab.kind === 'sync') return renderSync();
    if (tab.kind === 'riffs') {
      app.innerHTML = renderRiffList();
      return;
    }
    if (tab.kind === 'rhythm') {
      app.innerHTML = renderRhythmList();
      return;
    }
    if (tab.kind === 'improv') return renderImprov();
    if (tab.kind === 'level') {
      const lv = DATA.levels.find((l) => l.id === tab.level);
      html = `<h1>${fx(lv.name)}</h1><p class="muted">${fx(lv.desc)}</p>${exList(lv.exercises)}`;
    } else {
      const d = DATA[tab.ref];
      html =
        `<h1>${fx(d.title)}</h1><p class="muted">${fx(d.desc)}</p>` +
        d.sections.map((sec) => `<section class="level"><h2>${fx(sec.title)}</h2><p>${fx(sec.desc)}</p>${exList(sec.exercises)}</section>`).join('');
    }
    app.innerHTML = `<div class="welcome small"><b>${statLine()}</b> התחל כל תרגיל לאט. אם הוא נשמע נקי שלוש פעמים ברצף, העלה 5 BPM.</div>${html}`;
  }
  function statLine() {
    const st = fullStats();
    return st.totalDays ? `תרגלת ${daysText(st.totalDays)} בסך הכול${st.streak > 1 ? `, ${st.streak} ברצף` : ''}.` : 'עוד לא תרגלת. תתחיל מחימום קצר.';
  }

  // ---------- אלתור: חיפוש שיר, מפתח, ג׳אם וסולמות ----------
  const MINOR_SCALES = ['minorPent', 'blues', 'naturalMinor', 'dorian', 'harmonicMinor', 'phrygianDominant'];
  const allSongs = () => [...SONGS, ...S.custom.map((c) => ({ ...c, custom: true }))];
  const searchSongs = (q) => SONGS.search(allSongs(), q);
  const keyLabel = (key) => `${key.root} ${key.mode === 'minor' ? 'מינור' : 'מז׳ור'}`;
  const scaleRoot = (song, sc) => sc.root || song.key.root;
  const scaleFlats = (rootName, scale) => T.useFlats(rootName, MINOR_SCALES.includes(scale) ? 'minor' : 'major');
  const CONF = { high: ['ודאות גבוהה', 'c-high'], medium: ['ודאות בינונית: בדוק באוזן', 'c-med'], user: ['נוסף על ידך', 'c-med'] };
  const TUNING_NOTE = {
    halfDown: '<b>כיוון חצי טון למטה.</b> ההקלטה מכוונת חצי טון נמוך, ולכן הצורות על הצוואר (כמו שכתוב כאן) נשמעות חצי טון נמוך מהשם. כדי לנגן עם ההקלטה, כוון את כל המיתרים חצי טון למטה.',
    wholeDown: '<b>כיוון טון שלם למטה (D G C F A D).</b> ההקלטה מכוונת טון שלם נמוך, ולכן הצורות על הצוואר נשמעות טון נמוך מהשם. כדי לנגן עם ההקלטה, כוון את כל המיתרים טון שלם למטה. את הכוונון אפשר לבדוק בלשונית "כוונון".',
    check: '<b>המקורות חלוקים בכיוון של ההקלטה.</b> ייתכן שהיא מכוונת נמוך מהרגיל. כוון לפי ההקלטה, ובלשונית "כוונון" אפשר לבחור כיוון מתאים ולכוון איתו.',
  };

  const ROOT_OPTIONS = [['C', 0], ['C#', 1], ['Db', 1], ['D', 2], ['Eb', 3], ['E', 4], ['F', 5], ['F#', 6], ['G', 7], ['Ab', 8], ['A', 9], ['Bb', 10], ['B', 11]];
  const rootOptions = ROOT_OPTIONS.map(([n]) => n);

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
      `התחל מ-${fx(scaleRoot(song, main))} ${T.SCALE_HE[main.scale]} בתנוחה 1. זו הקופסה הבטוחה: כל התווים בה מתאימים.`,
      'נגן את הסולם מעל הרקע בלי לנסות ליצור משהו, רק כדי להכיר את הצליל.',
      'בנה משפט קצר: שלושה עד חמישה תווים, ואז שקט. חזור על המשפט עם שינוי קטן (תו אחד או קצב).',
      'סיים משפטים על השורש או על תו מהאקורד, כדי שהם ישמעו "גמורים".',
      'רק כשהסולם הראשון נוח, הוסף תווי צבע מהסולם הבא ברשימה.',
    ];
  };

  const gq = (s) => encodeURIComponent(s);
  function externalLinks(query, extra) {
    return `<div class="chips">
      <a class="chip" href="https://www.youtube.com/results?search_query=${gq(query + ' guitar lesson')}" target="_blank" rel="noopener noreferrer">שיעורים ביוטיוב ↗</a>
      <a class="chip" href="https://www.google.com/search?q=${gq(query + ' ' + (extra || 'guitar key scale solo'))}" target="_blank" rel="noopener noreferrer">חיפוש בגוגל ↗</a></div>`;
  }

  function songPage(song) {
    const conf = CONF[song.conf] || CONF.medium;
    const hasChords = song.chords && song.chords.length;
    const style = load('bk-style:' + (song.presetId || song.id), song.drums || load('bk-style', 'rock'));
    const jamControls = song.jam
      ? `<div class="form-row"><label>מפתח <select id="jamRoot">${ROOT_OPTIONS.map(([n, pc]) => `<option value="${pc}" ${pc === song.rootPc && n === song.key.root ? 'selected' : ''}>${n}</option>`).filter((o, i, a) => a.findIndex((x) => x.split('value="')[1].split('"')[0] === o.split('value="')[1].split('"')[0]) === i).join('')}</select></label>
        <label>סגנון <select id="jamPreset">${F.JAM.map((p) => `<option value="${p.id}" ${p.id === song.presetId ? 'selected' : ''}>${p.name}</option>`).join('')}</select></label>
        <button class="secondary" id="jamGo">עדכן</button></div>`
      : '';
    return `
      <a class="back" href="#" data-go="">‹ חזרה לאלתור</a>
      <h1 class="ex-title">${fx(song.jam ? 'ג׳אם: ' + song.title : song.titleHe && song.titleHe !== song.title ? song.titleHe + ' · ' + song.title : song.title)}</h1>
      <p class="muted">${fx(song.jam ? song.desc : song.artistHe && song.artistHe !== song.artist ? song.artistHe + ' · ' + song.artist : song.artist || '')}</p>
      ${jamControls}
      <div class="chips"><span class="chip static">מפתח: ${fx(keyLabel(song.key))}</span>${song.jam ? '' : `<span class="chip static ${conf[1]}">${conf[0]}</span>`}</div>
      ${song.tuning && TUNING_NOTE[song.tuning] ? `<section class="card style"><p style="margin:0">${TUNING_NOTE[song.tuning]}</p></section>` : ''}
      ${hasChords ? `<section class="card"><h3>האקורדים העיקריים</h3><div class="chips">${song.chords.map((c) => `<span class="chip static">${fx(c)}</span>`).join('')}</div>${chordTonesCard(song)}</section>` : ''}
      ${scalesCard(song)}
      <section class="card"><h3>איך לאלתר ${song.jam ? 'מעל הרקע' : 'על השיר'}</h3><ol>${HOW_IMPROV(song).map((t) => `<li>${t}</li>`).join('')}</ol>
        ${(song.tips || []).length ? `<h3 style="margin-top:14px">טיפים</h3><ul>${song.tips.map((t) => `<li>${fx(t)}</li>`).join('')}</ul>` : ''}</section>
      ${hasChords ? `<section class="card"><h3>רקע לאלתור</h3>
        <p class="muted small" style="margin-top:0">רצף האקורדים בצליל פשוט עם תופים מסונתזים${song.jam ? '' : ', לא ההקלטה של השיר'}. נגן מעליו את הסולם.</p>
        <div class="bk-now" id="bkNow">—</div>
        <div class="controls bk"><div class="bpm"><button class="step" id="bkSlower" aria-label="לאט יותר">−</button><input type="range" id="bkBpm" min="40" max="160" value="${load('bk:' + (song.presetId || song.id), song.bpm || 80)}" aria-label="מהירות" /><button class="step" id="bkFaster" aria-label="מהר יותר">+</button><output id="bkOut"></output></div>
        <button class="start" id="bkStart">▶ נגן רקע</button></div>
        <div class="form-row"><label>קצב <select id="bkStyle">${[['rock', 'רוק'], ['shuffle', 'שאפל (בלוז)'], ['ballad', 'בלדה איטית'], ['click', 'מטרונום בלבד']].map(([v, n]) => `<option value="${v}" ${v === style ? 'selected' : ''}>${n}</option>`).join('')}</select></label></div></section>
      <section class="card"><h3>🎙 הקלטה: שמע את האלתור שלך</h3>
        <p class="muted small" style="margin-top:0">ההקלטה כוללת את הרקע ואת הגיטרה שנקלטת במיקרופון, ומתחילה יחד עם הרקע. כדי שהרקע לא יתערבב פעמיים, הכי טוב עם אוזניות. ההקלטות נשמרות רק עד שסוגרים את הדף: אפשר להוריד אותן.</p>
        <button class="start rec" id="recGo">● התחל הקלטה</button> <span class="muted small" id="recMsg"></span>
        <div id="recList"></div></section>` : ''}
      ${song.jam ? '' : `<section class="card"><h3>לשמוע ולהכיר</h3><p class="muted small" style="margin-top:0">שיעורים והקלטות של השיר, כדי לשמוע את הצליל ולבדוק מול ההקלטה.</p>${externalLinks((song.artist || '') + ' ' + song.title)}</section>`}
      <section class="card"><p class="muted small" style="margin:0">הסולמות הם המלצות לאלתור שמתאימות ${song.jam ? 'לרצף' : 'לשיר'}, ולא תמלול של הסולו המקורי. ${song.src ? 'מקורות: ' + fx(song.src) + ' ' : ''}${song.jam ? '' : 'קיימות גרסאות שונות של שירים, חלקן מכוונות נמוך מהרגיל, ולכן כדאי לוודא באוזן מול ההקלטה.'}</p></section>`;
  }

  function bindBacking(song) {
    const startBtn = document.getElementById('bkStart');
    if (song.jam) {
      document.getElementById('jamGo').onclick = () => {
        const sel = document.getElementById('jamRoot');
        go(`jam-${document.getElementById('jamPreset').value}-${sel.value}`);
      };
    }
    if (!startBtn) return;
    const key = song.presetId || song.id;
    const bpmIn = document.getElementById('bkBpm');
    const out = document.getElementById('bkOut');
    const now = document.getElementById('bkNow');
    const styleSel = document.getElementById('bkStyle');
    const setBpm = (v) => {
      const b = Math.max(40, Math.min(160, v));
      bpmIn.value = b;
      out.textContent = b + ' BPM';
      save('bk:' + key, b);
      if (Backing.running) Backing.bpm = b;
    };
    setBpm(Number(bpmIn.value));
    bpmIn.oninput = () => setBpm(Number(bpmIn.value));
    styleSel.onchange = () => {
      save('bk-style:' + key, styleSel.value);
      save('bk-style', styleSel.value);
      if (Backing.running) Backing.style = styleSel.value;
    };
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
      S.jams++;
      save('jams', S.jams);
      markActive();
      Backing.start(song.chords, Number(bpmIn.value), 4, styleSel.value, (i) => {
        const next = song.chords[(i + 1) % song.chords.length];
        now.innerHTML = `<b class="big">${fx(song.chords[i])}</b> <span class="muted">· הבא: ${fx(next)}</span>`;
      });
    };

    // הקלטה
    const recBtn = document.getElementById('recGo');
    const recMsg = document.getElementById('recMsg');
    const recList = document.getElementById('recList');
    const drawRecs = () => {
      recList.innerHTML = Rec.items
        .map((r, i) => `<div class="rec-item"><b>הקלטה ${i + 1}</b> <span class="muted small">${esc(r.label)}</span><audio controls src="${r.url}"></audio> <a class="chip" href="${r.url}" download="improv-${i + 1}.${r.ext}">הורד</a></div>`)
        .join('');
    };
    drawRecs();
    recBtn.onclick = async () => {
      if (Rec.mr) {
        const blob = await recStop();
        if (Backing.running) startBtn.onclick();
        recBtn.textContent = '● התחל הקלטה';
        recBtn.classList.remove('on');
        recMsg.textContent = '';
        if (blob && blob.size) {
          const ext = /mp4/.test(blob.type) ? 'm4a' : /ogg/.test(blob.type) ? 'ogg' : 'webm';
          Rec.items.unshift({ url: URL.createObjectURL(blob), ext, label: song.title });
          if (Rec.items.length > 5) URL.revokeObjectURL(Rec.items.pop().url);
          drawRecs();
        }
        return;
      }
      try {
        await recStart();
      } catch (e) {
        recMsg.textContent = e && e.custom ? e.message : micError(e);
        return;
      }
      if (!Backing.running) startBtn.onclick();
      recBtn.textContent = '■ עצור הקלטה';
      recBtn.classList.add('on');
      recMsg.textContent = 'מקליט…';
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
          { scale: 'minorPent', why: 'בלוז-רוק: פנטטוני מינורי של אותו שורש על שיר במז׳ור.' },
        ];
  }

  function renderImprov() {
    Met.stop();
    Backing.stop();
    renderTabs('improv');
    app.innerHTML = `
      <h1>אלתור על שירים</h1>
      <p class="muted">כתוב שם של להקה, שיר או שניהם (למשל "pantera walk", בעברית או באנגלית) וקבל את המפתח, האקורדים והסולמות לאלתור, עם לוח ורקע.</p>
      <div class="searchbox"><input id="impQ" type="search" placeholder="למשל: pantera walk, Don't Cry, גאנז אנד רוזס, בלוז…" autocomplete="off" value="${esc(S.query)}" aria-label="חיפוש שיר או להקה" /></div>
      <div class="chips lvl-chips" id="lvlChips">${[[0, 'כל הרמות'], [1, 'קל'], [2, 'בינוני'], [3, 'מתקדם']].map(([v, n]) => `<button class="chip lvl ${S.lvl === v ? 'on' : ''}" data-lvl="${v}">${n}</button>`).join('')}</div>
      <div id="impResults"></div>
      <section class="card jam-card"><h3>🎸 ג׳אם חופשי</h3>
        <p class="muted small" style="margin-top:0">בלי שיר מסוים: בחר סגנון ומפתח, וקבל רקע עם תופים ואת הסולמות שמתאימים. הדרך הכי כיפית להתחיל לאלתר.</p>
        <div class="form-row"><label>סגנון <select id="jfPreset">${F.JAM.map((p) => `<option value="${p.id}">${p.name}</option>`).join('')}</select></label>
          <label>מפתח <select id="jfRoot">${ROOT_OPTIONS.filter(([n]) => n !== 'C#').map(([n, pc]) => `<option value="${pc}" ${n === 'A' ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
          <button class="start" id="jfGo">התחל ג׳אם</button></div></section>
      <section class="card"><h3>השיר לא ברשימה?</h3>
        <p class="muted small" style="margin-top:0">האתר לא מתחבר למאגר מוזיקה חיצוני, ולכן הרשימה מצומצמת. אפשר לחפש את השיר ביוטיוב או בגוגל לשמוע ולבדוק מפתח, ואז לבחור את המפתח כאן ולקבל סולמות. אפשר גם להוסיף את השיר לרשימה שלך, או לבקש ממני בשיחה להוסיף אותו לאתר.</p>
        <div id="impExt"></div>
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
    const ext = document.getElementById('impExt');

    const LVL = ['', 'קל', 'בינוני', 'מתקדם'];
    const row = (s) =>
      `<li><a class="ex" href="#song-${s.id}" data-go="song-${s.id}"><b>${fx(s.titleHe && s.titleHe !== s.title ? s.titleHe + ' · ' + s.title : s.title)} ${s.custom ? '<span class="tag">שלי</span>' : `<span class="tag d-${s.level}">${LVL[s.level]}</span>`}</b>
        <span>${fx(s.artistHe && s.artistHe !== s.artist ? s.artistHe + ' · ' + s.artist : s.artist || '')} · ${fx(keyLabel(s.key))}</span></a>${s.custom ? `<button class="del" data-del="${s.id}" aria-label="מחיקת השיר">מחק</button>` : ''}</li>`;
    const draw = () => {
      const list = searchSongs(S.query).filter((x) => !S.lvl || x.level === S.lvl);
      results.innerHTML = list.length
        ? `<p class="muted small">${list.length} ${S.query.trim() ? 'תוצאות' : 'שירים ברשימה'}</p><ul class="ex-list">${list.map(row).join('')}</ul>`
        : `<p class="empty">לא נמצא שיר כזה ברשימה. אפשר לחפש אותו בחוץ (למטה), או לבקש ממני להוסיף אותו.</p>`;
      ext.innerHTML = S.query.trim() ? externalLinks(S.query.trim(), 'guitar solo scale key') : '';
    };
    q.oninput = () => {
      S.query = q.value;
      draw();
    };
    document.getElementById('lvlChips').onclick = (e) => {
      const b = e.target.closest('[data-lvl]');
      if (!b) return;
      S.lvl = Number(b.dataset.lvl);
      document.querySelectorAll('#lvlChips .lvl').forEach((x) => x.classList.toggle('on', x === b));
      draw();
    };
    results.addEventListener('click', (e) => {
      const d = e.target.closest('[data-del]');
      if (!d) return;
      S.custom = S.custom.filter((c) => c.id !== d.dataset.del);
      S.customDeleted = [...new Set([...S.customDeleted, d.dataset.del])];
      save('customDeleted', S.customDeleted);
      save('custom', S.custom);
      draw();
    });
    draw();

    document.getElementById('jfGo').onclick = () => go(`jam-${document.getElementById('jfPreset').value}-${document.getElementById('jfRoot').value}`);
    document.getElementById('kfShow').onclick = () => {
      const root = document.getElementById('kfRoot').value;
      const mode = document.getElementById('kfMode').value;
      const fake = { key: { root, mode }, scales: defaultScales(mode).map((s) => ({ ...s, root })) };
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
        scales: defaultScales(mode).map((s) => ({ ...s, root })), tips: [],
      });
      save('custom', S.custom);
      document.getElementById('msName').value = '';
      document.getElementById('msChords').value = '';
      msg.textContent = 'נשמר. השיר מופיע ברשימה למעלה.';
      draw();
    };
  }

  function showSong(song) {
    Met.stop();
    Backing.stop();
    renderTabs('improv');
    lastRoute = song.jam ? song.id : 'song-' + song.id;
    app.innerHTML = songPage(song);
    bindBacking(song);
  }
  function renderSong(id) {
    const song = allSongs().find((s) => s.id === id);
    if (!song) {
      renderTabs('improv');
      app.innerHTML = '<a class="back" href="#" data-go="">‹ חזרה</a><p class="empty">השיר לא נמצא.</p>';
      return;
    }
    showSong(song);
  }
  function renderJam(id) {
    const m = /^jam-(.+)-(\d+)$/.exec(id);
    const song = m && jamSong(m[1], Number(m[2]));
    if (!song) return renderTabView();
    showSong(song);
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
    renderTabs(ex.id.startsWith('g-') ? 'improv' : S.tab);
    let bpm = load('bpm:' + ex.id, ex.startBpm);
    const n = ex.steps.length;
    const bps = bpsOf(ex);
    const chords = ex.mode === 'chords';
    const usesOpen = ex.steps.some((st) => (chords ? st.open.length || st.mute.length : st.f === 0));
    const usesBlue = ex.steps.some((st) => st.blue);
    const flats = !!ex.flats;
    const back = ex.id.startsWith('g-') && lastRoute ? lastRoute : '';
    let peak = bpm;
    let runStart = bpm;
    const styleCard = ex.style
      ? `<section class="card style"><h3>${fx(ex.style.title)}</h3><p>${fx(ex.style.text)}</p>${ex.style.note ? `<p class="muted small">${fx(ex.style.note)}</p>` : ''}</section>`
      : '';
    app.innerHTML = `
      <a class="back" href="#" data-go="${back}">‹ ${back ? (back.startsWith('jam-') ? 'חזרה לג׳אם' : 'חזרה לשיר') : 'חזרה'}</a>
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
      if (step.rest) return null;
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
      m: 'פאלם מיוט: כף היד נוגעת קלות במיתרים ליד הגשר',
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
      const sub = ex.sub || 1;
      const beat = Math.floor(c / sub);
      const barNo = Math.floor(beat / 4) % (ex.barLabels ? ex.barLabels.length : 1);
      const barTxt = ex.barLabels ? `<span class="barinfo">תיבה ${barNo + 1} מתוך ${ex.barLabels.length} · <bdi dir="ltr">${ex.barLabels[barNo]}</bdi> · פעימה ${(beat % 4) + 1}</span><br>` : '';
      if (step.rest) return `${barTxt}<b>שקט</b> <span class="muted">· ${i + 1} מתוך ${n}. אל תפרוט</span>`;
      const hasTech = ex.steps.some((x) => x.t === 'h' || x.t === 'p');
      const tech = step.t ? ` <span class="tech">· ${TECH[step.t]}</span>` : hasTech ? ' <span class="tech">· פורטים</span>' : '';
      const blue = step.blue ? ' <span class="tech">· תו המתח (b5)</span>' : '';
      const where = step.f === 0
        ? `מיתר <b>${step.s}</b> (${STRING_NAMES[step.s]}) · <b>פתוח</b> (בלי ללחוץ)`
        : `מיתר <b>${step.s}</b> (${STRING_NAMES[step.s]}) · סריג <b>${step.f}</b> · אצבע <b>${step.fi}</b> (${fingerName(step.fi)})`;
      return `${barTxt}${where} <span class="muted">· תו <bdi dir="ltr">${noteName(step.s, step.f, flats)}</bdi> · ${i + 1} מתוך ${n}</span>${tech}${blue}`;
    };
    const keepVisible = (el) => {
      const r = el.getBoundingClientRect();
      const w = board.getBoundingClientRect();
      if (r.left < w.left + 12) board.scrollLeft -= w.left + 12 - r.left;
      else if (r.right > w.right - 12) board.scrollLeft += r.right - (w.right - 12);
    };
    const subN = ex.sub || 1;
    const SUBLBL = { 1: [''], 2: ['', '&'], 3: ['', 'la', 'li'], 4: ['', 'e', '&', 'a'] }[subN] || [''];
    const onTick = (c) => {
      const si = ((c % subN) + subN) % subN;
      if (c < 0) {
        if (si !== 0) return;
        pulse.classList.remove('beat', 'accent', 'count', 'off');
        void pulse.offsetWidth;
        pulse.textContent = -Math.floor(c / subN);
        pulse.classList.add('beat', 'count');
        now.innerHTML = 'מתכוננים…';
        return;
      }
      pulse.classList.remove('beat', 'accent', 'count', 'off');
      void pulse.offsetWidth;
      if (ex.ramp && c > 0 && c % (ex.ramp.every || n) === 0 && bpm < ex.ramp.max) {
        setBpm(Math.min(ex.ramp.max, bpm + ex.ramp.step), { persist: false });
        peak = Math.max(peak, bpm);
      }
      const i = stepIndexOf(ex, c);
      const step = ex.steps[i];
      const beat = Math.floor(c / subN);
      const inBar = (beat % 4) + 1;
      pulse.textContent = si === 0 ? inBar : SUBLBL[si];
      pulse.classList.add('beat');
      if (si !== 0) pulse.classList.add('off');
      if (si === 0 && inBar === 1) pulse.classList.add('accent');
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
      markActive();
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
    if (stopTuner) stopTuner();
    if (Rec.mr) recStop();
    if (current.startsWith('rh-')) renderRhythm(current.slice(3));
    else if (current.startsWith('song-')) renderSong(current.slice(5));
    else if (current.startsWith('jam-')) renderJam(current);
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
  setFoot();
  if (creds()) {
    syncNow(true).then((r) => {
      // רענון המסך רק אם אין כרגע מטרונום, רקע, כוונון או הקלטה פעילים
      if (r.ok && !Met.running && !Backing.running && !stopTuner && !Rec.mr && !/^(song-|jam-|rh-|riff-|g-)/.test(current) && !findEx(current)) route();
    });
  }
})();
