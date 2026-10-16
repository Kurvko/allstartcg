// Moteur de combat Pokémon (règles de base du JCC). Aucun affichage ici : l'état est un objet simple,
// les cartes sont référencées par leur numéro (uid) dans `db`, ce qui permet à l'adversaire de cloner une partie à moindre coût.
//
// Règles gérées : mise en place (7 cartes, Pokémon de base, 6 Récompenses), pioche, Pokémon de base sur le Banc,
// évolution, 1 Énergie par tour, Dresseurs (Objet, Supporter 1 par tour, Stade, Outil), retraite, attaques,
// faiblesse / résistance, états spéciaux, KO, Récompenses (ex / V : 2, VMAX / Méga ex : 3), conditions de victoire.
// Effets des cartes : les plus courants sont lus dans le texte français (voir effects.js) ; les autres sont ignorés.
import { attackEffects, trainerEffect } from './effects.js';

export const TYPES = ['Plante', 'Feu', 'Eau', 'Électrique', 'Psy', 'Combat', 'Obscurité', 'Métal', 'Dragon', 'Fée', 'Incolore'];
export const STATUS_FR = { poison: 'Empoisonné', burn: 'Brûlé', sleep: 'Endormi', paralysis: 'Paralysé', confusion: 'Confus' };
const BENCH_MAX = 5;

// ---------- Hasard (graine) ----------
export function rng(state) {
  if (state.sim) return Math.random(); // l'adversaire ne doit pas « voir » les futurs lancers de pièce
  state.seed = (state.seed * 1664525 + 1013904223) % 4294967296;
  return state.seed / 4294967296;
}
export const coin = state => rng(state) < 0.5;
function shuffle(state, arr) {
  for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(rng(state) * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; }
}

// ---------- Infos sur les cartes ----------
export const card = (g, uid) => g.db[uid];
export const isPokemon = c => c.play?.kind === 'pokemon';
export const isBasic = c => isPokemon(c) && (c.play.stage === 'Base' || !c.play.from);
export const isEnergy = c => c.play?.kind === 'energy';
export const isTrainer = c => c.play?.kind === 'trainer';
export const trainerKind = c => {
  const sub = c.play?.sub ?? '';
  if (/supporter/i.test(sub)) return 'supporter';
  if (/stade/i.test(sub)) return 'stadium';
  if (/outil/i.test(sub)) return 'tool';
  return 'item';
};
export const energyType = c => (c.play?.basic ? c.play.colors?.[0] : 'Incolore');
export const topCard = (g, slot) => card(g, slot.stack[slot.stack.length - 1]);
export const maxHp = (g, slot) => topCard(g, slot).play.power ?? 50;
export const hpLeft = (g, slot) => maxHp(g, slot) - slot.damage;
export function prizeValue(c) {
  const sfx = c.play?.ex ?? '';
  if (/VMAX|V-UNION/i.test(sfx) || (/^ex$/.test(sfx) && /^Méga-/i.test(c.name))) return 3;
  if (/^(ex|EX|GX|V|VSTAR)$/.test(sfx) || /-(ex|EX|GX|V|VSTAR)$/.test(c.name)) return 2;
  return 1;
}
export const damageBase = atk => parseInt(String(atk.d ?? ''), 10) || 0;

/** Peut-on payer le coût d'une attaque avec ces Énergies ? (types précis d'abord, Incolore avec le reste) */
export function canPay(g, energies, cost) {
  const pool = energies.map(uid => energyType(card(g, uid)));
  let free = pool.length;
  const need = {};
  for (const t of cost) if (t !== 'Incolore') need[t] = (need[t] ?? 0) + 1;
  for (const [t, n] of Object.entries(need)) {
    const have = pool.filter(x => x === t).length;
    if (have < n) return false;
  }
  return free >= cost.length;
}
export function missingFor(g, energies, cost) {
  // Nombre d'Énergies manquantes (approximation pour l'adversaire) et types précis encore requis.
  const pool = energies.map(uid => energyType(card(g, uid)));
  const types = [];
  for (const t of cost) if (t !== 'Incolore') {
    const i = pool.indexOf(t);
    if (i >= 0) pool.splice(i, 1); else types.push(t);
  }
  const colorless = cost.filter(t => t === 'Incolore').length;
  return { types, total: types.length + Math.max(0, colorless - pool.length) };
}

