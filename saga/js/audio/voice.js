// Voice callouts ("Multiball!", "Jackpot!") like a real table, spoken by the browser's own speech synthesis
// (works on iPhone Safari). A deep, slow "wizard" voice; important calls cut in, minor ones wait their turn.

const PREFERRED = ['Daniel', 'Arthur', 'Oliver', 'Google UK English Male', 'Microsoft George', 'Alex', 'Fred'];

export class Voice {
  constructor(enabled = true) {
    this.enabled = enabled;
    this.synth = typeof window !== 'undefined' && window.speechSynthesis ? window.speechSynthesis : null;
    this.voice = null;
    this.busyUntil = 0;
    this.current = 0; // priority of what is being said
    this.unlocked = false;
    if (this.synth) {
      const pick = () => {
        const vs = this.synth.getVoices().filter((v) => /^en(-|_|$)/i.test(v.lang));
        this.voice = PREFERRED.map((n) => vs.find((v) => v.name.includes(n))).find(Boolean) || vs.find((v) => /GB/i.test(v.lang)) || vs[0] || null;
      };
      pick();
      if (typeof this.synth.addEventListener === 'function') this.synth.addEventListener('voiceschanged', pick);
    }
  }

  get available() { return !!this.synth; }

  /** iOS only lets speech start from a user gesture: speak one silent word on the first tap */
  unlock() {
    if (!this.synth || this.unlocked) return;
    this.unlocked = true;
    try { const u = new SpeechSynthesisUtterance(' '); u.volume = 0; this.synth.speak(u); } catch { /* not supported */ }
  }

  setEnabled(on) { this.enabled = on; if (!on) this.stop(); }

  stop() { if (this.synth) { try { this.synth.cancel(); } catch { /* ignore */ } } this.busyUntil = 0; this.current = 0; }

  /**
   * @param text what to say
   * @param priority 1 minor (skipped if something is being said), 2 normal (waits briefly), 3 big moment (cuts in)
   */
  say(text, priority = 2) {
    if (!this.enabled || !this.synth || !this.unlocked) return;
    const now = performance.now();
    const speaking = now < this.busyUntil;
    if (speaking && priority < 3 && (priority <= this.current || priority === 1)) return;
    try {
      if (speaking) this.synth.cancel();
      const u = new SpeechSynthesisUtterance(text);
      if (this.voice) u.voice = this.voice;
      u.lang = (this.voice && this.voice.lang) || 'en-GB';
      u.pitch = 0.62; u.rate = 0.92; u.volume = 1;
      this.synth.speak(u);
      this.current = priority;
      this.busyUntil = now + 450 + text.length * 70; // rough length of the phrase
    } catch { /* speech unavailable */ }
  }
}
