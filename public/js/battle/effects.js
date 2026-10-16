// Effets des cartes lus dans leur texte français (TCGdex). Seuls les effets les plus courants sont simulés :
// pioche, recherche, soin, échange, états spéciaux, lancers de pièce, dégâts au Banc, défausse d'Énergies…
// Une carte dont l'effet n'est pas reconnu se joue quand même, sans effet (le journal le signale).
import { card, coin, hpLeft, isBasic, isEnergy, isPokemon, log, topCard, energyType, damageBase, STATUS_FR } from './engine.js';

const WORDS = { une: 1, un: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6, sept: 7, huit: 8 };
const num = s => (s == null ? 0 : (WORDS[s.toLowerCase()] ?? parseInt(s, 10)) || 0);
const text = s => (s ?? '').replace(/[’]/g, "'").replace(/\s+/g, ' ');

// ---------- Petits outils ----------
function shuffleDeck(g, p) {
  for (let i = p.deck.length - 1; i > 0; i--) { const j = Math.floor((g.sim ? Math.random() : (g.seed = (g.seed * 1664525 + 1013904223) % 4294967296) / 4294967296) * (i + 1)); [p.deck[i], p.deck[j]] = [p.deck[j], p.deck[i]]; }
}
export function draw(g, side, n) {
  const p = g.players[side];
  const got = p.deck.splice(0, n);
  p.hand.push(...got);
  log(g, `${p.name} pioche ${got.length} carte${got.length > 1 ? 's' : ''}.`);
}
const slotsOf = (g, side) => [g.players[side].active, ...g.players[side].bench].filter(Boolean);
const refsOf = (g, side, pred = () => true) => {
  const p = g.players[side];
  const out = [];
  if (p.active && pred(p.active)) out.push({ side, zone: 'active', i: 0 });
  p.bench.forEach((s, i) => { if (pred(s)) out.push({ side, zone: 'bench', i }); });
  return out;
};
const at = (g, ref) => (ref.zone === 'active' ? g.players[ref.side].active : g.players[ref.side].bench[ref.i]);
const heal = (g, slot, n) => { slot.damage = Math.max(0, slot.damage - n); };
/** Meilleure carte du deck pour un critère (l'IA comme le joueur prennent la plus forte : PV). */
function pickFromDeck(g, side, pred) {
  const p = g.players[side];
  const cands = p.deck.filter(uid => pred(card(g, uid)));
  if (!cands.length) return null;
  cands.sort((a, b) => (card(g, b).play.power ?? 0) - (card(g, a).play.power ?? 0));
  const uid = cands[0];
  p.deck.splice(p.deck.indexOf(uid), 1);
  return uid;
}
/** Cartes de la main à défausser en priorité (coût de l'Hyper Ball…) : les moins utiles. */
function discardFromHand(g, side, n, except) {
  const p = g.players[side];
  const score = uid => { const c = card(g, uid); return isEnergy(c) ? 1 : isPokemon(c) ? 3 : 2; };
  const order = p.hand.filter(uid => uid !== except).sort((a, b) => score(a) - score(b));
  for (const uid of order.slice(0, n)) { p.hand.splice(p.hand.indexOf(uid), 1); p.discard.push(uid); }
}