// ---------- Création d'une partie ----------
/**
 * @param decks  [[cartes du joueur], [cartes de l'adversaire]] : objets carte (avec play), 60 chacun
 */
export function newGame(decks, { names = ['Toi', 'Adversaire'], seed = Date.now() % 4294967296 } = {}) {
  const g = { db: [], seed, sim: false, turn: 0, current: 0, first: 0, winner: null, reason: '', log: [], pending: null, stadium: null, players: [] };
  for (const [i, list] of decks.entries()) {
    const deck = list.map(c => { g.db.push(c); return g.db.length - 1; });
    g.players.push({ name: names[i], deck, hand: [], discard: [], prizes: [], active: null, bench: [], lostZone: [],
      supporter: false, energy: false, retreated: false, mulligans: 0 });
  }
  for (const p of g.players) {
    // Mulligan : on remélange tant que la main n'a pas de Pokémon de base.
    for (;;) {
      shuffle(g, p.deck);
      p.hand = p.deck.splice(0, 7);
      if (p.hand.some(uid => isBasic(card(g, uid)))) break;
      p.deck.push(...p.hand); p.hand = []; p.mulligans++;
      if (p.mulligans > 20) break;
    }
  }
  for (const [i, p] of g.players.entries()) {
    const other = g.players[1 - i];
    for (let k = 0; k < Math.min(other.mulligans, 3); k++) if (p.deck.length) p.hand.push(p.deck.shift()); // pioche bonus
  }
  g.first = coin(g) ? 0 : 1;
  g.pending = { type: 'setup' };
  log(g, `Pile ou face : ${g.players[g.first].name} commence.`);
  for (const p of g.players) if (p.mulligans) log(g, `${p.name} fait ${p.mulligans} mulligan${p.mulligans > 1 ? 's' : ''}.`);
  return g;
}

const newSlot = (uid, turn) => ({ stack: [uid], energies: [], tools: [], damage: 0, status: null, playedTurn: turn, evolvedTurn: -1 });
export function log(g, text) { if (!g.sim) g.log.push(text); }

/** Mise en place : Pokémon Actif + Banc choisis par chaque joueur (setup = [[uidActif, ...uidsBanc], [...]]). */
export function setup(g, choices) {
  for (const [i, p] of g.players.entries()) {
    const [activeUid, ...benchUids] = choices[i];
    p.active = newSlot(activeUid, 0);
    p.hand.splice(p.hand.indexOf(activeUid), 1);
    for (const uid of benchUids.slice(0, BENCH_MAX)) { p.bench.push(newSlot(uid, 0)); p.hand.splice(p.hand.indexOf(uid), 1); }
    p.prizes = p.deck.splice(0, 6);
  }
  g.pending = null;
  g.current = g.first;
  g.turn = 1;
  startTurn(g);
}

// ---------- Tours ----------
function startTurn(g) {
  const p = g.players[g.current];
  p.supporter = false; p.energy = false; p.retreated = false;
  if (!p.deck.length) return win(g, 1 - g.current, `${p.name} ne peut plus piocher`);
  p.hand.push(p.deck.shift());
  log(g, `— Tour ${g.turn} : ${p.name} —`);
}

function win(g, idx, reason) {
  g.winner = idx;
  g.reason = reason;
  g.pending = null;
  log(g, `${g.players[idx].name} gagne (${reason}).`);
}

export const firstTurn = g => g.turn === 1;

