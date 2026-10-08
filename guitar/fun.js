// תוכן "כיפי": ג'אם (רצפי אקורדים בכל מפתח עם תופים), אתגרים יצירתיים, הישגים, כוונונים ותכנון אימון יומי.
// פונקציות טהורות, כדי שאפשר יהיה לבדוק אותן.
(function (root) {
  const SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const FLAT = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
  const nameOf = (pc, flats) => (flats ? FLAT : SHARP)[((pc % 12) + 12) % 12];

  // כל צעד: [מרחק בחצאי טונים מהשורש, סיומת האקורד]
  const BLUES = [[0, '7'], [0, '7'], [0, '7'], [0, '7'], [5, '7'], [5, '7'], [0, '7'], [0, '7'], [7, '7'], [5, '7'], [0, '7'], [7, '7']];
  const MINOR_BLUES = [[0, 'm7'], [0, 'm7'], [0, 'm7'], [0, 'm7'], [5, 'm7'], [5, 'm7'], [0, 'm7'], [0, 'm7'], [8, ''], [7, '7'], [0, 'm7'], [7, '7']];

  const JAM = [
    {
      id: 'blues', name: 'בלוז 12 תיבות', mode: 'major', drums: 'shuffle', bpm: 90, bars: BLUES,
      desc: 'המבנה הקלאסי של בלוז ורוקנרול: שלושה אקורדים בסדר קבוע.',
      scales: [
        ['minorPent', 'הסולם הקלאסי של בלוז: מתאים מעל כל האקורדים.'],
        ['blues', 'עם תו המתח, לצליל "מלוכלך" יותר.'],
        ['majorPent', 'צליל שמח ומתוק יותר, בעיקר מעל האקורד הראשון.'],
        ['mixolydian', 'כשרוצים להתאים לכל אקורד בנפרד.'],
      ],
      tips: ['אלתר משפט, חזור עליו בשינוי קל, ואז "ענה" לו במשפט אחר. כך נבנה סולו בלוז.', 'כל 12 תיבות הן "מעגל". נסה לסיים משפט על השורש בתיבה 12.'],
    },
    {
      id: 'minor-blues', name: 'בלוז מינורי איטי', mode: 'minor', drums: 'ballad', bpm: 70, bars: MINOR_BLUES,
      desc: 'בלוז איטי ועצוב. הרבה מקום לבנדים, לוויברטו ולשקט.',
      scales: [
        ['minorPent', 'הסולם הבטוח.'],
        ['blues', 'תו המתח נותן את הצליל הבלוזי.'],
        ['naturalMinor', 'מכיל את כל האקורדים כולל האקורד על התו השישי.'],
      ],
      tips: ['בקצב איטי כל תו חשוב. נגן פחות תווים ותן להם לחיות עם בנד או ויברטו.'],
    },
    {
      id: 'rock-minor', name: 'רוק מינורי: i bVII bVI bVII', mode: 'minor', drums: 'rock', bpm: 100,
      bars: [[0, 'm'], [10, ''], [8, ''], [10, '']],
      desc: 'הרצף שנשמע בהמון שירי רוק: לה מינור, סול, פה, סול.',
      scales: [
        ['minorPent', 'הסולם הבטוח: כמעט כל תו מתאים.'],
        ['naturalMinor', 'כולל את כל האקורדים, גם F.'],
        ['blues', 'תו המתח לצליל קשוח.'],
      ],
      tips: ['נסה לנחות על השורש בתחילת כל סבב של ארבע תיבות.'],
    },
    {
      id: 'andalusian', name: 'אנדלוסי: i bVII bVI V', mode: 'minor', drums: 'rock', bpm: 95,
      bars: [[0, 'm'], [10, ''], [8, ''], [7, '']],
      desc: 'צליל דרמטי עם נגיעה ספרדית וים-תיכונית. אקורד ה-V המז׳ורי נותן את המתח.',
      scales: [
        ['naturalMinor', 'כולל את כל האקורדים חוץ מהתו של ה-V המז׳ורי.'],
        ['harmonicMinor', 'מכיל את סול דיאז, שמופיע באקורד E המז׳ורי.'],
        ['phrygianDominant', 'אהבה רבה: הצליל הים-תיכוני שמתאים במיוחד לאקורד האחרון.'],
        ['minorPent', 'הגרסה הפשוטה.'],
      ],
      tips: ['על האקורד האחרון (E) נסה לנחות על סול דיאז ולהחליק ללה. זה הצליל הדרמטי.'],
    },
    {
      id: 'pop', name: 'פופ: I V vi IV', mode: 'major', drums: 'rock', bpm: 100,
      bars: [[0, ''], [7, ''], [9, 'm'], [5, '']],
      desc: 'הרצף הנפוץ ביותר בפופ: דו, סול, לה מינור, פה.',
      scales: [
        ['majorPent', 'סולם בטוח לכל האקורדים חוץ מהרביעי.'],
        ['major', 'כולל את כל האקורדים, גם F.'],
      ],
      tips: ['מעל כל אקורד אפשר לנחות על תו מהאקורד. הטבלה למטה מראה איזה.'],
    },
    {
      id: 'mixo-rock', name: 'רוק מיקסולידי: I bVII IV', mode: 'major', drums: 'rock', bpm: 110,
      bars: [[0, ''], [10, ''], [5, ''], [0, '']],
      desc: 'רוק דרומי ושמח: רה, דו, סול. האקורד על התו השביעי נותן את הצליל הרוקי.',
      scales: [
        ['majorPent', 'הסולם הבטוח.'],
        ['mixolydian', 'מוסיף את התו שמגדיר את הצליל הרוקי.'],
        ['minorPent', 'בלוז-רוק: פנטטוני מינורי מעל שיר במז׳ור.'],
      ],
      tips: ['נסה לשלב שני סולמות: מינורי למתח ומז׳ורי לפתרון.'],
    },
  ];

  // אתגרים יצירתיים לפתיחת הראש
  const CHALLENGES = [
    'אלתר שמונה תיבות עם שלושה תווים בלבד. רק שלושה.',
    'כל משפט חייב להסתיים בבנד.',
    'נגן משפט, ואז "ענה" לעצמך באותו משפט הפוך.',
    'אלתר רק על שני מיתרים סמוכים.',
    'נגן את אותו משפט בשלוש תנוחות שונות של הסולם.',
    'הוסף ויברטו לכל תו אחרון של משפט.',
    'אלתר רק עם אצבעות 1 ו-3.',
    'התחל כל משפט בפעימה 2 ולא בפעימה 1.',
    'נגן את הסולו בשקט כמעט לחישה, ואז בחוזקה.',
    'נסה לנגן באוזן את המנגינה של שיר שאתה אוהב.',
    'השתמש בסלייד לפחות פעמיים בכל סבב.',
    'נגן משפט של חמישה תווים, וחזור עליו שלוש פעמים עם שינוי קטן בכל פעם.',
    'אלתר מעל הרקע בעיניים עצומות, ורק תקשיב.',
    'התחל גבוה על הצוואר וירד בהדרגה לתנוחה 1 לאורך הסבב.',
    'נגן רק תווים מהאקורד הנוכחי בתחילת כל תיבה.',
    'עשה הפסקה של תיבה שלמה אחרי כל משפט. שקט הוא חלק מהמוזיקה.',
  ];

  // כוונונים (מיתר 6 עד 1, מספרי MIDI)
  const TUNINGS = [
    { id: 'standard', name: 'רגיל', midi: [40, 45, 50, 55, 59, 64] },
    { id: 'half', name: 'חצי טון למטה (כמו הרבה הקלטות של GNR)', midi: [39, 44, 49, 54, 58, 63] },
    { id: 'whole', name: 'טון שלם למטה (כמו Pantera - Walk)', midi: [38, 43, 48, 53, 57, 62] },
    { id: 'dropd', name: 'Drop D', midi: [38, 45, 50, 55, 59, 64] },
  ];

  // תו (מספר 0-11) במיתר ובסריג, בכיוון רגיל
  const OPEN_MIDI = { 6: 40, 5: 45, 4: 50, 3: 55, 2: 59, 1: 64 };
  const noteAt = (s, f) => (OPEN_MIDI[s] + f) % 12;

  // ג'אם: האקורדים של רצף בכל מפתח
  function jamChords(preset, rootPc, flats) {
    return preset.bars.map(([semi, suffix]) => nameOf(rootPc + semi, flats) + suffix);
  }

  // רצף ימי תרגול: כמה ימים רצופים עד היום (או עד אתמול, אם היום עוד לא תרגלת)
  function computeStreak(days, todayKey) {
    const set = new Set(days);
    const dayMs = 864e5;
    const parse = (k) => Date.parse(k + 'T12:00:00Z');
    const fmt = (ms) => new Date(ms).toISOString().slice(0, 10);
    let cur = parse(todayKey);
    if (!set.has(fmt(cur))) cur -= dayMs;
    let n = 0;
    while (set.has(fmt(cur))) {
      n++;
      cur -= dayMs;
    }
    return n;
  }

  // תכנון אימון יומי דטרמיניסטי לפי מספר היום
  function dailyPlan(seed, data) {
    const pick = (list, k) => list[((seed * 7 + k) % list.length + list.length) % list.length];
    const l1 = data.levels[0].exercises;
    const l2 = data.levels[1].exercises;
    const tech = [...data.levels[2].exercises, ...data.penta.sections.flatMap((s) => s.exercises)];
    return {
      warm: [pick(l1, 0), pick(l2, 3)],
      tech: pick(tech, 5),
      jam: { preset: pick(JAM, 1), rootPc: (seed * 5) % 12 },
      challenge: pick(CHALLENGES, 2),
    };
  }

  // הישגים: כל אחד בודק מצב ומחזיר true כשהושג
  const ACHIEVEMENTS = [
    { id: 'first', icon: '🌱', name: 'יום ראשון', desc: 'תרגלת פעם אחת', check: (st) => st.totalDays >= 1 },
    { id: 'streak3', icon: '🔥', name: 'שלושה ימים ברצף', desc: 'תרגלת שלושה ימים ברציפות', check: (st) => st.streak >= 3 },
    { id: 'streak7', icon: '🏆', name: 'שבוע ברצף', desc: 'תרגלת שבעה ימים ברציפות', check: (st) => st.streak >= 7 },
    { id: 'days10', icon: '📅', name: 'עשרה ימי תרגול', desc: 'סך הכול עשרה ימים', check: (st) => st.totalDays >= 10 },
    { id: 'ex5', icon: '🎯', name: 'חמישה תרגילים שונים', desc: 'שמרת חמישה תרגילים שונים', check: (st) => st.uniqueExercises >= 5 },
    { id: 'ex20', icon: '🧭', name: 'עשרים תרגילים שונים', desc: 'שמרת עשרים תרגילים שונים', check: (st) => st.uniqueExercises >= 20 },
    { id: 'spider100', icon: '🕷️', name: 'ספיידר ב-100', desc: 'ספיידר פשוט במהירות 100 BPM או יותר', check: (st) => st.bests['1-2'] >= 100 },
    { id: 'jam', icon: '🎸', name: 'ג׳אם ראשון', desc: 'ניגנת מעל רקע של ג׳אם או שיר', check: (st) => st.jams >= 1 },
    { id: 'quiz10', icon: '🧠', name: 'חידון: עשרה ברצף', desc: 'עשר תשובות נכונות ברצף בחידון הלוח', check: (st) => st.quizBest >= 10 },
  ];

  const API = { JAM, CHALLENGES, TUNINGS, ACHIEVEMENTS, noteAt, jamChords, computeStreak, dailyPlan, nameOf };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else root.GUITAR_FUN = API;
})(typeof window !== 'undefined' ? window : globalThis);
