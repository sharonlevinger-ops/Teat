// מאגר שירים לאלתור. לכל שיר: מפתח (לפי הצורות שמנגנים על הצוואר), אקורדים עיקריים,
// והסולמות שמתאימים לאלתור, עם הסבר. זה לא תמלול של הסולו המקורי.
// conf: 'high' = מפתח ורצף מוכרים היטב; 'medium' = מקורות חלוקים או שהבחירה בסולם היא פרשנות.
// tuning: 'halfDown' = ההקלטה מכוונת חצי טון למטה (הצורות על הצוואר נשארות כמו שכתוב).
(function (root) {
  const S = (scale, why, extra) => ({ scale, why, ...(extra || {}) });

  const SONGS = [
    {
      id: 'gnr-dont-cry', artist: "Guns N' Roses", artistHe: 'גאנז אנד רוזס', title: "Don't Cry", titleHe: 'דונט קריי',
      alias: ['gnr', 'גנז אנד רוזס', 'גאנס אנד רוזס', 'סלאש', 'slash', 'use your illusion'],
      key: { root: 'A', mode: 'minor' }, tuning: 'halfDown', conf: 'medium',
      chords: ['Am', 'G', 'Dm', 'Am'],
      scales: [
        S('naturalMinor', 'הסולם שעליו בנוי הסולו, לפי Lick Library. אין תו מחוץ לסולם מעל האקורדים.'),
        S('minorPent', 'הגרסה הפשוטה: Slash יורד לפנטטוני המינורי בחלקים מהסולו.'),
        S('blues', 'תו מתח לשימוש חטוף במשפטים בלוזיים.'),
      ],
      tips: [
        'השיר איטי ומלודי: משפטים ארוכים, בנדים וויברטו על תווים שנשארים.',
        'מעל Am הישאר סביב לה, דו ומי. מעל G זוז לסול ולסי.',
      ],
      src: 'Lick Library ואתרי אקורדים. המקורות חלוקים בשם המפתח בגלל כיוון חצי טון למטה.',
    },
    {
      id: 'gnr-sweet-child', artist: "Guns N' Roses", artistHe: 'גאנז אנד רוזס', title: "Sweet Child O' Mine", titleHe: "סוויט צ'יילד או מיין",
      alias: ['gnr', 'גנז אנד רוזס', 'סלאש', 'slash', 'appetite for destruction'],
      key: { root: 'D', mode: 'major' }, tuning: 'halfDown', conf: 'medium',
      chords: ['D', 'C', 'G', 'D'],
      scales: [
        S('majorPent', 'הסולם הבטוח למשפטים בחלק הראשון של הסולו.'),
        S('mixolydian', 'לפי ניתוח של Guitar Music Theory, החלק הראשון של הסולו מבוסס על דו מיקסולידי: הסי במול (C) נותן את הצליל הרוקי.'),
        S('minorPent', 'בחלק המאוחר של הסולו השיר עובר למי מינור.', { root: 'E' }),
      ],
      tips: [
        'מעל D ו-C ו-G אפשר להישאר בפנטטוני המז׳ורי של D: אותם תווים מתאימים לשלושת האקורדים.',
        'התו C (סי במול ב-D מיקסולידי) נותן את תחושת הרוק. נסה לחזור אליו ולהחליק לשורש D.',
      ],
      src: 'Guitar Music Theory ו-Your Guitar Academy. המקורות חלוקים במפתח.',
    },
    {
      id: 'aero-walk-this-way', artist: 'Aerosmith', artistHe: 'אירוסמית׳', title: 'Walk This Way', titleHe: 'ווק דיס ווי',
      alias: ['aerosmith', 'ארוסמית', 'אירוסמית', 'joe perry', 'ג׳ו פרי', 'גו פרי'],
      key: { root: 'E', mode: 'minor' }, conf: 'medium', chords: [],
      scales: [
        S('minorPent', 'לפי Lick Library השיר מנוגן בעיקר בפנטטוני המינורי.'),
        S('blues', 'הריף הראשי מזוהה גם עם סולם הבלוז בתנוחה 1.'),
      ],
      tips: [
        'השיר מבוסס ריף: למד את הריף ואחר כך אלתר סביב אותה תנוחה.',
        'המקורות חלוקים בין מי לרה כמפתח. בדוק באוזן מול ההקלטה.',
      ],
      src: 'Lick Library ו-Your Guitar Academy.',
    },
    {
      id: 'aero-sweet-emotion', artist: 'Aerosmith', artistHe: 'אירוסמית׳', title: 'Sweet Emotion', titleHe: 'סוויט אימושן',
      alias: ['aerosmith', 'ארוסמית', 'אירוסמית', 'joe perry', 'ג׳ו פרי', 'גו פרי'],
      key: { root: 'A', mode: 'minor' }, conf: 'medium', chords: ['D', 'A'],
      scales: [
        S('minorPent', 'לפי TotallyGuitars: פנטטוני לה מינור מתאים לריפים בשיר.'),
        S('blues', 'תו מתח לצליל בלוזי יותר.'),
      ],
      tips: ['השיר נע בין D ל-A. התחל מפנטטוני לה מינור וחזור לשורש לה.'],
      src: 'TotallyGuitars.',
    },
    {
      id: 'pantera-walk', artist: 'Pantera', artistHe: 'פנטרה', title: 'Walk', titleHe: 'ווק',
      alias: ['dimebag', 'dimebag darrell', 'דיימבאג', 'מטאל', 'vulgar display of power'],
      key: { root: 'E', mode: 'minor' }, tuning: 'wholeDown', conf: 'medium', chords: [],
      scales: [
        S('blues', 'לפי Lick Library, הסולו משתמש בסולם הבלוז: בנדים איטיים וריצות מהירות עם פיקינג מתחלף.'),
        S('minorPent', 'הבסיס הפשוט: פנטטוני מי מינור.'),
        S('naturalMinor', 'מוסיף תווי צבע לריצות מלודיות.'),
      ],
      tips: [
        'הריף בנוי סביב מיתר פתוח ורק סריג אחד. התחל ממנו ובנה סביבו תבניות קצרות.',
        'כדי לנגן עם ההקלטה כוון את כל המיתרים טון שלם למטה: D G C F A D. הצורות כאן נשארות כמו שכתוב.',
      ],
      src: 'Lick Library ואתרי תווים. המקורות לא קובעים בבירור את המפתח (כאן הוא מוצג לפי הצורות על הצוואר) והם חלוקים בגובה הכיוון המדויק.',
    },
    {
      id: 'pantera-cfh', artist: 'Pantera', artistHe: 'פנטרה', title: 'Cowboys from Hell', titleHe: 'קאובויז פרום הל',
      alias: ['dimebag', 'dimebag darrell', 'דיימבאג', 'מטאל'],
      key: { root: 'E', mode: 'minor' }, tuning: 'check', conf: 'medium', chords: ['E5', 'G5', 'A5'],
      scales: [
        S('minorPent', 'לפי Lick Library, הסולואים מבוססים על פנטטוני מי מינור עם בנדים.'),
        S('blues', 'לפי Guitar World, הריף והליק הפותח מבוססים על סולם הבלוז המינורי.'),
        S('dorian', 'ניתוח אחד מזהה בשיר את מי דורי (עם דו דיאז). אופציה למשפטים מלודיים יותר.'),
      ],
      tips: ['הריף בנוי על אקורדי פאוור E5, G5 ו-A5. נסה אחר כך לאלתר מעל אותם אקורדים.'],
      src: 'Guitar World ו-Lick Library. המקורות חלוקים בכיוון המדויק: בדוק מול ההקלטה.',
    },
    {
      id: 'met-puppets', artist: 'Metallica', artistHe: 'מטאליקה', title: 'Master of Puppets', titleHe: 'מאסטר אוף פאפטס',
      alias: ['metallica', 'kirk hammett', 'מטאל'],
      key: { root: 'E', mode: 'minor' }, conf: 'medium', chords: [],
      scales: [
        S('naturalMinor', 'השיר ממוקם במי מינור, והסולו מבוסס על הסולם המינורי הטבעי.'),
        S('minorPent', 'הגרסה הפשוטה לתחילת אלתור.'),
      ],
      tips: ['הריף מנוגן בפיקינג מתחלף ובפאלם מיוט. נסה אותו באיטיות לפני שאתה מאלתר.'],
      src: 'Lick Library ואתרי לימוד.',
    },
    {
      id: 'met-sandman', artist: 'Metallica', artistHe: 'מטאליקה', title: 'Enter Sandman', titleHe: 'אנטר סנדמן',
      alias: ['metallica', 'kirk hammett', 'מטאל', 'black album'],
      key: { root: 'E', mode: 'minor' }, conf: 'medium', chords: [],
      scales: [
        S('minorPent', 'הסולו כולל חלקים פנטטוניים.'),
        S('blues', 'הריף הראשי משתמש בתו המתח של סולם הבלוז.'),
      ],
      tips: ['הריף מנוגן על מיתר 6 ו-5 בפאלם מיוט. התחל ממנו ואחר כך עבור לסולו.'],
      src: 'אתרי לימוד. המפתח (מי מינור) מוסכם בכל המקורות שבדקתי.',
    },
    {
      id: 'santana-bmw', artist: 'Santana', artistHe: 'סנטנה', title: 'Black Magic Woman', titleHe: "בלאק מג'יק וומן",
      alias: ['carlos santana', 'קרלוס סנטנה', 'peter green'],
      key: { root: 'D', mode: 'minor' }, conf: 'medium', chords: ['Dm', 'Gm', 'A7'],
      scales: [
        S('minorPent', 'לפי Guitar Alliance, הסולו הראשון של סנטנה מבוסס על פנטטוני רה מינור.'),
        S('naturalMinor', 'כולל את סי במול שמופיע מעל האקורד Gm.'),
        S('dorian', 'מופיע מדי פעם: מוסיף את סי טבעי ואת מי.'),
      ],
      tips: ['מעל A7 נסה לנחות על דו דיאז, ואז לפתור לרה.'],
      src: 'Guitar Alliance ושיעורי גיטרה. המקורות חלוקים בין מינורי לדורי.',
    },
    {
      id: 'dp-smoke', artist: 'Deep Purple', artistHe: 'דיפ פרפל', title: 'Smoke on the Water', titleHe: 'סמוק און דה ווטר',
      alias: ['deep purple', 'blackmore'],
      key: { root: 'G', mode: 'minor' }, conf: 'high', chords: ['G5', 'Bb5', 'C5', 'G5'],
      scales: [
        S('minorPent', 'הריף הראשי הוא פנטטוני סול מינור עם תו בלוזי.'),
        S('blues', 'הריף משתמש בתו המתח (רה במול).'),
      ],
      tips: ['נסה לאלתר מעל הריף: חזור על שלושה-ארבעה תווים וקבל איתם תחושה של ריף.'],
    },
    {
      id: 'eagles-hotel', artist: 'Eagles', artistHe: 'איגלס', title: 'Hotel California', titleHe: 'הוטל קליפורניה',
      alias: ['eagles', 'איגלז'],
      key: { root: 'B', mode: 'minor' }, conf: 'high', chords: ['Bm', 'F#', 'A', 'E', 'G', 'D', 'Em', 'F#'],
      scales: [
        S('naturalMinor', 'כמעט כל האקורדים נמצאים בסי מינור טבעי.'),
        S('minorPent', 'הגרסה הפשוטה והבטוחה לתחילת אלתור.'),
        S('harmonicMinor', 'האקורד F# מכיל את התו לה דיאז, שמופיע בסי מינורי הרמוני. בעבור אקורד זה בחר בו.'),
      ],
      tips: ['מעל F# נסה להדגיש את לה דיאז: זה מה שנותן את הצליל "הספרדי" של השיר.'],
    },
    {
      id: 'lz-stairway', artist: 'Led Zeppelin', artistHe: 'לד זפלין', title: 'Stairway to Heaven', titleHe: 'סטיירווי טו הבן',
      alias: ['led zeppelin', 'jimmy page', 'לד זפלין', 'לדזפלין'],
      key: { root: 'A', mode: 'minor' }, conf: 'medium', chords: [],
      scales: [
        S('minorPent', 'הסולו בנוי בעיקר על פנטטוני לה מינור.'),
        S('naturalMinor', 'מוסיף תווים לשפת הסולו המלודית.'),
      ],
      tips: ['הסולו מתפתח: התחל במשפטים רגועים בפנטטוני ועלה לתנוחות גבוהות יותר.'],
    },
    {
      id: 'lz-whole-lotta', artist: 'Led Zeppelin', artistHe: 'לד זפלין', title: 'Whole Lotta Love', titleHe: 'הול לוטה לאב',
      alias: ['led zeppelin', 'jimmy page', 'לד זפלין'],
      key: { root: 'D', mode: 'minor' }, conf: 'high', chords: [],
      scales: [S('minorPent', 'הריף בנוי על פנטטוני רה.'), S('blues', 'סולם בלוז רה לצליל קשוח יותר.')],
      tips: ['הריף חוזר על עצמו. אלתר סביב אותה תנוחה והחזר את הריף כמוטיב.'],
    },
    {
      id: 'pf-numb', artist: 'Pink Floyd', artistHe: 'פינק פלויד', title: 'Comfortably Numb', titleHe: 'קומפורטבלי נאמב',
      alias: ['pink floyd', 'gilmour', 'גילמור', 'פינקפלויד'],
      key: { root: 'B', mode: 'minor' }, conf: 'medium', chords: [],
      scales: [
        S('minorPent', 'סולם בטוח לסולו הראשי.'),
        S('naturalMinor', 'שפת הסולו עוברת בסי מינור טבעי.'),
        S('majorPent', 'בחלקי הפזמון (רה מז׳ור) אותם התווים מתאימים: רה מז׳ור פנטטוני הוא אותם תווים של סי מינור פנטטוני.', { root: 'D' }),
      ],
      tips: ['סי מינור פנטטוני ורה מז׳ור פנטטוני הם אותם חמישה תווים. מה שמשתנה הוא התו שעליו נחים.'],
      src: 'ניתוח כללי. בדוק מול ההקלטה.',
    },
    {
      id: 'pf-wywh', artist: 'Pink Floyd', artistHe: 'פינק פלויד', title: 'Wish You Were Here', titleHe: 'וויש יו וור היר',
      alias: ['pink floyd', 'gilmour', 'גילמור', 'פינקפלויד'],
      key: { root: 'G', mode: 'major' }, conf: 'medium', chords: ['Em7', 'G', 'Em7', 'G', 'Em7', 'A7sus4', 'G'],
      scales: [
        S('majorPent', 'סול מז׳ור פנטטוני: מתאים למלודיה הפתוחה של השיר.'),
        S('minorPent', 'מי מינור פנטטוני הם אותם תווים כמו סול מז׳ור פנטטוני, ולכן מתאימים גם כן.', { root: 'E' }),
      ],
      tips: ['הצליל פתוח ופשוט: משפטים איטיים, והרבה שקט. נסה לנחות על סול כדי להרגיש יציבות.'],
    },
    {
      id: 'met-nem', artist: 'Metallica', artistHe: 'מטאליקה', title: 'Nothing Else Matters', titleHe: 'נאת׳ינג אלס מאטרס',
      alias: ['metallica', 'kirk hammett'],
      key: { root: 'E', mode: 'minor' }, conf: 'medium', chords: ['Em', 'D', 'C', 'G', 'B7'],
      scales: [
        S('minorPent', 'הסולו בנוי בעיקר על פנטטוני מי מינור.'),
        S('naturalMinor', 'שפת הסולו המלודית.'),
        S('harmonicMinor', 'האקורד B7 מכיל את רה דיאז שמופיע במי מינורי הרמוני.'),
      ],
      tips: ['על B7 נסה לנחות על רה דיאז ואז לפתור למי.'],
    },
    {
      id: 'acdc-bib', artist: 'AC/DC', artistHe: 'איי סי די סי', title: 'Back in Black', titleHe: 'בק אין בלאק',
      alias: ['acdc', 'ac dc', 'angus young', 'אי סי די סי'],
      key: { root: 'E', mode: 'minor' }, conf: 'high', chords: ['E5', 'D5', 'A5'],
      scales: [S('minorPent', 'הריף והסולו בנויים על פנטטוני מי מינור.'), S('blues', 'תו המתח לצליל קשוח.')],
      tips: ['הזמן קצר ופשוט: חזור לשורש מי בסוף כל משפט.'],
    },
    {
      id: 'acdc-hth', artist: 'AC/DC', artistHe: 'איי סי די סי', title: 'Highway to Hell', titleHe: 'הייווי טו הל',
      alias: ['acdc', 'ac dc', 'angus young', 'אי סי די סי'],
      key: { root: 'A', mode: 'major' }, conf: 'high', chords: ['A', 'D', 'G'],
      scales: [
        S('minorPent', 'הסולו משתמש בפנטטוני לה מינור מעל האקורדים המז׳וריים: זה צליל רוקי.'),
        S('majorPent', 'לצליל שמח ומתוק יותר.'),
      ],
      tips: ['נסה להחליף בין דו (שלישית מינורית) לדו דיאז (שלישית מז׳ורית) מעל האקורד A: זה מה שנותן את הצליל הרוקי.'],
    },
    {
      id: 'lynyrd-sha', artist: 'Lynyrd Skynyrd', artistHe: 'לינרד סקינרד', title: 'Sweet Home Alabama', titleHe: 'סוויט הום אלבמה',
      alias: ['lynyrd skynyrd', 'skynyrd', 'לינירד'],
      key: { root: 'D', mode: 'major' }, conf: 'high', chords: ['D', 'C', 'G'],
      scales: [
        S('majorPent', 'רה מז׳ור פנטטוני מתאים לשלושת האקורדים.'),
        S('mixolydian', 'האקורד C מורה על רה מיקסולידי.'),
      ],
      tips: ['שלושת האקורדים D, C ו-G חוזרים. אותו משפט מתאים לכולם.'],
    },
    {
      id: 'hendrix-haze', artist: 'Jimi Hendrix', artistHe: "ג'ימי הנדריקס", title: 'Purple Haze', titleHe: 'פרפל הייז',
      alias: ['hendrix', 'הנדריקס', 'jimi'],
      key: { root: 'E', mode: 'minor' }, conf: 'high', chords: ['E7', 'G', 'A'],
      scales: [S('minorPent', 'פנטטוני מי מינור.'), S('blues', 'תו המתח לצליל קשוח.')],
      tips: ['הריף וה"אקורד של הנדריקס" (E7#9) מצליחים כי הם מערבבים מז׳ורי ומינורי. נסה גם אתה.'],
    },
    {
      id: 'hendrix-heyjoe', artist: 'Jimi Hendrix', artistHe: "ג'ימי הנדריקס", title: 'Hey Joe', titleHe: "היי ג'ו",
      alias: ['hendrix', 'הנדריקס', 'jimi'],
      key: { root: 'E', mode: 'minor' }, conf: 'medium', chords: ['C', 'G', 'D', 'A', 'E'],
      scales: [S('minorPent', 'סולם בטוח לסולו.'), S('blues', 'תו המתח בנוסף.'), S('naturalMinor', 'כולל את כל אקורדי הרצף: גם האקורד C (דו הוא התו השישי של מי מינור).')],
      tips: ['הרצף C G D A E יורד במרווחי קווינטה. הסולו נשאר בסביבת מי.'],
    },
    {
      id: 'clapton-layla', artist: 'Derek and the Dominos', artistHe: 'אריק קלפטון', title: 'Layla', titleHe: 'ליילה',
      alias: ['eric clapton', 'clapton', 'קלפטון', 'דרק והדומינוס'],
      key: { root: 'D', mode: 'minor' }, conf: 'medium', chords: [],
      scales: [S('minorPent', 'הריף מבוסס על פנטטוני רה מינור.'), S('naturalMinor', 'מוסיף תווי צבע.')],
      tips: ['הריף עושה קפיצות. נסה לנגן את הריף מהזיכרון ואז לאלתר מתוכו.'],
    },
    {
      id: 'ds-sultans', artist: 'Dire Straits', artistHe: 'דייר סטרייטס', title: 'Sultans of Swing', titleHe: 'סולטנס אוף סווינג',
      alias: ['dire straits', 'knopfler', 'קנופפלר'],
      key: { root: 'D', mode: 'minor' }, conf: 'medium', chords: ['Dm', 'C', 'Bb', 'A'],
      scales: [S('minorPent', 'פנטטוני רה מינור מתאים לאקורדים.'), S('naturalMinor', 'מוסיף שני תווי צבע.')],
      tips: ['האקורד A (מז׳ורי) מכיל דו דיאז. נסה לנחות עליו כדי להדגיש את המעבר.'],
    },
    {
      id: 'ws-sna', artist: 'The White Stripes', artistHe: 'וייט סטרייפס', title: 'Seven Nation Army', titleHe: 'סבן ניישן ארמי',
      alias: ['white stripes', 'jack white'],
      key: { root: 'E', mode: 'minor' }, conf: 'high', chords: [],
      scales: [S('minorPent', 'הריף בנוי על תווים מפנטטוני מי מינור.'), S('blues', 'תו המתח לצליל בלוזי יותר.')],
      tips: ['הריף פשוט מאוד: אלתר עליו בעזרת חמישה תווים בלבד.'],
    },
    {
      id: 'nirvana-slts', artist: 'Nirvana', artistHe: 'נירוונה', title: 'Smells Like Teen Spirit', titleHe: 'סמלס לייק טין ספיריט',
      alias: ['nirvana', 'kurt cobain', 'קורט קוביין'],
      key: { root: 'F', mode: 'minor' }, conf: 'high', chords: ['F5', 'Bb5', 'Ab5', 'Db5'],
      scales: [S('minorPent', 'פנטטוני פה מינור: הצליל של השיר.'), S('blues', 'לגיוון.'), S('naturalMinor', 'כולל את האקורד Db (התו השישי של פה מינור).')],
      tips: ['הסולו מתנגן את מלודיית הפזמון. נסה לאלתר רק על השורש והתו שאחריו.'],
    },
    {
      id: 'rhcp-calif', artist: 'Red Hot Chili Peppers', artistHe: "רד הוט צ'ילי פפרס", title: 'Californication', titleHe: 'קליפורניקיישן',
      alias: ['rhcp', 'red hot', 'frusciante', 'פרושאנטה'],
      key: { root: 'A', mode: 'minor' }, conf: 'high', chords: ['Am', 'F', 'C', 'G'],
      scales: [S('naturalMinor', 'כל האקורדים נמצאים בלה מינור טבעי.'), S('minorPent', 'הגרסה הפשוטה והבטוחה.')],
      tips: ['על F נסה להדגיש את התו פה: זה נותן צליל מינורי עמוק.'],
    },
    {
      id: 'bb-thrill', artist: 'B.B. King', artistHe: 'בי בי קינג', title: 'The Thrill Is Gone', titleHe: 'דה תריל איז גון',
      alias: ['bb king', 'b b king', 'בי.בי. קינג'],
      key: { root: 'B', mode: 'minor' }, conf: 'medium', chords: [],
      scales: [
        S('minorPent', 'הבסיס של בלוז מינורי.'),
        S('blues', 'עם תו המתח.'),
        S('majorPent', 'B.B. King משלב גם צליל מז׳ורי. תבנית B.B. היא פנטטוני מז׳ורי.', { root: 'D' }),
      ],
      tips: ['נסה לשלב מינורי ומז׳ורי: המינורי נותן מתח, והמז׳ורי נותן פתרון.'],
    },
    {
      id: 'dylan-knock', artist: 'Bob Dylan', artistHe: 'בוב דילן', title: "Knockin' on Heaven's Door", titleHe: 'נוקינג און הבנס דור',
      alias: ['dylan', 'דילן', 'knocking on heavens door', 'gnr'],
      key: { root: 'G', mode: 'major' }, conf: 'high', chords: ['G', 'D', 'Am', 'Am', 'G', 'D', 'C', 'C'],
      scales: [
        S('majorPent', 'סול מז׳ור פנטטוני מתאים לכל האקורדים.'),
        S('minorPent', 'מי מינור פנטטוני הם אותם תווים כמו סול מז׳ור פנטטוני.', { root: 'E' }),
        S('major', 'כולל גם את האקורד C: התו דו הוא התו הרביעי של סול מז׳ור.'),
      ],
      tips: ['רצף פשוט ואיטי: מתאים להתחלה באלתור. חזור על משפט קצר.'],
    },
    {
      id: 'animals-rising', artist: 'The Animals', artistHe: 'אנימלס', title: 'House of the Rising Sun', titleHe: 'האוס אוף דה רייזינג סאן',
      alias: ['animals', 'rising sun'],
      key: { root: 'A', mode: 'minor' }, conf: 'high', chords: ['Am', 'C', 'D', 'F', 'Am', 'E', 'Am', 'E'],
      scales: [
        S('naturalMinor', 'רוב האקורדים בלה מינור טבעי.'),
        S('harmonicMinor', 'האקורד E (מז׳ורי) מכיל סול דיאז: זה לה מינורי הרמוני.'),
        S('minorPent', 'הגרסה הפשוטה.'),
      ],
      tips: ['על E נסה לנחות על סול דיאז ואז לעלות ללה. זה התו שנותן את הצליל הדרמטי.'],
    },
    {
      id: 'chuck-johnny', artist: 'Chuck Berry', artistHe: "צ'אק ברי", title: 'Johnny B. Goode', titleHe: "ג'וני בי גוד",
      alias: ['chuck berry', 'צאק ברי'],
      key: { root: 'Bb', mode: 'major' }, conf: 'medium', chords: ['Bb', 'Bb', 'Bb', 'Bb', 'Eb', 'Eb', 'Bb', 'Bb', 'F', 'Eb', 'Bb', 'F'],
      scales: [
        S('majorPent', 'סי במול מז׳ור פנטטוני: צליל פתוח.'),
        S('blues', 'סולם בלוז סי במול לטעם רוקנרול.'),
        S('mixolydian', 'מתאים לאקורדים הדומיננטיים של בלוז.'),
      ],
      tips: ['המבנה הוא בלוז 12 תיבות. אותם משפטים חוזרים מעל כל אקורד.'],
    },
    {
      id: 'blues-12-e', artist: 'בלוז', artistHe: 'בלוז 12 תיבות', title: '12 Bar Blues in E', titleHe: 'בלוז 12 תיבות באי',
      alias: ['blues', 'בלוז', '12 bar', 'twelve bar'],
      key: { root: 'E', mode: 'major' }, conf: 'high', chords: ['E7', 'E7', 'E7', 'E7', 'A7', 'A7', 'E7', 'E7', 'B7', 'A7', 'E7', 'B7'],
      scales: [
        S('minorPent', 'הסולם הקלאסי: פנטטוני מי מינור מעל כל האקורדים.'),
        S('blues', 'עם תו המתח.'),
        S('majorPent', 'לצליל שמח יותר, בעיקר מעל E7.'),
        S('mixolydian', 'כשרוצים להתאים לכל אקורד.'),
      ],
      tips: ['אלתר משפט, חזור עליו בשינוי קל, ואז "ענה" למשפט בתשובה. כך בונים סולו בלוז.'],
    },
    {
      id: 'blues-12-a', artist: 'בלוז', artistHe: 'בלוז 12 תיבות', title: '12 Bar Blues in A', titleHe: 'בלוז 12 תיבות בלה',
      alias: ['blues', 'בלוז', '12 bar', 'twelve bar'],
      key: { root: 'A', mode: 'major' }, conf: 'high', chords: ['A7', 'A7', 'A7', 'A7', 'D7', 'D7', 'A7', 'A7', 'E7', 'D7', 'A7', 'E7'],
      scales: [
        S('minorPent', 'הסולם הקלאסי: פנטטוני לה מינור מעל כל האקורדים.'),
        S('blues', 'עם תו המתח.'),
        S('majorPent', 'לצליל שמח יותר.'),
        S('mixolydian', 'כשרוצים להתאים לכל אקורד.'),
      ],
      tips: ['אותו מבנה כמו בלוז באי, ארבע פעימות לתיבה. נסה אותו מהר ואיטי.'],
    },

    // ---- שירים נוספים שרבים לומדים על גיטרה ----
    {
      id: 'stand-by-me', artist: 'Ben E. King', artistHe: 'בן אי קינג', title: 'Stand By Me', titleHe: 'סטנד ביי מי',
      alias: ['stand by me'],
      key: { root: 'A', mode: 'major' }, conf: 'high', chords: ['A', 'F#m', 'D', 'E'],
      scales: [
        S('majorPent', 'סולם בטוח ומתוק מעל כל ארבעת האקורדים.'),
        S('major', 'כולל את כל האקורדים, כולל F#m.'),
      ],
      tips: ['הלחן פשוט ומדורג: נסה לנגן אותו באוזן על מיתר אחד לפני שאתה מאלתר.'],
      src: 'מבנה אקורדים נפוץ ומוכר (I vi IV V). בדוק באוזן מול ההקלטה.',
    },
    {
      id: 'three-little-birds', artist: 'Bob Marley', artistHe: 'בוב מארלי', title: 'Three Little Birds', titleHe: 'שלוש ציפורים קטנות',
      alias: ['marley', 'bob marley', 'רגאיי', 'reggae'],
      key: { root: 'A', mode: 'major' }, conf: 'high', chords: ['A', 'D', 'A', 'E'],
      scales: [
        S('majorPent', 'צליל רגוע ושמח. משפטים קצרים עם הרבה שקט ביניהם.'),
        S('mixolydian', 'נותן טעם רגאיי-בלוזי קל.'),
      ],
      tips: ['ברגאיי הקצב נמצא בפעימות 2 ו-4. נסה להתחיל משפטים אחרי הפעימה, ולא עליה.'],
      src: 'מבנה אקורדים נפוץ ומוכר. בדוק באוזן מול ההקלטה.',
    },
    {
      id: 'wild-thing', artist: 'The Troggs', artistHe: 'הטרוגס', title: 'Wild Thing', titleHe: 'ויילד ת׳ינג',
      alias: ['troggs'],
      key: { root: 'A', mode: 'major' }, conf: 'high', chords: ['A', 'D', 'E', 'D'],
      scales: [
        S('minorPent', 'רוק-גראז׳ קלאסי: פנטטוני לה מינור מעל אקורדים מז׳וריים.'),
        S('majorPent', 'הגרסה המתוקה יותר.'),
      ],
      tips: ['שלושה אקורדים בלבד. מושלם לתרגל מעבר מהיר בין A, D ו-E.'],
      src: 'מבנה אקורדים נפוץ ומוכר. בדוק באוזן מול ההקלטה.',
    },
    {
      id: 'louie-louie', artist: 'The Kingsmen', artistHe: 'קינגסמן', title: 'Louie Louie', titleHe: 'לואי לואי',
      alias: ['kingsmen', 'louie'],
      key: { root: 'A', mode: 'major' }, conf: 'high', chords: ['A', 'D', 'Em', 'D'],
      scales: [
        S('majorPent', 'מכיל את התווים של A ו-D, ועובד היטב מעל Em.'),
        S('mixolydian', 'הסול הטבעי (b7) מתאים לאקורד Em.'),
      ],
      tips: ['אחד הריפים הכי פשוטים ללמוד, ומושלם להתחיל לאלתר מעליו.'],
      src: 'מבנה אקורדים נפוץ ומוכר. בדוק באוזן מול ההקלטה.',
    },
    {
      id: 'twist-and-shout', artist: 'The Beatles', artistHe: 'הביטלס', title: 'Twist and Shout', titleHe: 'טוויסט אנד שאוט',
      alias: ['beatles', 'ביטלס', 'isley brothers'],
      key: { root: 'D', mode: 'major' }, conf: 'high', chords: ['D', 'G', 'A', 'G'],
      scales: [
        S('majorPent', 'סולם בטוח מעל D, G ו-A.'),
        S('mixolydian', 'נותן צליל רוקנרול קלאסי.'),
      ],
      tips: ['שלושה אקורדים, קצב מהיר: מתרגלים פריטה כלפי מטה-למעלה רציפה.'],
      src: 'מבנה אקורדים נפוץ ומוכר (I IV V). בדוק באוזן מול ההקלטה.',
    },
    {
      id: 'la-bamba', artist: 'Ritchie Valens', artistHe: "ריצ'י ולנס", title: 'La Bamba', titleHe: 'לה במבה',
      alias: ['ritchie valens', 'bamba'],
      key: { root: 'C', mode: 'major' }, conf: 'high', chords: ['C', 'F', 'G', 'F'],
      scales: [
        S('majorPent', 'הסולם הבטוח.'),
        S('mixolydian', 'מוסיף את התו הדומיננטי לצליל עממי.'),
      ],
      tips: ['הרצף C F G חוזר שוב ושוב: בסיס מצוין לתרגל החלפות אקורד בקצב קבוע.'],
      src: 'מבנה אקורדים נפוץ ומוכר. בדוק באוזן מול ההקלטה.',
    },
    {
      id: 'brown-eyed-girl', artist: 'Van Morrison', artistHe: 'ואן מוריסון', title: 'Brown Eyed Girl', titleHe: 'בראון איד גירל',
      alias: ['van morrison'],
      key: { root: 'G', mode: 'major' }, conf: 'high', chords: ['G', 'C', 'G', 'D'],
      scales: [
        S('majorPent', 'מתאים לכל האקורדים.'),
        S('major', 'כולל גם את אקורד Em של הפזמון.'),
      ],
      tips: ['נסה לנגן את הלחן הקצר של הפתיחה, ואז לשנות אותו קצת בכל פעם.'],
      src: 'מבנה אקורדים נפוץ ומוכר. בדוק באוזן מול ההקלטה.',
    },
    {
      id: 'let-it-be', artist: 'The Beatles', artistHe: 'הביטלס', title: 'Let It Be', titleHe: 'לט איט בי',
      alias: ['beatles', 'ביטלס'],
      key: { root: 'C', mode: 'major' }, conf: 'high', chords: ['C', 'G', 'Am', 'F'],
      scales: [
        S('majorPent', 'הסולם הבטוח למשפטים רכים.'),
        S('major', 'כולל את כל האקורדים.'),
      ],
      tips: ['אותו רצף כמו ברוב שירי הפופ (I V vi IV): אפשר לאלתר מעליו גם בג׳אם הפופ.'],
      src: 'מבנה אקורדים נפוץ ומוכר. בדוק באוזן מול ההקלטה.',
    },
    {
      id: 'ring-of-fire', artist: 'Johnny Cash', artistHe: "ג'וני קאש", title: 'Ring of Fire', titleHe: 'רינג אוף פייר',
      alias: ['cash', 'johnny cash', 'קאש'],
      key: { root: 'G', mode: 'major' }, conf: 'high', chords: ['G', 'C', 'G', 'D'],
      scales: [
        S('majorPent', 'צליל קאנטרי קלאסי.'),
        S('mixolydian', 'מתאים לאקורד D הדומיננטי.'),
      ],
      tips: ['נסה משפטים קצרים עם תנועה בעיקר בין תווי האקורד.'],
      src: 'מבנה אקורדים נפוץ ומוכר. בדוק באוזן מול ההקלטה.',
    },
    {
      id: 'blowin-in-the-wind', artist: 'Bob Dylan', artistHe: 'בוב דילן', title: "Blowin' in the Wind", titleHe: 'בלואינג אין דה ווינד',
      alias: ['dylan', 'דילן', 'blowing in the wind'],
      key: { root: 'D', mode: 'major' }, conf: 'high', chords: ['D', 'G', 'D', 'A'],
      scales: [
        S('majorPent', 'מתאים למלודיה העממית.'),
        S('major', 'כולל את כל האקורדים.'),
      ],
      tips: ['שיר פשוט שמתאים לפריטת אצבעות איטית על האקורדים.'],
      src: 'מבנה אקורדים נפוץ ומוכר. בדוק באוזן מול ההקלטה.',
    },
    {
      id: 'hallelujah', artist: 'Leonard Cohen', artistHe: 'לאונרד כהן', title: 'Hallelujah', titleHe: 'הללויה',
      alias: ['cohen', 'כהן', 'jeff buckley'],
      key: { root: 'C', mode: 'major' }, conf: 'high', chords: ['C', 'Am', 'C', 'Am', 'F', 'G', 'C', 'G'],
      scales: [
        S('majorPent', 'מלודי ובטוח.'),
        S('major', 'כולל את כל האקורדים. האקורד E7 בגשר מוסיף סול דיאז.'),
      ],
      tips: ['מקצב 6/8: נסה לנגן שני תווים בכל פעימה ולתת לתווים הארוכים לנשום.'],
      src: 'מבנה אקורדים נפוץ ומוכר. בדוק באוזן מול ההקלטה.',
    },
    {
      id: 'watchtower', artist: 'Bob Dylan / Jimi Hendrix', artistHe: 'דילן / הנדריקס', title: 'All Along the Watchtower', titleHe: 'אול אלונג דה וואצ׳טאוור',
      alias: ['dylan', 'hendrix', 'watchtower', 'הנדריקס', 'דילן'],
      key: { root: 'A', mode: 'minor' }, conf: 'high', chords: ['Am', 'G', 'F', 'G'],
      scales: [
        S('minorPent', 'הסולם הקלאסי לסולואים בגרסת הנדריקס.'),
        S('naturalMinor', 'כולל את F, שאינו בפנטטוני.'),
      ],
      tips: ['ארבעה אקורדים בלבד, ואותו רצף מסתובב כל השיר. זה בדיוק מה שצריך כדי להתמקד באלתור.'],
      src: 'מבנה אקורדים נפוץ ומוכר (i bVII bVI bVII).',
    },
    {
      id: 'zombie', artist: 'The Cranberries', artistHe: 'הקרנברייז', title: 'Zombie', titleHe: 'זומבי',
      alias: ['cranberries'],
      key: { root: 'E', mode: 'minor' }, conf: 'high', chords: ['Em', 'C', 'G', 'D'],
      scales: [
        S('minorPent', 'הסולם הבטוח.'),
        S('naturalMinor', 'כולל גם את C, שאינו בפנטטוני.'),
      ],
      tips: ['נסה לנגן בעוצמה כשהפזמון מגיע ולהשתיק כשהבית חוזר. הדינמיקה עושה חצי מהעבודה.'],
      src: 'מבנה אקורדים נפוץ ומוכר (i VI III VII).',
    },
    {
      id: 'wonderful-tonight', artist: 'Eric Clapton', artistHe: 'אריק קלפטון', title: 'Wonderful Tonight', titleHe: 'וונדרפול טונייט',
      alias: ['clapton', 'קלפטון'],
      key: { root: 'G', mode: 'major' }, conf: 'high', chords: ['G', 'D', 'C', 'D'],
      scales: [
        S('majorPent', 'מתאים למשפטים איטיים ורכים.'),
        S('major', 'כולל את כל האקורדים.'),
      ],
      tips: ['בלדה איטית: תן לכל תו זמן, והוסף ויברטו על תווים ארוכים.'],
      src: 'מבנה אקורדים נפוץ ומוכר. בדוק באוזן מול ההקלטה.',
    },
    {
      id: 'radiohead-creep', artist: 'Radiohead', artistHe: 'רדיוהד', title: 'Creep', titleHe: 'קריפ',
      alias: ['radiohead'],
      key: { root: 'G', mode: 'major' }, conf: 'medium', chords: ['G', 'B', 'C', 'Cm'],
      scales: [
        S('majorPent', 'צליל פתוח מעל האקורדים המז׳וריים.'),
        S('major', 'כולל את G, C ו-B כשורשים.'),
        S('minorPent', 'האקורד Cm שאול ממינור: הסולם של סול מינור פנטטוני מתאים מעליו.'),
      ],
      tips: ['האקורד Cm נותן את הרגע העצוב: נסה לנחות על המי במול (Eb) כשהוא מגיע.'],
      src: 'MusicRadar ואתרי אקורדים: המקורות מסכימים על G, B, C, Cm אבל חלוקים בשימוש בקאפו. בדוק באוזן.',
    },
    {
      id: 'wmggw', artist: 'The Beatles', artistHe: 'הביטלס', title: 'While My Guitar Gently Weeps', titleHe: 'וואיל מיי גיטאר ג׳נטלי ויפס',
      alias: ['beatles', 'ביטלס', 'clapton', 'harrison'],
      key: { root: 'A', mode: 'minor' }, conf: 'medium', chords: ['Am', 'G', 'D', 'E'],
      scales: [
        S('minorPent', 'התווים שרוב הנגנים משתמשים בהם בסגנון הסולו. השלישית הקטנה (דו) מגדירה את הצליל.'),
        S('blues', 'תו המתח לצבע בלוזי.'),
        S('naturalMinor', 'כולל את כל התווים מחוץ לפנטטוני.'),
      ],
      tips: ['הסולם נבחר כהמלצה לאלתור, לא כתמלול. אנליזות מצביעות על לה מינור עם יציאות ללה מז׳ור בפזמון.'],
      src: 'MusicRadar ואנליזה אקדמית: לה מינור, עם D שלא שייך למפתח. המקורות אינם מפרטים את סולם הסולו.',
    },
    {
      id: 'crazy-train', artist: 'Ozzy Osbourne', artistHe: 'אוזי אוסבורן', title: 'Crazy Train', titleHe: 'קרייזי טריין',
      alias: ['ozzy', 'אוזי', 'randy rhoads', 'ראנדי רודס'],
      key: { root: 'F#', mode: 'minor' }, conf: 'medium', chords: [],
      scales: [
        S('minorPent', 'משפטים הבסיס של הסולו, לפי Lick Library.'),
        S('naturalMinor', 'הסולם שעליו נבנית התחלת הסולו.'),
        S('harmonicMinor', 'רמזים של הרמוני מינור לצבע דרמטי.'),
      ],
      tips: ['המפתח פה מינור לא רגיל לרוק כבד. התנוחות נוחות להתחיל מסריג 2.'],
      src: 'Lick Library: פה דיאז מינור. מקור אחד אחר טוען לה מינור, ולכן ודאות בינונית. הכיוון של ההקלטה לא אומת: בדוק באוזן.',
    },
    {
      id: 'srv-pride-joy', artist: 'Stevie Ray Vaughan', artistHe: 'סטיבי ריי ווהן', title: 'Pride and Joy', titleHe: 'פרייד אנד ג׳וי',
      alias: ['srv', 'stevie ray', 'ווהן', 'texas shuffle'],
      key: { root: 'E', mode: 'major' }, tuning: 'halfDown', conf: 'high', drums: 'shuffle', bpm: 100,
      chords: ['E7', 'E7', 'E7', 'E7', 'A7', 'A7', 'E7', 'E7', 'B7', 'A7', 'E7', 'B7'],
      scales: [
        S('minorPent', 'משפטי הלידים מבוססים על מי מינור פנטטוני.'),
        S('blues', 'עם תו המתח לצליל בלוזי.'),
        S('majorPent', 'לצליל מתוק יותר מעל E7.'),
      ],
      tips: ['שאפל טקסני: הקצב מבוסס על צירופים של אקורד קצר ואקורד פתוח, בפעימות החלשות.'],
      src: 'Guitar World ו-Guitar Player: בלוז 12 תיבות במי, מכוון חצי טון למטה. הצורות על הצוואר נשארות כמו שכתוב.',
    },
  ];

  // רמת קושי: 1 קל (שלושה אקורדים פשוטים), 2 בינוני, 3 מתקדם
  const LEVEL = {
    1: ['dylan-knock','acdc-hth','dp-smoke','ws-sna','blues-12-e','blues-12-a','lynyrd-sha','rhcp-calif','stand-by-me','three-little-birds','wild-thing','louie-louie','twist-and-shout','la-bamba','brown-eyed-girl','let-it-be','ring-of-fire','blowin-in-the-wind','hallelujah'],
    2: ['gnr-dont-cry','gnr-sweet-child','acdc-bib','animals-rising','hendrix-haze','hendrix-heyjoe','nirvana-slts','pf-wywh','met-nem','bb-thrill','chuck-johnny','lz-whole-lotta','aero-walk-this-way','aero-sweet-emotion','met-sandman','pantera-cfh','watchtower','zombie','wonderful-tonight','radiohead-creep','santana-bmw'],
    3: ['met-puppets','pantera-walk','lz-stairway','pf-numb','clapton-layla','ds-sultans','eagles-hotel','wmggw','crazy-train','srv-pride-joy'],
  };
  for (const [lv, ids] of Object.entries(LEVEL)) for (const id of ids) { const sg = SONGS.find((x) => x.id === id); if (sg) sg.level = Number(lv); }
  SONGS.sort((a, b) => a.level - b.level);

  // חיפוש לפי שם שיר או להקה, בעברית ובאנגלית. כל מילה בשאילתה צריכה להופיע בפרטי השיר.
  const norm = (t) => String(t).toLowerCase().replace(/[׳'’`"״.,!?()_/\\&-]/g, ' ').replace(/\s+/g, ' ').trim();
  const hay = (s) => norm([s.artist, s.artistHe, s.title, s.titleHe, ...(s.alias || [])].join(' '));
  Object.defineProperty(SONGS, 'search', {
    value: (list, q) => {
      const tokens = norm(q).split(' ').filter(Boolean);
      return tokens.length
        ? list.filter((s) => {
            const h = hay(s);
            const compact = h.replace(/ /g, '');
            return tokens.every((t) => h.includes(t) || compact.includes(t));
          })
        : list;
    },
  });

  if (typeof module !== 'undefined' && module.exports) module.exports = SONGS;
  else root.GUITAR_SONGS = SONGS;
})(typeof window !== 'undefined' ? window : globalThis);
