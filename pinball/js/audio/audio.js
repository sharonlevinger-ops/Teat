// Procedural audio: every sound effect and all music are synthesised live with the Web Audio API.
// No audio files to download, seamless loops by construction (step sequencer), cross-faded tracks.

const NOTE = (n) => 440 * Math.pow(2, (n - 69) / 12); // MIDI -> Hz
const C4 = 60;
const MAJOR = [0, 2, 4, 5, 7, 9, 11];
// mushroom bells: C major scale C4..A4
export const BELL_NOTES = [60, 62, 64, 65, 67, 69];

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.musicVolume = 0.55;
    this.sfxVolume = 0.85;
    this.muted = false;
    this.bellIndex = 0;
    this.voices = 0;
  }

  get ready() { return !!this.ctx; }

  /** Must be called from a user gesture (iOS). Safe to call repeatedly. */
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      const ctx = new AC({ latencyHint: 'interactive' });
      this.ctx = ctx;
      this.master = ctx.createGain();
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14; comp.knee.value = 12; comp.ratio.value = 4; comp.attack.value = 0.003; comp.release.value = 0.2;
      this.master.connect(comp).connect(ctx.destination);
      this.sfx = ctx.createGain();
      this.music = ctx.createGain();
      this.sfx.connect(this.master);
      this.music.connect(this.master);
      // shared reverb + echo
      this.reverb = ctx.createConvolver();
      this.reverb.buffer = this._impulse(2.4, 2.2);
      this.reverbSend = ctx.createGain(); this.reverbSend.gain.value = 0.32;
      this.reverbSend.connect(this.reverb).connect(this.master);
      this.delay = ctx.createDelay(1);
      this.delay.delayTime.value = 0.32;
      const fb = ctx.createGain(); fb.gain.value = 0.3;
      const dl = ctx.createBiquadFilter(); dl.type = 'lowpass'; dl.frequency.value = 2400;
      this.delay.connect(dl).connect(fb).connect(this.delay);
      this.delaySend = ctx.createGain(); this.delaySend.gain.value = 0.25;
      this.delaySend.connect(this.delay);
      dl.connect(this.music);
      this.noise = this._noiseBuffer(2);
      this._buildRoll();
      this.seq = new Sequencer(this);
      this.applyVolumes();
      // iOS: play a silent buffer inside the gesture
      const s = ctx.createBufferSource(); s.buffer = ctx.createBuffer(1, 1, 22050); s.connect(ctx.destination); s.start(0);
    }
    if (this.ctx.state !== 'running') this.ctx.resume().catch(() => {});
  }

  suspend() { if (this.ctx && this.ctx.state === 'running') this.ctx.suspend().catch(() => {}); }
  resume() { if (this.ctx && this.ctx.state !== 'running') this.ctx.resume().catch(() => {}); }

  applyVolumes() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.music.gain.setTargetAtTime(this.muted ? 0 : this.musicVolume * 0.7, t, 0.05);
    this.sfx.gain.setTargetAtTime(this.muted ? 0 : this.sfxVolume, t, 0.05);
  }

  _impulse(seconds, decay) {
    const ctx = this.ctx, len = Math.floor(ctx.sampleRate * seconds);
    const b = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = b.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return b;
  }

  _noiseBuffer(seconds) {
    const ctx = this.ctx, len = Math.floor(ctx.sampleRate * seconds);
    const b = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }

  // ------------------------------------------------------------------------------- primitives
  _env(g, t, a, peak, d, end = 0.0001) {
    g.gain.cancelScheduledValues(t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + a);
    g.gain.exponentialRampToValueAtTime(end, t + a + d);
  }

  /** oscillator voice -> destination. returns stop time */
  tone(dest, type, freq, t, a, peak, d, { glideTo = 0, glideTime = 0, detune = 0, send = 0, echo = 0 } = {}) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (glideTo) o.frequency.exponentialRampToValueAtTime(glideTo, t + (glideTime || a + d));
    if (detune) o.detune.value = detune;
    o.connect(g).connect(dest);
    if (send) { const s = ctx.createGain(); s.gain.value = send; g.connect(s).connect(this.reverbSend); }
    if (echo) { const s = ctx.createGain(); s.gain.value = echo; g.connect(s).connect(this.delaySend); }
    this._env(g, t, a, peak, d);
    o.start(t);
    o.stop(t + a + d + 0.05);
    this.voices++;
    o.onended = () => { this.voices--; g.disconnect(); };
    return t + a + d;
  }

  noiseHit(dest, t, { type = 'bandpass', freq = 1000, q = 1, a = 0.002, peak = 0.5, d = 0.1, sweepTo = 0, send = 0 } = {}) {
    const ctx = this.ctx;
    const s = ctx.createBufferSource();
    s.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + a + d);
    const g = ctx.createGain();
    s.connect(f).connect(g).connect(dest);
    if (send) { const sg = ctx.createGain(); sg.gain.value = send; g.connect(sg).connect(this.reverbSend); }
    this._env(g, t, a, peak, d);
    s.start(t, Math.random() * 1.5);
    s.stop(t + a + d + 0.05);
    this.voices++;
    s.onended = () => { this.voices--; g.disconnect(); };
  }

  _ok(max = 40) { return this.ctx && this.ctx.state === 'running' && !this.muted && this.voices < max; }

  // ------------------------------------------------------------------------------- rolling ball
  _buildRoll() {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noise; src.loop = true;
    this.rollFilter = ctx.createBiquadFilter();
    this.rollFilter.type = 'lowpass'; this.rollFilter.frequency.value = 300; this.rollFilter.Q.value = 0.7;
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 60;
    this.rollGain = ctx.createGain(); this.rollGain.gain.value = 0;
    src.connect(this.rollFilter).connect(hp).connect(this.rollGain).connect(this.sfx);
    src.start();
  }

  /** speed: summed rolling speed of balls on the wood (0 when nothing rolls). */
  setRolling(speed, onRail) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const v = Math.min(1, speed / 60);
    this.rollGain.gain.setTargetAtTime(v * (onRail ? 0.08 : 0.16), t, 0.06);
    this.rollFilter.frequency.setTargetAtTime(onRail ? 2200 + v * 1800 : 180 + v * 700, t, 0.08);
  }

  // ------------------------------------------------------------------------------- sound effects
  flipper(up) {
    if (!this._ok()) return;
    const t = this.ctx.currentTime;
    this.noiseHit(this.sfx, t, { freq: up ? 1900 : 1300, q: 4, peak: up ? 0.5 : 0.25, d: up ? 0.05 : 0.04 });
    this.tone(this.sfx, 'triangle', up ? 180 : 140, t, 0.002, up ? 0.55 : 0.3, 0.07, { glideTo: 60 });
    if (up) this.noiseHit(this.sfx, t + 0.012, { freq: 3200, q: 6, peak: 0.18, d: 0.03 });
  }

  thud(impact) {
    if (!this._ok(30)) return;
    const t = this.ctx.currentTime, v = Math.min(1, impact / 40);
    this.tone(this.sfx, 'sine', 110, t, 0.002, 0.25 + v * 0.5, 0.12, { glideTo: 45 });
    this.noiseHit(this.sfx, t, { type: 'lowpass', freq: 500 + v * 800, peak: 0.12 + v * 0.25, d: 0.06 });
  }

  metalClick() {
    if (!this._ok()) return;
    const t = this.ctx.currentTime;
    this.tone(this.sfx, 'square', 2400, t, 0.001, 0.08, 0.04);
    this.tone(this.sfx, 'sine', 3700, t, 0.001, 0.12, 0.08, { send: 0.3 });
  }

  sling() {
    if (!this._ok()) return;
    const t = this.ctx.currentTime;
    this.noiseHit(this.sfx, t, { freq: 2200, q: 2, peak: 0.45, d: 0.05 });
    this.tone(this.sfx, 'sine', 160, t, 0.002, 0.5, 0.1, { glideTo: 55 });
  }

  bumperThump() {
    if (!this._ok()) return;
    const t = this.ctx.currentTime;
    this.tone(this.sfx, 'sine', 95, t, 0.002, 0.7, 0.16, { glideTo: 40 });
    this.noiseHit(this.sfx, t, { type: 'lowpass', freq: 900, peak: 0.25, d: 0.05 });
  }

  /** magical bell, rising through C4–A4 on every mushroom hit */
  mushroomBell() {
    if (!this._ok()) return;
    const n = BELL_NOTES[this.bellIndex % BELL_NOTES.length];
    this.bellIndex++;
    this.bell(NOTE(n), 0.32);
    this.bell(NOTE(n + 12), 0.1, 0.01);
  }

  bell(f, vol = 0.3, delay = 0) {
    const t = this.ctx.currentTime + delay;
    this.tone(this.sfx, 'sine', f, t, 0.003, vol, 1.6, { send: 0.6 });
    this.tone(this.sfx, 'sine', f * 2.76, t, 0.002, vol * 0.35, 0.6, { send: 0.5 });
    this.tone(this.sfx, 'sine', f * 5.4, t, 0.001, vol * 0.15, 0.25, { send: 0.4 });
  }

  crystal() {
    if (!this._ok()) return;
    const t = this.ctx.currentTime;
    const base = [2093, 2637, 3136, 3951, 4699];
    for (let i = 0; i < 5; i++) this.tone(this.sfx, 'sine', base[i] * (0.98 + Math.random() * 0.04), t + i * 0.018, 0.001, 0.09, 0.35 + Math.random() * 0.4, { send: 0.7 });
    this.noiseHit(this.sfx, t, { type: 'highpass', freq: 6000, peak: 0.2, d: 0.12, send: 0.4 });
  }

  potion() {
    if (!this._ok()) return;
    const t = this.ctx.currentTime;
    this.tone(this.sfx, 'sine', 260, t, 0.005, 0.5, 0.12, { glideTo: 900, glideTime: 0.09 });
    for (let i = 0; i < 4; i++) this.tone(this.sfx, 'sine', 500 + Math.random() * 700, t + 0.08 + i * 0.05, 0.003, 0.12, 0.05, { glideTo: 1400, send: 0.3 });
  }

  wizardSpell() {
    if (!this._ok()) return;
    const t = this.ctx.currentTime;
    this.noiseHit(this.sfx, t, { freq: 300, q: 3, a: 0.08, peak: 0.25, d: 0.6, sweepTo: 1600, send: 0.6 });
    for (const [f, dt] of [[NOTE(45), -12], [NOTE(52), 9], [NOTE(57), 4]]) this.tone(this.sfx, 'sawtooth', f, t, 0.05, 0.05, 0.7, { detune: dt, send: 0.5 });
    this.tone(this.sfx, 'sine', 880, t + 0.1, 0.02, 0.12, 0.6, { glideTo: 1760, send: 0.6 });
  }

  towerOpen() {
    if (!this._ok()) return;
    [72, 76, 79, 84, 88].forEach((n, i) => this.bell(NOTE(n), 0.25, i * 0.09));
    const t = this.ctx.currentTime;
    this.noiseHit(this.sfx, t, { type: 'highpass', freq: 5000, a: 0.3, peak: 0.12, d: 1.4, send: 0.8 });
  }

  towerEnter() {
    if (!this._ok(60)) return;
    const t = this.ctx.currentTime;
    // the gate creaks open
    this.tone(this.sfx, 'sawtooth', 70, t, 0.05, 0.12, 0.7, { glideTo: 120 });
    this.noiseHit(this.sfx, t, { freq: 700, q: 8, a: 0.05, peak: 0.25, d: 0.6, sweepTo: 1300 });
    // crowd cheer
    for (let i = 0; i < 6; i++) this.noiseHit(this.sfx, t + 0.4 + i * 0.12, { freq: 900 + Math.random() * 1600, q: 1.2, a: 0.15, peak: 0.12, d: 1.4, send: 0.5 });
    // fanfare
    [[60, 0.5], [64, 0.62], [67, 0.74], [72, 0.9]].forEach(([n, dt]) => this.brassNote(this.sfx, NOTE(n), t + dt, 0.5, 0.18));
    this.fireworkPops(5, 0.6);
  }

  fireworkPops(n, start = 0) {
    if (!this._ok(60)) return;
    const t = this.ctx.currentTime + start;
    for (let i = 0; i < n; i++) {
      const tt = t + i * 0.45 + Math.random() * 0.2;
      this.noiseHit(this.sfx, tt, { type: 'lowpass', freq: 1200, peak: 0.5, d: 0.35, send: 0.5 });
      for (let k = 0; k < 6; k++) this.noiseHit(this.sfx, tt + 0.1 + Math.random() * 0.5, { type: 'highpass', freq: 4000, peak: 0.08, d: 0.03 });
    }
  }

  brassNote(dest, f, t, dur, vol) {
    const ctx = this.ctx;
    for (const det of [-8, 7]) {
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = det;
      const flt = ctx.createBiquadFilter(); flt.type = 'lowpass'; flt.Q.value = 2;
      flt.frequency.setValueAtTime(400, t); flt.frequency.exponentialRampToValueAtTime(2800, t + 0.08); flt.frequency.exponentialRampToValueAtTime(1200, t + dur);
      const g = ctx.createGain();
      o.connect(flt).connect(g).connect(dest);
      const s = ctx.createGain(); s.gain.value = 0.3; g.connect(s).connect(this.reverbSend);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.04); g.gain.setValueAtTime(vol, t + dur * 0.7); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.start(t); o.stop(t + dur + 0.05);
      this.voices++; o.onended = () => { this.voices--; g.disconnect(); };
    }
  }

  superJackpot() {
    if (!this._ok(60)) return;
    const t = this.ctx.currentTime;
    [[60, 64, 67], [65, 69, 72], [67, 71, 74], [72, 76, 79]].forEach((ch, i) => ch.forEach((n) => this.brassNote(this.sfx, NOTE(n), t + i * 0.14, 0.4, 0.09)));
    [84, 88, 91, 96].forEach((n, i) => this.bell(NOTE(n), 0.18, 0.5 + i * 0.07));
    this.fireworkPops(3, 0.3);
  }

  skillShot() {
    if (!this._ok()) return;
    [67, 71, 74, 79, 83, 86].forEach((n, i) => this.bell(NOTE(n), 0.2, i * 0.06));
  }

  rushStart() {
    if (!this._ok()) return;
    const t = this.ctx.currentTime;
    this.noiseHit(this.sfx, t, { freq: 400, q: 2, a: 0.4, peak: 0.3, d: 0.1, sweepTo: 5000 });
    [0, 0.12, 0.24, 0.36].forEach((dt, i) => this.tone(this.sfx, 'square', NOTE(72 + i * 4), t + 0.45 + dt, 0.002, 0.08, 0.15, { echo: 0.4 }));
  }

  launch(power) {
    if (!this._ok()) return;
    const t = this.ctx.currentTime;
    this.tone(this.sfx, 'triangle', 90 + power * 60, t, 0.002, 0.5, 0.25, { glideTo: 320 + power * 200, glideTime: 0.2 });
    this.noiseHit(this.sfx, t, { freq: 800, q: 1, peak: 0.25 + power * 0.25, d: 0.25, sweepTo: 3000 });
  }

  plungerPull() {
    if (!this._ok()) return;
    const t = this.ctx.currentTime;
    this.tone(this.sfx, 'sawtooth', 60, t, 0.05, 0.05, 0.6, { glideTo: 140 });
  }

  kickback() {
    if (!this._ok()) return;
    const t = this.ctx.currentTime;
    this.tone(this.sfx, 'sine', 70, t, 0.002, 0.8, 0.2, { glideTo: 35 });
    this.noiseHit(this.sfx, t, { freq: 600, q: 1, peak: 0.4, d: 0.3, sweepTo: 4000, send: 0.3 });
  }

  rampDone() {
    if (!this._ok()) return;
    [79, 83, 86].forEach((n, i) => this.bell(NOTE(n), 0.12, i * 0.05));
  }

  splash() {
    if (!this._ok(30)) return;
    const t = this.ctx.currentTime;
    this.noiseHit(this.sfx, t, { freq: 1200, q: 0.8, peak: 0.12, d: 0.25, sweepTo: 500 });
    this.tone(this.sfx, 'sine', 700, t + 0.02, 0.005, 0.06, 0.08, { glideTo: 1400 });
  }

  drain() {
    if (!this._ok()) return;
    const t = this.ctx.currentTime;
    this.tone(this.sfx, 'triangle', 330, t, 0.01, 0.25, 0.6, { glideTo: 110, send: 0.4 });
  }

  ballLost() {
    if (!this._ok()) return;
    const t = this.ctx.currentTime;
    [69, 65, 62, 57].forEach((n, i) => this.tone(this.sfx, 'triangle', NOTE(n), t + i * 0.18, 0.01, 0.2, 0.4, { send: 0.5 }));
  }

  gameOver() {
    if (!this._ok()) return;
    const t = this.ctx.currentTime;
    [69, 67, 64, 62, 57, 50].forEach((n, i) => this.tone(this.sfx, 'triangle', NOTE(n), t + i * 0.26, 0.01, 0.22, 0.7, { send: 0.6 }));
  }

  chapter() {
    if (!this._ok()) return;
    const t = this.ctx.currentTime;
    this.noiseHit(this.sfx, t, { type: 'highpass', freq: 3000, a: 0.6, peak: 0.15, d: 1.6, send: 0.9 });
    [60, 67, 72, 76, 79, 84].forEach((n, i) => this.bell(NOTE(n), 0.16, 0.2 + i * 0.12));
  }

  doorThud() { this.thud(25); }

  // ------------------------------------------------------------------------------- music control
  playMusic(name) { if (this.seq) this.seq.play(name); }
  setRushLayer(on) { if (this.seq) this.seq.setRush(on); }
  stopMusic() { if (this.seq) this.seq.play(null); }
}

