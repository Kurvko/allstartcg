// Télécharge les visuels officiels des boosters (images produit TCGplayer via TCGCSV),
// retire le fond blanc, et les enregistre dans public/packs/. Écrit public/data/packs.json.
// Usage : npm run packs              (tous les sets)
//         npm run packs -- --missing (seulement les sets sans visuel)
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { allSets } from '../public/js/catalog.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_JSON = join(ROOT, 'public', 'data', 'packs.json');
const MAX_ARTS = 4; // illustrations différentes gardées par set

const CATEGORY = { pokemon: 3, magic: 1, yugioh: 2, lorcana: 71, onepiece: 68, dragonball: 80, riftbound: 89 };

// Sets dont le nom diffère trop entre la source des cartes et TCGplayer : id -> nom exact du groupe TCGplayer.
const GROUP_NAME = {
  'pokemon/base1': 'Base Set', 'pokemon/sm1': 'SM Base Set', 'pokemon/xy1': 'XY Base Set',
  'pokemon/swsh1': 'SWSH01: Sword & Shield Base Set', 'pokemon/sv01': 'SV01: Scarlet & Violet Base Set',
  'pokemon/bw1': 'Black and White', 'pokemon/dp1': 'Diamond and Pearl', 'pokemon/30th': 'ME: 30th Celebration',
  'pokemon/swsh12.5': 'SWSH: Crown Zenith', 'pokemon/sv03.5': 'SV: Scarlet & Violet 151', 'pokemon/exu': 'EX Unseen Forces', 'pokemon/swsh10.5': 'Pokemon GO', 'pokemon/ecard1': 'Expedition',
  'magic/lea': 'Alpha Edition', 'magic/blb': 'Bloomburrow',
  'yugioh/LOB': 'The Legend of Blue Eyes White Dragon', 'yugioh/MRD': 'Metal Raiders',
  'lorcana/1': 'The First Chapter',
};

const HEADERS = { 'User-Agent': 'AllStarTCG/0.1 (projet perso)', Accept: 'application/json' };
const getJson = async url => {
  for (let i = 1; ; i++) {
    try {
      const res = await fetch(url, { headers: HEADERS });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      if (i >= 3) throw new Error(`${url} -> ${err.message}`);
      await new Promise(r => setTimeout(r, 600 * i));
    }
  }
};

const norm = s => s.toLowerCase()
  .replace(/&/g, 'and').replace(/é/g, 'e')
  .replace(/^(sv|swsh|sm|xy|me|bw)\d*\s*[:-]\s*/, '')
  .replace(/^ex\s+/, '').replace(/\bbase set\b/, '').replace(/^the\s+/, '')
  .replace(/[^a-z0-9]+/g, ' ').trim();

// Noms anglais des sets Pokémon (le catalogue est en français).
async function pokemonEnglishNames() {
  const list = await getJson('https://api.tcgdex.net/v2/en/sets');
  return Object.fromEntries(list.map(s => [s.id, s.name]));
}

function findGroup(groups, key, set, enNames) {
  const exact = GROUP_NAME[key];
  if (exact) return groups.find(g => g.name === exact);
  if (set.tcgGroup) return groups.find(g => g.groupId === set.tcgGroup);
  const wanted = norm(key.startsWith('pokemon/') ? enNames[set.id] ?? set.name : set.apiName ?? set.name);
  return groups.find(g => norm(g.name) === wanted);
}

const PACK_RE = /booster\b.*\bpack/i;
const NOT_PACK_RE = /code card|case|box|display|bundle|blister|lot of|jumbo|collector|- set booster|draft|dash pack|mini|3-card|promo|fun pack|preview|sampling|prerelease|classic collection|\bx\d+\b|\(\d+ packs?\)/i;

function pickPackProducts(products) {
  const packs = products.filter(p => PACK_RE.test(p.name) && !NOT_PACK_RE.test(p.name) && p.imageCount > 0);
  // Les versions « sleeved » (sous blister cartonné) ne servent qu'à défaut de booster simple.
  const plain = packs.filter(p => !/sleeved/i.test(p.name));
  return (plain.length ? plain : packs).slice(0, MAX_ARTS);
}

/**
 * Retire le fond blanc autour du booster : remplissage depuis les bords sur les pixels quasi blancs
 * (coins, dents de la soudure, marges). Si le remplissage « fuit » dans le visuel (booster au dessin clair
 * qui touche le bord, ex. 151), on recommence avec un seuil plus strict, puis on abandonne le détourage.
 */
