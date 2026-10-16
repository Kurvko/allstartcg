// Decks : construction avec les cartes de sa collection, règles officielles de chaque jeu
// (simplifiées) et decks conseillés générés à partir de ce qu'on possède.
import { GAMES, findSet } from './catalog.js';
import { loadSet } from './data.js';
import { getState, getDecks, saveDeck, deleteDeck } from './store.js';
import { app, esc, fmt } from './ui.js';
import { icon } from './icons.js';

// ---------- Règles de construction ----------

const PK_ENERGIES = ['Plante', 'Feu', 'Eau', 'Électrique', 'Psy', 'Combat', 'Obscurité', 'Métal'];
const MTG_LANDS = { W: 'Plaine', U: 'Île', B: 'Marais', R: 'Montagne', G: 'Forêt' };

export const RULES = {
  pokemon: {
    min: 60, max: 60, copies: 4,
    kinds: { pokemon: 'Pokémon', trainer: 'Dresseurs', energy: 'Énergies' },
    basics: { kind: 'energy', colors: PK_ENERGIES, name: c => `Énergie ${c} de base` },
    text: '60 cartes exactement · 4 exemplaires max d\'une même carte (sauf Énergies de base) · au moins 1 Pokémon de base.',
  },
  onepiece: {
    min: 50, max: 50, copies: 4, leader: 'leader', matchLeader: true,
    kinds: { character: 'Personnages', event: 'Événements', stage: 'Lieux' },
    text: '1 Leader + 50 cartes exactement · 4 exemplaires max · uniquement les couleurs du Leader.',
  },
  dragonball: {
    min: 50, max: 60, copies: 4, leader: 'leader', matchLeader: true,
    kinds: { battle: 'Combat', extra: 'Extra' },
    text: '1 Leader + 50 à 60 cartes · 4 exemplaires max · couleurs du Leader conseillées.',
  },
  yugioh: {
    min: 40, max: 60, copies: 3, extraMax: 15,
    kinds: { monster: 'Monstres', spell: 'Magies', trap: 'Pièges' },
    text: 'Deck principal de 40 à 60 cartes · Extra Deck de 15 cartes max · 3 exemplaires max.',
  },
  riftbound: {
    min: 40, max: 40, copies: 3, leader: 'legend', matchLeader: true, battlefields: 3,
    kinds: { champion: 'Champions', unit: 'Unités', spell: 'Sorts', gear: 'Équipements', battlefield: 'Champs de bataille' },
    text: '1 Légende + 40 cartes (dont 1 Champion) · 3 exemplaires max · domaines de la Légende · 3 champs de bataille · 12 runes ajoutées automatiquement.',
  },
  lorcana: {
    min: 60, max: Infinity, copies: 4, maxColors: 2,
    kinds: { character: 'Personnages', action: 'Actions', item: 'Objets', location: 'Lieux' },
    text: '60 cartes minimum · 4 exemplaires max · 2 encres maximum.',
  },
  magic: {
    min: 60, max: Infinity, copies: 4,
    kinds: { creature: 'Créatures', spell: 'Sorts', land: 'Terrains' },
    basics: { kind: 'land', colors: Object.keys(MTG_LANDS), name: c => MTG_LANDS[c] },
    text: '60 cartes minimum · 4 exemplaires max (sauf terrains de base).',
  },
};

const COLOR_FR = {
  Red: 'Rouge', Blue: 'Bleu', Green: 'Vert', Yellow: 'Jaune', Purple: 'Violet', Black: 'Noir', White: 'Blanc',
  W: 'Blanc', U: 'Bleu', B: 'Noir', R: 'Rouge', G: 'Vert',
  Amber: 'Ambre', Amethyst: 'Améthyste', Emerald: 'Émeraude', Ruby: 'Rubis', Sapphire: 'Saphir', Steel: 'Acier',
  Fury: 'Fureur', Calm: 'Calme', Mind: 'Esprit', Body: 'Corps', Chaos: 'Chaos', Order: 'Ordre',
  LIGHT: 'Lumière', DARK: 'Ténèbres', FIRE: 'Feu', WATER: 'Eau', EARTH: 'Terre', WIND: 'Vent', DIVINE: 'Divin',
};
const COLOR_HEX = {
  Red: '#e5484d', Blue: '#3e8bff', Green: '#30a46c', Yellow: '#f5c518', Purple: '#9b5de5', Black: '#5b5f6e', White: '#e8e8e8',
  W: '#f3ecd2', U: '#3e8bff', B: '#6b5b73', R: '#e5484d', G: '#30a46c',
  Amber: '#f4b400', Amethyst: '#8e44ad', Emerald: '#27ae60', Ruby: '#c0392b', Sapphire: '#2e86de', Steel: '#95a5a6',
  Fury: '#e5484d', Calm: '#30a46c', Mind: '#3e8bff', Body: '#f08c00', Chaos: '#9b5de5', Order: '#f5c518',
  Plante: '#30a46c', Feu: '#e5484d', Eau: '#3e8bff', 'Électrique': '#f5c518', Psy: '#b45cd6', Combat: '#c2703d',
  'Obscurité': '#4b4f63', 'Métal': '#95a5a6', Dragon: '#c8a03b', Fée: '#f78fb3', Incolore: '#d5d5d5',
};
const colorName = c => COLOR_FR[c] ?? c;
const colorDot = c => `<i class="cdot" style="background:${COLOR_HEX[c] ?? '#888'}" title="${esc(colorName(c))}"></i>`;

