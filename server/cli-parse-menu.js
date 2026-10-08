// שימוש: npm run parse-menu -- <file.pdf>  → מדפיס JSON של התפרחות
import fs from 'node:fs';
import { parseMenuPdf } from './menu/parsePdf.js';

const file = process.argv[2];
if (!file) {
  console.error('שימוש: npm run parse-menu -- <menu.pdf>');
  process.exit(1);
}
const result = await parseMenuPdf(fs.readFileSync(file));
console.log(JSON.stringify(result, null, 1));