async function cutout(buffer) {
  const { data, info } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: w, height: h } = info;

  for (const min of [238, 248]) {
    const white = p => {
      const r = data[p * 4], g = data[p * 4 + 1], b = data[p * 4 + 2];
      return r > min && g > min && b > min && Math.max(r, g, b) - Math.min(r, g, b) < 14;
    };
    const removed = new Uint8Array(w * h);
    const stack = [];
    const push = p => { if (!removed[p] && white(p)) { removed[p] = 1; stack.push(p); } };
    for (let x = 0; x < w; x++) { push(x); push((h - 1) * w + x); }
    for (let y = 0; y < h; y++) { push(y * w); push(y * w + w - 1); }
    while (stack.length) {
      const p = stack.pop();
      const x = p % w;
      if (x > 0) push(p - 1);
      if (x < w - 1) push(p + 1);
      if (p >= w) push(p - w);
      if (p < w * (h - 1)) push(p + w);
    }

    // Boîte du booster (pixels gardés) puis contrôle de fuite au centre de cette boîte.
    let x0 = w, x1 = 0, y0 = h, y1 = 0;
    for (let p = 0; p < w * h; p++) if (!removed[p]) {
      const x = p % w, y = (p / w) | 0;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
    if (x1 <= x0 || y1 <= y0) continue;
    const bw = x1 - x0, bh = y1 - y0;
    let leak = 0, inner = 0;
    for (let y = y0 + bh * 0.12 | 0; y < y1 - bh * 0.12; y++) for (let x = x0 + bw * 0.12 | 0; x < x1 - bw * 0.12; x++) {
      inner++; leak += removed[y * w + x];
    }
    if (leak / inner > 0.003) continue;

    for (let p = 0; p < w * h; p++) {
      if (removed[p]) { data[p * 4 + 3] = 0; continue; }
      // Bord adouci : pixel clair voisin du fond -> semi-transparent.
      const x = p % w;
      const near = (x > 0 && removed[p - 1]) || (x < w - 1 && removed[p + 1]) || (p >= w && removed[p - w]) || (p < w * (h - 1) && removed[p + w]);
      if (near && data[p * 4] > 200 && data[p * 4 + 1] > 200 && data[p * 4 + 2] > 200) data[p * 4 + 3] = 110;
    }
    break;
  }
  return sharp(data, { raw: { width: w, height: h, channels: 4 } })
    .trim({ threshold: 5 })
    .resize({ height: 720, withoutEnlargement: true })
    .webp({ quality: 82, alphaQuality: 90 })
    .toBuffer();
}

// ---------- Main ----------

const missingOnly = process.argv.includes('--missing');
const only = process.argv.slice(2).filter(a => !a.startsWith('--')); // ex. pokemon/me05 onepiece
let mapping = {};
try { mapping = JSON.parse(await readFile(OUT_JSON, 'utf8')); } catch { /* premier lancement */ }

const enNames = await pokemonEnglishNames();
const groupsByCat = {};
const misses = [];

for (const { game, set, key } of allSets()) {
  if (game.sport) continue; // boosters sport dessinés par make-sport-art.mjs
  if (missingOnly && mapping[key]?.length) continue;
  if (only.length && !only.some(o => key === o || key.startsWith(o + '/'))) continue;
  const cat = set.category ?? CATEGORY[game.id];
  groupsByCat[cat] ??= (await getJson(`https://tcgcsv.com/tcgplayer/${cat}/groups`)).results;
  const group = findGroup(groupsByCat[cat], key, set, enNames);
  if (!group) { misses.push(`${key} (groupe introuvable)`); continue; }

  const { results: products } = await getJson(`https://tcgcsv.com/tcgplayer/${cat}/${group.groupId}/products`);
  const picks = pickPackProducts(products);
  if (!picks.length) { misses.push(`${key} (aucun booster dans « ${group.name} »)`); continue; }

  const files = [];
  for (const [i, p] of picks.entries()) {
    try {
      const res = await fetch(`https://tcgplayer-cdn.tcgplayer.com/product/${p.productId}_in_1000x1000.jpg`, { headers: { 'User-Agent': HEADERS['User-Agent'] } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const webp = await cutout(Buffer.from(await res.arrayBuffer()));
      const rel = `packs/${game.id}/${set.id}-${i}.webp`;
      await mkdir(dirname(join(ROOT, 'public', rel)), { recursive: true });
      await writeFile(join(ROOT, 'public', rel), webp);
      files.push(rel);
    } catch (err) {
      console.log(`  ${key} : image ${p.productId} ignorée (${err.message})`);
    }
  }
  if (files.length) mapping[key] = files;
  console.log(`${key.padEnd(22)} ${files.length} visuel(s) — ${group.name} : ${picks.map(p => p.name).join(' | ')}`);
}

await writeFile(OUT_JSON, JSON.stringify(mapping, null, 1));
console.log(`\npacks.json : ${Object.keys(mapping).length} sets avec visuel`);
if (misses.length) console.log(`Sans visuel (${misses.length}) :\n  ${misses.join('\n  ')}`);