// ---------- Réserve de cartes (collection) ----------

const isBasicKey = key => key.startsWith('basic:');
const nameKey = card => card.name.toLowerCase().replace(/\s+/g, ' ').trim();

/** Toutes les cartes possédées d'un jeu : [{ key, card, setKey, set, owned }]. */
async function loadPool(gameId) {
  const { collection } = getState();
  const game = GAMES.find(g => g.id === gameId);
  const pool = [];
  await Promise.all(game.sets.map(async set => {
    const setKey = `${gameId}/${set.id}`;
    const owned = collection[setKey];
    if (!owned || !Object.keys(owned).length) return;
    let data;
    try { data = await loadSet(setKey); } catch { return; }
    for (const [id, n] of Object.entries(owned)) {
      const card = data.byId.get(id);
      if (card?.play?.kind) pool.push({ key: `${setKey}|${id}`, card, setKey, set, owned: n });
    }
  }));
  return pool;
}

const basicEntry = (gameId, color) => {
  const r = RULES[gameId];
  return { key: `basic:${color}`, basic: true, owned: Infinity, card: { name: r.basics.name(color), price: 0, play: { kind: r.basics.kind, colors: [color], basic: true } } };
};

function entryOf(key, byKey, gameId) {
  if (isBasicKey(key)) return basicEntry(gameId, key.slice(6));
  return byKey.get(key);
}

const slot = (gameId, card) => {
  const p = card.play ?? {};
  if (gameId === 'yugioh' && p.extra) return 'extra';
  if (gameId === 'riftbound' && p.kind === 'battlefield') return 'battlefield';
  return 'main';
};

// ---------- Vérification ----------

export function checkDeck(deck, byKey) {
  const r = RULES[deck.game];
  const issues = [];
  const leader = deck.leader ? byKey.get(deck.leader) : null;
  if (r.leader && !leader) issues.push(`Choisis ${r.leader === 'legend' ? 'une Légende' : 'un Leader'} (clique sur une carte ${r.leader === 'legend' ? 'Légende' : 'Leader'}).`);
  const count = { main: 0, extra: 0, battlefield: 0 };
  const byName = new Map();
  const colors = new Set();
  let basicsPk = 0, champions = 0, value = leader?.card.price ?? 0;
  for (const [key, n] of Object.entries(deck.cards)) {
    const e = entryOf(key, byKey, deck.game);
    if (!e) { issues.push('Une carte du deck n\'est plus dans ta collection.'); continue; }
    count[slot(deck.game, e.card)] += n;
    value += (e.card.price ?? 0) * n;
    if (!e.basic && n > e.owned) issues.push(`${e.card.name} : tu n'en possèdes que ${e.owned}.`);
    if (!e.card.play.basic) {
      const k = nameKey(e.card);
      byName.set(k, { name: e.card.name, n: (byName.get(k)?.n ?? 0) + n });
    }
    for (const c of e.card.play.colors ?? []) if (!(deck.game === 'pokemon' && e.card.play.kind !== 'pokemon')) colors.add(c);
    if (deck.game === 'pokemon' && e.card.play.kind === 'pokemon' && e.card.play.stage === 'Base') basicsPk += n;
    if (deck.game === 'riftbound' && e.card.play.kind === 'champion') champions += n;
    if (r.matchLeader && leader && e.card.play.colors?.length) {
      const ok = e.card.play.colors.every(c => leader.card.play.colors?.includes(c));
      if (!ok) issues.push(`${e.card.name} n'est pas de la couleur du ${r.leader === 'legend' ? 'domaine de la Légende' : 'Leader'}.`);
    }
  }
  if (count.main < r.min) issues.push(`${count.main}/${r.min} cartes : il en manque ${r.min - count.main}.`);
  if (count.main > r.max) issues.push(`${count.main} cartes : ${count.main - r.max} de trop (max ${r.max}).`);
  for (const { name, n } of byName.values()) if (n > r.copies) issues.push(`${name} : ${n} exemplaires (max ${r.copies}).`);
  if (r.extraMax && count.extra > r.extraMax) issues.push(`Extra Deck : ${count.extra}/${r.extraMax} cartes.`);
  if (r.battlefields && count.battlefield !== r.battlefields) issues.push(`Champs de bataille : ${count.battlefield}/${r.battlefields}.`);
  if (r.maxColors && colors.size > r.maxColors) issues.push(`${colors.size} encres : 2 maximum.`);
  if (deck.game === 'pokemon' && count.main && !basicsPk) issues.push('Il faut au moins 1 Pokémon de base.');
  if (deck.game === 'riftbound' && count.main && !champions) issues.push('Il faut au moins 1 Champion.');
  return { ok: !issues.length, issues: [...new Set(issues)], count, value, colors: [...colors], leader };
}

