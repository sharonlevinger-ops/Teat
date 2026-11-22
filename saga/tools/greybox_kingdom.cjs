// Prototype art for table 2 "Forest Kingdom" until the real painting arrives.
// Keeps the painted frame, rails and lower playfield of table 1 (shared by both tables), softens the upper
// playfield into a forest-floor backdrop, and draws every Kingdom element exactly where the physics has it
// (walls, ramps, targets come straight from js/core/table-kingdom.js).
// Usage: node saga/tools/greybox_kingdom.cjs   -> saga/art/kingdom/playfield.jpg
const path = require('path'), fs = require('fs');
const { chromium } = require('playwright');
const ROOT = path.resolve(__dirname, '..');

(async () => {
  const { buildKingdomTable, KINGDOM: K } = await import(path.join(ROOT, 'js/core/table-kingdom.js'));
  const { flatToArt } = await import(path.join(ROOT, 'js/core/artmap.js'));
  const t = buildKingdomTable();
  const A = (p) => flatToArt(p[0], p[1]).map((v) => +v.toFixed(1));
  const line = (pts) => pts.map((p, i) => `${i ? 'L' : 'M'}${p[0]} ${p[1]}`).join(' ');
  const boundary = t.walls[0].pts.map(A);
  const CUT = 1545; // below this the table-1 painting is used as is (slings, lanes, flipper area)
  const clip = [...boundary.filter((p) => p[1] <= CUT + 200), [1245, CUT], [96, CUT]];
  const rampA = t.ramps.rampA.path.pts.map(A), rampB = t.ramps.rampB.path.pts.map(A);
  const tw = t.decor.tower, tc = A([tw.x, tw.y]), tr = A([tw.x + tw.r, tw.y])[0] - tc[0];
  const shields = K.shields;
  const pf = 'data:image/jpeg;base64,' + fs.readFileSync(path.join(ROOT, 'art/playfield.jpg')).toString('base64');
  const mush = (id, [x, y], n, c1, c2) => `
    <g transform="translate(${x} ${y})">
      <ellipse cx="6" cy="58" rx="58" ry="16" fill="#000" opacity=".45" filter="url(#soft)"/>
      <rect x="-15" y="0" width="30" height="58" rx="10" fill="url(#stem)"/>
      <path d="M-56 8 Q-58 -52 0 -58 Q58 -52 56 8 Q0 26 -56 8 Z" fill="url(#${id})" stroke="#2a1608" stroke-width="3"/>
      <ellipse cx="-18" cy="-34" rx="14" ry="8" fill="#fff" opacity=".55"/><ellipse cx="22" cy="-22" rx="9" ry="6" fill="#fff" opacity=".45"/>
      <text x="0" y="-6" text-anchor="middle" style="font:700 40px Georgia;fill:#fff8e0;paint-order:stroke;stroke:#3a2208;stroke-width:5px">${n}</text>
      <defs><radialGradient id="${id}" cx="40%" cy="30%" r="80%"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></radialGradient></defs>
    </g>`;
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;background:#000}</style></head><body>
<svg xmlns="http://www.w3.org/2000/svg" width="1284" height="2281" viewBox="0 0 1284 2281">
<defs>
  <filter id="blur" x="-5%" y="-5%" width="110%" height="110%"><feGaussianBlur stdDeviation="14"/></filter>
  <filter id="soft"><feGaussianBlur stdDeviation="6"/></filter>
  <filter id="glow"><feGaussianBlur stdDeviation="8" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
  <clipPath id="upper"><path d="${line(clip)} Z"/></clipPath>
  <linearGradient id="fadeMask" x1="0" x2="0" gradientUnits="userSpaceOnUse" y1="${CUT - 170}" y2="${CUT}"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#000"/></linearGradient>
  <mask id="fade"><rect x="0" y="0" width="1284" height="2281" fill="url(#fadeMask)"/></mask>
  <linearGradient id="stone" x1="0" x2="1"><stop offset="0" stop-color="#8f877a"/><stop offset=".45" stop-color="#e6dfd1"/><stop offset="1" stop-color="#7d7568"/></linearGradient>
  <linearGradient id="stem" x1="0" x2="1"><stop offset="0" stop-color="#d9cfb8"/><stop offset=".5" stop-color="#fff8e8"/><stop offset="1" stop-color="#b8ad94"/></linearGradient>
  <linearGradient id="roofT" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#b070d8"/><stop offset="1" stop-color="#5a2a80"/></linearGradient>
  <linearGradient id="roofC" x1="0" x2="1"><stop offset="0" stop-color="#2a5a98"/><stop offset=".5" stop-color="#4a88d0"/><stop offset="1" stop-color="#1e4478"/></linearGradient>
  <linearGradient id="glass" x1="0" x2="1"><stop offset="0" stop-color="#d8fbff" stop-opacity=".75"/><stop offset=".5" stop-color="#9fe6ff" stop-opacity=".35"/><stop offset="1" stop-color="#d8fbff" stop-opacity=".7"/></linearGradient>
  <linearGradient id="hill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#6e5a46"/><stop offset="1" stop-color="#3a2e22"/></linearGradient>
  <radialGradient id="water" cx="50%" cy="40%"><stop offset="0" stop-color="#8ff4ff"/><stop offset="1" stop-color="#11607e"/></radialGradient>
  <linearGradient id="shield" x1="0" x2="1"><stop offset="0" stop-color="#2f5fb8"/><stop offset=".5" stop-color="#5a8ae0"/><stop offset="1" stop-color="#2a4c98"/></linearGradient>
</defs>
<image href="${pf}" x="0" y="0" width="1284" height="2281"/>
<!-- the upper playfield softened into a forest floor -->
<g clip-path="url(#upper)" mask="url(#fade)">
  <image href="${pf}" x="0" y="0" width="1284" height="2281" filter="url(#blur)"/>
  <rect x="0" y="0" width="1284" height="${CUT}" fill="#0c1a08" opacity=".45"/>
</g>
<!-- magic pool -->
<ellipse cx="630" cy="1410" rx="214" ry="98" fill="#4a5440" stroke="#2a3020" stroke-width="10"/>
<ellipse cx="630" cy="1416" rx="176" ry="72" fill="url(#water)"/>
<!-- golden wire ramp round the tower (drawn under the tower top) -->
<path d="${line(rampB)}" fill="none" stroke="#3a2808" stroke-width="30" stroke-linecap="round" opacity=".55" filter="url(#soft)"/>
<path d="${line(rampB)}" fill="none" stroke="#f0c048" stroke-width="7" stroke-dasharray="1 0" transform="translate(-9 0)"/>
<path d="${line(rampB)}" fill="none" stroke="#f0c048" stroke-width="7" transform="translate(9 0)"/>
<!-- the dwarves' mine -->
<path d="${line(K.mine)} Q 300 1060 200 1180 Z" fill="url(#hill)" stroke="#241a10" stroke-width="5"/>
<path d="M248 1182 L248 1140 Q296 1100 344 1140 L344 1182 Z" fill="#120c06"/>
<rect x="262" y="1156" width="66" height="30" rx="6" fill="#8a5a2a" stroke="#3a2208" stroke-width="3"/>
<circle cx="276" cy="1160" r="8" fill="#9ff"/><circle cx="296" cy="1155" r="8" fill="#ff8"/><circle cx="314" cy="1161" r="7" fill="#f9f"/>
<circle cx="${K.mineHole[0]}" cy="${K.mineHole[1]}" r="34" fill="#0a0704" stroke="#7a6a4a" stroke-width="9"/>
<!-- the wizard's tower -->
<ellipse cx="${tc[0] + 10}" cy="${tc[1] + tr * 0.9}" rx="${tr * 1.2}" ry="${tr * 0.32}" fill="#000" opacity=".5" filter="url(#soft)"/>
<rect x="${tc[0] - tr * 0.9}" y="${tc[1] - 150}" width="${tr * 1.8}" height="${150 + tr * 0.75}" rx="18" fill="url(#stone)" stroke="#4a443a" stroke-width="4"/>
<path d="M${tc[0] - 28} ${tc[1] + tr * 0.78} L${tc[0] - 28} ${tc[1] + tr * 0.4} Q${tc[0]} ${tc[1] + tr * 0.15} ${tc[0] + 28} ${tc[1] + tr * 0.4} L${tc[0] + 28} ${tc[1] + tr * 0.78} Z" fill="#4a2a10" stroke="#2a1606" stroke-width="4"/>
<rect x="281" y="638" width="38" height="46" rx="16" fill="#ffd36a" filter="url(#glow)"/><rect x="341" y="638" width="38" height="46" rx="16" fill="#ffd36a" filter="url(#glow)"/>
<ellipse cx="${tc[0]}" cy="${tc[1] - 150}" rx="${tr * 1.35}" ry="62" fill="url(#roofT)" stroke="#2a1440" stroke-width="4"/>
<ellipse cx="${tc[0] - 30}" cy="${tc[1] - 172}" rx="22" ry="10" fill="#fff" opacity=".35"/>
<!-- the wizard -->
<g transform="translate(${K.wizard[0]} ${K.wizard[1]})">
  <ellipse cx="6" cy="40" rx="36" ry="10" fill="#000" opacity=".5" filter="url(#soft)"/>
  <path d="M-30 40 L0 -40 L30 40 Z" fill="#3048a8" stroke="#1a2460" stroke-width="3"/><circle cx="0" cy="-50" r="16" fill="#f1d6b8"/>
  <path d="M-12 -40 Q0 -6 12 -40 Z" fill="#eee"/><path d="M-22 -58 L0 -112 L22 -58 Z" fill="#26388a"/>
  <path d="M26 -20 L46 -86" stroke="#c99a48" stroke-width="6"/><circle cx="47" cy="-90" r="10" fill="#fff6b0" filter="url(#glow)"/>
</g>
<!-- mushroom bumpers -->
${mush('m1', K.bumpers.mush1, 1, '#ffb070', '#c0501a')}${mush('m2', K.bumpers.mush2, 2, '#c890ff', '#6a30b0')}${mush('m3', K.bumpers.mush3, 3, '#80ffe8', '#169080')}
<!-- the castle -->
<g>
  <path d="${line(K.castle)} Z" fill="url(#stone)" stroke="#5a5448" stroke-width="5"/>
  <rect x="780" y="600" width="70" height="262" fill="url(#stone)" stroke="#5a5448" stroke-width="4"/><rect x="1010" y="600" width="70" height="262" fill="url(#stone)" stroke="#5a5448" stroke-width="4"/>
  <path d="M770 604 L815 520 L860 604 Z" fill="url(#roofC)"/><path d="M1000 604 L1045 520 L1090 604 Z" fill="url(#roofC)"/>
  <path d="M815 520 L815 484 L845 496 L815 508" fill="#e04040"/><path d="M1045 520 L1045 484 L1075 496 L1045 508" fill="#e04040"/>
  <rect x="868" y="742" width="124" height="14" fill="#9a8f80"/>
  <circle cx="930" cy="716" r="13" fill="#f1d6b8"/><path d="M913 756 L930 724 L947 756 Z" fill="#ff7ac8"/><path d="M921 705 L930 692 L939 705 Z" fill="#ffd36a"/>
  <rect x="870" y="772" width="30" height="34" rx="12" fill="#ffd36a" filter="url(#glow)"/><rect x="960" y="772" width="30" height="34" rx="12" fill="#ffd36a" filter="url(#glow)"/>
  <path d="M${K.gate[0][0]} ${K.gate[0][1]} L${K.gate[0][0]} 812 Q930 770 ${K.gate[1][0]} 812 L${K.gate[1][0]} ${K.gate[1][1]} Z" fill="#5a3410" stroke="#2a1806" stroke-width="5"/>
  <path d="M900 860 L900 800 M930 860 L930 792 M960 860 L960 800" stroke="#2a1806" stroke-width="3"/>
</g>
<!-- crystal ramp over the castle and down the right -->
<path d="${line(rampA)}" fill="none" stroke="#123040" stroke-width="54" stroke-linecap="round" opacity=".45" filter="url(#soft)"/>
<path d="${line(rampA)}" fill="none" stroke="url(#glass)" stroke-width="44" stroke-linecap="round"/>
<path d="${line(rampA)}" fill="none" stroke="#e8c060" stroke-width="4" transform="translate(-22 0)"/><path d="${line(rampA)}" fill="none" stroke="#e8c060" stroke-width="4" transform="translate(22 0)"/>
<!-- the prince (his shields are live drop targets drawn by the game) -->
<g transform="translate(${K.prince[0]} ${K.prince[1]})"><ellipse cx="4" cy="44" rx="26" ry="8" fill="#000" opacity=".5" filter="url(#soft)"/><path d="M-20 44 L0 -6 L20 44 Z" fill="#3060c0" stroke="#1a3070" stroke-width="3"/><circle cx="0" cy="-18" r="14" fill="#f1d6b8"/><path d="M-12 -30 L-8 -42 L0 -34 L8 -42 L12 -30 Z" fill="#ffd36a"/></g>
<!-- mystery hole and fairy spinner -->
<circle cx="${K.scoop[0]}" cy="${K.scoop[1]}" r="36" fill="#0a0704" stroke="#8a7a50" stroke-width="10"/>
<g transform="translate(${K.spinner[0]} ${K.spinner[1]}) rotate(-10)"><rect x="-40" y="-9" width="80" height="18" rx="5" fill="#ffe8f8" stroke="#c070c0" stroke-width="3"/><circle r="6" fill="#c070c0"/></g>
</svg></body></html>`;
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1284, height: 2281 } });
  await p.setContent(html, { waitUntil: 'load' });
  await p.waitForTimeout(300);
  fs.mkdirSync(path.join(ROOT, 'art/kingdom'), { recursive: true });
  const png = await p.screenshot({ type: 'jpeg', quality: 90, clip: { x: 0, y: 0, width: 1284, height: 2281 } });
  fs.writeFileSync(path.join(ROOT, 'art/kingdom/playfield.jpg'), png);
  await b.close();
  console.log('wrote art/kingdom/playfield.jpg');
})().catch((e) => { console.error(e); process.exit(1); });
