// Télécharge les cartes, images et prix de chaque set du catalogue
// et les écrit dans public/data/<jeu>/<set>.json.
// Usage : npm run fetch            (tous les sets)
//         npm run fetch -- pokemon (un seul jeu)
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { allSets, USD_TO_EUR } from '../public/js/catalog.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const HEADERS = { 'User-Agent': 'AllStarTCG/0.1 (projet perso)', Accept: 'application/json' };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const usd = v => (v == null || v === '' || Number(v) <= 0 ? null : +(Number(v) * USD_TO_EUR).toFixed(2));
const eur = v => (v == null || v === '' || Number(v) <= 0 ? null : +Number(v).toFixed(2));
const num = v => (v == null || v === '' || Number.isNaN(parseInt(v, 10)) ? undefined : parseInt(v, 10));
const list = v => (v ? String(v).split(/[;/]/).map(x => x.trim()).filter(x => x && !/^(none|colorless|n\/a)$/i.test(x)) : []);

// Infos de jeu utilisées par les decks : kind (type de carte), colors, cost, power, + stage / basic / extra.
const play = o => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== false && !(Array.isArray(v) && !v.length)));

async function getJson(url, options = {}, tries = 4) {
  for (let i = 1; ; i++) {
    try {
      const res = await fetch(url, { headers: HEADERS, ...options });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      if (i >= tries) throw new Error(`${url} -> ${err.message}`);
      await sleep(500 * i);
    }
  }
}

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: limit }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  }));
  return out;
}

// ---------- Sources ----------

const TCGPLAYER_KEYS = ['holofoil', 'unlimited-holofoil', 'normal', 'unlimited', 'reverse-holofoil'];

async function fromTcgdex(set) {
  const lang = set.lang ?? 'en';
  const brief = await getJson(`https://api.tcgdex.net/v2/${lang}/sets/${set.id}`);
  const cards = await mapLimit(brief.cards, 12, c => getJson(`https://api.tcgdex.net/v2/${lang}/cards/${encodeURIComponent(c.id)}`).catch(() => null));
  return cards.filter(Boolean).map(c => {
    // Pas de scan français pour certains sets anciens : on prend le scan anglais.
    const image = c.image ?? `https://assets.tcgdex.net/en/${set.serie}/${set.id}/${c.localId}`;
    let rarity = c.rarity;
    // Avant Écarlate et Violet, l'API range souvent les rares holo dans « Rare ».
    if (!['sv', 'me'].includes(set.serie) && rarity === 'Rare' && c.variants?.holo && !c.variants?.normal) rarity = 'Rare Holo';
    const tp = c.pricing?.tcgplayer ?? {};
    const tpKey = TCGPLAYER_KEYS.find(k => tp[k]?.marketPrice) ??
      Object.keys(tp).find(k => tp[k]?.marketPrice && !k.startsWith('1st'));
    const cm = c.pricing?.cardmarket;
    return {
      id: c.id,
      name: c.name,
      num: c.localId,
      rarity,
      img: `${image}/low.webp`,
      imgHi: `${image}/high.webp`,
      price: usd(tpKey && tp[tpKey].marketPrice) ?? eur(cm?.trend) ?? eur(cm?.avg),
      play: play({
        kind: c.category === 'Pokémon' ? 'pokemon' : c.category === 'Énergie' ? 'energy' : 'trainer',
        colors: c.types, power: num(c.hp), stage: c.stage, from: c.evolveFrom, dex: c.dexId, sub: c.trainerType,
        basic: c.category === 'Énergie' && c.energyType === 'Normal',
      }),
    };
  });
}

async function fromScryfall(set) {
  const cards = [];
  let url = `https://api.scryfall.com/cards/search?q=${encodeURIComponent(`set:${set.id} is:booster`)}&unique=cards&order=set`;
  while (url) {
    const page = await getJson(url);
    cards.push(...page.data);
    url = page.has_more ? page.next_page : null;
    await sleep(120);
  }
  return cards.map(c => {
    const imgs = c.image_uris ?? c.card_faces?.[0]?.image_uris;
    if (!imgs) return null;
    return {
      id: c.id,
      name: c.printed_name ?? c.name,
      num: c.collector_number,
      rarity: c.rarity,
      img: imgs.normal,
      imgHi: imgs.large,
      price: eur(c.prices.eur) ?? usd(c.prices.usd) ?? eur(c.prices.eur_foil) ?? usd(c.prices.usd_foil),
      play: play({
        kind: /Land/.test(c.type_line) ? 'land' : /Creature/.test(c.type_line) ? 'creature' : 'spell',
        colors: c.color_identity, cost: c.cmc, power: num(c.power), basic: /Basic Land/.test(c.type_line),
      }),
    };
  }).filter(Boolean);
}

