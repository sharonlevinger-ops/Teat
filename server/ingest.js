// הכנסת פרופיל זן שחולץ מדף מקור למסד הנתונים, שדה-שדה עם מקור.
import { getOrCreateStrain, saveFact, saveReview, saveAlias } from './db.js';
import { normalizeType, parsePercent, normalizeRating, parseLineage, searchKey } from './normalize.js';

/**
 * @returns {{strainId:number, conflicts:string[]} | null}
 */
export function ingestProfile(db, sourceId, profile, fetchedAt) {
  if (!profile?.name || !searchKey(profile.name)) return null;
  const strain = getOrCreateStrain(db, profile.name, profile.producer || '');
  const base = { strainId: strain.id, sourceId, sourceUrl: profile.url, fetchedAt };
  const conflicts = [];
  const fact = (field, value, raw) => {
    const v = saveFact(db, { ...base, field, value: value ?? null, raw: raw ?? null });
    if (v === 'conflict') conflicts.push(field);
  };

  fact('name_en', profile.name_en || null, profile.name_en);
  fact('type', normalizeType(profile.type_raw), profile.type_raw);
  fact('thc', parsePercent(profile.thc_raw), profile.thc_raw);
  fact('cbd', parsePercent(profile.cbd_raw), profile.cbd_raw);
  fact('rating_avg', normalizeRating(profile.rating_raw, profile.rating_scale || 5), profile.rating_raw);
  fact('rating_count', profile.rating_count ?? null, profile.rating_count);
  fact('effects', profile.effects, profile.effects?.join(', '));
  fact('indications', profile.indications, profile.indications?.join(', '));
  fact('lineage', parseLineage(profile.lineage_raw), profile.lineage_raw);
  fact('related', profile.related, profile.related?.join(', '));

  // שם גלובלי רק כשהמקור קובע זאת במפורש
  if (profile.global_name) saveAlias(db, { ...base, globalName: profile.global_name });

  for (const r of profile.reviews || []) {
    const rating = normalizeRating(r.rating, r.scale || 5);
    if (rating === null) continue; // בלי ציון אין בסיס לסווג חיובי/שלילי
    if (rating >= 4) saveReview(db, { ...base, sentiment: 'positive', rating, text: r.text });
    else if (rating <= 2) saveReview(db, { ...base, sentiment: 'negative', rating, text: r.text });
  }
  for (const t of profile.pros || []) saveReview(db, { ...base, sentiment: 'positive', rating: null, text: t });
  for (const t of profile.cons || []) saveReview(db, { ...base, sentiment: 'negative', rating: null, text: t });

  return { strainId: strain.id, conflicts };
}
