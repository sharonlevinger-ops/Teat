# העלאת האתר לשרת אמיתי (מדריך צעד אחר צעד)

המטרה: כתובת https שנפתחת מכל מכשיר, שחברים יכולים להיכנס אליה, ושההתקדמות נשמרת בה.
האתר כולל שרת קטן (`guitar/server.js`) שמגיש את האתר וגם שומר התקדמות לכל משתמש (שם + קוד סודי).
**כתובת https חובה** כדי שהמיקרופון (כוונון והקלטה) יעבוד בדפדפן. כל השירותים למטה נותנים https אוטומטית.

## אפשרות א׳: Render (מומלץ, הכי פשוט, כ-7 דולר לחודש)
צריך דיסק קבוע כדי שההתקדמות לא תימחק, והדיסק זמין רק בתוכנית בתשלום.

1. ודא שהקוד נמצא ב-GitHub וממוזג ל-`main` (או בחר בשלב 4 את הענף `claude/new-session-ujlw3h`).
2. היכנס ל-https://render.com והירשם עם חשבון GitHub.
3. לחץ **New +** ← **Web Service** ← חבר את המאגר `Teat`.
4. מלא: **Root Directory** = `guitar` · **Runtime** = Node · **Build Command** = (ריק) · **Start Command** = `node server.js` · **Instance Type** = Starter.
5. תחת **Advanced** ← **Add Disk**: Name `guitar-data`, Mount Path `/var/data`, Size 1GB.
6. תחת **Environment** הוסף `DATA_DIR` = `/var/data`. אופציונלי: `SITE_PASSWORD` = סיסמה אחת לכל האתר (ראה "מי נכנס").
7. **Create Web Service**. אחרי כמה דקות מקבלים כתובת כמו `https://guitar-xxxx.onrender.com`. זה הכול.

(הקובץ `guitar/render.yaml` מכיל את אותן הגדרות, ואפשר להשתמש ב-New ← Blueprint.)

## אפשרות ב׳: Fly.io (דומה, זול)
1. התקן `flyctl` והרץ `fly auth signup`.
2. בתיקיית `guitar`: `fly launch` (הוא יזהה את ה-Dockerfile), אשר.
3. `fly volumes create data --size 1` ואז הוסף ב-`fly.toml`: `[mounts] source="data" destination="/data"`.
4. `fly deploy`. הכתובת: `https://<שם>.fly.dev`.

## אפשרות ג׳: חינם לגמרי, בלי שרת (Cloudflare Pages / Netlify / GitHub Pages)
מעלים את תיקיית `guitar` כקבצים סטטיים. הכול עובד (כולל מיקרופון, כי יש https), חוץ מהסנכרון האוטומטי.
את ההתקדמות מעבירים בין מכשירים ידנית בלשונית "חשבון וסנכרון" (קוד להעתקה).
- **Cloudflare Pages**: Create project ← Connect to Git ← בחר מאגר ← Build command ריק ← Output directory `guitar`.
- **Netlify**: Add new site ← Import from Git ← Publish directory `guitar`.

## מי נכנס לאתר
- **כל מי שיש לו את הכתובת**: ברירת המחדל. זה לא סוד אמיתי.
- **סיסמה אחת לכל האתר**: הגדר `SITE_PASSWORD` (Render/Fly). הדפדפן ישאל שם וסיסמה (השם יכול להיות כל דבר). שתף את הסיסמה רק עם החברים.
- **ההתקדמות של כל אחד**: כל חבר יוצר לעצמו שם וקוד סודי בלשונית "חשבון וסנכרון", וההתקדמות שלו נפרדת משלך.

## כתובת משלך (אופציונלי)
קנה דומיין. ב-Render: Settings ← Custom Domains ← הוסף, והעתק את רשומת ה-CNAME שהוא מציג למקום שבו קנית את הדומיין. https מתחדש אוטומטית.

## גיבוי ותחזוקה
- הנתונים נשמרים בקובץ אחד: `$DATA_DIR/profiles.json`. הורד אותו מדי פעם כגיבוי.
- קודים סודיים נשמרים מוצפנים (scrypt). אי אפשר לשחזר קוד שנשכח.
- עדכון האתר: מעלים קוד ל-GitHub ו-Render מפרסם אוטומטית.

## הרצה מקומית לבדיקה
`cd guitar && node server.js` ואז http://localhost:3002 (המיקרופון עובד גם ב-localhost).
