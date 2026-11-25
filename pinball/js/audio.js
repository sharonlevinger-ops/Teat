// Synthesised sound effects + adaptive fantasy music (Web Audio, no files).
const KEY = 'fcp_muted';

export class Sound {
  constructor() {
    this.ctx = null;
    this.muted = (() => { try { return localStorage.getItem(KEY) === '1'; } catch { return false; } })();
    this.intensity = 0; // 0 calm, 1 multiball / mode
    this.musicOn = false;
  }

  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      const c = (this.ctx = new AC({ latencyHint: 'interactive' }));
      this.master = c.createGain(); this.master.gain.value = this.muted ? 0 : 0.9;
      const comp = c.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4; comp.attack.value = 0.003; comp.release.value = 0.2;
      this.master.connect(comp).connect(c.destination);
      this.sfx = c.createGain(); this.sfx.gain.value = 0.85; this.sfx.connect(this.master);
      this.music = c.createGain(); this.music.gain.value = 0.32; this.music.connect(this.master);
      // reverb for magical sounds
      this.verb = c.createConvolver(); this.verb.buffer = this.impulse(2.4); const vg = c.createGain(); vg.gain.value = 0.35; this.verb.connect(vg).connect(this.master);
      this.noise = this.noiseBuffer();
      // rolling ball loop
      this.roll = c.createBufferSource(); this.roll.buffer = this.noise; this.roll.loop = true;
      this.rollF = c.createBiquadFilter(); this.rollF.type = 'bandpass'; this.rollF.frequency.value = 300; this.rollF.Q.value = 0.8;
      this.rollG = c.createGain(); this.rollG.gain.value = 0;
      this.roll.connect(this.rollF).connect(this.rollG).connect(this.sfx); this.roll.start();
    }
    if (this.ctx.state !== 'running') this.ctx.resume();
  }

  setMuted(m) {
    this.muted = m;
    try { localStorage.setItem(KEY, m ? '1' : '0'); } catch { /* ignore */ }
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.9, this.ctx.currentTime, 0.05);
  }

  impulse(sec) {
    const c = this.ctx, n = Math.floor(c.sampleRate * sec), b = c.createBuffer(2, n, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const d = b.getChannelData(ch); for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 3); }
    return b;
  }
  noiseBuffer() {
    const c = this.ctx, n = c.sampleRate * 2, b = c.createBuffer(1, n, c.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }

  // --- primitives
  tone(freq, dur, { type = 'sine', vol = 0.3, attack = 0.003, at = 0, slide = 0, dest, verb = 0 } = {}) {
    const c = this.ctx; if (!c) return;
    const t = c.currentTime + at;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(dest || this.sfx);
    if (verb) { const vg = c.createGain(); vg.gain.value = verb; g.connect(vg).connect(this.verb); }
    o.start(t); o.stop(t + dur + 0.05);
  }
  burst(dur, { freq = 2000, q = 1, vol = 0.3, type = 'bandpass', at = 0, slide = 0, dest } = {}) {
    const c = this.ctx; if (!c) return;
    const t = c.currentTime + at;
    const s = c.createBufferSource(); s.buffer = this.noise; s.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    if (slide) f.frequency.exponentialRampToValueAtTime(freq * slide, t + dur);
    const g = c.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(dest || this.sfx);
    s.start(t, Math.random()); s.stop(t + dur + 0.05);
  }

  play(name, v = 1) {
    if (!this.ctx || this.muted) return;
    const vv = Math.min(1, Math.max(0.15, v));
    switch (name) {
      case 'flipper': this.burst(0.05, { freq: 1800, q: 0.7, vol: 0.5 }); this.tone(95, 0.09, { type: 'square', vol: 0.18, slide: 0.5 }); break;
      case 'flipperDown': this.burst(0.04, { freq: 900, q: 1, vol: 0.22 }); break;
      case 'bumper': this.tone(160, 0.18, { type: 'square', vol: 0.22, slide: 0.45 }); this.burst(0.08, { freq: 3000, vol: 0.35 }); this.tone(880 + Math.random() * 300, 0.25, { type: 'triangle', vol: 0.12, verb: 0.6 }); break;
      case 'sling': this.burst(0.06, { freq: 2600, q: 1.5, vol: 0.45 }); this.tone(220, 0.08, { type: 'square', vol: 0.15, slide: 0.6 }); break;
      case 'wall': this.burst(0.03, { freq: 1200 + Math.random() * 600, q: 3, vol: 0.18 * vv }); break;
      case 'ball': this.burst(0.03, { freq: 4000, q: 5, vol: 0.25 * vv }); this.tone(1900, 0.05, { vol: 0.08 * vv }); break;
      case 'post': this.tone(420, 0.06, { type: 'triangle', vol: 0.12 * vv }); this.burst(0.03, { freq: 2500, vol: 0.2 * vv }); break;
      case 'target': this.burst(0.04, { freq: 1500, q: 2, vol: 0.4 }); this.tone(600, 0.12, { type: 'triangle', vol: 0.14, verb: 0.3 }); break;
      case 'drop': this.burst(0.08, { freq: 700, q: 1, vol: 0.45 }); this.tone(300, 0.15, { type: 'sawtooth', vol: 0.1, slide: 0.5 }); break;
      case 'spinner': this.burst(0.015, { freq: 5000, q: 6, vol: 0.18 }); this.tone(2400 + Math.random() * 400, 0.03, { vol: 0.05 }); break;
      case 'rollover': this.tone(1320, 0.12, { type: 'triangle', vol: 0.15, verb: 0.4 }); this.tone(1760, 0.14, { type: 'triangle', vol: 0.12, at: 0.06, verb: 0.4 }); break;
      case 'ramp': this.burst(0.7, { freq: 400, q: 1.5, vol: 0.25, slide: 6 }); this.arp([523, 659, 784, 1047], 0.06, 0.12, 'triangle'); break;
      case 'wire': this.burst(0.5, { freq: 2500, q: 4, vol: 0.12, slide: 0.6 }); this.tone(1800, 0.3, { type: 'triangle', vol: 0.04, verb: 0.3 }); break;
      case 'rampFail': this.burst(0.3, { freq: 900, vol: 0.2, slide: 0.3 }); break;
      case 'hole': this.tone(130, 0.3, { type: 'sine', vol: 0.4, slide: 0.4 }); this.burst(0.12, { freq: 500, vol: 0.4 }); break;
      case 'kick': this.burst(0.08, { freq: 900, q: 1, vol: 0.5 }); this.tone(80, 0.12, { type: 'square', vol: 0.2, slide: 0.5 }); break;
      case 'plunger': this.burst(0.12, { freq: 600, q: 0.8, vol: 0.5 }); this.tone(120, 0.15, { type: 'triangle', vol: 0.3, slide: 0.4 }); break;
      case 'pull': this.burst(0.15, { freq: 3000, q: 8, vol: 0.06, slide: 0.5 }); break;
      case 'pool': this.burst(0.5, { freq: 900, q: 0.8, vol: 0.18, slide: 0.4, type: 'lowpass' }); this.arp([1047, 1319, 1568], 0.05, 0.08, 'sine'); break;
      case 'magic': this.arp([784, 988, 1175, 1568, 1976], 0.05, 0.12, 'triangle'); break;
      case 'lock': this.arp([392, 523, 659, 784], 0.08, 0.2, 'sawtooth', 0.08); this.tone(98, 0.8, { type: 'sine', vol: 0.3, verb: 0.5 }); break;
      case 'jackpot': this.arp([523, 659, 784, 1047, 1319, 1568, 2093], 0.06, 0.18, 'square', 0.08); this.burst(1.2, { freq: 6000, vol: 0.15, slide: 0.3, type: 'highpass' }); break;
      case 'multiball': this.fanfare(); break;
      case 'combo': this.arp([660 * Math.pow(1.06, v), 880 * Math.pow(1.06, v)], 0.05, 0.15, 'triangle'); break;
      case 'drain': this.tone(330, 1.2, { type: 'sawtooth', vol: 0.15, slide: 0.25, verb: 0.4 }); this.tone(165, 1.4, { type: 'sine', vol: 0.25, slide: 0.3 }); break;
      case 'save': this.arp([880, 660, 880, 1320], 0.07, 0.15, 'triangle'); break;
      case 'treasure': this.arp([1047, 1319, 1568, 2093, 1568, 2093, 2637], 0.07, 0.2, 'triangle', 0.14); this.burst(1.5, { freq: 7000, vol: 0.1, type: 'highpass' }); break;
      case 'gameover': this.arp([523, 494, 440, 392, 349, 330, 262], 0.16, 0.5, 'triangle', 0.12); break;
      case 'start': this.arp([392, 523, 659, 784, 1047], 0.08, 0.3, 'triangle', 0.12); break;
      case 'kickback': this.burst(0.15, { freq: 400, vol: 0.6 }); this.tone(60, 0.25, { type: 'square', vol: 0.3, slide: 3 }); break;
      case 'click': this.tone(1200, 0.04, { type: 'square', vol: 0.06 }); break;
      default: break;
    }
  }
  arp(notes, step, dur, type = 'triangle', vol = 0.1) { notes.forEach((f, i) => this.tone(f, dur, { type, vol, at: i * step, verb: 0.5 })); }
  fanfare() {
    const seq = [[392, 0], [523, 0.12], [659, 0.24], [784, 0.36], [659, 0.6], [784, 0.72], [1047, 0.9]];
    for (const [f, at] of seq) { this.tone(f, 0.35, { type: 'sawtooth', vol: 0.09, at, verb: 0.5 }); this.tone(f / 2, 0.35, { type: 'square', vol: 0.05, at }); }
    this.burst(1.6, { freq: 8000, vol: 0.12, type: 'highpass', at: 0.9 });
  }

  setRoll(speed) {
    if (!this.rollG) return;
    const v = this.muted ? 0 : Math.min(0.22, speed / 9000);
    this.rollG.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05);
    this.rollF.frequency.setTargetAtTime(180 + speed * 0.25, this.ctx.currentTime, 0.05);
  }

  // --- music: gentle fantasy loop in D minor, more layers when intensity rises
  startMusic() {
    if (!this.ctx || this.musicOn) return;
    this.musicOn = true; this.step = 0; this.nextT = this.ctx.currentTime + 0.1;
    const tick = () => {
      if (!this.musicOn) return;
      while (this.nextT < this.ctx.currentTime + 0.25) { this.scheduleStep(this.step, this.nextT); this.step++; this.nextT += this.stepDur(); }
      this.timer = setTimeout(tick, 60);
    };
    tick();
  }
  stopMusic() { this.musicOn = false; clearTimeout(this.timer); }
  stepDur() { return 60 / (this.intensity > 0.5 ? 132 : 96) / 4; }
  scheduleStep(step, t) {
    const c = this.ctx;
    const chords = [[62, 65, 69], [58, 62, 65], [65, 69, 72], [60, 64, 67], [57, 60, 64], [58, 62, 65], [55, 58, 62], [57, 61, 64]];
    const bar = Math.floor(step / 16) % chords.length, s = step % 16;
    const ch = chords[bar];
    const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
    const note = (m, dur, type, vol, at = 0, dest = this.music, cutoff = 2400) => {
      const o = c.createOscillator(), g = c.createGain(), f = c.createBiquadFilter();
      o.type = type; o.frequency.value = mtof(m); f.type = 'lowpass'; f.frequency.value = cutoff;
      g.gain.setValueAtTime(0.0001, t + at); g.gain.exponentialRampToValueAtTime(vol, t + at + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + at + dur);
      o.connect(f).connect(g).connect(dest); o.start(t + at); o.stop(t + at + dur + 0.05);
      return g;
    };
    if (s === 0) {
      // pad
      for (const m of ch) { for (const det of [-6, 6]) { const o = c.createOscillator(), g = c.createGain(), f = c.createBiquadFilter(); o.type = 'sawtooth'; o.frequency.value = mtof(m - 12); o.detune.value = det; f.type = 'lowpass'; f.frequency.value = 900 + this.intensity * 900; const d = this.stepDur() * 16; g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.028, t + d * 0.3); g.gain.linearRampToValueAtTime(0.0001, t + d); o.connect(f).connect(g).connect(this.music); const vg = c.createGain(); vg.gain.value = 0.4; g.connect(vg).connect(this.verb); o.start(t); o.stop(t + d + 0.1); } }
      note(ch[0] - 24, this.stepDur() * 7, 'triangle', 0.18, 0, this.music, 600);
    }
    if (s === 8) note(ch[0] - 24, this.stepDur() * 6, 'triangle', 0.14, 0, this.music, 600);
    // harp arpeggio
    const arp = [0, 1, 2, 1, 0, 1, 2, 3];
    if (s % 2 === 0) { const idx = arp[(s / 2) % 8]; const m = idx === 3 ? ch[0] + 12 : ch[idx]; const g = note(m + 12, 0.5, 'triangle', 0.05 + this.intensity * 0.02, 0, this.music, 3500); const vg = c.createGain(); vg.gain.value = 0.6; g.connect(vg).connect(this.verb); }
    // percussion when the action heats up
    if (this.intensity > 0.3) {
      if (s % 4 === 0) { const o = c.createOscillator(), g = c.createGain(); o.frequency.setValueAtTime(120, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.12); g.gain.setValueAtTime(0.25, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.15); o.connect(g).connect(this.music); o.start(t); o.stop(t + 0.2); }
      if (s % 2 === 1) { const src = c.createBufferSource(); src.buffer = this.noise; const f = c.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 7000; const g = c.createGain(); g.gain.setValueAtTime(0.05, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05); src.connect(f).connect(g).connect(this.music); src.start(t, Math.random()); src.stop(t + 0.06); }
    }
  }
}
