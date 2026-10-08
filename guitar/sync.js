// מיזוג התקדמות בין מכשירים. פונקציה טהורה: לא מוחקת כלום מאף צד ולא תלויה בסדר.
(function (root) {
  // מצב: { log: {exId: [{at,bpm}]}, active: ['2026-01-01'], jams: n, custom: [{id,...}], customDeleted: [id], lefty, notesSound, countIn }
  const uniqSorted = (arr) => [...new Set(arr)].sort();

  function merge(a, b) {
    a = a || {};
    b = b || {};
    const log = {};
    for (const id of new Set([...Object.keys(a.log || {}), ...Object.keys(b.log || {})])) {
      const seen = new Map();
      for (const r of [...((a.log || {})[id] || []), ...((b.log || {})[id] || [])]) seen.set(r.at, r);
      log[id] = [...seen.values()].sort((x, y) => (x.at < y.at ? -1 : 1));
    }
    const deleted = uniqSorted([...(a.customDeleted || []), ...(b.customDeleted || [])]);
    const customMap = new Map();
    for (const c of [...(a.custom || []), ...(b.custom || [])]) if (!deleted.includes(c.id)) customMap.set(c.id, c);
    return {
      log,
      active: uniqSorted([...(a.active || []), ...(b.active || [])]),
      jams: Math.max(a.jams || 0, b.jams || 0),
      custom: [...customMap.values()],
      customDeleted: deleted,
    };
  }

  // מה נשלח לשרת (בלי הגדרות מקומיות כמו יד שמאלית)
  const pick = (s) => ({ log: s.log || {}, active: s.active || [], jams: s.jams || 0, custom: s.custom || [], customDeleted: s.customDeleted || [] });

  // קוד גיבוי ידני: מאפשר להעביר התקדמות בין מכשירים גם באתר סטטי בלי שרת
  function toCode(state) {
    const json = JSON.stringify(pick(state));
    if (typeof Buffer !== 'undefined') return 'G1.' + Buffer.from(json, 'utf8').toString('base64');
    return 'G1.' + btoa(unescape(encodeURIComponent(json)));
  }
  function fromCode(code) {
    const m = /^G1\.([A-Za-z0-9+/=]+)$/.exec(String(code).trim());
    if (!m) throw new Error('קוד לא תקין');
    const json = typeof Buffer !== 'undefined' ? Buffer.from(m[1], 'base64').toString('utf8') : decodeURIComponent(escape(atob(m[1])));
    const o = JSON.parse(json);
    if (typeof o !== 'object' || !o) throw new Error('קוד לא תקין');
    return pick(o);
  }

  const API = { merge, pick, toCode, fromCode };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else root.GUITAR_SYNC = API;
})(typeof window !== 'undefined' ? window : globalThis);