// ---------- Decks conseillés ----------

/** Force estimée d'une carte : rareté, cote (les cartes jouées en tournoi sont chères) et efficacité. */
function quality(e) {
  const c = e.card, p = c.play;
  let q = (c.tier ?? 0) * 1.2 + Math.log10(1 + (c.price ?? 0)) * 3;
  if (p.cost != null && p.power != null && p.cost > 0) q += Math.min(2, p.power / (p.cost * (p.power > 100 ? 1000 : 1.5)));
  return q;
}

function combos(list, k) {
  if (k === 1) return list.map(x => [x]);
  return list.flatMap((x, i) => combos(list.slice(i + 1), k - 1).map(rest => [x, ...rest]));
}

// Exemplaires déjà placés par nom, partagés entre les appels successifs à fill() pour un même deck.
const NAMES = new WeakMap();

/** Ajoute des cartes au deck en respectant possession et limite d'exemplaires (par nom). */
function fill(cards, entries, limit, copies) {
  if (!NAMES.has(cards)) NAMES.set(cards, new Map());
  const perName = NAMES.get(cards);
  let added = 0;
  for (const e of entries) {
    if (added >= limit) break;
    const k = nameKey(e.card);
    const room = Math.min(e.owned - (cards[e.key] ?? 0), copies - (perName.get(k) ?? 0), limit - added);
    if (room <= 0) continue;
    cards[e.key] = (cards[e.key] ?? 0) + room;
    perName.set(k, (perName.get(k) ?? 0) + room);
    added += room;
  }
  return added;
}

const fits = (e, colors) => !e.card.play.colors?.length || e.card.play.colors.every(c => colors.includes(c));
const byQuality = list => [...list].sort((a, b) => quality(b) - quality(a));

