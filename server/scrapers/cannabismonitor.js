// scraper עבור קנאביס מוניטור.
// ביקורות ודירוגי מטופלים.
// שים לב: מבנה ה-HTML של האתר עדיין לא נבדק (האתר לא היה נגיש מסביבת הפיתוח).
// ברירת המחדל היא חילוץ גנרי (JSON-LD + תוויות טקסט). אחרי שמירת דף אמיתי
// עם "npm run save-fixture -- cannabismonitor <url>", יש למלא כאן סלקטורים מדויקים.
import { defineSite } from './site.js';

export default defineSite({
  id: 'cannabismonitor',
  name: 'קנאביס מוניטור',
  notes: 'ביקורות ודירוגי מטופלים.',
  selectors: {
    // name: 'h1.strain-title',
    // type: '.strain-type',
    // reviews: { item: '.review', text: '.review-body', rating: '.stars', positive: '.pros li', negative: '.cons li' },
  },
  resultLinkSelector: null,
});
