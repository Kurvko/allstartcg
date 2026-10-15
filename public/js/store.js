// État du joueur, sauvegardé dans le navigateur (localStorage).
import { DAILY_PACKS } from './catalog.js';

const KEY = 'allstartcg:v1';

const blank = () => ({
  collection: {},   // { "pokemon/base1": { "base1-4": 2, ... } }
  opened: {},       // { "2026-10-15": { pokemon: 3 } }
  totalPacks: {},   // { "pokemon/base1": 12 }
  history: {},      // { "2026-10-15": 123.45 } valeur de la collection par jour
  bestPulls: [],    // [{ setKey, id, name, img, price, at }]
});

let state = load();

function load() {
  try {
    return { ...blank(), ...JSON.parse(localStorage.getItem(KEY) ?? '{}') };
  } catch {
    return blank();
  }
}

function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* stockage indisponible */ }
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
  state = { ...blank(), opened: state.opened };
  save();
}