// ============================================================================================ music
// Chord / scale helpers
const chord = (root, kind = 'maj') => {
  const iv = { maj: [0, 4, 7], min: [0, 3, 7], sus: [0, 5, 7], maj7: [0, 4, 7, 11], min7: [0, 3, 7, 10] }[kind];
  return iv.map((i) => root + i);
};

const TRACKS = {
  // Chapter 1 – calm & magical: harp arpeggios, bells, warm pad (C major)
  ch1: {
    bpm: 72, bars: [chord(60), chord(57, 'min'), chord(53), chord(55), chord(60), chord(52, 'min'), chord(53, 'maj7'), chord(55, 'sus')],
    step(e, s, t, d, ch, bar) {
      const out = this.out;
      if (s === 0) e.padChord(out, ch.map((n) => n - 12), t, d * 16, 0.035);
      if (s % 2 === 0) { const pat = [0, 1, 2, 3, 2, 1, 0, 1]; const n = ch[pat[(s / 2) % 8] % ch.length] + (pat[(s / 2) % 8] >= 3 ? 12 : 0); e.pluck(out, NOTE(n + 12), t, 0.09, 1.4); }
      if (s === 0 || (s === 8 && bar % 2)) e.bellNote(out, NOTE(ch[(bar + s / 8) % 3] + 24), t, 0.05);
      if (s === 0) e.bass(out, NOTE(ch[0] - 24), t, d * 14, 0.12, 'sine');
    },
  },
  // Chapter 2 – mysterious & rhythmic: pulsing bass, echoing arpeggio, soft hats (D minor)
  ch2: {
    bpm: 92, bars: [chord(62, 'min'), chord(58), chord(60), chord(57, 'min'), chord(62, 'min'), chord(55, 'min'), chord(58), chord(57)],
    step(e, s, t, d, ch, bar) {
      const out = this.out;
      if (s === 0) e.padChord(out, ch.map((n) => n - 12), t, d * 16, 0.03, 700);
      if (s % 2 === 0) e.bass(out, NOTE(ch[0] - 24), t, d * 1.6, s % 4 === 0 ? 0.16 : 0.09, 'triangle');
      if (s % 3 === 0) e.pluck(out, NOTE(ch[(s / 3) % 3] + 12 + (s > 8 ? 12 : 0)), t, 0.06, 0.6, 0.45);
      if (s % 4 === 2) e.hat(out, t, 0.05);
      if (s === 8 && bar % 2 === 1) e.bellNote(out, NOTE(ch[2] + 24), t, 0.05);
      if (s === 0 || s === 10) e.kick(out, t, 0.18);
    },
  },
  // Chapter 3 – epic: drums, brass, timpani (D minor)
  ch3: {
    bpm: 108, bars: [chord(62, 'min'), chord(58), chord(53), chord(60), chord(62, 'min'), chord(55, 'min'), chord(58), chord(57)],
    step(e, s, t, d, ch, bar) {
      const out = this.out;
      if (s === 0) e.padChord(out, ch.map((n) => n - 12), t, d * 16, 0.035, 1200);
      if (s === 0 || s === 6 || s === 8) e.kick(out, t, 0.32);
      if (s === 4 || s === 12) e.snare(out, t, 0.2);
      if (s % 2 === 0) e.hat(out, t, 0.04);
      if (s === 0 || s === 3 || s === 6) e.brass(out, ch.map((n) => n), t, d * (s === 6 ? 6 : 2.5), 0.05);
      if (s === 14 && bar % 2) { e.tom(out, t, 130, 0.22); e.tom(out, t + d * 0.5, 100, 0.22); }
      if (s % 4 === 0) e.bass(out, NOTE(ch[0] - 24), t, d * 3.5, 0.18, 'sawtooth', 500);
      if (s === 0 && bar % 4 === 0) e.timpani(out, NOTE(ch[0] - 24), t, 0.35);
    },
  },
  // Multiball – intense & driving (E minor)
  multiball: {
    bpm: 138, bars: [chord(64, 'min'), chord(60), chord(62), chord(59, 'min'), chord(64, 'min'), chord(60), chord(57, 'min'), chord(59)],
    step(e, s, t, d, ch, bar) {
      const out = this.out;
      if (s % 4 === 0) e.kick(out, t, 0.34);
      if (s === 4 || s === 12) e.snare(out, t, 0.24);
      e.hat(out, t, s % 2 ? 0.025 : 0.045);
      e.bass(out, NOTE(ch[0] - 24 + (s % 8 === 6 ? 12 : 0)), t, d * 0.9, 0.15, 'sawtooth', 700);
      if (s === 0 || s === 3 || s === 6 || s === 10) e.brass(out, ch, t, d * 2, 0.045);
      if (s % 2 === 0) e.pluck(out, NOTE(ch[(s / 2) % 3] + 24), t, 0.04, 0.25);
      if (s === 15 && bar % 2) e.tom(out, t, 160, 0.2);
    },
  },
};