async function fromYgoprodeck(set) {
  const { data } = await getJson(`https://db.ygoprodeck.com/api/v7/cardinfo.php?cardset=${encodeURIComponent(set.apiName ?? set.name)}`);
  const naCode = new RegExp(`^${set.id}-(EN)?\\d`);
  return data.map(c => {
    const entries = c.card_sets.filter(s => s.set_name === (set.apiName ?? set.name));
    const entry = entries.find(s => naCode.test(s.set_code)) ?? entries[0];
    if (!entry) return null;
    return {
      id: String(c.id),
      name: c.name,
      num: entry.set_code,
      rarity: entry.set_rarity,
      img: c.card_images[0].image_url_small,
      imgHi: c.card_images[0].image_url,
      price: usd(entry.set_price) ?? usd(c.card_prices?.[0]?.tcgplayer_price),
      play: play({
        kind: c.frameType === 'spell' ? 'spell' : c.frameType === 'trap' ? 'trap' : 'monster',
        colors: c.attribute ? [c.attribute] : [], cost: c.level, power: c.atk,
        extra: /fusion|synchro|xyz|link/.test(c.frameType),
      }),
    };
  }).filter(Boolean).sort((a, b) => a.num.localeCompare(b.num));
}

async function fromLorcast(set) {
  const cards = await getJson(`https://api.lorcast.com/v0/sets/${set.id}/cards`);
  return cards.map(c => ({
    id: c.id,
    name: c.version ? `${c.name} – ${c.version}` : c.name,
    num: c.collector_number,
    rarity: c.rarity,
    img: c.image_uris.digital.normal,
    imgHi: c.image_uris.digital.large,
    price: usd(c.prices?.usd) ?? usd(c.prices?.usd_foil),
    play: play({ kind: (c.type?.[0] ?? 'character').toLowerCase(), colors: c.ink ? [c.ink] : [], cost: c.cost, power: c.strength }),
  }));
}

async function fromOptcg(set) {
  const cards = await getJson(`https://optcgapi.com/api/sets/${set.id}/`);
  const seen = new Set();
  return cards.filter(c => {
    if (seen.has(c.card_image_id)) return false;
    seen.add(c.card_image_id);
    return true;
  }).map(c => ({
    id: c.card_image_id,
    name: c.card_name,
    num: c.card_set_id,
    rarity: /_p\d/.test(c.card_image_id) ? 'AA' : c.rarity,
    img: c.card_image,
    imgHi: c.card_image,
    price: usd(c.market_price) ?? usd(c.inventory_price),
    play: play({ kind: (c.card_type ?? 'character').toLowerCase(), colors: list(c.card_color?.replace(/ /g, ';')), cost: num(c.card_cost), power: num(c.card_power) }),
  })).sort((a, b) => a.id.localeCompare(b.id));
}

// TCGCSV : miroir quotidien des données TCGplayer (tous les jeux). Les produits scellés n'ont pas de rareté.
async function fromTcgcsv(set) {
  const base = `https://tcgcsv.com/tcgplayer/${set.category}/${set.tcgGroup}`;
  const [{ results: products }, { results: prices }] = await Promise.all([getJson(`${base}/products`), getJson(`${base}/prices`)]);
  const priceOf = {};
  for (const p of prices) {
    const value = p.marketPrice ?? p.midPrice ?? p.lowPrice;
    if (value && (!priceOf[p.productId] || p.subTypeName === 'Normal')) priceOf[p.productId] = value;
  }
  const field = (p, name) => p.extendedData.find(d => d.name === name)?.value;
  return products.filter(p => field(p, 'Rarity')).map(p => {
    const variant = set.variants?.find(([re]) => re.test(p.name));
    return {
      id: String(p.productId),
      name: p.name.replace(/ - [A-Z0-9]+-\d+/, '').replace(/(\s*\([^)]*\))+$/, ''),
      rarity: variant ? variant[1] : field(p, 'Rarity'),
      num: field(p, 'Number') ?? '',
      img: p.imageUrl.replace('_200w', '_400w'),
      imgHi: p.imageUrl.replace('_200w', '_in_1000x1000'),
      price: usd(priceOf[p.productId]),
      play: tcgcsvPlay(p, field),
    };
  }).sort((a, b) => a.num.localeCompare(b.num, 'en', { numeric: true }));
}

