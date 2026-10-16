// Dessine les boosters et le dos des cartes sport (pas de visuels officiels : ce sont des cartes du site).
// Écrit public/packs/<sport>/<set>-0.webp, public/backs/<sport>.webp et met à jour public/data/packs.json.
// Usage : npm run sports (lancé après la récupération des effectifs)
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { GAMES } from '../public/js/catalog.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FONT = "'Arial Black', 'Segoe UI Black', Impact, sans-serif";

const BALL = {
  basketball: `<g transform="translate(200 330)"><circle r="110" fill="#f58426" stroke="#3b1d05" stroke-width="7"/>
    <path d="M-110 0H110M0-110V110M-78-78C-30-30-30 30-78 78M78-78C30-30 30 30 78 78" fill="none" stroke="#3b1d05" stroke-width="7"/></g>`,
  soccer: `<g transform="translate(200 330)"><circle r="110" fill="#fff" stroke="#111" stroke-width="6"/>
    <path d="M0-38L36-12L22 31H-22L-36-12Z" fill="#111"/>
    <path d="M0-38V-104M36-12L98-34M22 31L60 86M-22 31L-60 86M-36-12L-98-34" stroke="#111" stroke-width="6"/>
    <path d="M-30-104L0-112L30-104L0-90Z M84-62L106-30L96-4L80-30Z M84 62L60 92L40 94L56 70Z M-84 62L-60 92L-40 94L-56 70Z M-84-62L-106-30L-96-4L-80-30Z" fill="#111"/></g>`,
};

const crimp = (y, flip) => {
  let d = `M0 ${y}`;
  for (let x = 0; x <= 400; x += 16) d += ` L${x + 8} ${y + (flip ? -10 : 10)} L${x + 16} ${y}`;
  return `<path d="${d} V${flip ? 720 : 0} H0Z" fill="#ffffff22"/>`;
};

function packSvg(game, set) {
  const [title, season] = set.name.split(/ (?=\d{4}-\d{2}$)/);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="720" viewBox="0 0 400 720">
    <defs>
      <linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${game.color}"/><stop offset=".55" stop-color="${game.accent}"/><stop offset="1" stop-color="#05060a"/></linearGradient>
      <linearGradient id="foil" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity=".35"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
    </defs>
    <rect width="400" height="720" rx="14" fill="url(#g)"/>
    <path d="M0 520L400 380V470L0 610Z" fill="#ffffff14"/><path d="M0 170L400 60V110L0 220Z" fill="#ffffff10"/>
    ${crimp(36, false)}${crimp(684, true)}
    <text x="200" y="104" text-anchor="middle" font-family="${FONT}" font-size="30" fill="#fff" letter-spacing="6">ALLSTAR</text>
    <text x="200" y="136" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-size="17" font-weight="700" fill="#ffffffcc" letter-spacing="9">SPORT CARDS</text>
    ${BALL[game.id]}
    <text x="200" y="${title.length > 10 ? 520 : 528}" text-anchor="middle" font-family="${FONT}" font-size="${title.length > 10 ? 34 : 62}" fill="#fff" stroke="#00000055" stroke-width="2">${title.toUpperCase()}</text>
    <text x="200" y="572" text-anchor="middle" font-family="${FONT}" font-size="34" fill="#ffd36b">${season ?? ''}</text>
    <rect x="120" y="606" width="160" height="40" rx="20" fill="#000a"/>
    <text x="200" y="633" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-size="18" font-weight="700" fill="#fff">${set.slots.length} CARTES</text>
    <rect width="400" height="720" rx="14" fill="url(#foil)" opacity=".5"/>
  </svg>`;
}

function backSvg(game) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="500" height="698" viewBox="0 0 500 698">
    <defs><radialGradient id="g" cx=".5" cy=".45" r=".75"><stop offset="0" stop-color="${game.accent}"/><stop offset="1" stop-color="#05060a"/></radialGradient></defs>
    <rect width="500" height="698" fill="#f4f4f4"/>
    <rect x="18" y="18" width="464" height="662" rx="18" fill="url(#g)"/>
    <rect x="34" y="34" width="432" height="630" rx="12" fill="none" stroke="${game.color}" stroke-width="5"/>
    <g transform="translate(50 30) scale(1)">${BALL[game.id]}</g>
    <text x="250" y="560" text-anchor="middle" font-family="${FONT}" font-size="54" fill="#fff" letter-spacing="6">ALLSTAR</text>
    <text x="250" y="600" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-size="24" font-weight="700" fill="${game.color}" letter-spacing="10">SPORT CARDS</text>
  </svg>`;
}

const packsFile = join(ROOT, 'public', 'data', 'packs.json');
const packs = JSON.parse(await readFile(packsFile, 'utf8'));
for (const game of GAMES.filter(g => g.sport)) {
  await mkdir(join(ROOT, 'public', 'packs', game.id), { recursive: true });
  for (const set of game.sets) {
    const rel = `packs/${game.id}/${set.id}-0.webp`;
    await sharp(Buffer.from(packSvg(game, set))).webp({ quality: 88 }).toFile(join(ROOT, 'public', rel));
    packs[`${game.id}/${set.id}`] = [rel];
    console.log(rel);
  }
  await sharp(Buffer.from(backSvg(game))).webp({ quality: 88 }).toFile(join(ROOT, 'public', 'backs', `${game.id}.webp`));
  console.log(`backs/${game.id}.webp`);
}
await writeFile(packsFile, JSON.stringify(packs, null, 1));
