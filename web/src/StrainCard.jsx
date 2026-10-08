import React, { useEffect, useState } from 'react';
import { api, TYPE_HE, NA, fmtDate } from './api.js';

function SourceLink({ v }) {
  return (
    <a className="src" href={v.source_url} target="_blank" rel="noreferrer" title={`נאסף ${fmtDate(v.fetched_at)}`}>
      {v.source_name}
    </a>
  );
}

/** שדה עם ערך אחד או יותר; כל ערך מוצג עם המקור. סתירה מסומנת. */
function Field({ label, values, render = (x) => String(x) }) {
  const conflict = values?.some((v) => v.validation === 'conflict');
  return (
    <div className={`field ${conflict ? 'conflict' : ''}`}>
      <dt>{label}</dt>
      <dd>
        {!values && <span className="na">{NA}</span>}
        {values?.map((v, i) => (
          <div key={i} className="val">
            <span>{render(v.value)}</span> <SourceLink v={v} />
            {v.validation === 'agree' && <span className="agree" title="מאומת מול מקור נוסף">✓</span>}
          </div>
        ))}
        {conflict && <div className="conflict-note">המקורות סותרים – מוצגים כל הערכים עם מקורם</div>}
      </dd>
    </div>
  );
}

const list = (arr) => (Array.isArray(arr) ? arr.join(', ') : String(arr));

export default function StrainCard({ id, onClose, onOpen }) {
  const [card, setCard] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    setCard(null);
    api.strain(id).then(setCard).catch((e) => setError(e.message));
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [id]);

  const menu = card?.menu_appearances?.[0];

  return (
    <div className="overlay" onClick={onClose}>
      <article className="card" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <button className="close" onClick={onClose} aria-label="סגירה">×</button>
        {error && <p className="error">{error}</p>}
        {!card && !error && <p className="muted">טוען…</p>}
        {card && (
          <>
            <header>
              <h2>{card.strain.local_name}</h2>
              <p className="muted">
                {card.strain.producer || 'יצרן לא ידוע'}
                {card.aliases.length > 0 && (
                  <>
                    {' · '}שם גלובלי:{' '}
                    {card.aliases.map((a, i) => (
                      <span key={i}>{a.global_name} <SourceLink v={a} /></span>
                    ))}
                  </>
                )}
              </p>
              {menu && (
                <p className="menu-line">
                  <span className="cat">{menu.category}</span>
                  {menu.type && <span className={`type t-${menu.type}`}>{TYPE_HE[menu.type]}</span>}
                  <span>₪{menu.price_ils?.toFixed(2)}</span>
                  <span className="muted small">לפי {menu.source}</span>
                </p>
              )}
            </header>

            <section className="rating">
              <h3>ציון בעלי קנאביס</h3>
              {card.rating?.combined ? (
                <p>
                  <strong className="score">{card.rating.combined.toFixed(1)}</strong> / 5
                  <span className="muted"> · {card.rating.count} מדרגים</span>
                </p>
              ) : (
                <p className="na">{NA}</p>
              )}
              {card.rating?.by_source?.map((r, i) => (
                <p key={i} className="small">
                  {r.avg.toFixed(1)} {r.count ? `(${r.count})` : '(מספר מדרגים לא זמין)'} – <SourceLink v={r} />
                </p>
              ))}
            </section>

            <dl className="fields">
              <Field label="סוג (לפי מקורות)" values={card.fields.type} render={(t) => TYPE_HE[t] || t} />
              <Field label="שם באנגלית" values={card.fields.name_en} />
              <Field label="THC" values={card.fields.thc} render={(v) => `${v}%`} />
              <Field label="CBD" values={card.fields.cbd} render={(v) => `${v}%`} />
              <Field label="השפעות" values={card.fields.effects} render={list} />
              <Field label="התוויות" values={card.fields.indications} render={list} />
              <Field label="שושלת" values={card.fields.lineage} render={(l) => l.parents.join(' × ')} />
              <Field label="זנים קרובים" values={card.fields.related} render={list} />
            </dl>

            <section className="reviews">
              <div>
                <h3>ביקורות חיוביות</h3>
                {card.reviews.positive.length === 0 && <p className="na">{NA}</p>}
                {card.reviews.positive.map((r) => (
                  <blockquote key={r.id} className="pos">
                    “{r.excerpt}” {r.rating ? <span className="small">({r.rating}/5)</span> : null}{' '}
                    <a href={r.source_url} target="_blank" rel="noreferrer">לביקורת המלאה ב{r.source_name}</a>
                  </blockquote>
                ))}
              </div>
              <div>
                <h3>ביקורות שליליות</h3>
                {card.reviews.negative.length === 0 && <p className="na">{NA}</p>}
                {card.reviews.negative.map((r) => (
                  <blockquote key={r.id} className="neg">
                    “{r.excerpt}” {r.rating ? <span className="small">({r.rating}/5)</span> : null}{' '}
                    <a href={r.source_url} target="_blank" rel="noreferrer">לביקורת המלאה ב{r.source_name}</a>
                  </blockquote>
                ))}
              </div>
            </section>

            {card.same_name_other_producers.length > 0 && (
              <section>
                <h3>אותו שם, יצרן אחר</h3>
                <p className="small muted">לא בהכרח אותו זן – אין מקור שקובע זאת.</p>
                {card.same_name_other_producers.map((s) => (
                  <button key={s.id} className="chip" onClick={() => onOpen(s.id)}>
                    {s.local_name} · {s.producer || 'יצרן לא ידוע'}
                  </button>
                ))}
              </section>
            )}

            {card.menu_appearances.length > 0 && (
              <section>
                <h3>בתפריטים</h3>
                <ul className="plain small">
                  {card.menu_appearances.map((m, i) => (
                    <li key={i}>
                      {m.name} · {m.category} · {TYPE_HE[m.type] || NA} · ₪{m.price_ils?.toFixed(2)} — {m.source}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <section>
              <h3>מקורות</h3>
              {card.sources.length === 0 ? (
                <p className="na">עדיין לא נאסף מידע ממקורות על הזן הזה.</p>
              ) : (
                <ul className="plain small">
                  {card.sources.map((s) => (
                    <li key={s.source_url}>
                      <a href={s.source_url} target="_blank" rel="noreferrer">{s.source_name}</a>{' '}
                      <span className="muted">· נאסף {fmtDate(s.fetched_at)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </article>
    </div>
  );
}