// Champs TCGplayer -> infos de jeu (One Piece, Dragon Ball, Riftbound).
function tcgcsvPlay(p, field) {
  const type = (field(p, 'CardType') ?? field(p, 'Card Type') ?? '').toLowerCase();
  const kind = /legend/.test(type) ? 'legend' : /champion/.test(type) ? 'champion' : /battlefield/.test(type) ? 'battlefield'
    : /rune/.test(type) ? 'rune' : /unit/.test(type) ? 'unit' : /spell/.test(type) ? 'spell' : /gear/.test(type) ? 'gear'
    : type || undefined;
  return play({
    kind,
    colors: list(field(p, 'Color') ?? field(p, 'Domain')),
    cost: num(field(p, 'Cost') ?? field(p, 'Energy Cost') ?? field(p, 'EnergyColor Cost')),
    power: num(field(p, 'Power') ?? field(p, 'Might')),
  });
}

const SOURCES = { tcgdex: fromTcgdex, scryfall: fromScryfall, ygoprodeck: fromYgoprodeck, lorcast: fromLorcast, optcg: fromOptcg, tcgcsv: fromTcgcsv };

// ---------- Main ----------

const args = process.argv.slice(2);
const missingOnly = args.includes('--missing'); // ne télécharge que les sets pas encore présents
const only = args.find(a => !a.startsWith('--'));
const fileOf = (game, set) => join(ROOT, 'public', 'data', game.id, `${set.id}.json`);
const exists = file => access(file).then(() => true, () => false);

let failed = 0;
for (const { game, set, key } of allSets()) {
  if (only && game.id !== only && key !== only) continue;
  if (missingOnly && await exists(fileOf(game, set))) continue;
  process.stdout.write(`${key.padEnd(22)} `);
  try {
    const all = await SOURCES[set.source](set);
    const counts = {};
    for (const c of all) counts[c.rarity] = (counts[c.rarity] ?? 0) + 1;
    // Les raretés absentes du catalogue (promos, cartes de deck de démarrage…) ne sont pas dans les boosters.
    const unknown = Object.keys(counts).filter(r => !(r in set.tiers));
    const cards = all.filter(c => c.rarity in set.tiers);
    if (!cards.length) throw new Error('aucune carte');
    const file = fileOf(game, set);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, JSON.stringify({ fetchedAt: new Date().toISOString(), cards }));
    console.log(`${cards.length} cartes  ${JSON.stringify(counts)}${unknown.length ? `  (ignorées : ${unknown})` : ''}`);
  } catch (err) {
    failed++;
    console.log(`ÉCHEC: ${err.message}`);
  }
}

// Index léger lu par le site : nombre de cartes et carte phare de chaque set (évite de charger tous les sets).
const index = {};
for (const { game, set, key } of allSets()) {
  try {
    const { cards } = JSON.parse(await readFile(fileOf(game, set), 'utf8'));
    // Carte phare = illustration du booster : la plus chère dont l'image existe vraiment.
    const top = [...cards].sort((a, b) => (b.price ?? 0) - (a.price ?? 0)).slice(0, 6);
    let chase = top[0];
    for (const c of top) {
      const ok = await fetch(c.img, { method: 'HEAD' }).then(r => r.ok, () => false);
      if (ok) { chase = c; break; }
    }
    index[key] = { total: cards.length, chase: { name: chase.name, img: chase.img, price: chase.price } };
  } catch { /* set pas encore téléchargé */ }
}
await writeFile(join(ROOT, 'public', 'data', 'index.json'), JSON.stringify(index));
console.log(`index.json : ${Object.keys(index).length} sets disponibles`);
if (failed) process.exitCode = 1;