/** Fin du tour : contrôle Pokémon (poison, brûlure, sommeil, paralysie) puis tour adverse. */
export function endTurn(g) {
  if (g.winner != null || g.pending) return;
  const ended = g.current;
  for (const [i, p] of g.players.entries()) {
    const s = p.active;
    if (!s?.status) continue;
    const name = topCard(g, s).name;
    if (s.status === 'poison') { s.damage += 10; log(g, `${name} subit 10 dégâts de poison.`); }
    if (s.status === 'burn') {
      s.damage += 20; log(g, `${name} subit 20 dégâts de brûlure.`);
      if (coin(g)) { s.status = null; log(g, `${name} n'est plus Brûlé.`); }
    }
    if (s.status === 'sleep' && coin(g)) { s.status = null; log(g, `${name} se réveille.`); }
    if (s.status === 'paralysis' && i === ended) { s.status = null; log(g, `${name} n'est plus Paralysé.`); }
  }
  checkKOs(g, ended);
  if (g.winner != null) return;
  if (g.pending) { g.pending.then = 'next'; return; }
  nextTurn(g);
}

function nextTurn(g) {
  g.current = 1 - g.current;
  g.turn++;
  startTurn(g);
}

// ---------- KO et Récompenses ----------
function knockOut(g, ownerIdx, slot, zone) {
  const owner = g.players[ownerIdx];
  const taker = g.players[1 - ownerIdx];
  const c = topCard(g, slot);
  owner.discard.push(...slot.stack, ...slot.energies, ...slot.tools);
  if (zone === 'active') owner.active = null;
  else owner.bench.splice(owner.bench.indexOf(slot), 1);
  const n = Math.min(prizeValue(c), taker.prizes.length);
  taker.hand.push(...taker.prizes.splice(0, n));
  log(g, `${c.name} est K.O. ! ${taker.name} prend ${n} Récompense${n > 1 ? 's' : ''}.`);
}

/** Vérifie les KO des deux côtés (l'attaquant en premier : ses Récompenses comptent). */
export function checkKOs(g, attackerIdx) {
  for (const idx of [1 - attackerIdx, attackerIdx]) {
    const p = g.players[idx];
    for (const slot of [...p.bench]) if (hpLeft(g, slot) <= 0) knockOut(g, idx, slot, 'bench');
    if (p.active && hpLeft(g, p.active) <= 0) knockOut(g, idx, p.active, 'active');
  }
  for (const idx of [attackerIdx, 1 - attackerIdx]) {
    if (!g.players[idx].prizes.length) return win(g, idx, 'toutes les Récompenses prises');
  }
  for (const idx of [1 - attackerIdx, attackerIdx]) {
    const p = g.players[idx];
    if (!p.active && !p.bench.length) return win(g, 1 - idx, `${p.name} n'a plus de Pokémon en jeu`);
  }
  const needs = [0, 1].filter(i => !g.players[i].active);
  if (needs.length) g.pending = { type: 'promote', players: needs };
}

/** Un joueur choisit son nouveau Pokémon Actif après un KO. */
export function promote(g, idx, benchIndex) {
  const p = g.players[idx];
  p.active = p.bench.splice(benchIndex, 1)[0];
  log(g, `${p.name} envoie ${topCard(g, p.active).name}.`);
  g.pending.players = g.pending.players.filter(i => i !== idx);
  if (!g.pending.players.length) {
    const then = g.pending.then;
    g.pending = null;
    if (then === 'next') nextTurn(g);
    else if (then === 'end') endTurn(g);
  }
}

// ---------- Actions possibles ----------
export const slotAt = (g, side, zone, i) => (zone === 'active' ? g.players[side].active : g.players[side].bench[i]);
const allSlots = (g, side) => [g.players[side].active, ...g.players[side].bench].filter(Boolean)
  .map((s, k) => ({ s, zone: k === 0 && g.players[side].active ? 'active' : 'bench', i: g.players[side].active ? k - 1 : k }));

