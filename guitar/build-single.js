// בונה קובץ HTML יחיד (CSS ו-JS מוטמעים) לפרסום כארטיפקט: node guitar/build-single.js <out.html>
const fs = require('fs');
const path = require('path');
const here = __dirname;
const read = (f) => fs.readFileSync(path.join(here, f), 'utf8');
const html = read('index.html');
const body = html.match(/<body>([\s\S]*?)<script src="exercises\.js">/)[1];
const out = `<title>תרגילי גיטרה</title>\n<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Heebo:wght@400;500;700;800&display=swap">\n<script>document.documentElement.setAttribute('dir', 'rtl'); document.documentElement.setAttribute('lang', 'he');</script>\n<style>\n${read('style.css')}\n</style>\n<div dir="rtl" lang="he">\n${body}</div>\n<script>\n${read('exercises.js')}\n${read('fun.js')}\n${read('songs.js')}\n${read('tuner.js')}\n${read('rhythm.js')}\n${read('riffs.js')}\n${read('sync.js')}\n${read('app.js')}\n</script>\n`;
const target = process.argv[2];
if (!target) throw new Error('שימוש: node guitar/build-single.js <out.html>');
fs.writeFileSync(target, out);
console.log('נכתב', target, out.length, 'בתים');
