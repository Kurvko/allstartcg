// Construit les sets de cartes sport (basket, football) à partir des effectifs ESPN.
// Photos : ESPN (NBA) ; Wikipédia / Wikimedia Commons (football, photos libres).
// Chaque joueur existe en version de base (ou Rookie / Espoir) et en parallèles Argent, Bleu /199, Or /10, Noir 1/1.
// Usage : npm run sports
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GAMES } from '../public/js/catalog.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const HEADERS = { 'User-Agent': 'AllStarTCG/0.1 (projet perso ; cartes sport simulées)' };
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function getJson(url, tries = 3) {
  for (let i = 1; ; i++) {
    try {
      const res = await fetch(url, { headers: HEADERS });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      if (i >= tries) throw new Error(`${url} -> ${err.message}`);
      await sleep(600 * i);
    }
  }
}

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: limit }, async () => {
    while (next < items.length) { const i = next++; out[i] = await fn(items[i], i); }
  }));
  return out;
}

const POSITIONS = {
  Guard: 'Arrière', 'Point Guard': 'Meneur', 'Shooting Guard': 'Arrière', Forward: 'Ailier', 'Small Forward': 'Ailier',
  'Power Forward': 'Ailier fort', Center: 'Pivot', 'Guard-Forward': 'Arrière / Ailier', 'Forward-Center': 'Ailier / Pivot',
  Goalkeeper: 'Gardien', Defender: 'Défenseur', Midfielder: 'Milieu', Forward_soccer: 'Attaquant',
};

// ---------- Photos des footballeurs (Wikipédia / Wikimedia Commons) ----------
// Wikimedia limite le nombre de requêtes : titres demandés par lots de 50, recherche une par une et lente
// seulement pour les joueurs restants, résultats gardés dans scripts/sports-photos.json.
const CACHE_FILE = join(ROOT, 'scripts', 'sports-photos.json');
const photoCache = JSON.parse(await readFile(CACHE_FILE, 'utf8').catch(() => '{}'));
const WIKI_HEADERS = { 'User-Agent': 'AllStarTCG/0.1 (https://github.com/Kurvko/allstartcg)' };
const isFootballer = p => p?.thumbnail && /foot|soccer/i.test(p.description ?? '');
const thumb = p => p.thumbnail.source.replace(/\?.*$/, '');

async function wiki(lang, params) {
  const url = `https://${lang}.wikipedia.org/w/api.php?action=query&format=json&maxlag=5&${params}`;
  for (let i = 1; i <= 5; i++) {
    const res = await fetch(url, { headers: WIKI_HEADERS });
    const text = await res.text();
    if (res.ok && text.startsWith('{')) {
      const j = JSON.parse(text);
      if (!j.error) return j;
    }
    await sleep(3000 * i); // trop de requêtes : on attend
  }
  return null;
}

async function wikiPhotos(players, langs) {
  const todo = players.filter(p => !(p.key in photoCache));
  // 1. Titre exact, par lots de 50.
  for (const lang of langs) {
    const left = todo.filter(p => !photoCache[p.key]);
    for (let i = 0; i < left.length; i += 50) {
      const batch = left.slice(i, i + 50);
      const j = await wiki(lang, `redirects=1&prop=pageimages|description&piprop=thumbnail&pithumbsize=400&titles=${encodeURIComponent(batch.map(p => p.name).join('|'))}`);
      if (!j) continue;
      const alias = new Map();
      for (const r of [...(j.query.normalized ?? []), ...(j.query.redirects ?? [])]) alias.set(r.to, alias.get(r.from) ?? r.from);
      for (const page of Object.values(j.query.pages ?? {})) {
        if (!isFootballer(page)) continue;
        let from = page.title;
        while (alias.has(from) && alias.get(from) !== from) from = alias.get(from);
        for (const p of batch) if (p.name === from || p.name === page.title) photoCache[p.key] = thumb(page);
      }
      await sleep(400);
    }
  }
  // 2. Recherche « nom + footballeur + club » pour les autres (homonymes, accents…).
  for (const p of todo.filter(x => !photoCache[x.key])) {
    for (const lang of langs) {
      const q = `${p.name} ${lang === 'fr' ? 'footballeur' : 'footballer'} ${p.club}`;
      const j = await wiki(lang, `generator=search&gsrlimit=3&prop=pageimages|description&piprop=thumbnail&pithumbsize=400&gsrsearch=${encodeURIComponent(q)}`);
      const last = p.name.split(' ').at(-1).toLowerCase();
      const page = Object.values(j?.query?.pages ?? {}).sort((a, b) => a.index - b.index)
        .find(x => isFootballer(x) && x.title.toLowerCase().includes(last));
      await sleep(250);
      if (page) { photoCache[p.key] = thumb(page); break; }
    }
    photoCache[p.key] ??= '';
  }
  await writeFile(CACHE_FILE, JSON.stringify(photoCache, null, 0));
}

