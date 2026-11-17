// Full-screen PIN pad + Face ID lock screen (iOS style).
import * as auth from './auth.js';
import { icon } from './icons.js';
import { esc, haptic } from './util.js';

/**
 * mode:
 *  'setup'  – choose a new PIN (twice). resolves the PIN.
 *  'unlock' – app lock. resolves true.
 *  'vault'  – resolves a vault CryptoKey (or null if cancelled).
 *  'verify' – resolves the verified PIN string (or null if cancelled).
 *  'newpin' – choose a PIN (twice) without saving it. resolves the PIN or null.
 */
export function pinPad({ mode = 'unlock', title, subtitle = '', overlay = false, allowBio = true } = {}) {
  return new Promise((resolve) => {
    const el = document.createElement('div');
    el.className = `lock ${overlay ? 'overlay' : ''}`;
    const cancellable = mode === 'vault' || mode === 'verify' || mode === 'newpin' || (mode === 'setup' && overlay);
    const choosing = mode === 'setup' || mode === 'newpin';
    const useBio = allowBio && (mode === 'unlock' || mode === 'vault') && auth.bioEnrolled();
    let pin = '', first = null, busy = false;
    const fixedLen = choosing ? 0 : auth.pinLength();
    const maxLen = 6;

    const titles = {
      setup: 'בחירת קוד גישה',
      unlock: 'יומן 2.0',
      vault: 'כספת הסיסמאות',
      verify: 'אימות קוד',
      newpin: 'קוד חדש',
    };
    el.innerHTML = `
      <div class="lock-head">
        <img class="lock-logo" src="icons/icon-192.png" alt="">
        <h2>${esc(title || titles[mode])}</h2>
        <p class="msg">${esc(subtitle || (choosing ? 'בחרו קוד בן 4–6 ספרות' : 'הזינו קוד גישה'))}</p>
        <div class="dots"></div>
      </div>
      <div class="pad">
        ${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => `<button class="key" data-k="${n}">${n}</button>`).join('')}
        ${useBio ? `<button class="key ghost" data-bio aria-label="Face ID">${icon('faceid', 30)}</button>` : (cancellable ? '<button class="key ghost" data-cancel>ביטול</button>' : '<span></span>')}
        <button class="key" data-k="0">0</button>
        <button class="key ghost" data-del aria-label="מחיקה">${icon('backspace', 26)}</button>
      </div>
      <div class="lock-foot">
        ${choosing ? '<button class="btn block" data-next disabled style="min-width:220px">המשך</button>' : ''}
        ${useBio && cancellable ? '<button class="btn-text" data-cancel>ביטול</button>' : ''}
      </div>`;
    document.body.appendChild(el);
    const dotsEl = el.querySelector('.dots');
    const msgEl = el.querySelector('.msg');
    const nextBtn = el.querySelector('[data-next]');

    const renderDots = () => {
      const n = fixedLen || Math.max(4, pin.length);
      dotsEl.innerHTML = Array.from({ length: n }, (_, i) => `<span class="dot ${i < pin.length ? 'on' : ''}"></span>`).join('');
      if (nextBtn) nextBtn.disabled = pin.length < 4;
    };
    const setMsg = (t, err = false) => { msgEl.textContent = t; msgEl.classList.toggle('err', err); };
    const fail = (t) => {
      dotsEl.classList.remove('shake'); void dotsEl.offsetWidth; dotsEl.classList.add('shake');
      haptic(60);
      pin = ''; renderDots(); setMsg(t, true);
    };
    const done = (val) => {
      el.style.transition = 'opacity .2s'; el.style.opacity = '0';
      document.removeEventListener('keydown', onKey);
      setTimeout(() => el.remove(), 200);
      resolve(val);
    };

    const submit = async () => {
      if (busy) return;
      const wait = auth.lockoutRemaining();
      if (wait > 0 && !choosing) return fail(`יותר מדי ניסיונות. נסו שוב בעוד ${wait} שניות`);
      busy = true;
      try {
        if (choosing) {
          if (!first) { first = pin; pin = ''; renderDots(); setMsg('הזינו שוב את הקוד לאימות'); if (nextBtn) nextBtn.textContent = 'אישור'; return; }
          if (pin !== first) { first = null; if (nextBtn) nextBtn.textContent = 'המשך'; return fail('הקודים אינם תואמים, נסו שוב'); }
          if (mode === 'setup') { setMsg('שומר…'); await auth.setupPin(pin); }
          return done(pin);
        }
        setMsg('בודק…');
        if (mode === 'vault') {
          const key = await auth.vaultKeyFromPin(pin);
          return key ? done(key) : fail('קוד שגוי');
        }
        const ok = await auth.verifyPin(pin);
        if (!ok) return fail(auth.lockoutRemaining() ? `יותר מדי ניסיונות. המתינו ${auth.lockoutRemaining()} שניות` : 'קוד שגוי');
        return done(mode === 'verify' ? pin : true);
      } finally { busy = false; }
    };

    const press = (d) => {
      if (busy || pin.length >= (fixedLen || maxLen)) return;
      haptic(5);
      pin += d; renderDots();
      if (fixedLen && pin.length === fixedLen) setTimeout(submit, 80);
    };
    const tryBio = async () => {
      try {
        setMsg('מאמת עם Face ID…');
        if (mode === 'vault') {
          const key = await auth.vaultKeyFromBio();
          if (key) return done(key);
        } else if (await auth.bioAssert()) return done(true);
        setMsg('לא אומת – הזינו קוד', true);
      } catch {
        setMsg('הזינו קוד גישה');
      }
    };

    el.addEventListener('click', (e) => {
      const k = e.target.closest('[data-k]');
      if (k) return press(k.dataset.k);
      if (e.target.closest('[data-del]')) { pin = pin.slice(0, -1); renderDots(); return; }
      if (e.target.closest('[data-next]')) return submit();
      if (e.target.closest('[data-bio]')) return tryBio();
      if (e.target.closest('[data-cancel]')) return done(null);
    });
    const onKey = (e) => {
      if (/^\d$/.test(e.key)) press(e.key);
      else if (e.key === 'Backspace') { pin = pin.slice(0, -1); renderDots(); }
      else if (e.key === 'Enter' && choosing && pin.length >= 4) submit();
      else if (e.key === 'Escape' && cancellable) done(null);
    };
    document.addEventListener('keydown', onKey);
    renderDots();
    if (useBio) setTimeout(tryBio, 250);
  });
}

/** Verified PIN for sensitive actions (vault, backup, Face ID). Creates one the first time. */
export async function requirePin(subtitle) {
  if (!auth.isSetUp()) {
    return pinPad({ mode: 'setup', overlay: true, title: 'קוד לכספת ולגיבוי', subtitle: 'בחרו קוד בן 4–6 ספרות (היומן עצמו נפתח בלי קוד)' });
  }
  return pinPad({ mode: 'verify', overlay: true, subtitle, allowBio: false });
}
