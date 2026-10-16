// État du joueur, sauvegardé dans le navigateur (localStorage).
import { MAX_PACKS, REFILL_MS } from './catalog.js';

const KEY = 'allstartcg:v1';

const blank = () => ({
  collection: {},   // { "pokemon/base1": { "base1-4": 2, ... } }
  packs: {},        // { pokemon: 1760000000000 } heure à laquelle le stock de boosters du jeu sera plein
  totalPacks: {},   // { "pokemon/base1": 12 }
  history: {},      // { "2026-10-15": 123.45 } valeur de la collection par jour
  bestPulls: [],    // [{ setKey, id, name, img, price, at }]
  favorites: {},    // { "pokemon/sv01|sv01-001": { on: true, at } } cartes favorites
  battles: {},      // { "pokemon/difficile": { w: 3, l: 1 } } résultats des combats contre l'IA
  decks: {},        // { "<id>": { id, game, name, cards: { "pokemon/sv01|sv01-001": 2, "basic:Feu": 10 }, updatedAt } }
  deletedDecks: {}, // { "<id>": date de suppression } pour la synchro entre appareils
  resetAt: 0,       // date de la dernière réinitialisation de la collection
  updatedAt: 0,
});

export const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

let state = load();

function load() {
  try {
    return migrate({ ...blank(), ...JSON.parse(localStorage.getItem(KEY) ?? '{}') });
  } catch {
    return blank();
  }
}

// Anciennes sauvegardes (10 boosters par jour) : les boosters ouverts aujourd'hui sont décomptés du stock.
function migrate(s) {
  if (s.opened) {
    const day = s.opened[today()] ?? {};
    for (const [game, n] of Object.entries(day)) s.packs[game] ??= Date.now() + Math.min(MAX_PACKS, n) * REFILL_MS;
    delete s.opened;
  }
  return s;
}

const listeners = new Set();
/** Appelé après chaque sauvegarde (synchronisation du compte). */
export const onSave = fn => listeners.add(fn);

function save({ silent = false } = {}) {
  if (!silent) state.updatedAt = Date.now();
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* stockage indisponible */ }
  if (!silent) for (const fn of listeners) fn(state);
}

export const getState = () => state;

// ---------- Boosters : un stock qui se recharge ----------
// On garde seulement l'heure à laquelle le stock sera plein : chaque booster ouvert la repousse de 1h30.

const missing = gameId => Math.max(0, Math.ceil(((state.packs[gameId] ?? 0) - Date.now()) / REFILL_MS));

export const packsLeft = gameId => Math.max(0, MAX_PACKS - missing(gameId));

/** Millisecondes avant le prochain booster (0 si le stock est plein). */
export function nextPackIn(gameId) {
  const m = missing(gameId);
  return m ? (state.packs[gameId] - (m - 1) * REFILL_MS) - Date.now() : 0;
}

export const owned = setKey => state.collection[setKey] ?? {};

/** Enregistre un booster ouvert. Retourne les ids des cartes nouvelles pour la collection. */
export function recordPack(gameId, setKey, cards) {
  state.packs[gameId] = Math.max(state.packs[gameId] ?? 0, Date.now()) + REFILL_MS;
  state.totalPacks[setKey] = (state.totalPacks[setKey] ?? 0) + 1;

  const col = (state.collection[setKey] ??= {});
  const fresh = new Set();
  for (const c of cards) {
    if (!col[c.id] && !fresh.has(c.id)) fresh.add(c.id);
    col[c.id] = (col[c.id] ?? 0) + 1;
  }

  const best = cards.reduce((a, b) => ((b.price ?? 0) > (a.price ?? 0) ? b : a));
  state.bestPulls.push({ setKey, id: best.id, name: best.name, img: best.img, price: best.price ?? 0, at: Date.now() });
  state.bestPulls.sort((a, b) => b.price - a.price);
  state.bestPulls = state.bestPulls.slice(0, 12);

  save();
  return fresh;
}

export function recordValue(value) {
  state.history[today()] = +value.toFixed(2);
  save();
}

/** Efface la collection. Le stock de boosters est conservé (pas de boosters bonus en réinitialisant). */
export function resetAll() {
  state = { ...blank(), packs: state.packs, decks: state.decks, deletedDecks: state.deletedDecks, resetAt: Date.now() };
  save();
}