export const PARALLELS = [['s', 'Argent'], ['u', 'Bleu /199'], ['g', 'Or /10'], ['k', 'Noir 1/1']];

async function buildSet(game, set) {
  const { teams } = (await getJson(`https://site.api.espn.com/apis/site/v2/sports/${set.league}/teams`)).sports[0].leagues[0];
  const soccer = set.league.startsWith('soccer');
  const rosters = await mapLimit(teams, 4, async ({ team }) => {
    const r = await getJson(`https://site.api.espn.com/apis/site/v2/sports/${set.league}/teams/${team.id}/roster`);
    // Le football renvoie parfois les joueurs groupés par poste.
    const athletes = (r?.athletes ?? []).flatMap(a => a.items ?? [a]);
    return { team: r?.team ?? team, athletes };
  });

  const players = rosters.flatMap(({ team, athletes }) => athletes.map(a => ({ team, a })));
  console.log(`  ${teams.length} équipes, ${players.length} joueurs`);
  if (soccer) await wikiPhotos(players.map(({ team, a }) => ({ key: a.id, name: a.displayName, club: team.displayName })), set.wikiLangs);
  let photos = 0;
  const cards = [];
  await mapLimit(players, 12, async ({ team, a }) => {
    const photo = a.headshot?.href ?? (soccer ? photoCache[a.id] : '') ?? '';
    if (photo) photos++;
    const posKey = a.position?.displayName ?? a.position?.name ?? '';
    const sport = {
      team: team.displayName, abbr: team.abbreviation, logo: team.logos?.[0]?.href ?? team.logo ?? '',
      c1: `#${team.color ?? '333333'}`, c2: `#${team.alternateColor ?? 'ffffff'}`,
      pos: POSITIONS[soccer && posKey === 'Forward' ? 'Forward_soccer' : posKey] ?? posKey,
      flag: a.flag?.href ?? '',
    };
    const young = soccer ? (a.age && a.age <= 21) : a.experience?.years === 0;
    const base = { name: a.displayName, num: a.jersey ?? '', img: photo, imgHi: photo, price: null, sport };
    cards.push({ ...base, id: a.id, rarity: young ? set.youngLabel : 'Base' });
    for (const [code, rarity] of PARALLELS) cards.push({ ...base, id: `${a.id}-${code}`, rarity });
  });
  cards.sort((x, y) => x.sport.team.localeCompare(y.sport.team) || x.name.localeCompare(y.name) || x.id.localeCompare(y.id));
  console.log(`  ${photos}/${players.length} joueurs avec photo, ${cards.length} cartes`);
  return cards;
}

const indexFile = join(ROOT, 'public', 'data', 'index.json');
const index = JSON.parse(await readFile(indexFile, 'utf8'));
for (const game of GAMES.filter(g => g.sport)) {
  for (const set of game.sets) {
    const key = `${game.id}/${set.id}`;
    console.log(key);
    const cards = await buildSet(game, set);
    const file = join(ROOT, 'public', 'data', game.id, `${set.id}.json`);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(file, JSON.stringify({ fetchedAt: new Date().toISOString(), cards }));
    // Carte phare : un Noir 1/1 d'un joueur avec photo (en priorité les numéros mythiques).
    const chase = cards.find(c => c.rarity === 'Noir 1/1' && c.img && set.stars?.includes(c.name))
      ?? cards.find(c => c.rarity === 'Noir 1/1' && c.img) ?? cards[0];
    index[key] = { total: cards.length, chase: { name: chase.name, img: chase.img, price: null } };
  }
}
await writeFile(indexFile, JSON.stringify(index));
console.log('index.json mis à jour');
