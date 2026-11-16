// Navigation helpers: open an address in Waze / Apple Maps / Google Maps.
import { icon } from './icons.js';
import { esc, openSheet, toast } from './util.js';

const enc = encodeURIComponent;
export const mapLinks = (address) => ({
  waze: `https://waze.com/ul?q=${enc(address)}&navigate=yes`,
  apple: `https://maps.apple.com/?q=${enc(address)}`,
  google: `https://www.google.com/maps/search/?api=1&query=${enc(address)}`,
});

export function openNavigate(address, title = '') {
  if (!address) return;
  const l = mapLinks(address);
  const sh = openSheet({
    title: title || 'ניווט',
    body: `
      <div class="card" style="padding:12px 14px;margin-bottom:12px;display:flex;gap:10px;align-items:center">
        <span style="color:var(--red)">${icon('pin', 22)}</span><div class="grow" style="-webkit-user-select:text;user-select:text">${esc(address)}</div></div>
      <div class="list">
        <a class="row tappable" href="${l.waze}" target="_blank" rel="noopener" style="color:inherit;text-decoration:none"><span class="setting-icon" style="background:#33CCFF">${icon('navigation', 17)}</span><span class="grow">ניווט ב-Waze</span>${icon('chevron-left', 18, 'chev')}</a>
        <a class="row tappable" href="${l.apple}" target="_blank" rel="noopener" style="color:inherit;text-decoration:none"><span class="setting-icon" style="background:#34C759">${icon('pin', 17)}</span><span class="grow">מפות של Apple</span>${icon('chevron-left', 18, 'chev')}</a>
        <a class="row tappable" href="${l.google}" target="_blank" rel="noopener" style="color:inherit;text-decoration:none"><span class="setting-icon" style="background:#4285F4">${icon('globe', 17)}</span><span class="grow">Google Maps</span>${icon('chevron-left', 18, 'chev')}</a>
        <button class="row tappable" data-copy style="width:100%"><span class="setting-icon" style="background:#8E8E93">${icon('copy', 17)}</span><span class="grow" style="text-align:start">העתקת הכתובת</span></button>
      </div>`,
  });
  sh.body.querySelector('[data-copy]').onclick = async () => {
    try { await navigator.clipboard.writeText(address); toast('הכתובת הועתקה'); } catch { toast('לא ניתן להעתיק'); }
  };
  sh.body.querySelectorAll('a').forEach((a) => a.addEventListener('click', () => setTimeout(() => sh.close(), 300)));
}