// ---------- Decks ----------

export const getDecks = gameId => Object.values(state.decks)
  .filter(d => !gameId || d.game === gameId).sort((a, b) => b.updatedAt - a.updatedAt);

export function saveDeck(deck) {
  deck.id ??= `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  deck.updatedAt = Date.now();
  state.decks[deck.id] = deck;
  save();
  return deck;
}

export function deleteDeck(id) {
  delete state.decks[id];
  state.deletedDecks[id] = Date.now();
  save();
}

// ---------- Synchronisation ----------

const maxInto = (target, src) => { for (const [k, v] of Object.entries(src ?? {})) target[k] = Math.max(target[k] ?? 0, v); };

/**
 * Fusionne deux sauvegardes (cet appareil + compte en ligne) sans rien perdre :
 * cartes = maximum des deux, stock de boosters = le plus entamé des deux (impossible de le contourner),
 * decks = version la plus récente, réinitialisation respectée.
 */
export function mergeStates(a, b) {
  a = { ...blank(), ...a }; b = { ...blank(), ...b };
  const out = blank();
  out.resetAt = Math.max(a.resetAt, b.resetAt);
  // Une sauvegarde antérieure à la dernière réinitialisation ne ramène pas l'ancienne collection.
  const live = [a, b].filter(x => x.updatedAt >= out.resetAt || x.resetAt === out.resetAt);
  for (const x of live) {
    for (const [k, cards] of Object.entries(x.collection)) maxInto(out.collection[k] ??= {}, cards);
    maxInto(out.totalPacks, x.totalPacks);
    maxInto(out.history, x.history);
  }
  for (const x of [a, b]) maxInto(out.packs, migrate({ ...x, packs: { ...x.packs } }).packs);
  for (const x of [a, b]) for (const [k, f] of Object.entries(x.favorites ?? {})) if (!out.favorites[k] || out.favorites[k].at < f.at) out.favorites[k] = f;
  const seen = new Set();
  out.bestPulls = live.flatMap(x => x.bestPulls)
    .filter(p => { const k = `${p.setKey}|${p.id}|${p.at}`; return !seen.has(k) && seen.add(k); })
    .sort((p, q) => q.price - p.price).slice(0, 12);
  maxInto(out.deletedDecks, a.deletedDecks); maxInto(out.deletedDecks, b.deletedDecks);
  for (const d of [...Object.values(a.decks), ...Object.values(b.decks)]) {
    if ((out.deletedDecks[d.id] ?? 0) >= d.updatedAt) continue;
    if (!out.decks[d.id] || out.decks[d.id].updatedAt < d.updatedAt) out.decks[d.id] = d;
  }
  for (const x of [a, b]) for (const [k, r] of Object.entries(x.battles ?? {})) {
    const o = (out.battles[k] ??= { w: 0, l: 0 });
    o.w = Math.max(o.w, r.w); o.l = Math.max(o.l, r.l);
  }
  out.updatedAt = Math.max(a.updatedAt, b.updatedAt);
  return out;
}

/** Remplace l'état local (après fusion avec le compte). */
export function replaceState(next) {
  state = migrate({ ...blank(), ...next });
  save({ silent: true });
}

/** Résultat d'un combat contre l'IA. */
export function recordBattle(key, won) {
  const r = (state.battles[key] ??= { w: 0, l: 0 });
  if (won) r.w++; else r.l++;
  save();
}

// ---------- Favoris ----------

export const favKey = (setKey, id) => `${setKey}|${id}`;
export const isFav = (setKey, id) => !!state.favorites[favKey(setKey, id)]?.on;

/** Ajoute ou retire une carte des favoris. Retourne le nouvel état. */
export function toggleFav(setKey, id) {
  const on = !isFav(setKey, id);
  state.favorites[favKey(setKey, id)] = { on, at: Date.now() };
  save();
  return on;
}

/** Favoris du plus récent au plus ancien : [{ setKey, id, at }]. */
export const getFavorites = () => Object.entries(state.favorites)
  .filter(([, f]) => f.on).sort(([, a], [, b]) => b.at - a.at)
  .map(([k, f]) => { const i = k.lastIndexOf('|'); return { setKey: k.slice(0, i), id: k.slice(i + 1), at: f.at }; });