function buildFor(gameId, pool, colors, leader) {
  const r = RULES[gameId];
  const cards = {};
  const kind = k => byQuality(pool.filter(e => e.card.play.kind === k && fits(e, colors)));
  let main = 0;
  if (gameId === 'pokemon') {
    const allMons = pool.filter(e => e.card.play.kind === 'pokemon');
    const mons = byQuality(allMons.filter(e => e.card.play.colors?.some(c => colors.includes(c))));
    // Meilleure version possédée de chaque Pokémon, par nom (pour retrouver les pré-évolutions).
    const bestByName = new Map();
    for (const e of byQuality(allMons)) if (!bestByName.has(nameKey(e.card))) bestByName.set(nameKey(e.card), e);
    // Une évolution n'entre dans le deck qu'avec toute sa lignée (ex. Grolem-ex + Gravalanch + Racaillou).
    const line = e => {
      const chain = [e];
      for (let cur = e; cur.card.play.from;) {
        cur = bestByName.get(cur.card.play.from.toLowerCase().replace(/\s+/g, ' ').trim());
        if (!cur || chain.includes(cur)) return null;
        chain.push(cur);
      }
      return chain.reverse();
    };
    for (const e of mons) {
      if (main >= 18) break;
      const chain = line(e);
      if (!chain) continue;
      const n = Math.min(chain.length > 1 ? 2 : 3, 18 - main);
      for (const link of chain) main += fill(cards, [link], Math.max(0, n - (cards[link.key] ?? 0)), r.copies);
    }
    main += fill(cards, kind('trainer'), 28, r.copies);
    main += fill(cards, kind('energy').filter(e => !e.card.play.basic), 2, r.copies);
    const rest = r.min - main;
    colors.forEach((c, i) => { const n = Math.floor(rest / colors.length) + (i < rest % colors.length ? 1 : 0); if (n) cards[`basic:${c}`] = n; });
    main = r.min;
  } else if (gameId === 'magic') {
    const spells = byQuality(pool.filter(e => e.card.play.kind !== 'land' && fits(e, colors)));
    main += fill(cards, spells.filter(e => e.card.play.kind === 'creature'), 18, r.copies);
    main += fill(cards, spells, 36 - main, r.copies);
    main += fill(cards, kind('land').filter(e => !e.card.play.basic), 4, r.copies);
    const rest = Math.max(0, r.min - main);
    colors.forEach((c, i) => { const n = Math.floor(rest / colors.length) + (i < rest % colors.length ? 1 : 0); if (n) cards[`basic:${c}`] = n; });
    main += rest;
  } else if (gameId === 'yugioh') {
    main += fill(cards, kind('monster').filter(e => !e.card.play.extra), 22, r.copies);
    main += fill(cards, kind('spell'), 32 - main, r.copies);
    main += fill(cards, kind('trap'), 40 - main, r.copies);
    main += fill(cards, byQuality(pool.filter(e => !e.card.play.extra)), 40 - main, r.copies);
    fill(cards, byQuality(pool.filter(e => e.card.play.extra)), r.extraMax, r.copies);
  } else if (gameId === 'riftbound') {
    main += fill(cards, kind('champion'), 3, r.copies);
    main += fill(cards, byQuality(pool.filter(e => ['unit', 'spell', 'gear', 'champion'].includes(e.card.play.kind) && fits(e, colors))), r.min - main, r.copies);
    fill(cards, kind('battlefield'), r.battlefields, 1);
  } else {
    const playable = Object.keys(r.kinds);
    main += fill(cards, byQuality(pool.filter(e => playable.includes(e.card.play.kind) && fits(e, colors))), r.min, r.copies);
  }
  return { cards, main, leader: leader?.key ?? null };
}

export function recommend(gameId, pool) {
  const r = RULES[gameId];
  const out = [];
  const add = (name, colors, leader) => {
    const built = buildFor(gameId, pool, colors, leader);
    const real = Object.entries(built.cards).filter(([k]) => !isBasicKey(k));
    if (real.length < 3) return;
    const score = real.reduce((s, [k, n]) => s + quality(pool.find(e => e.key === k)) * n, 0) + (leader ? quality(leader) * 4 : 0);
    out.push({ name, colors, ...built, score, missing: Math.max(0, r.min - built.main) });
  };
  if (r.leader) {
    const leaders = byQuality(pool.filter(e => e.card.play.kind === r.leader));
    const seen = new Set();
    for (const l of leaders) {
      if (seen.has(nameKey(l.card))) continue;
      seen.add(nameKey(l.card));
      const colors = l.card.play.colors ?? [];
      add(`${l.card.name} (${colors.map(colorName).join(' / ')})`, colors, l);
    }
  } else if (gameId === 'pokemon') {
    const types = new Map();
    for (const e of pool) if (e.card.play.kind === 'pokemon') for (const t of e.card.play.colors ?? []) types.set(t, (types.get(t) ?? 0) + e.owned);
    const main = [...types].filter(([t]) => PK_ENERGIES.includes(t)).sort((a, b) => b[1] - a[1]).map(([t]) => t).slice(0, 5);
    for (const t of main) add(`Deck ${t}`, [t]);
    for (const [a, b] of combos(main.slice(0, 3), 2)) add(`Deck ${a} / ${b}`, [a, b]);
  } else if (gameId === 'magic' || gameId === 'lorcana') {
    const all = gameId === 'magic' ? Object.keys(MTG_LANDS) : ['Amber', 'Amethyst', 'Emerald', 'Ruby', 'Sapphire', 'Steel'];
    for (const pair of combos(all, 2)) add(`Deck ${pair.map(colorName).join(' / ')}`, pair);
  } else {
    add('Meilleures cartes de ta collection', []);
  }
  // Decks complets d'abord, puis les plus forts ; 3 propositions max.
  return out.sort((a, b) => (a.missing > 0) - (b.missing > 0) || b.score - a.score).slice(0, 3);
}

// ---------- Pages ----------

// Les cartes sport n'ont pas de règles de deck.
const DECK_GAMES = GAMES.filter(g => RULES[g.id]);
const gameOf = id => DECK_GAMES.find(g => g.id === id);
const cover = (deck, byKey) => {
  const l = deck.leader && byKey.get(deck.leader);
  if (l) return l.card.img;
  let best = null;
  for (const [k, n] of Object.entries(deck.cards)) { const e = byKey.get(k); if (e && (!best || (e.card.price ?? 0) > (best.card.price ?? 0))) best = e; }
  return best?.card.img;
};

