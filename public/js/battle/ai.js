// IA du combat Pokémon, 3 niveaux :
// - facile : coups au hasard, attaque quand elle peut ;
// - normal : teste chaque coup sur une copie de la partie et garde le meilleur, avec des erreurs de temps en temps ;
// - difficile : comme normal, sans erreur, et en regardant aussi ce que l'adversaire pourra faire au tour suivant.
import {
  apply, attackable, canPay, card, clone, hpLeft, isBasic, isEnergy, isPokemon, legalActions, maxHp, missingFor,
  prizeValue, promote, topCard, damageBase,
} from './engine.js';

export const LEVELS = {
  facile: { label: 'Facile', noise: 1, mistakes: 1, lookahead: false },
  normal: { label: 'Normal', noise: 0.25, mistakes: 0.15, lookahead: false },
  difficile: { label: 'Difficile', noise: 0, mistakes: 0, lookahead: true },
};

// ---------- Évaluation d'une position (du point de vue de `side`) ----------
function bestReach(g, slot) {
  // Dégâts de la meilleure attaque, et Énergies qui manquent pour l'utiliser.
  let best = { dmg: 0, missing: 9 };
  for (const a of topCard(g, slot).play.atk ?? []) {
    const miss = missingFor(g, slot.energies, a.c ?? []).total;
    const dmg = damageBase(a) || 10;
    if (miss < best.missing || (miss === best.missing && dmg > best.dmg)) best = { dmg, missing: miss };
  }
  return best;
}

function sideValue(g, side) {
  const p = g.players[side];
  let v = 0;
  v += (6 - p.prizes.length) * 120;
  const slots = [p.active, ...p.bench].filter(Boolean);
  for (const s of slots) {
    const c = topCard(g, s);
    const frac = hpLeft(g, s) / maxHp(g, s);
    v += 18 + frac * 25 + (s.stack.length - 1) * 22 + s.energies.length * 9;
    const r = bestReach(g, s);
    v += Math.max(0, 4 - r.missing) * 4 + r.dmg / 15;
    v -= prizeValue(c) > 1 ? (1 - frac) * 20 : 0;
  }
  if (p.active) {
    const r = bestReach(g, p.active);
    if (r.missing === 0) v += 25 + r.dmg / 6;
    if (p.active.status) v -= 12;
  }
  v += Math.min(p.hand.length, 8) * 3;
  v += Math.min(p.bench.length, 4) * 6;
  return v;
}

function evaluate(g, side) {
  if (g.winner != null) return g.winner === side ? 1e6 : -1e6;
  return sideValue(g, side) - sideValue(g, 1 - side);
}

// Menace de l'adversaire au prochain tour : peut-il mettre KO notre Actif ?
function threat(g, side) {
  const foe = g.players[1 - side];
  const me = g.players[side];
  if (!foe.active || !me.active) return 0;
  let worst = 0;
  for (const a of topCard(g, foe.active).play.atk ?? []) {
    const miss = missingFor(g, foe.active.energies, a.c ?? []).total;
    if (miss > 1) continue; // il peut attacher 1 Énergie
    let dmg = damageBase(a);
    const def = topCard(g, me.active);
    if (def.play.weak?.[0] === topCard(g, foe.active).play.colors?.[0]) dmg *= 2;
    if (dmg >= hpLeft(g, me.active)) worst = Math.max(worst, prizeValue(def) * 110);
    else worst = Math.max(worst, dmg / 4);
  }
  return worst;
}

function scoreAction(g, side, action, level) {
  const sim = clone(g);
  // L'IA ne connaît pas l'ordre de son deck : on le mélange dans la copie.
  sim.players[side].deck.sort(() => Math.random() - 0.5);
  if (action.type === 'end') {
    // Fin du tour : on évalue la position actuelle (pas de pioche adverse simulée).
    return evaluate(sim, side) - (level.lookahead ? threat(sim, side) : 0) - 2;
  }
  apply(sim, action);
  // KO pendant l'attaque : l'adversaire choisira son meilleur remplaçant.
  autoPromote(sim);
  let s = evaluate(sim, side);
  if (level.lookahead && action.type !== 'attack') s -= threat(sim, side) * 0.5;
  if (level.lookahead && action.type === 'attack' && sim.winner == null) s -= threat(sim, side);
  return s;
}

/** Meilleur Pokémon de Banc à envoyer au Poste Actif. */
export function bestPromotion(g, side) {
  const p = g.players[side];
  let best = 0, bestScore = -Infinity;
  p.bench.forEach((s, i) => {
    const r = bestReach(g, s);
    const sc = hpLeft(g, s) + r.dmg * 1.5 - r.missing * 40 + s.energies.length * 20;
    if (sc > bestScore) { bestScore = sc; best = i; }
  });
  return best;
}

function autoPromote(g) {
  while (g.pending?.type === 'promote' && g.pending.players.length) {
    const idx = g.pending.players[0];
    promote(g, idx, bestPromotion(g, idx));
  }
}

/** Choisit la prochaine action de l'IA (side) au niveau donné. */
export function chooseAction(g, side, levelKey = 'normal') {
  const level = LEVELS[levelKey] ?? LEVELS.normal;
  const actions = legalActions(g);
  if (actions.length <= 1) return actions[0] ?? { type: 'end' };

  if (levelKey === 'facile') {
    const attacks = actions.filter(a => a.type === 'attack');
    const useful = actions.filter(a => ['bench', 'evolve', 'energy'].includes(a.type));
    if (useful.length && Math.random() < 0.7) return useful[Math.floor(Math.random() * useful.length)];
    if (attacks.length && Math.random() < 0.8) return attacks[Math.floor(Math.random() * attacks.length)];
    const others = actions.filter(a => a.type === 'trainer');
    if (others.length && Math.random() < 0.4) return others[Math.floor(Math.random() * others.length)];
    return { type: 'end' };
  }

  if (Math.random() < level.mistakes) {
    const pick = actions[Math.floor(Math.random() * actions.length)];
    if (pick.type !== 'retreat') return pick;
  }
  let best = actions[0], bestScore = -Infinity;
  for (const a of actions) {
    let s = scoreAction(g, side, a, level);
    if (level.noise) s *= 1 + (Math.random() - 0.5) * level.noise;
    if (s > bestScore) { bestScore = s; best = a; }
  }
  return best;
}

/** Mise en place de l'IA : le Pokémon de base le plus solide en Actif, les autres sur le Banc. */
export function chooseSetup(g, side) {
  const p = g.players[side];
  const basics = p.hand.filter(uid => isBasic(card(g, uid)))
    .sort((a, b) => (card(g, b).play.power ?? 0) - (card(g, a).play.power ?? 0));
  return [basics[0], ...basics.slice(1, 6)];
}

export { autoPromote };
