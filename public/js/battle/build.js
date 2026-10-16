// Construction de decks de 60 cartes pour le combat : decks des Dresseurs adverses et deck de démo.
import { trainerEffect } from './effects.js';

const norm = s => (s ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
export const basicEnergy = type => ({ id: `basic-${type}`, name: `Énergie ${type} de base`, img: '', rarity: 'Commune', play: { kind: 'energy', basic: true, colors: [type] } });

/** Types principaux d'une liste de cartes, du plus fourni au moins fourni. */
export function mainTypes(cards) {
  const count = {};
  for (const c of cards) if (c.play?.kind === 'pokemon' && c.play.atk?.length) for (const t of c.play.colors ?? []) if (t !== 'Incolore') count[t] = (count[t] ?? 0) + 1;
  return Object.entries(count).sort((a, b) => b[1] - a[1]).map(([t]) => t);
}

const power = c => (c.play.power ?? 0) + Math.max(0, ...(c.play.atk ?? []).map(a => parseInt(a.d, 10) || 0)) * 1.5 + (c.play.ex ? 60 : 0);

/**
 * Deck d'un type à partir d'une réserve de cartes (4 exemplaires max par nom).
 * @param strength 0..1 : 1 = les cartes les plus fortes, 0 = au hasard
 */
export function buildDeck(cards, type, { strength = 1 } = {}) {
  const pick = list => (strength >= 1 ? list : [...list].sort(() => Math.random() - strength));
  const byName = new Map();
  for (const c of cards) if (!byName.has(norm(c.name)) || power(c) > power(byName.get(norm(c.name)))) byName.set(norm(c.name), c);
  const deck = [];
  const add = (c, n) => { for (let k = 0; k < n && deck.length < 60; k++) deck.push(c); };

  // Pokémon : lignées complètes du type choisi (base → Niveau 1 → Niveau 2).
  const mons = pick([...byName.values()].filter(c => c.play?.kind === 'pokemon' && c.play.colors?.includes(type) && c.play.atk?.length)
    .sort((a, b) => power(b) - power(a)));
  const used = new Set();
  let monCount = 0;
  for (const top of mons) {
    if (monCount >= 18) break;
    const chain = [top];
    let ok = true;
    for (let cur = top; cur.play.from;) {
      cur = byName.get(norm(cur.play.from));
      if (!cur || chain.includes(cur)) { ok = false; break; }
      chain.push(cur);
    }
    if (!ok || chain.some(c => used.has(c))) continue;
    chain.reverse().forEach((c, i) => { const n = chain.length === 1 ? 3 : [4, 3, 2][i] ?? 2; add(c, n); monCount += n; used.add(c); });
  }

  // Dresseurs dont l'effet est simulé : pioche et recherche d'abord.
  const priority = c => {
    const t = c.play.text ?? '';
    if (/piochez/i.test(t)) return 5;
    if (/Cherchez/i.test(t)) return 4;
    if (/Échangez|Poste Actif/i.test(t)) return 3;
    if (/Soignez|marqueurs/i.test(t)) return 2;
    return 1;
  };
  const trainers = [...byName.values()].filter(c => c.play?.kind === 'trainer' && trainerEffect(c))
    .sort((a, b) => priority(b) - priority(a));
  for (const t of trainers) { if (deck.length >= 44) break; add(t, /Supporter/i.test(t.play.sub ?? '') ? 3 : 4); }

  while (deck.length < 60) deck.push(basicEnergy(type));
  return deck;
}