// ---------- Dresseurs ----------
const TRAINERS = [
  { // Échange, Corde Sortie (partie joueur)
    re: /Échangez votre Pokémon Actif (avec|contre) l'un de vos Pokémon de Banc/i,
    targets: (g, side) => g.players[side].bench.map((_, i) => ({ side, zone: 'bench', i })),
    run(g, side, t) {
      const p = g.players[side];
      if (!t || !p.bench[t.i]) return;
      const old = p.active; old.status = null;
      p.active = p.bench.splice(t.i, 1, old)[0];
      log(g, `${topCard(g, p.active).name} passe Actif.`);
    },
  },
  { // Ordres du Boss, Attrape-Pokémon, Inversion de Pokémon
    re: /(Pokémon Actif de votre adversaire avec 1 de ses Pokémon de Banc|Pokémon de Banc de votre adversaire sur le Poste Actif|Pokémon de Banc de votre adversaire (avec|contre) son Pokémon Actif|Pokémon du Banc de votre adversaire.*échangez ce Pokémon contre le Pokémon Défenseur)/i,
    targets: (g, side) => g.players[1 - side].bench.map((_, i) => ({ side: 1 - side, zone: 'bench', i })),
    run(g, side, t, uid) {
      const foe = g.players[1 - side];
      if (!t || !foe.bench[t.i]) return;
      if (/Lancez une pièce/i.test(text(card(g, uid).play.text)) && !coin(g)) return log(g, 'Pile : rien ne se passe.');
      const old = foe.active;
      foe.active = foe.bench.splice(t.i, 1, old)[0];
      log(g, `${topCard(g, foe.active).name} est envoyé au Poste Actif.`);
    },
  },
  { // Potion, Dame du Centre Pokémon, Potion Max
    re: /(Soignez (\d+|tous les) dégâts|Retirez jusqu'à (\d+) marqueurs? de dégâts) (et retirez tous les États Spéciaux )?(de l'un de vos|d'1 de vos|de 1 de vos|de votre)/i,
    targets: (g, side) => refsOf(g, side, s => s.damage > 0),
    run(g, side, t, uid) {
      const s = t && at(g, t);
      if (!s) return;
      const m = text(card(g, uid).play.text).match(this.re);
      const n = m[2] === 'tous les' ? s.damage : m[2] ? num(m[2]) : num(m[3]) * 10;
      heal(g, s, n);
      if (/États Spéciaux/i.test(m[0])) s.status = null;
      if (m[2] === 'tous les' && /défaussez toutes les Énergies/i.test(card(g, uid).play.text)) { g.players[side].discard.push(...s.energies); s.energies = []; }
      log(g, `${topCard(g, s).name} récupère ${n} PV.`);
    },
  },
  { re: /Retirez tous les États Spéciaux de votre Pokémon Actif/i, run(g, side) { if (g.players[side].active) g.players[side].active.status = null; } },
  { // Recherches Professorales, Professeur Chen
    re: /Défaussez votre main,? (puis|et) piochez (\d+|\w+) cartes/i,
    run(g, side, t, uid) {
      const p = g.players[side];
      p.discard.push(...p.hand.splice(0));
      draw(g, side, num(text(card(g, uid).play.text).match(this.re)[2]));
    },
  },
  { // Sannah, Professeur Orme…
    re: /Mélangez votre main avec votre deck\. Ensuite, piochez (\d+|\w+) cartes/i,
    run(g, side, t, uid) {
      const p = g.players[side];
      p.deck.push(...p.hand.splice(0)); shuffleDeck(g, p);
      draw(g, side, num(text(card(g, uid).play.text).match(this.re)[1]));
    },
  },
  { // Copieuse
    re: /Mélangez votre main avec votre deck\. Ensuite, piochez un nombre de cartes égal au nombre de cartes de la main de votre adversaire/i,
    run(g, side) { const p = g.players[side]; p.deck.push(...p.hand.splice(0)); shuffleDeck(g, p); draw(g, side, g.players[1 - side].hand.length); },
  },
  { // Juge
    re: /Chaque joueur mélange sa main avec son deck,? (puis|et|\. Ensuite,) (chaque joueur )?pioche (\d+|\w+) cartes/i,
    run(g, side, t, uid) {
      const n = num(text(card(g, uid).play.text).match(this.re)[3]);
      for (const s of [side, 1 - side]) { const p = g.players[s]; p.deck.push(...p.hand.splice(0)); shuffleDeck(g, p); draw(g, s, n); }
    },
  },
  { // N
    re: /pioche une carte pour chacune des cartes Récompense/i,
    run(g, side) { for (const s of [side, 1 - side]) { const p = g.players[s]; p.deck.push(...p.hand.splice(0)); shuffleDeck(g, p); draw(g, s, p.prizes.length); } },
  },
  { // Fan Club Pokémon, Faiblo Ball, Appel à la Famille…
    re: /Cherchez dans votre deck (un|jusqu'à (\d+|\w+)) (cartes? )?(Bébé Pokémon et\/ou )?Pokémon de base,? (puis |et )?placez-(le|les) sur votre Banc/i,
    canPlay: (g, side) => g.players[side].bench.length < 5,
    run(g, side, t, uid) {
      const m = text(card(g, uid).play.text).match(this.re);
      const n = m[2] ? num(m[2]) : 1;
      const p = g.players[side];
      for (let k = 0; k < n && p.bench.length < 5; k++) {
        const got = pickFromDeck(g, side, isBasic);
        if (got == null) break;
        p.bench.push({ stack: [got], energies: [], tools: [], damage: 0, status: null, playedTurn: g.turn, evolvedTurn: -1 });
        log(g, `${card(g, got).name} est placé sur le Banc.`);
      }
      shuffleDeck(g, p);
    },
  },
  { // Hyper Ball, Rapide Ball, Poké Ball, Master Ball, Double boule
    re: /Cherchez (un|une carte) Pokémon( de base)?( de Niveau 1| d'Évolution)? dans votre deck|Cherchez dans votre deck (un|une carte) Pokémon( de base)?.*(ajoutez|placez)-le dans votre main|Cherchez dans votre deck un Pokémon de base, montrez-le, puis ajoutez-le à votre main/i,
    canPlay(g, side, uid) {
      const m = text(card(g, uid).play.text).match(/défausse[rz]? (\d+|une|deux) (autres? )?cartes? de votre main/i);
      return !m || g.players[side].hand.length - 1 >= num(m[1]);
    },
    run(g, side, t, uid) {
      const tx = text(card(g, uid).play.text);
      const cost = tx.match(/défausse[rz]? (\d+|une|deux) (autres? )?cartes? de votre main/i);
      if (cost) discardFromHand(g, side, num(cost[1]), uid);
      const flips = /Lancez 2 pièces/i.test(tx) ? [coin(g), coin(g)].filter(Boolean).length : /Lancez une pièce/i.test(tx) ? (coin(g) ? 1 : 0) : 1;
      if (!flips) return log(g, 'Pile : aucune recherche.');
      const basicOnly = /Pokémon de base/i.test(tx);
      for (let k = 0; k < flips; k++) {
        const got = pickFromDeck(g, side, c => isPokemon(c) && (!basicOnly || isBasic(c)));
        if (got != null) { g.players[side].hand.push(got); log(g, `${g.players[side].name} ajoute ${card(g, got).name} à sa main.`); }
      }
      shuffleDeck(g, g.players[side]);
    },
  },
  { // Recherche d'Énergie
    re: /Énergie de base dans votre deck.*main|dans votre deck une carte Énergie de base/i,
    run(g, side) {
      const got = pickFromDeck(g, side, c => isEnergy(c) && c.play.basic);
      if (got != null) g.players[side].hand.push(got);
      shuffleDeck(g, g.players[side]);
    },
  },
  { // Récupération d'Énergie
    re: /Ajoutez jusqu'à (\d+|\w+) cartes? Énergie de base de votre pile de défausse à votre main/i,
    canPlay: (g, side) => g.players[side].discard.some(uid => isEnergy(card(g, uid)) && card(g, uid).play.basic),
    run(g, side, t, uid) {
      const p = g.players[side];
      const n = num(text(card(g, uid).play.text).match(this.re)[1]);
      for (const e of p.discard.filter(x => isEnergy(card(g, x)) && card(g, x).play.basic).slice(0, n)) { p.discard.splice(p.discard.indexOf(e), 1); p.hand.push(e); }
      log(g, `${p.name} récupère des Énergies de sa défausse.`);
    },
  },
  { // Échange d'Énergie : de 1 Pokémon vers un autre
    re: /Déplacez une carte Énergie de base attachée à 1 de vos Pokémon sur 1 autre de vos Pokémon/i,
    targets(g, side) {
      const out = [];
      const refs = refsOf(g, side);
      for (const from of refs) if (at(g, from).energies.some(uid => card(g, uid).play.basic)) for (const to of refs) if (to !== from) out.push({ side, from, to, zone: to.zone, i: to.i });
      return out;
    },
    run(g, side, t) {
      if (!t) return;
      const from = at(g, t.from), to = at(g, t.to);
      const e = from.energies.find(uid => card(g, uid).play.basic);
      if (e == null) return;
      from.energies.splice(from.energies.indexOf(e), 1); to.energies.push(e);
      log(g, `Une Énergie passe de ${topCard(g, from).name} à ${topCard(g, to).name}.`);
    },
  },
  { // Maillet Écrasant
    re: /défaussez une Énergie attachée à 1 des Pokémon de votre adversaire/i,
    targets: (g, side) => refsOf(g, 1 - side, s => s.energies.length > 0),
    run(g, side, t, uid) {
      if (!t) return;
      if (/Lancez une pièce/i.test(text(card(g, uid).play.text)) && !coin(g)) return log(g, 'Pile : rien ne se passe.');
      const s = at(g, t); const e = s.energies.pop();
      g.players[1 - side].discard.push(e);
      log(g, `${topCard(g, s).name} perd une Énergie.`);
    },
  },
  { // Super Bonbon : Pokémon de base → Niveau 2 directement
    re: /Choisissez 1 de vos Pokémon de base en jeu\. Si vous (avez|possédez) dans votre main (un Pokémon de Niveau 2|une carte Niveau 1 ou Niveau 2)/i,
    targets(g, side) {
      if (g.turn === 1) return [];
      const p = g.players[side];
      const out = [];
      refsOf(g, side, s => s.stack.length === 1 && s.playedTurn !== g.turn).forEach(ref => {
        const evo = rareCandyTarget(g, side, at(g, ref));
        if (evo != null) out.push({ ...ref, evo });
      });
      return out;
    },
    run(g, side, t) {
      if (!t) return;
      const p = g.players[side];
      const s = at(g, t);
      p.hand.splice(p.hand.indexOf(t.evo), 1);
      s.stack.push(t.evo); s.evolvedTurn = g.turn; s.status = null;
      log(g, `Super Bonbon : ${card(g, s.stack[0]).name} évolue directement en ${card(g, t.evo).name} !`);
    },
  },
  { // Piochez N cartes (Tcheren…)
    re: /^Piochez (\d+|\w+) cartes?\.?$/i,
    run(g, side, t, uid) { draw(g, side, num(text(card(g, uid).play.text).match(this.re)[1])); },
  },
];

/** Niveau 2 de la main qui évolue (via son Niveau 1) du Pokémon de base de ce slot. */
function rareCandyTarget(g, side, slot) {
  const basic = card(g, slot.stack[0]);
  const norm = s => (s ?? '').toLowerCase().trim();
  for (const uid of g.players[side].hand) {
    const c = card(g, uid);
    if (!isPokemon(c) || c.play.stage !== 'Niveau 2') continue;
    const stage1 = g.db.find(x => norm(x.name) === norm(c.play.from) && x.play?.from);
    if (stage1 ? norm(stage1.play.from) === norm(basic.name) : (c.play.dex?.[0] - 2 === basic.play.dex?.[0])) return uid;
  }
  return null;
}

const cache = new Map();
export function trainerEffect(c) {
  if (!cache.has(c.name + c.play.text)) {
    const t = text(c.play.text);
    cache.set(c.name + c.play.text, TRAINERS.find(h => h.re.test(t)) ?? null);
  }
  return cache.get(c.name + c.play.text);
}

// ---------- Attaques ----------
/**
 * Calcule les dégâts d'une attaque et prépare ses effets secondaires.
 * @returns {{ damage, fail, noWeakness, after: Function[] }}
 */
export function attackEffects(g, side, a) {
  const me = g.players[side];
  const foe = g.players[1 - side];
  const att = me.active;
  const e = text(a.e);
  const d = String(a.d ?? '');
  let damage = damageBase(a);
  const fx = { damage, fail: false, noWeakness: /n'est pas affectée par la Faiblesse/i.test(e), after: [] };

  // Lancers de pièce
  let m;
  if ((m = e.match(/Lancez (\d+|une|deux|trois|quatre|cinq) pièces?\. Cette attaque inflige (\d+) dégâts (multipliés par le nombre de côtés face|pour chaque côté face)/i))) {
    let heads = 0; for (let k = 0; k < num(m[1]); k++) if (coin(g)) heads++;
    fx.damage = num(m[2]) * heads;
    log(g, `${heads} face${heads > 1 ? 's' : ''} sur ${num(m[1])}.`);
  } else if ((m = e.match(/Lancez une pièce jusqu'à obtenir pile\. Cette attaque inflige (\d+) dégâts (multipliés par le nombre de côtés face|pour chaque côté face)/i))) {
    let heads = 0; while (coin(g) && heads < 20) heads++;
    fx.damage = num(m[1]) * heads;
    log(g, `${heads} face${heads > 1 ? 's' : ''} avant pile.`);
  } else if (/Lancez une pièce\. Si c'est pile, cette attaque ne fait rien/i.test(e)) {
    if (!coin(g)) fx.fail = true;
  } else if ((m = e.match(/Lancez une pièce\. Si c'est face, cette attaque inflige (\d+) dégâts supplémentaires/i))) {
    if (coin(g)) { fx.damage += num(m[1]); log(g, 'Face : dégâts supplémentaires !'); }
  }
  // Dégâts selon les Énergies, les marqueurs, le Banc
  if ((m = e.match(/(\d+) dégâts (supplémentaires )?pour chaque Énergie attachée à ce Pokémon/i))) {
    fx.damage = (m[2] ? damage : 0) + num(m[1]) * att.energies.length;
  }
  if ((m = e.match(/Si au moins un marqueur de dégâts est placé sur ce Pokémon, cette attaque inflige (\d+) dégâts supplémentaires/i)) && att.damage > 0) fx.damage += num(m[1]);
  if ((m = e.match(/(\d+) dégâts (supplémentaires )?pour chaque marqueur de dégâts (placé )?sur ce Pokémon/i))) fx.damage = (m[2] ? damage : 0) + num(m[1]) * (att.damage / 10);
  if ((m = e.match(/(\d+) dégâts (supplémentaires )?pour chacun de vos Pokémon de Banc/i))) fx.damage = (m[2] ? damage : 0) + num(m[1]) * me.bench.length;
  if ((m = e.match(/(\d+) dégâts (supplémentaires )?pour chaque Pokémon de Banc de votre adversaire/i))) fx.damage = (m[2] ? damage : 0) + num(m[1]) * foe.bench.length;
  if (d.endsWith('×') && fx.damage === damage && !/pièce/i.test(e)) fx.damage = damage; // multiplicateur non reconnu : dégâts de base

  // États spéciaux sur le Pokémon Actif adverse
  const statusRe = /(Empoisonné|Brûlé|Endormi|Paralysé|Confus)/g;
  if (/(Pokémon Actif de votre adversaire|Pokémon Défenseur) est maintenant/i.test(e)) {
    const sentence = e.match(/[^.]*(Pokémon Actif de votre adversaire|Pokémon Défenseur) est maintenant[^.]*\./i)[0];
    const statuses = [...sentence.matchAll(statusRe)].map(x => x[1]);
    const needsHeads = /Lancez une pièce\. Si c'est face, (le Pokémon Actif de votre adversaire|le Pokémon Défenseur) est maintenant/i.test(e);
    fx.after.push(() => {
      if (!foe.active || hpLeft(g, foe.active) <= 0) return;
      if (needsHeads && !coin(g)) return;
      const code = { Empoisonné: 'poison', Brûlé: 'burn', Endormi: 'sleep', Paralysé: 'paralysis', Confus: 'confusion' }[statuses.at(-1)];
      if (code) { foe.active.status = code; log(g, `${topCard(g, foe.active).name} est maintenant ${STATUS_FR[code]}.`); }
    });
  }
  // Soin, pioche, dégâts au Banc, dégâts à soi-même, défausse d'Énergies
  if ((m = e.match(/Soignez (\d+) dégâts de ce Pokémon/i))) { const n = num(m[1]); fx.after.push(() => heal(g, att, n)); }
  if ((m = e.match(/Piochez (\d+|une|deux|trois) cartes?/i))) { const n = num(m[1]); fx.after.push(() => draw(g, side, n)); }
  if ((m = e.match(/(\d+) dégâts à chacun des Pokémon de Banc de votre adversaire/i))) {
    const n = num(m[1]); fx.after.push(() => foe.bench.forEach(s => { s.damage += n; }));
  } else if ((m = e.match(/(\d+) dégâts à (1|l'un|un) des Pokémon de Banc de votre adversaire/i))) {
    const n = num(m[1]);
    fx.after.push(() => {
      const target = [...foe.bench].sort((x, y) => hpLeft(g, x) - hpLeft(g, y))[0];
      if (target) { target.damage += n; log(g, `${topCard(g, target).name} (Banc) subit ${n} dégâts.`); }
    });
  }
  if ((m = e.match(/Ce Pokémon (s'inflige|subit) aussi (\d+) dégâts/i))) { const n = num(m[2]); fx.after.push(() => { att.damage += n; }); }
  if ((m = e.match(/Défaussez (\d+|une|deux|trois|toutes les) (cartes? )?Énergies?[^.]*?(de ce Pokémon|attachées? à ce Pokémon|attachées? à [A-ZÉ])/i))) {
    const all = /toutes les/i.test(m[1]);
    const n = all ? Infinity : num(m[1]);
    fx.after.push(() => { const gone = att.energies.splice(0, Math.min(n, att.energies.length)); me.discard.push(...gone); });
  }
  if (fx.fail) fx.damage = 0;
  return fx;
}

/** Résumé lisible d'une attaque pour l'interface. */
export const attackSummary = a => `${a.n}${a.d ? ` · ${a.d}` : ''}`;
export const energyTypeOf = (g, uid) => energyType(card(g, uid));
export { slotsOf };
