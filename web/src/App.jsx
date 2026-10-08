import React, { useEffect, useMemo, useRef, useState } from 'react';
import { api, TYPE_HE } from './api.js';
import StrainCard from './StrainCard.jsx';
import SourcesPanel from './SourcesPanel.jsx';

const EMPTY_FILTERS = { category: '', type: '', producer: '', thcMin: '', thcMax: '', cbdMin: '', cbdMax: '' };

export default function App() {
  const [q, setQ] = useState('');
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [options, setOptions] = useState(null);
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [openId, setOpenId] = useState(null);
  const [showSources, setShowSources] = useState(false);
  const fileRef = useRef(null);

  const refreshOptions = () => api.filters().then(setOptions).catch(() => {});
  useEffect(() => {
    refreshOptions();
  }, []);

  const hasMenu = options && options.categories.length > 0;
  const active = q.trim() || Object.values(filters).some(Boolean);

  useEffect(() => {
    if (!active) {
      setResults(null);
      return;
    }
    const t = setTimeout(() => {
      setLoading(true);
      api
        .search({ q, ...filters })
        .then((r) => {
          setResults(r);
          setError('');
        })
        .catch((e) => setError(e.message))
        .finally(() => setLoading(false));
    }, 250);
    return () => clearTimeout(t);
  }, [q, filters, active]);

  async function onUpload(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setNotice('מפענח את התפריט…');
    setError('');
    try {
      const r = await api.uploadMenu(file);
      setNotice(`נטען תפריט ${r.source}: ${r.count} תפרחות`);
      await refreshOptions();
      setFilters({ ...EMPTY_FILTERS, category: 'T22/C4' });
    } catch (err) {
      setNotice('');
      setError(err.message);
    }
  }

  const grouped = useMemo(() => {
    if (!results) return [];
    const g = new Map();
    for (const it of results.items) {
      const k = `${it.category || 'ללא קטגוריה'}|${it.type || ''}`;
      if (!g.has(k)) g.set(k, { category: it.category, type: it.type, items: [] });
      g.get(k).items.push(it);
    }
    return [...g.values()];
  }, [results]);

  const set = (k) => (e) => setFilters((f) => ({ ...f, [k]: e.target.value }));

  return (
    <div className="page">
      <header className="topbar">
        <span className="brand">🌿 קנאביס ביקורות</span>
        <button className="link" onClick={() => setShowSources(true)}>מצב מקורות</button>
      </header>

      <main>
        <section className={`hero ${active ? 'compact' : ''}`}>
          {!active && <h1>קנאביס ביקורות</h1>}
          {!active && <p className="sub">חיפוש זנים, ביקורות ממקורות ישראליים, ופענוח תפריטי בתי מרקחת</p>}
          <div className="searchbox">
            <span className="icon" aria-hidden>⌕</span>
            <input
              autoFocus
              type="search"
              placeholder="חפשו זן בעברית או באנגלית…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              aria-label="חיפוש זן"
            />
          </div>
          <div className="upload-row">
            <button className="secondary" onClick={() => fileRef.current?.click()}>⇪ העלאת תפריט PDF</button>
            <input ref={fileRef} type="file" accept="application/pdf,.pdf" hidden onChange={onUpload} />
          </div>
          {notice && <div className="notice">{notice}</div>}
          {error && <div className="error">{error}</div>}
        </section>

        {hasMenu && (
          <section className="filters" aria-label="סינון">
            <div className="chips" role="group" aria-label="קטגוריה">
              <button className={`chip ${!filters.category ? 'on' : ''}`} onClick={() => setFilters((f) => ({ ...f, category: '' }))}>
                הכול
              </button>
              {options.categories.map((c) => (
                <button key={c} className={`chip ${filters.category === c ? 'on' : ''} ${c === 'T22/C4' ? 'star' : ''}`}
                  onClick={() => setFilters((f) => ({ ...f, category: f.category === c ? '' : c }))}>
                  {c}
                </button>
              ))}
            </div>
            <div className="row">
              <label>
                סוג
                <select value={filters.type} onChange={set('type')}>
                  <option value="">הכול</option>
                  {options.types.map((t) => <option key={t} value={t}>{TYPE_HE[t] || t}</option>)}
                </select>
              </label>
              <label>
                יצרן
                <select value={filters.producer} onChange={set('producer')}>
                  <option value="">הכול</option>
                  {options.producers.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </label>
              <label className="range">
                THC %
                <input type="number" min="0" max="40" placeholder="מ-" value={filters.thcMin} onChange={set('thcMin')} />
                <input type="number" min="0" max="40" placeholder="עד" value={filters.thcMax} onChange={set('thcMax')} />
              </label>
              <label className="range">
                CBD %
                <input type="number" min="0" max="40" placeholder="מ-" value={filters.cbdMin} onChange={set('cbdMin')} />
                <input type="number" min="0" max="40" placeholder="עד" value={filters.cbdMax} onChange={set('cbdMax')} />
              </label>
              {Object.values(filters).some(Boolean) && (
                <button className="link" onClick={() => setFilters(EMPTY_FILTERS)}>ניקוי סינון</button>
              )}
            </div>
            <p className="hint">טווח THC/CBD לפי קטגוריית התפריט (למשל T22/C4 ← THC 22, CBD 4).</p>
          </section>
        )}

        {!hasMenu && !active && (
          <p className="empty">עדיין לא הועלה תפריט. העלו PDF של תפריט בית מרקחת כדי להתחיל.</p>
        )}

        {loading && <p className="muted center">מחפש…</p>}

        {results && !loading && (
          <section className="results">
            <p className="muted">{results.items.length} תוצאות בתפריטים{results.strains.length ? ` · ${results.strains.length} זנים ממקורות` : ''}</p>
            {results.items.length === 0 && results.strains.length === 0 && <p className="empty">לא נמצאו זנים תואמים.</p>}
            {grouped.map((g) => (
              <div key={`${g.category}|${g.type}`} className="group">
                <h2>
                  <span className="cat">{g.category}</span>
                  {g.type && <span className={`type t-${g.type}`}>{TYPE_HE[g.type]}</span>}
                  <span className="muted small">{g.items.length}</span>
                </h2>
                <ul className="list">
                  {g.items.map((it) => (
                    <li key={it.id}>
                      <button className="item" onClick={() => setOpenId(it.strain_id)}>
                        <span className="name">{it.name}</span>
                        <span className="producer">{it.producer || 'יצרן לא זמין'}</span>
                        <span className="badges">
                          {it.has_source_data ? <span className="badge ok">יש מידע ממקורות</span> : null}
                          {it.review_count ? <span className="badge">{it.review_count} ביקורות</span> : null}
                        </span>
                        <span className="price">
                          ₪{it.price_ils?.toFixed(2)}
                          {it.original_price_ils ? <s>{it.original_price_ils.toFixed(2)}</s> : null}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            {results.strains.length > 0 && (
              <div className="group">
                <h2>זנים ממקורות (לא בתפריט)</h2>
                <ul className="list">
                  {results.strains.map((s) => (
                    <li key={s.id}>
                      <button className="item" onClick={() => setOpenId(s.id)}>
                        <span className="name">{s.local_name}</span>
                        <span className="producer">{s.producer || 'יצרן לא זמין'}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        )}
      </main>

      <footer className="foot">
        המידע נאסף ממקורות ציבוריים עם קישור לכל מקור. אינו מהווה ייעוץ רפואי – יש להתייעץ עם רופא או רוקח.
      </footer>

      {openId && <StrainCard id={openId} onClose={() => setOpenId(null)} onOpen={setOpenId} />}
      {showSources && <SourcesPanel onClose={() => setShowSources(false)} />}
    </div>
  );
}