export async function viewDecks(path = '', helpers = {}) {
  if (path && !path.startsWith('jeu/')) return viewDeck(path, helpers);
  const gameId = path.slice(4) || localStorage.getItem('allstar:deckGame') || DECK_GAMES[0].id;
  try { localStorage.setItem('allstar:deckGame', gameId); } catch { /* ignore */ }
  const game = gameOf(gameId) ?? DECK_GAMES[0];
  const rules = RULES[game.id];
  app.innerHTML = `
    <section class="page" style="--c:${game.color};--a:${game.accent}">
      <h1>Decks</h1>
      <nav class="game-tabs">${DECK_GAMES.map(g => `<a href="#/decks/jeu/${g.id}" class="${g.id === game.id ? 'on' : ''}" style="--c:${g.color}">${esc(g.short ?? g.name)}</a>`).join('')}</nav>
      <p class="muted rules-line">${icon('scroll-text')} ${esc(rules.text)}</p>
      <div class="page-head"><h2>Mes decks ${esc(game.name)}</h2><button class="btn primary" data-new>+ Nouveau deck</button></div>
      <div class="deck-list mine"><p class="muted">Chargement…</p></div>
      <h2>Decks conseillés avec ta collection</h2>
      <p class="muted">Construits automatiquement avec les cartes que tu possèdes, en suivant les règles du jeu. Prends-en un comme base et modifie-le.</p>
      <div class="deck-list recos"><p class="muted">Analyse de ta collection…</p></div>
    </section>`;

  app.querySelector('[data-new]').addEventListener('click', () => {
    const deck = saveDeck({ game: game.id, name: `Nouveau deck ${game.short ?? game.name}`, cards: {}, leader: null });
    location.hash = `#/decks/${deck.id}`;
  });

  const pool = await loadPool(game.id);
  const byKey = new Map(pool.map(e => [e.key, e]));
  const mine = getDecks(game.id);
  app.querySelector('.mine').innerHTML = mine.length ? mine.map(d => {
    const chk = checkDeck(d, byKey);
    const img = cover(d, byKey);
    return `
      <a class="deck-tile" href="#/decks/${d.id}">
        <div class="deck-cover">${img ? `<img src="${img}" alt="" loading="lazy">` : backImg(game)}</div>
        <div class="deck-body">
          <h3>${esc(d.name)}</h3>
          <p class="muted">${chk.count.main} cartes · ${fmt(chk.value)}</p>
          <span class="badge ${chk.ok ? 'ok' : 'ko'}">${chk.ok ? `${icon('check')} Prêt à jouer` : `${icon('triangle-alert')} ${chk.issues.length} point(s) à corriger`}</span>
        </div>
      </a>`;
  }).join('') : '<p class="muted">Aucun deck pour l\'instant.</p>';

  const recos = pool.length ? recommend(game.id, pool) : [];
  const recoBox = app.querySelector('.recos');
  if (!recos.length) {
    recoBox.innerHTML = `<p class="panel">Pas encore assez de cartes ${esc(game.name)} pour proposer un deck. <a class="accent arrow" href="#/game/${game.id}">Ouvre des boosters</a></p>`;
    return;
  }
  recoBox.innerHTML = recos.map((r, i) => {
    const deck = { game: game.id, cards: r.cards, leader: r.leader };
    const chk = checkDeck(deck, byKey);
    const top = Object.keys(r.cards).map(k => byKey.get(k)).filter(Boolean)
      .sort((a, b) => (b.card.price ?? 0) - (a.card.price ?? 0)).slice(0, 5);
    const leader = r.leader && byKey.get(r.leader);
    return `
      <div class="deck-tile reco">
        <div class="reco-cards">${[leader, ...top].filter(Boolean).slice(0, 5).map(e => `<img src="${e.card.img}" alt="${esc(e.card.name)}" title="${esc(e.card.name)}" loading="lazy">`).join('')}</div>
        <div class="deck-body">
          <h3>${r.colors.map(colorDot).join('')} ${esc(r.name)}</h3>
          <p class="muted">${chk.count.main} cartes · valeur ${fmt(chk.value)}</p>
          <span class="badge ${r.missing ? 'ko' : 'ok'}">${r.missing ? `Il te manque ${r.missing} carte(s) : continue d'ouvrir des boosters` : `${icon('check')} Complet avec ta collection`}</span>
          <button class="btn" data-take="${i}">Créer ce deck</button>
        </div>
      </div>`;
  }).join('');
  recoBox.addEventListener('click', e => {
    const b = e.target.closest('[data-take]'); if (!b) return;
    const r = recos[+b.dataset.take];
    const deck = saveDeck({ game: game.id, name: r.name, cards: { ...r.cards }, leader: r.leader });
    location.hash = `#/decks/${deck.id}`;
  });
}

