// État du joueur, sauvegardé dans le navigateur (localStorage).
import { DAILY_PACKS } from './catalog.js';

const KEY = 'allstartcg:v1';

const blank = () => ({
  collection: {},   // { "pokemon/base1": { "base1-4": 2, ... } }
  opened: {},       // { "2026-10-15": { pokemon: 3 } }
  totalPacks: {},   // { "pokemon/base1": 12 }
  history: {},      // { "2026-10-15": 123.45 } valeur de la collection par jour
  bestPulls: [],    // [{ setKey, id, name, img, price, at }]
  decks: {},        // { "<id>": { id, game, name, cards: { "pokemon/sv01|sv01-001": 2, "basic:Feu": 10 }, updatedAt } }
  deletedDecks: {}, // { "<id>": date de suppression } pour la synchro entre appareils
  resetAt: 0,       // date de la dernière réinitialisation de la collection
  updatedAt: 0,
});

let state = load();

function load() {
  try {
    return { ...blank(), ...JSON.parse(localStorage.getItem(KEY) ?? '{}') };
  } catch {
    return blank();
  }
}

const listeners = new Set();
/** Appelé après chaque sauvegarde (synchronisation du compte). */
export const onSave = fn => listeners.add(fn);

function save({ silent = false } = {}) {
  if (!silent) state.updatedAt = Date.now();
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* stockage indisponible */ }
  if (!silent) for (const fn of listeners) fn(state);
}

export const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export const getState = () => state;

export const packsLeft = gameId => DAILY_PACKS - (state.opened[today()]?.[gameId] ?? 0);

export const owned = setKey => state.collection[setKey] ?? {};

/** Enregistre un booster ouvert. Retourne les ids des cartes nouvelles pour la collection. */
export function recordPack(gameId, setKey, cards) {
  const day = today();
  state.opened[day] ??= {};
  state.opened[day][gameId] = (state.opened[day][gameId] ?? 0) + 1;
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

  // Seul le compteur du jour compte.
  for (const d of Object.keys(state.opened)) if (d !== day) delete state.opened[d];
  save();
  return fresh;
}

export function recordValue(value) {
  state.history[today()] = +value.toFixed(2);
  save();
}

/** Efface la collection. Le quota du jour est conservé (pas de boosters bonus en réinitialisant). */
export function resetAll() {
  state = { ...blank(), opened: state.opened, decks: state.decks, deletedDecks: state.deletedDecks, resetAt: Date.now() };
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
 * cartes et boosters ouverts du jour = maximum des deux (le quota ne peut pas être contourné),
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
  for (const x of [a, b]) for (const [day, games] of Object.entries(x.opened)) maxInto(out.opened[day] ??= {}, games);
  const seen = new Set();
  out.bestPulls = live.flatMap(x => x.bestPulls)
    .filter(p => { const k = `${p.setKey}|${p.id}|${p.at}`; return !seen.has(k) && seen.add(k); })
    .sort((p, q) => q.price - p.price).slice(0, 12);
  maxInto(out.deletedDecks, a.deletedDecks); maxInto(out.deletedDecks, b.deletedDecks);
  for (const d of [...Object.values(a.decks), ...Object.values(b.decks)]) {
    if ((out.deletedDecks[d.id] ?? 0) >= d.updatedAt) continue;
    if (!out.decks[d.id] || out.decks[d.id].updatedAt < d.updatedAt) out.decks[d.id] = d;
  }
  out.updatedAt = Math.max(a.updatedAt, b.updatedAt);
  return out;
}

/** Remplace l'état local (après fusion avec le compte). */
export function replaceState(next) {
  state = { ...blank(), ...next };
  save({ silent: true });
}