class Sequencer {
  constructor(engine) {
    this.e = engine;
    this.ctx = engine.ctx;
    this.active = []; // { name, track, gain, step, bar, next, endAt }
    this.rushGain = this.ctx.createGain();
    this.rushGain.gain.value = 0;
    this.rushGain.connect(engine.music);
    this.rushOn = false;
    this.current = null;
    this.timer = setInterval(() => this._schedule(), 25);
  }

  play(name) {
    if (name === this.current) return;
    const ctx = this.ctx, t = ctx.currentTime, FADE = 2.5;
    for (const a of this.active) {
      if (a.endAt) continue;
      a.gain.gain.cancelScheduledValues(t);
      a.gain.gain.setValueAtTime(a.gain.gain.value, t);
      a.gain.gain.linearRampToValueAtTime(0, t + FADE);
      a.endAt = t + FADE + 0.1;
    }
    this.current = name;
    if (!name) return;
    const track = Object.create(TRACKS[name]);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(1, t + FADE);
    gain.connect(this.e.music);
    track.out = gain;
    this.active.push({ name, track, gain, step: 0, bar: 0, next: t + 0.06, endAt: 0 });
  }

  setRush(on) {
    if (on === this.rushOn) return;
    this.rushOn = on;
    const t = this.ctx.currentTime;
    this.rushGain.gain.cancelScheduledValues(t);
    this.rushGain.gain.setValueAtTime(this.rushGain.gain.value, t);
    this.rushGain.gain.linearRampToValueAtTime(on ? 1 : 0, t + (on ? 0.4 : 1.5));
  }