export function canEvolve(g, slot, evoCard) {
  if (!isPokemon(evoCard) || isBasic(evoCard)) return false;
  if (firstTurn(g) || slot.playedTurn === g.turn || slot.evolvedTurn === g.turn) return false;
  const norm = s => s.toLowerCase().replace(/\s+/g, ' ').trim();
  return norm(evoCard.play.from ?? '') === norm(topCard(g, slot).name);
}

export function attackable(g, side) {
  const p = g.players[side];
  if (!p.active || (g.turn === 1 && g.current === g.first)) return [];
  if (['sleep', 'paralysis'].includes(p.active.status)) return [];
  return (topCard(g, p.active).play.atk ?? []).map((a, i) => ({ a, i }))
    .filter(({ a }) => canPay(g, p.active.energies, a.c ?? []));
}

export const retreatCost = (g, slot) => topCard(g, slot).play.retreat ?? 0;
export function canRetreat(g, side) {
  const p = g.players[side];
  return Boolean(p.active && p.bench.length && !p.retreated && !['sleep', 'paralysis'].includes(p.active.status)
    && p.active.energies.length >= retreatCost(g, p.active));
}

/** Toutes les actions possibles du joueur actif (utilisées par l'adversaire et pour griser l'interface). */
export function legalActions(g) {
  if (g.winner != null || g.pending) return [];
  const side = g.current;
  const p = g.players[side];
  const out = [];
  const seen = new Set(); // une seule action par carte identique (évite d'explorer des doublons)
  for (const uid of p.hand) {
    const c = card(g, uid);
    const sig = `${c.name}|${c.play.kind}`;
    if (seen.has(sig)) continue;
    seen.add(sig);
    if (isBasic(c) && p.bench.length < BENCH_MAX) out.push({ type: 'bench', uid });
    if (isPokemon(c) && !isBasic(c)) for (const t of allSlots(g, side)) if (canEvolve(g, t.s, c)) out.push({ type: 'evolve', uid, zone: t.zone, i: t.i });
    if (isEnergy(c) && !p.energy) for (const t of allSlots(g, side)) out.push({ type: 'energy', uid, zone: t.zone, i: t.i });
    if (isTrainer(c)) {
      const kind = trainerKind(c);
      if (kind === 'supporter' && (p.supporter || (g.turn === 1 && g.current === g.first))) continue;
      const eff = trainerEffect(c);
      if (kind === 'tool') { for (const t of allSlots(g, side)) if (!t.s.tools.length) out.push({ type: 'trainer', uid, target: { side, zone: t.zone, i: t.i } }); continue; }
      const targets = eff?.targets ? eff.targets(g, side, uid) : [null];
      if (eff?.canPlay && !eff.canPlay(g, side, uid)) continue;
      for (const target of targets) out.push({ type: 'trainer', uid, target });
    }
  }
  if (canRetreat(g, side)) p.bench.forEach((_, i) => out.push({ type: 'retreat', i }));
  for (const { i } of attackable(g, side)) out.push({ type: 'attack', i });
  out.push({ type: 'end' });
  return out;
}

