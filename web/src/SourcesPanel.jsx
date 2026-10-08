import React, { useEffect, useState } from 'react';
import { api, fmtDate } from './api.js';

const ROBOTS = { unchecked: 'לא נבדק', allowed: 'מותר', disallowed: 'אסור', unreachable: 'לא נגיש' };
const TOS = { unreviewed: 'לא נבדקו ידנית', allowed: 'מאושר', forbidden: 'אוסר איסוף' };

export default function SourcesPanel({ onClose }) {
  const [rows, setRows] = useState(null);
  useEffect(() => {
    api.sources().then(setRows);
  }, []);
  return (
    <div className="overlay" onClick={onClose}>
      <article className="card" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <button className="close" onClick={onClose} aria-label="סגירה">×</button>
        <h2>מצב מקורות</h2>
        <p className="small muted">
          איסוף מתבצע רק כשיש כתובת מאומתת, robots.txt מתיר, ותנאי השימוש נקראו ואושרו ידנית.
        </p>
        {!rows && <p className="muted">טוען…</p>}
        {rows && (
          <table className="sources">
            <thead>
              <tr><th>מקור</th><th>כתובת</th><th>robots.txt</th><th>תנאי שימוש</th><th>ריצה אחרונה</th></tr>
            </thead>
            <tbody>
              {rows.map((s) => (
                <tr key={s.id}>
                  <td>{s.name}</td>
                  <td>{s.base_url ? <a href={s.base_url} target="_blank" rel="noreferrer">{s.base_url}</a> : <span className="na">לא הוגדרה</span>}</td>
                  <td>{ROBOTS[s.robots_status] || s.robots_status} <span className="muted">{fmtDate(s.robots_checked_at)}</span></td>
                  <td>{TOS[s.tos_status] || s.tos_status}{s.tos_note ? <div className="small muted">{s.tos_note}</div> : null}</td>
                  <td className="small">{s.last_run_status || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </article>
    </div>
  );
}