  _schedule() {
    const ctx = this.ctx;
    if (ctx.state !== 'running') return;
    const horizon = ctx.currentTime + 0.15;
    for (const a of this.active) {
      const d = 60 / a.track.bpm / 4; // 16th note
      while (a.next < horizon) {
        const ch = a.track.bars[a.bar % a.track.bars.length];
        try { a.track.step(this, a.step, a.next, d, ch, a.bar); } catch (err) { /* never let music break the game */ }
        // RUSH COMBO: rhythmic percussion layer locked to the current track's tempo
        if (this.rushOn && !a.endAt) {
          if (a.step % 2 === 0) this.shaker(this.rushGain, a.next, 0.06);
          if (a.step % 4 === 0) this.kick(this.rushGain, a.next, 0.22);
          if (a.step === 6 || a.step === 14) this.tom(this.rushGain, a.next, 180, 0.15);
        }
        a.next += d;
        if (++a.step === 16) { a.step = 0; a.bar++; }
      }
    }
    const t = ctx.currentTime;
    for (let i = this.active.length - 1; i >= 0; i--) {
      const a = this.active[i];
      if (a.endAt && t > a.endAt) { a.gain.disconnect(); this.active.splice(i, 1); }
    }
  }

  // --------------------------------------------------------------------------- instruments
  pluck(out, f, t, vol, dur = 1, bright = 1) {
    const e = this.e;
    e.tone(out, 'triangle', f, t, 0.004, vol, dur, { send: 0.35, echo: 0.2 * bright });
    e.tone(out, 'sine', f * 2, t, 0.002, vol * 0.3 * bright, dur * 0.4);
  }