const backImg = game => (game.back ? `<img src="${game.back}" alt="">` : '');

async function viewDeck(id, { openModal } = {}) {
  const deck = getState().decks[id];
  if (!deck) { app.innerHTML = '<section class="page"><h1>Deck introuvable</h1><a class="btn" href="#/decks">Retour aux decks</a></section>'; return; }
  const game = gameOf(deck.game);
  const r = RULES[deck.game];
  const pool = await loadPool(deck.game);
  const byKey = new Map(pool.map(e => [e.key, e]));
  const basics = r.basics ? r.basics.colors.map(c => basicEntry(deck.game, c)) : [];
  let q = '', kindFilter = 'all', colorFilter = 'all', onlyFit = true, shown = 120;
  const allColors = [...new Set(pool.flatMap(e => e.card.play.colors ?? []))].sort();

  app.innerHTML = `
    <section class="page deck-editor" style="--c:${game.color};--a:${game.accent}">
      <a href="#/decks/jeu/${game.id}" class="back">Decks ${esc(game.name)}</a>
      <div class="page-head">
        <input class="deck-name" value="${esc(deck.name)}" maxlength="60" aria-label="Nom du deck">
        <div class="row-btns">
          <button class="btn ghost" data-export>Copier la liste</button>
          <button class="btn ghost danger" data-delete>Supprimer</button>
        </div>
      </div>
      <p class="muted rules-line">${icon('scroll-text')} ${esc(r.text)}</p>
      <div class="deck-layout">
        <aside class="deck-side"></aside>
        <div class="deck-pool">
          <div class="toolbar">
            <input type="search" placeholder="Chercher une carte…" data-q>
            <div class="seg" data-kind><button data-v="all" class="on">Tout</button>${[...(r.leader ? [[r.leader, r.leader === 'legend' ? 'Légendes' : 'Leaders']] : []), ...Object.entries(r.kinds)].map(([k, l]) => `<button data-v="${k}">${esc(l)}</button>`).join('')}</div>
          </div>
          <div class="toolbar">
            <div class="seg" data-color><button data-v="all" class="on">Toutes couleurs</button>${allColors.map(c => `<button data-v="${esc(c)}">${colorDot(c)} ${esc(colorName(c))}</button>`).join('')}</div>
            ${r.matchLeader || r.maxColors ? '<label class="check"><input type="checkbox" data-fit checked> Seulement les cartes jouables</label>' : ''}
          </div>
          <div class="grid pool-grid"></div>
          <p class="more-line"></p>
        </div>
      </div>
    </section>`;

  const root = app.querySelector('.deck-editor');
  const side = app.querySelector('.deck-side');
  const grid = app.querySelector('.pool-grid');
  const persist = () => saveDeck(deck);

  function drawSide() {
    const chk = checkDeck(deck, byKey);
    const groups = new Map();
    for (const [key, n] of Object.entries(deck.cards)) {
      const e = entryOf(key, byKey, deck.game);
      if (!e) continue;
      const s = slot(deck.game, e.card);
      const label = s === 'extra' ? 'Extra Deck' : r.kinds[e.card.play.kind] ?? 'Autres';
      if (!groups.has(label)) groups.set(label, []);
      groups.get(label).push([e, n]);
    }
    // Courbe de coût
    const curve = {};
    for (const [key, n] of Object.entries(deck.cards)) {
      const e = entryOf(key, byKey, deck.game);
      const c = e?.card.play.cost;
      if (c != null && !e.card.play.basic && e.card.play.kind !== 'land') curve[Math.min(c, 8)] = (curve[Math.min(c, 8)] ?? 0) + n;
    }
    const peak = Math.max(1, ...Object.values(curve));
    side.innerHTML = `
      <div class="deck-summary">
        <div><span>Cartes</span><b>${chk.count.main}${Number.isFinite(r.max) && r.max === r.min ? `/${r.min}` : ` (min ${r.min})`}</b></div>
        <div><span>Valeur</span><b class="accent">${fmt(chk.value)}</b></div>
      </div>
      <div class="deck-check ${chk.ok ? 'ok' : 'ko'}">
        ${chk.ok ? `${icon('check')} Deck valide, prêt à jouer !` : `<b>À corriger :</b><ul>${chk.issues.slice(0, 6).map(i => `<li>${esc(i)}</li>`).join('')}</ul>`}
      </div>
      ${r.leader ? `<h4>${r.leader === 'legend' ? 'Légende' : 'Leader'}</h4>${chk.leader ? line(chk.leader, 1, true) : '<p class="muted small">Aucun : clique sur une carte ' + (r.leader === 'legend' ? 'Légende' : 'Leader') + '.</p>'}` : ''}
      ${[...groups].map(([label, rows]) => `
        <h4>${esc(label)} <small>${rows.reduce((s, [, n]) => s + n, 0)}</small></h4>
        ${rows.sort((a, b) => (a[0].card.play.cost ?? 0) - (b[0].card.play.cost ?? 0) || a[0].card.name.localeCompare(b[0].card.name)).map(([e, n]) => line(e, n)).join('')}`).join('')}
      ${basics.length ? `<h4>${deck.game === 'pokemon' ? 'Énergies de base' : 'Terrains de base'} <small>illimitées</small></h4>
        <div class="basics">${basics.map(e => `<button data-add="${e.key}" title="Ajouter : ${esc(e.card.name)}">${colorDot(e.card.play.colors[0])}${esc(deck.game === 'pokemon' ? e.card.play.colors[0] : e.card.name)}</button>`).join('')}</div>` : ''}
      ${Object.keys(curve).length ? `<h4>Courbe de coût</h4><div class="curve">${[0, 1, 2, 3, 4, 5, 6, 7, 8].map(c => `<div title="${curve[c] ?? 0} carte(s) coût ${c}${c === 8 ? '+' : ''}"><i style="height:${((curve[c] ?? 0) / peak) * 100}%"></i><span>${c}${c === 8 ? '+' : ''}</span></div>`).join('')}</div>` : ''}`;
  }

  function line(e, n, isLeader = false) {
    return `
      <div class="deck-line ${isLeader ? 'leader' : ''}">
        ${e.card.img ? `<img src="${e.card.img}" alt="" loading="lazy">` : `<span class="basic-img">${colorDot(e.card.play.colors[0])}</span>`}
        <span class="dl-name" title="${esc(e.card.name)}">${e.card.play.cost != null ? `<small class="cost">${e.card.play.cost}</small>` : ''}${esc(e.card.name)}</span>
        ${isLeader ? `<button data-unleader title="Retirer">${icon('x')}</button>` : `
        <span class="dl-n">×${n}</span>
        <button data-sub="${e.key}" title="Retirer 1">−</button>
        <button data-add="${e.key}" title="Ajouter 1">+</button>`}
      </div>`;
  }

  function canAdd(e) {
    if (e.basic) return '';
    const inDeck = deck.cards[e.key] ?? 0;
    if (inDeck >= e.owned) return `Tu n'en possèdes que ${e.owned}.`;
    const k = nameKey(e.card);
    let sameName = 0;
    for (const [key, n] of Object.entries(deck.cards)) { const o = entryOf(key, byKey, deck.game); if (o && !o.basic && nameKey(o.card) === k) sameName += n; }
    if (sameName >= r.copies) return `${r.copies} exemplaires maximum.`;
    if (r.battlefields && e.card.play.kind === 'battlefield') {
      const bf = Object.entries(deck.cards).reduce((s, [key, n]) => s + (byKey.get(key)?.card.play.kind === 'battlefield' ? n : 0), 0);
      if (bf >= r.battlefields) return `${r.battlefields} champs de bataille maximum.`;
    }
    return '';
  }

  const playable = e => {
    if (!onlyFit) return true;
    const leader = deck.leader && byKey.get(deck.leader);
    if (r.matchLeader && leader && e.card.play.kind !== r.leader) return fits(e, leader.card.play.colors ?? []);
    if (r.maxColors) {
      const chk = checkDeck(deck, byKey);
      if (chk.colors.length >= r.maxColors) return fits(e, chk.colors);
    }
    return true;
  };

  function drawPool() {
    const usable = new Set([...Object.keys(r.kinds), r.leader].filter(Boolean));
    const list = pool.filter(e => usable.has(e.card.play.kind))
      .filter(e => kindFilter === 'all' || e.card.play.kind === kindFilter)
      .filter(e => colorFilter === 'all' || e.card.play.colors?.includes(colorFilter))
      .filter(e => !q || e.card.name.toLowerCase().includes(q))
      .filter(playable)
      .sort((a, b) => (b.card.price ?? 0) - (a.card.price ?? 0));
    grid.innerHTML = list.slice(0, shown).map(e => {
      const inDeck = e.key === deck.leader ? 1 : deck.cards[e.key] ?? 0;
      const blocked = e.card.play.kind === r.leader ? '' : canAdd(e);
      return `
        <div class="pool-card ${blocked ? 'blocked' : ''} ${inDeck ? 'in' : ''}" title="${esc(blocked || 'Cliquer pour ajouter')}">
          <button class="thumb tier-${e.card.tier}" data-pick="${esc(e.key)}">
            <img src="${e.card.img}" alt="${esc(e.card.name)}" loading="lazy">
            <span class="thumb-info"><span>${esc(e.card.name)}</span><b>${fmt(e.card.price)}</b></span>
          </button>
          <span class="pc-own">${inDeck ? `<b>${inDeck}</b>/` : ''}${e.owned}</span>
          <button class="pc-info" data-info="${esc(e.key)}" title="Voir la carte">i</button>
        </div>`;
    }).join('') || '<p class="muted">Aucune carte ne correspond. Ouvre des boosters pour agrandir ta collection !</p>';
    app.querySelector('.more-line').innerHTML = list.length > shown ? `<button class="btn ghost" data-more>Afficher plus (${list.length - shown})</button>` : '';
  }

  const redraw = () => { drawSide(); drawPool(); };
  redraw();

  root.addEventListener('click', e => {
    const t = e.target.closest('button');
    if (!t) return;
    if (t.dataset.pick) {
      const entry = byKey.get(t.dataset.pick);
      if (r.leader && entry.card.play.kind === r.leader) { deck.leader = entry.key; persist(); return redraw(); }
      if (canAdd(entry)) return;
      deck.cards[entry.key] = (deck.cards[entry.key] ?? 0) + 1;
      persist(); redraw();
    } else if (t.dataset.add) {
      const entry = entryOf(t.dataset.add, byKey, deck.game);
      if (!entry || canAdd(entry)) return;
      deck.cards[entry.key] = (deck.cards[entry.key] ?? 0) + 1;
      persist(); redraw();
    } else if (t.dataset.sub) {
      const k = t.dataset.sub;
      if (--deck.cards[k] <= 0) delete deck.cards[k];
      persist(); redraw();
    } else if ('unleader' in t.dataset) {
      deck.leader = null; persist(); redraw();
    } else if (t.dataset.info) {
      const entry = byKey.get(t.dataset.info);
      openModal?.(entry.card, game, entry.owned, entry.setKey);
    } else if ('more' in t.dataset) {
      shown += 120; drawPool();
    } else if ('export' in t.dataset) {
      const lines = [];
      const l = deck.leader && byKey.get(deck.leader);
      if (l) lines.push(`${r.leader === 'legend' ? 'Légende' : 'Leader'} : ${l.card.name} (${l.card.num})`);
      for (const [key, n] of Object.entries(deck.cards)) {
        const en = entryOf(key, byKey, deck.game);
        if (en) lines.push(`${n} ${en.card.name}${en.card.num ? ` (${en.setKey?.split('/')[1]} ${en.card.num})` : ''}`);
      }
      navigator.clipboard?.writeText(`${deck.name}\n${lines.join('\n')}`).then(() => { t.textContent = 'Liste copiée'; setTimeout(() => { t.textContent = 'Copier la liste'; }, 1600); });
    } else if ('delete' in t.dataset) {
      if (confirm(`Supprimer le deck « ${deck.name} » ? Les cartes restent dans ta collection.`)) {
        deleteDeck(deck.id);
        location.hash = `#/decks/jeu/${deck.game}`;
      }
    }
  });

  app.querySelector('.deck-name').addEventListener('change', e => { deck.name = e.target.value.trim() || deck.name; persist(); });
  app.querySelector('[data-q]').addEventListener('input', e => { q = e.target.value.trim().toLowerCase(); shown = 120; drawPool(); });
  const seg = (sel, set) => app.querySelector(sel).addEventListener('click', e => {
    const b = e.target.closest('[data-v]'); if (!b) return;
    app.querySelectorAll(`${sel} button`).forEach(x => x.classList.toggle('on', x === b));
    set(b.dataset.v); shown = 120; drawPool();
  });
  seg('[data-kind]', v => { kindFilter = v; });
  seg('[data-color]', v => { colorFilter = v; });
  app.querySelector('[data-fit]')?.addEventListener('change', e => { onlyFit = e.target.checked; drawPool(); });
}
