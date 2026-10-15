// Chargement des sets (public/data) et génération des boosters.
import { allSets, findSet } from './catalog.js';
import { getState } from './store.js';

const cache = new Map();
let indexPromise;

/** Index léger : { "pokemon/base1": { total, chase: { name, img, price } } } */
export function loadIndex() {
  indexPromise ??= fetch('data/index.json').then(r => (r.ok ? r.json() : {})).catch(() => ({}));
  return indexPromise;
}

export async function loadSet(setKey) {
  if (!cache.has(setKey)) {
    cache.set(setKey, fetch(`data/${setKey}.json`).then(r => {
      if (!r.ok) throw new Error(`Données manquantes pour ${setKey} — lance "npm run fetch".`);
      return r.json();
    }).then(data => {
      const { set } = findSet(setKey);
      for (const c of data.cards) c.tier = set.tiers[c.rarity] ?? 0;
      data.byId = new Map(data.cards.map(c => [c.id, c]));
      return data;
    }));
  }
  try {
    return await cache.get(setKey);
  } catch (err) {
    cache.delete(setKey);
    throw err;
  }
}

function pickWeighted(entries) {
  const total = entries.reduce((s, [, w]) => s + w, 0);
  let roll = Math.random() * total;
  for (const [value, w] of entries) if ((roll -= w) < 0) return value;
  return entries[entries.length - 1][0];
}

/** Tire un booster selon la composition du set. Cartes triées de la moins à la plus rare. */
export async function openPack(setKey) {
  const { set } = findSet(setKey);
  const data = await loadSet(setKey);
  const pools = {};
  for (const c of data.cards) (pools[c.rarity] ??= []).push(c);

  const taken = new Set();
  const pack = set.slots.map(slot => {
    const available = slot.filter(([rarity]) => pools[rarity]?.length);
    // Aucune rareté de l'emplacement dans ce set : n'importe quelle carte du set.
    const pool = available.length ? pools[pickWeighted(available)] : data.cards;
    let card = pool[Math.floor(Math.random() * pool.length)];
    for (let i = 0; i < 6 && taken.has(card.id); i++) card = pool[Math.floor(Math.random() * pool.length)];
    taken.add(card.id);
    return card;
  });
  return pack.map((c, i) => ({ c, i })).sort((a, b) => a.c.tier - b.c.tier || a.i - b.i).map(x => x.c);
}

/** Valeur et progression de la collection. Seuls les sets dont on possède des cartes sont chargés. */
export async function collectionSummary() {
  const { collection } = getState();
  const index = await loadIndex();
  const rows = await Promise.all(allSets().map(async ({ game, set, key }) => {
    const meta = index[key];
    if (!meta) return { game, set, key, missing: true, value: 0, unique: 0, total: 0, count: 0 };
    const owned = Object.entries(collection[key] ?? {});
    const row = { game, set, key, meta, value: 0, unique: 0, count: 0, total: meta.total };
    if (!owned.length) return row;
    try { row.data = await loadSet(key); } catch { return row; }
    for (const [id, n] of owned) {
      const card = row.data.byId.get(id);
      if (!card) continue;
      row.unique++;
      row.count += n;
      row.value += (card.price ?? 0) * n;
    }
    return row;
  }));
  return { rows, value: rows.reduce((s, r) => s + r.value, 0), count: rows.reduce((s, r) => s + r.count, 0) };
}