  bellNote(out, f, t, vol) {
    const e = this.e;
    e.tone(out, 'sine', f, t, 0.003, vol, 2.2, { send: 0.7 });
    e.tone(out, 'sine', f * 2.76, t, 0.002, vol * 0.3, 0.8, { send: 0.6 });
  }

  padChord(out, notes, t, dur, vol, cutoff = 900) {
    const ctx = this.ctx;
    const flt = ctx.createBiquadFilter(); flt.type = 'lowpass'; flt.frequency.value = cutoff;
    const g = ctx.createGain();
    flt.connect(g).connect(out);
    const s = ctx.createGain(); s.gain.value = 0.5; g.connect(s).connect(this.e.reverbSend);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + dur * 0.3);
    g.gain.linearRampToValueAtTime(vol * 0.8, t + dur * 0.8);
    g.gain.linearRampToValueAtTime(0.0001, t + dur * 1.05);
    for (const n of notes) {
      for (const det of [-7, 6]) {
        const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = NOTE(n); o.detune.value = det;
        o.connect(flt); o.start(t); o.stop(t + dur * 1.1);
        this.e.voices++; o.onended = () => { this.e.voices--; };
      }
    }
    setTimeout(() => g.disconnect(), (t - ctx.currentTime + dur * 1.2) * 1000 + 100);
  }

  bass(out, f, t, dur, vol, type = 'sine', cutoff = 0) {
    const ctx = this.ctx;
    const o = ctx.createOscillator(); o.type = type; o.frequency.value = f;
    const g = ctx.createGain();
    if (cutoff) { const flt = ctx.createBiquadFilter(); flt.type = 'lowpass'; flt.frequency.value = cutoff; o.connect(flt).connect(g); } else o.connect(g);
    g.connect(out);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.start(t); o.stop(t + dur + 0.05);
    this.e.voices++; o.onended = () => { this.e.voices--; g.disconnect(); };
  }

  brass(out, notes, t, dur, vol) { for (const n of notes) this.e.brassNote(out, NOTE(n), t, dur, vol); }

  kick(out, t, vol) { this.e.tone(out, 'sine', 150, t, 0.002, vol * 2, 0.22, { glideTo: 42, glideTime: 0.12 }); }
  snare(out, t, vol) {
    this.e.noiseHit(out, t, { freq: 1800, q: 0.8, peak: vol, d: 0.14, send: 0.2 });
    this.e.tone(out, 'triangle', 220, t, 0.001, vol * 0.8, 0.08, { glideTo: 140 });
  }
  hat(out, t, vol) { this.e.noiseHit(out, t, { type: 'highpass', freq: 8000, peak: vol, d: 0.03 }); }
  shaker(out, t, vol) { this.e.noiseHit(out, t, { type: 'bandpass', freq: 6000, q: 2, a: 0.01, peak: vol, d: 0.05 }); }
  tom(out, t, f, vol) { this.e.tone(out, 'sine', f, t, 0.002, vol * 1.6, 0.3, { glideTo: f * 0.55, send: 0.3 }); }
  timpani(out, f, t, vol) {
    this.e.tone(out, 'sine', f, t, 0.004, vol * 1.5, 1.4, { glideTo: f * 0.94, send: 0.5 });
    this.e.noiseHit(out, t, { type: 'lowpass', freq: 300, peak: vol * 0.5, d: 0.3 });
  }
}

export { NOTE, C4, MAJOR };
