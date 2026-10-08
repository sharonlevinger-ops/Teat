// זיהוי גובה צליל (אלגוריתם YIN) ופונקציות עזר לכוונון. פונקציות טהורות, כדי שאפשר יהיה לבדוק אותן.
(function (root) {
  const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const midiOfFreq = (f) => 69 + 12 * Math.log2(f / 440);
  const freqOfMidi = (m) => 440 * Math.pow(2, (m - 69) / 12);

  // מחזיר {freq, clarity} או null אם אין צליל ברור. buf: Float32Array של דגימות.
  function detectPitch(buf, sampleRate, opts) {
    const minF = (opts && opts.minFreq) || 60;
    const maxF = (opts && opts.maxFreq) || 450;
    const gate = (opts && opts.gate) || 0.01;
    const thr = (opts && opts.threshold) || 0.15;
    let sum = 0;
    for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
    if (Math.sqrt(sum / buf.length) < gate) return null;
    const tauMax = Math.min(Math.floor(sampleRate / minF), Math.floor(buf.length / 2));
    const tauMin = Math.max(2, Math.floor(sampleRate / maxF));
    const W = Math.min(2048, buf.length - tauMax);
    if (W < 256) return null;
    const d = new Float32Array(tauMax + 1);
    for (let tau = 1; tau <= tauMax; tau++) {
      let s = 0;
      for (let i = 0; i < W; i++) {
        const x = buf[i] - buf[i + tau];
        s += x * x;
      }
      d[tau] = s;
    }
    // הפרש מנורמל לפי הממוצע המצטבר
    const cm = new Float32Array(tauMax + 1);
    cm[0] = 1;
    let run = 0;
    for (let tau = 1; tau <= tauMax; tau++) {
      run += d[tau];
      cm[tau] = run === 0 ? 1 : (d[tau] * tau) / run;
    }
    let tau = -1;
    for (let t = tauMin; t < tauMax; t++) {
      if (cm[t] < thr) {
        while (t + 1 < tauMax && cm[t + 1] < cm[t]) t++;
        tau = t;
        break;
      }
    }
    if (tau < 0) return null;
    // אינטרפולציה פרבולית לדיוק מתחת לדגימה
    const a = cm[tau - 1];
    const b = cm[tau];
    const c = cm[tau + 1];
    const denom = a - 2 * b + c;
    const shift = denom === 0 ? 0 : (a - c) / (2 * denom);
    return { freq: sampleRate / (tau + shift), clarity: 1 - cm[tau] };
  }

  // תו קרוב ביותר (בכיוון רגיל של 12 חצאי טון) והסטייה בסנטים
  function noteInfo(freq) {
    const m = midiOfFreq(freq);
    const near = Math.round(m);
    return { midi: near, name: NAMES[((near % 12) + 12) % 12], cents: Math.round((m - near) * 100) };
  }

  // איזה מיתר מהכוונון הנבחר קרוב ביותר לצליל? tuningMidi: מיתר 6 עד 1
  function nearestString(freq, tuningMidi) {
    const m = midiOfFreq(freq);
    let best = 0;
    for (let i = 1; i < tuningMidi.length; i++) if (Math.abs(m - tuningMidi[i]) < Math.abs(m - tuningMidi[best])) best = i;
    return { index: best, string: 6 - best, midi: tuningMidi[best], cents: Math.round((m - tuningMidi[best]) * 100) };
  }

  const API = { detectPitch, noteInfo, nearestString, midiOfFreq, freqOfMidi };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else root.GUITAR_TUNER = API;
})(typeof window !== 'undefined' ? window : globalThis);