// ---------- Application d'une action ----------
export function apply(g, action) {
  const side = g.current;
  const p = g.players[side];
  const take = uid => p.hand.splice(p.hand.indexOf(uid), 1);
  switch (action.type) {
    case 'bench': {
      take(action.uid);
      p.bench.push(newSlot(action.uid, g.turn));
      log(g, `${p.name} place ${card(g, action.uid).name} sur son Banc.`);
      break;
    }
    case 'evolve': {
      const slot = slotAt(g, side, action.zone, action.i);
      const from = topCard(g, slot).name;
      take(action.uid);
      slot.stack.push(action.uid);
      slot.evolvedTurn = g.turn;
      slot.status = null;
      log(g, `${from} évolue en ${card(g, action.uid).name} !`);
      break;
    }
    case 'energy': {
      const slot = slotAt(g, side, action.zone, action.i);
      take(action.uid);
      slot.energies.push(action.uid);
      p.energy = true;
      log(g, `${p.name} attache ${card(g, action.uid).name} à ${topCard(g, slot).name}.`);
      break;
    }
    case 'trainer': {
      const c = card(g, action.uid);
      const kind = trainerKind(c);
      take(action.uid);
      if (kind === 'supporter') p.supporter = true;
      if (kind === 'tool') {
        slotAt(g, side, action.target.zone, action.target.i).tools.push(action.uid);
        log(g, `${p.name} attache l'Outil ${c.name}.`);
        break;
      }
      log(g, `${p.name} joue ${c.name}.`);
      const eff = trainerEffect(c);
      if (eff) eff.run(g, side, action.target, action.uid);
      else log(g, `(effet de ${c.name} non simulé)`);
      if (kind === 'stadium') { if (g.stadium != null) g.players[g.stadium.owner].discard.push(g.stadium.uid); g.stadium = { uid: action.uid, owner: side }; }
      else p.discard.push(action.uid);
      checkKOs(g, side);
      break;
    }
    case 'retreat': {
      const cost = retreatCost(g, p.active);
      // Défausse les Énergies les moins utiles : d'abord celles qui ne servent à aucune attaque.
      const discarded = p.active.energies.splice(0, cost);
      p.discard.push(...discarded);
      const old = p.active;
      old.status = null;
      p.active = p.bench.splice(action.i, 1, old)[0];
      p.retreated = true;
      log(g, `${topCard(g, old).name} bat en retraite, ${topCard(g, p.active).name} passe Actif.`);
      break;
    }
    case 'attack': return attack(g, action.i);
    case 'end': return endTurn(g);
    default: break;
  }
  return null;
}

function attack(g, atkIndex) {
  const side = g.current;
  const me = g.players[side];
  const foe = g.players[1 - side];
  const att = me.active;
  const atkCard = topCard(g, att);
  const a = atkCard.play.atk[atkIndex];
  log(g, `${atkCard.name} utilise ${a.n} !`);
  if (att.status === 'confusion') {
    if (!coin(g)) { att.damage += 30; log(g, `${atkCard.name} est Confus et se blesse (30 dégâts).`); checkKOs(g, side); return finishAttack(g); }
  }
  const fx = attackEffects(g, side, a);
  if (fx.fail) { log(g, 'Pile : l\'attaque échoue.'); return finishAttack(g); }
  if (fx.damage > 0 && foe.active) {
    let dmg = fx.damage;
    const def = topCard(g, foe.active);
    const atkType = atkCard.play.colors?.[0];
    if (!fx.noWeakness && def.play.weak && def.play.weak[0] === atkType) {
      const v = def.play.weak[1] ?? '×2';
      dmg = v.includes('×') ? dmg * (parseInt(v.replace(/\D/g, ''), 10) || 2) : dmg + (parseInt(v.replace(/\D/g, ''), 10) || 0);
      log(g, 'C\'est super efficace (Faiblesse) !');
    }
    if (!fx.noWeakness && def.play.res && def.play.res[0] === atkType) dmg = Math.max(0, dmg - (parseInt(String(def.play.res[1]).replace(/\D/g, ''), 10) || 30));
    foe.active.damage += dmg;
    log(g, `${def.name} subit ${dmg} dégâts.`);
  }
  for (const after of fx.after) after();
  checkKOs(g, side);
  return finishAttack(g);
}

function finishAttack(g) {
  if (g.winner != null) return null;
  if (g.pending) { g.pending.then = 'end'; return null; }
  endTurn(g);
  return null;
}

/** Copie légère d'une partie (pour que l'adversaire teste des coups). */
export function clone(g) {
  const { db, log: _l, ...rest } = g;
  const copy = structuredClone(rest);
  copy.db = db;
  copy.log = [];
  copy.sim = true;
  return copy;
}
