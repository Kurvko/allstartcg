// Page Combat : un deck Pokémon contre l'IA (3 niveaux), mis en scène comme un combat des jeux Pokémon 3DS
// (Rubis Oméga / Saphir Alpha). Les règles restent celles du JCC (engine.js) : ce fichier ne gère que l'affichage.
import { loadSet } from '../data.js';
import { getDecks, getState, recordBattle } from '../store.js';
import { app, esc } from '../ui.js';
import {
  apply, attackable, canRetreat, card, hpLeft, isBasic, legalActions, maxHp, newGame, promote, retreatCost,
  setup, slotAt, STATUS_FR, topCard, energyType,
} from './engine.js';
import { chooseAction, chooseSetup, bestPromotion, LEVELS } from './ai.js';
import { buildDeck, basicEnergy, mainTypes } from './build.js';
import { sfx, bgm } from '../sfx.js';
import * as fx from '../fx.js';

const TYPE_HEX = {
  Plante: '#30a46c', Feu: '#e5484d', Eau: '#3e8bff', Électrique: '#f5c518', Psy: '#b45cd6', Combat: '#c2703d',
  Obscurité: '#4b4f63', Métal: '#95a5a6', Dragon: '#c8a03b', Fée: '#f78fb3', Incolore: '#d5d5d5',
};
const dot = t => `<i class="edot" style="background:${TYPE_HEX[t] ?? '#999'}" title="${esc(t)}"></i>`;
const sleep = ms => new Promise(r => setTimeout(r, ms));

// Réserves de cartes de l'IA selon le niveau (sets complets, cartes les plus fortes en Difficile).
const AI_POOLS = {
  facile: { sets: ['sv01'], strength: 0.3 },
  normal: { sets: ['sv03.5', 'sv01'], strength: 0.8 },
  difficile: { sets: ['me01', 'me02', 'sv08', 'sv10'], strength: 1 },
};
const DEMO_SETS = ['sv03.5', 'sv01'];

async function poolOf(ids) {
  const sets = await Promise.all(ids.map(id => loadSet(`pokemon/${id}`).catch(() => ({ cards: [] }))));
  return sets.flatMap(s => s.cards);
}

/** Deck sauvegardé → 60 objets carte. */
async function deckCards(deck) {
  const out = [];
  for (const [key, n] of Object.entries(deck.cards)) {
    let c;
    if (key.startsWith('basic:')) c = basicEnergy(key.slice(6));
    else {
      const [setKey, id] = key.split('|');
      c = (await loadSet(setKey).catch(() => null))?.byId.get(id);
    }
    if (c) for (let k = 0; k < n; k++) out.push(c);
  }
  return out;
}

// ---------- Écran de choix ----------
let choice = { deck: null, level: 'normal' };

export async function viewBattle() {
  const decks = getDecks('pokemon');
  const usable = [];
  for (const d of decks) {
    const total = Object.values(d.cards).reduce((s, n) => s + n, 0);
    usable.push({ id: d.id, name: d.name, total, ok: total === 60 });
  }
  const demoPool = await poolOf(DEMO_SETS);
  const demoTypes = mainTypes(demoPool).slice(0, 6);
  if (!choice.deck) choice.deck = usable.find(d => d.ok)?.id ?? `demo:${demoTypes[0]}`;
  const stats = getState().battles ?? {};

  app.innerHTML = `
    <section class="page battle-setup" style="--c:#ffcb05;--a:#3d7dca">
      <h1>Combat Pokémon</h1>
      <p class="muted">Affronte l'IA avec ton deck, avec les vraies règles du JCC : Pokémon Actif et Banc, Énergies, évolutions, Dresseurs, faiblesses, états spéciaux, 6 Récompenses.
      Les effets les plus courants des cartes sont simulés ; les autres sont ignorés.</p>
      <h2>Ton deck</h2>
      <div class="pick-list" data-pick="deck">
        ${usable.map(d => `<button class="pick ${choice.deck === d.id ? 'on' : ''}" data-v="${d.id}" ${d.ok ? '' : 'disabled'}>
          <b>${esc(d.name)}</b><small>${d.ok ? '60 cartes' : `${d.total}/60 cartes : à compléter dans Decks`}</small></button>`).join('')}
        ${demoTypes.map(t => `<button class="pick ${choice.deck === `demo:${t}` ? 'on' : ''}" data-v="demo:${t}">
          <b>${dot(t)} Deck de démo ${esc(t)}</b><small>Cartes de 151 et Écarlate et Violet</small></button>`).join('')}
      </div>
      ${usable.length ? '' : '<p class="muted small">Tu n\'as pas encore de deck Pokémon : crée-en un dans <a class="accent" href="#/decks/jeu/pokemon">Decks</a>, ou joue avec un deck de démo.</p>'}
      <h2>Difficulté</h2>
      <div class="pick-list" data-pick="level">
        ${Object.entries(LEVELS).map(([k, l]) => {
          const r = stats[`pokemon/${k}`] ?? { w: 0, l: 0 };
          return `<button class="pick ${choice.level === k ? 'on' : ''}" data-v="${k}">
            <b>${l.label}</b><small>${{ facile: 'L\'IA joue un peu au hasard.', normal: 'L\'IA joue les bons coups, avec quelques erreurs.', difficile: 'L\'IA calcule, anticipe tes attaques et joue un deck fort.' }[k]}</small>
            <small class="record">${r.w} victoire${r.w > 1 ? 's' : ''} · ${r.l} défaite${r.l > 1 ? 's' : ''}</small></button>`;
        }).join('')}
      </div>
      <p class="battle-go"><button class="btn primary" data-start>⚔️ Lancer le combat</button></p>
      <p class="muted small">Contre de vrais joueurs : bientôt (il faut activer les comptes en ligne).</p>
    </section>`;

  app.querySelectorAll('[data-pick]').forEach(list => list.addEventListener('click', e => {
    const b = e.target.closest('[data-v]'); if (!b || b.disabled) return;
    choice[list.dataset.pick] = b.dataset.v;
    list.querySelectorAll('.pick').forEach(x => x.classList.toggle('on', x === b));
  }));
  app.querySelector('[data-start]').addEventListener('click', async () => {
    app.querySelector('[data-start]').disabled = true;
    const mine = choice.deck.startsWith('demo:')
      ? buildDeck(demoPool, choice.deck.slice(5), { strength: 0.9 })
      : await deckCards(getState().decks[choice.deck]);
    const aiCfg = AI_POOLS[choice.level];
    const aiPool = await poolOf(aiCfg.sets);
    const types = mainTypes(aiPool).slice(0, 4);
    const aiType = types[Math.floor(Math.random() * types.length)];
    const aiDeck = buildDeck(aiPool, aiType, { strength: aiCfg.strength });
    startBattle(mine, aiDeck, choice.level, aiType);
  });
}

// ---------- Plateau façon Rubis Oméga / Saphir Alpha ----------
// Le terrain (écran du haut) : les deux cartes Actives debout sur leurs plateformes, les boîtes de PV, le Banc,
// la boîte de messages. La console (écran du bas) : Attaque / Sac / Pokémon / Fin du tour.
// Chaque action passe par perform() : l'état change d'un coup dans le moteur, puis playback() rejoue
// les messages du journal et les animations (caméra, projectile, impact, PV qui descendent, K.O.).

const TERRAIN = { Plante: 'forest', Eau: 'beach', Feu: 'volcano', Psy: 'night', Obscurité: 'night', Combat: 'cave', Métal: 'cave', Dragon: 'sky', Électrique: 'sky' };
const STATUS_SHORT = { poison: 'PSN', burn: 'BRU', sleep: 'SOM', paralysis: 'PAR', confusion: 'CNF' };
const TYPE_FX = {
  Feu: { colors: ['#ff4d1a', '#ffb347', '#ffe08a'], shapes: ['spark', 'dot'] },
  Eau: { colors: ['#3e8bff', '#8fd3ff', '#ffffff'], shapes: ['dot'] },
  Plante: { colors: ['#30a46c', '#9be15d', '#e6ffb3'], shapes: ['confetti', 'star'] },
  Électrique: { colors: ['#fff35c', '#ffffff', '#ffd000'], shapes: ['spark'] },
  Psy: { colors: ['#ff6bd6', '#c58bff', '#ffffff'], shapes: ['star', 'dot'] },
  Combat: { colors: ['#ff9f43', '#c2703d', '#ffffff'], shapes: ['star', 'spark'] },
  Obscurité: { colors: ['#8a6bd1', '#3a2a5c', '#c9b3ff'], shapes: ['dot'] },
  Métal: { colors: ['#e4e9f2', '#95a5a6', '#ffffff'], shapes: ['spark'] },
  Dragon: { colors: ['#ffd36b', '#c8a03b', '#ff6b3d'], shapes: ['star', 'spark'] },
  Fée: { colors: ['#ffb3d9', '#ffffff', '#ff8bd4'], shapes: ['star'] },
  Incolore: { colors: ['#ffffff', '#e8e8e8', '#ffd36b'], shapes: ['star', 'dot'] },
};
const FAST_KEY = 'allstartcg:battle-fast';

const alive = ui => ui.root?.isConnected;
const keyOf = (side, s) => `${side}|${s.stack[0]}`;
const hpClass = pct => (pct > 0.5 ? 'hp-ok' : pct > 0.2 ? 'hp-mid' : 'hp-low');
const typeOf = c => c?.play?.colors?.[0] ?? 'Incolore';
const wait = (ui, ms) => sleep(ui.fast ? ms / 2 : ms);

function startBattle(myDeck, aiDeck, level, aiType) {
  const g = newGame([myDeck, aiDeck], { names: ['Toi', `IA ${LEVELS[level].label}`] });
  let fast = false;
  try { fast = localStorage.getItem(FAST_KEY) === '1'; } catch { /* stockage indisponible */ }
  const ui = { g, level, view: 'main', sel: null, selActions: null, mode: null, setupPick: [], busy: true, done: false, fast, shown: null, preview: null, skip: false };
  app.innerHTML = `
    <section class="page battle rosa">
      <div class="bwrap">
        <div class="arena t-${TERRAIN[aiType] ?? 'plain'} intro">
          <div class="sky"><i class="cloud c1"></i><i class="cloud c2"></i><i class="cloud c3"></i></div>
          <div class="far"></div>
          <div class="world">
            <div class="ground"></div>
            <div class="pad foe"></div>
            <div class="pad me"></div>
            <div class="fighters"></div>
          </div>
          <div class="hud"></div>
          <div class="overlay"></div>
          <div class="msgbox" title="Clique pour passer"><p></p><i>▼</i></div>
        </div>
        <div class="console"></div>
      </div>
      <aside class="bpreview"><p>Survole une carte pour la voir en grand.</p></aside>
    </section>`;
  ui.root = app.querySelector('.battle');
  ui.arena = ui.root.querySelector('.arena');
  bind(ui);
  bgm.start();
  sfx.whoosh(0.25);
  intro(ui);
}

async function intro(ui) {
  renderConsole(ui);
  await sleep(900);
  ui.arena.classList.remove('intro');
  await say(ui, `${ui.g.players[1].name} veut se battre !`);
  for (const line of ui.g.log) await say(ui, line);
  ui.busy = false;
  render(ui);
}

// ---------- Affichage ----------

function targetSet(ui) {
  const g = ui.g, me = g.players[0], t = new Set();
  const ref = (side, zone, i) => `${side}|${zone}|${zone === 'active' ? 0 : i}`;
  if (g.pending?.type === 'promote' && g.pending.players.includes(0)) me.bench.forEach((_, i) => t.add(ref(0, 'bench', i)));
  else if (ui.mode === 'retreat') me.bench.forEach((_, i) => t.add(ref(0, 'bench', i)));
  else if (ui.sel != null) {
    for (const a of ui.selActions ?? []) {
      if (a.zone) t.add(ref(0, a.zone, a.i));
      if (a.target?.zone) t.add(ref(a.target.side, a.target.zone, a.target.i));
    }
  }
  return t;
}

function fighterHtml(ui, side, targets) {
  const g = ui.g, s = g.players[side].active;
  if (!s) return '';
  const c = topCard(g, s);
  return `
    <div class="fighter ${side ? 'foe' : 'me'} ${s.status ? `st-${s.status}` : ''} ${targets.has(`${side}|active|0`) ? 'target' : ''}"
      data-key="${keyOf(side, s)}" data-slot="${side}|active|0" data-uid="${s.stack[s.stack.length - 1]}">
      <div class="fshadow"></div>
      <div class="bcard"><img src="${c.imgHi ?? c.img}" alt="${esc(c.name)}"><i class="bshine"></i></div>
    </div>`;
}

function hpBox(ui, side) {
  const g = ui.g, p = g.players[side], s = p.active;
  if (!s) return '';
  const c = topCard(g, s);
  const max = maxHp(g, s), hp = Math.max(0, hpLeft(g, s)), pct = hp / max;
  const balls = Array.from({ length: 6 }, (_, i) => `<i class="${i < p.prizes.length ? 'on' : ''}"></i>`).join('');
  return `
    <div class="hpbox ${side ? 'foe' : 'me'}" data-hp="${side}">
      <div class="hb-top"><b class="hb-name">${s ? esc(c.name) : '—'}</b>
        ${s?.status ? `<span class="st st-${s.status}" title="${STATUS_FR[s.status]}">${STATUS_SHORT[s.status]}</span>` : ''}
        <span class="hb-prizes" title="${p.prizes.length} Récompense${p.prizes.length > 1 ? 's' : ''} restante${p.prizes.length > 1 ? 's' : ''}">${balls}</span></div>
      <div class="hb-bar"><span>PV</span><div class="bar ${hpClass(pct)}"><i style="width:${pct * 100}%"></i></div></div>
      <div class="hb-bottom"><span class="hb-en">${s ? s.energies.map(uid => dot(energyType(card(g, uid)))).join('') : ''}${s?.tools.length ? '<span title="Outil attaché">🔧</span>' : ''}</span>
        <b class="hb-num">${hp}/${max}</b></div>
      <div class="hb-meta">${esc(p.name)} · Main ${p.hand.length} · Deck ${p.deck.length}</div>
    </div>`;
}

function benchRow(ui, side, targets) {
  const g = ui.g, p = g.players[side];
  return `<div class="benchrow ${side ? 'foe' : 'me'}">${[0, 1, 2, 3, 4].map(i => {
    const s = p.bench[i];
    if (!s) return '<span class="mini empty"></span>';
    const c = topCard(g, s), max = maxHp(g, s), hp = Math.max(0, hpLeft(g, s));
    return `<button class="mini ${targets.has(`${side}|bench|${i}`) ? 'target' : ''}" data-slot="${side}|bench|${i}" data-key="${keyOf(side, s)}"
      data-uid="${s.stack[s.stack.length - 1]}" title="${esc(c.name)} · ${hp}/${max} PV">
      <img src="${c.img}" alt="${esc(c.name)}"><span class="mbar ${hpClass(hp / max)}"><i style="width:${(hp / max) * 100}%"></i></span>
      ${s.energies.length ? `<b class="men">${s.energies.length}</b>` : ''}</button>`;
  }).join('')}</div>`;
}

function renderArena(ui) {
  const g = ui.g, targets = targetSet(ui);
  ui.arena.querySelector('.fighters').innerHTML = fighterHtml(ui, 1, targets) + fighterHtml(ui, 0, targets);
  ui.arena.querySelector('.hud').innerHTML = `
    ${g.stadium ? `<div class="stadium-tag">Stade : ${esc(card(g, g.stadium.uid).name)}</div>` : ''}
    <div class="side foe">${hpBox(ui, 1)}${benchRow(ui, 1, targets)}</div>
    <div class="side me">${benchRow(ui, 0, targets)}${hpBox(ui, 0)}</div>`;
}

function handCardHtml(ui, uid, label, { playable = false, selected = false, badge = '' } = {}) {
  const c = card(ui.g, uid);
  const art = c.img ? `<img src="${c.img}" alt="${esc(c.name)}">` : `<span class="energy-card" style="--t:${TYPE_HEX[c.play.colors?.[0]] ?? '#999'}">${esc(c.play.colors?.[0] ?? '')}</span>`;
  return `<button class="hcard ${playable ? 'playable' : ''} ${selected ? 'sel' : ''}" data-hand="${uid}" data-uid="${uid}" title="${esc(c.name)}">
    ${art}${badge ? `<b class="hbadge">${badge}</b>` : ''}${label ? `<small class="hlabel">${label}</small>` : ''}</button>`;
}

const ACTION_LABEL = { bench: 'Banc', evolve: 'Évoluer', energy: 'Attacher', trainer: 'Jouer' };

function slotButton(ui, ref) {
  const [side, zone, i] = ref.split('|');
  const s = slotAt(ui.g, +side, zone, +i);
  if (!s) return '';
  const c = topCard(ui.g, s), max = maxHp(ui.g, s), hp = Math.max(0, hpLeft(ui.g, s));
  return `<button class="tpick ${side === '1' ? 'foe' : ''}" data-slot="${ref}" data-uid="${s.stack[s.stack.length - 1]}">
    <img src="${c.img}" alt=""><span><b>${esc(c.name)}</b><small>${side === '1' ? 'Adversaire · ' : ''}${zone === 'active' ? 'Actif' : 'Banc'} · ${hp}/${max} PV · ${s.energies.length} Énergie${s.energies.length > 1 ? 's' : ''}</small></span></button>`;
}

function consoleView(ui) {
  const g = ui.g;
  if (g.winner != null) return 'end';
  if (g.pending?.type === 'setup') return ui.busy ? 'wait' : 'setup';
  if (g.pending?.type === 'promote' && g.pending.players.includes(0) && !ui.busy) return 'promote';
  if (ui.busy || g.current !== 0 || g.pending) return 'wait';
  if (ui.sel != null || ui.mode === 'retreat') return 'target';
  return ui.view;
}

function renderConsole(ui) {
  if (!alive(ui)) return;
  const g = ui.g, me = g.players[0], foe = g.players[1];
  const view = consoleView(ui);
  const fastBtn = `<button class="cfast ${ui.fast ? 'on' : ''}" data-fast title="Animations plus rapides">⏩ ${ui.fast ? 'Rapide' : 'Normal'}</button>`;
  let body = '';
  if (view === 'wait') {
    body = `<div class="cprompt wait">${g.current === 1 && g.winner == null ? `${esc(foe.name)} réfléchit<span class="dots3"><i>.</i><i>.</i><i>.</i></span>` : '…'}</div>`;
  } else if (view === 'setup') {
    body = `
      <div class="cprompt">${ui.setupPick.length ? 'Ajoute des Pokémon de base sur ton Banc (facultatif), puis valide.' : 'Choisis ton Pokémon <b>Actif</b> parmi tes Pokémon de base.'}</div>
      <div class="handrow">${me.hand.map(uid => {
        const k = ui.setupPick.indexOf(uid);
        return handCardHtml(ui, uid, '', { playable: isBasic(card(g, uid)) && k < 0, selected: k >= 0, badge: k === 0 ? 'Actif' : k > 0 ? 'Banc' : '' });
      }).join('')}</div>
      <div class="crow"><button class="cbtn fight" data-setup-ok ${ui.setupPick.length ? '' : 'disabled'}>✔ Valider</button></div>`;
  } else if (view === 'promote') {
    body = `
      <div class="cprompt">Ton Pokémon Actif est K.O. ! Qui envoies-tu ?</div>
      <div class="targets">${me.bench.map((_, i) => slotButton(ui, `0|bench|${i}`)).join('')}</div>`;
  } else if (view === 'target') {
    body = `
      <div class="cprompt">${ui.mode === 'retreat' ? `Retraite (coût ${retreatCost(g, me.active)}) : qui passe Actif ?` : `<b>${esc(card(g, ui.sel).name)}</b> : choisis une cible.`}</div>
      <div class="targets">${[...targetSet(ui)].map(ref => slotButton(ui, ref)).join('')}</div>
      <div class="crow"><button class="cbtn back" data-cancel>✕ Annuler</button></div>`;
  } else if (view === 'attack') {
    const top = topCard(g, me.active), ok = attackable(g, 0).map(x => x.i);
    const why = g.turn === 1 && g.current === g.first ? 'Pas d\'attaque au premier tour du joueur qui commence.'
      : ['sleep', 'paralysis'].includes(me.active.status) ? `${esc(top.name)} est ${STATUS_FR[me.active.status]} : il ne peut pas attaquer.` : '';
    body = `
      <div class="cprompt">Quelle attaque ? <small>Énergies : ${me.active.energies.map(uid => dot(energyType(card(g, uid)))).join('') || 'aucune'}</small></div>
      ${why ? `<p class="cnote">${why}</p>` : ''}
      <div class="moves">${(top.play.atk ?? []).map((a, i) => {
        const t = (a.c ?? []).find(x => x !== 'Incolore') ?? typeOf(top);
        return `<button class="move ${ok.includes(i) ? '' : 'off'}" style="--t:${TYPE_HEX[t] ?? '#999'}" data-attack="${i}" ${ok.includes(i) ? '' : 'disabled'}>
          <span class="mv-head"><b>${esc(a.n)}</b><em>${esc(String(a.d ?? ''))}</em></span>
          <span class="mv-cost">${(a.c ?? []).map(dot).join('') || '<small>Gratuit</small>'}</span>
          ${a.e ? `<small class="mv-text">${esc(a.e)}</small>` : ''}</button>`;
      }).join('') || '<p class="cnote">Cette carte n\'a pas d\'attaque.</p>'}</div>
      <div class="crow"><button class="cbtn back" data-go="main">← Retour</button></div>`;
  } else if (view === 'bag') {
    const actions = legalActions(g);
    const byName = name => actions.filter(a => a.uid != null && card(g, a.uid).name === name);
    body = `
      <div class="cprompt">Ta main <small>${me.hand.length} carte${me.hand.length > 1 ? 's' : ''} · Énergie ${me.energy ? 'déjà attachée' : 'disponible'} · Supporter ${me.supporter ? 'déjà joué' : 'disponible'}</small></div>
      <div class="handrow">${me.hand.map(uid => {
        const acts = byName(card(g, uid).name);
        return handCardHtml(ui, uid, acts.length ? ACTION_LABEL[acts[0].type] : '', { playable: acts.length > 0 });
      }).join('') || '<p class="cnote">Ta main est vide.</p>'}</div>
      <div class="crow"><button class="cbtn back" data-go="main">← Retour</button></div>`;
  } else if (view === 'team') {
    body = `
      <div class="cprompt">Ton équipe <small>Banc ${me.bench.length}/5 · Deck ${me.deck.length} · Défausse ${me.discard.length}</small></div>
      <div class="targets">${[me.active ? slotButton(ui, '0|active|0') : '', ...me.bench.map((_, i) => slotButton(ui, `0|bench|${i}`))].join('')}</div>
      <div class="crow">
        ${canRetreat(g, 0) ? `<button class="cbtn team" data-retreat>↩ Retraite (coût ${retreatCost(g, me.active)})</button>`
          : `<span class="cnote">${me.retreated ? 'Déjà battu en retraite ce tour.' : !me.bench.length ? 'Aucun Pokémon sur le Banc.' : `Retraite : il faut ${retreatCost(g, me.active)} Énergie(s) attachée(s).`}</span>`}
        <button class="cbtn back" data-go="main">← Retour</button></div>`;
  } else if (view === 'end') {
    body = `
      <div class="cprompt">${g.winner === 0 ? '🏆 Victoire !' : 'Défaite…'} <small>${esc(tutoie(g.reason))}</small></div>
      <div class="crow"><a class="cbtn fight" href="#/combat" data-again>⚔ Rejouer</a><a class="cbtn back" href="#/decks/jeu/pokemon">Mes decks</a></div>`;
  } else {
    const playable = new Set(legalActions(g).filter(a => a.uid != null).map(a => card(g, a.uid).name));
    const nPlay = me.hand.filter(uid => playable.has(card(g, uid).name)).length;
    const nAtk = attackable(g, 0).length;
    body = `
      <div class="cprompt">Que doit faire <b>${esc(me.active ? topCard(g, me.active).name : '…')}</b> ?</div>
      <div class="cmain">
        <button class="cbtn fight big" data-go="attack"><span class="ci">⚔</span>Attaque<small>${nAtk ? `${nAtk} attaque${nAtk > 1 ? 's' : ''} possible${nAtk > 1 ? 's' : ''}` : 'aucune attaque possible'}</small></button>
        <button class="cbtn bag" data-go="bag"><span class="ci">🎒</span>Sac<small>${me.hand.length} cartes · ${nPlay} jouable${nPlay > 1 ? 's' : ''}</small></button>
        <button class="cbtn team" data-go="team"><span class="ci">◓</span>Pokémon<small>Banc ${me.bench.length}/5</small></button>
        <button class="cbtn run" data-end><span class="ci">⏭</span>Fin du tour<small>Tour ${g.turn}</small></button>
      </div>`;
  }
  ui.root.querySelector('.console').innerHTML = `<div class="cview v-${view}">${fastBtn}${body}</div>`;
}

function previewHtml(ui, uid) {
  const c = card(ui.g, uid);
  if (!c.img) return `<p><b>${esc(c.name)}</b></p>`;
  const atks = (c.play.atk ?? []).map(a => `<p class="atk-text"><b>${esc(a.n)}</b> ${esc(String(a.d ?? ''))}${a.e ? ` — ${esc(a.e)}` : ''}</p>`).join('');
  return `<img src="${c.imgHi ?? c.img}" alt="${esc(c.name)}">${atks}${c.play.text ? `<p class="atk-text">${esc(c.play.text)}</p>` : ''}`;
}

/** Après chaque affichage : carte qui entre sur le terrain, évolution, Énergie qui apparaît, carte posée sur le Banc. */
function postEffects(ui) {
  const g = ui.g, prev = ui.shown;
  const now = {
    active: [0, 1].map(side => { const s = g.players[side].active; return s ? { base: s.stack[0], top: s.stack[s.stack.length - 1], en: s.energies.length } : null; }),
    bench: new Set([0, 1].flatMap(side => g.players[side].bench.map(s => keyOf(side, s)))),
  };
  for (const side of [0, 1]) {
    const a = now.active[side], b = prev?.active[side];
    const el = ui.arena.querySelector(`.fighter.${side ? 'foe' : 'me'}`);
    if (!a || !el) continue;
    if (!b || b.base !== a.base) {
      el.classList.add('sendout');
      setTimeout(() => {
        sfx.sendOut();
        const { x, y } = fx.center(el);
        fx.burst(x, y + el.offsetHeight * 0.3, { n: 36, colors: ['#ffffff', '#ff5a5a', '#ffd36b'], speed: 8, shapes: ['star', 'spark'], life: 45 });
      }, 150);
    } else if (b.top !== a.top) {
      el.classList.add('evolve');
      sfx.evolve();
      setTimeout(() => { const { x, y } = fx.center(el); fx.flash('#ffffff', 0.5, 600); fx.burst(x, y, { n: 80, colors: ['#ffffff', '#bfe3ff', '#ffd36b'], speed: 9, shapes: ['star', 'spark', 'dot'] }); }, 780);
    }
    if (b && b.base === a.base && a.en > b.en) ui.arena.querySelector(`[data-hp="${side}"] .hb-en .edot:last-of-type`)?.classList.add('pop');
  }
  for (const key of now.bench) {
    if (prev && !prev.bench.has(key)) ui.arena.querySelector(`.mini[data-key="${key}"]`)?.classList.add('enter');
  }
  ui.shown = now;
}

function render(ui) {
  if (!alive(ui)) return;
  const g = ui.g;
  renderArena(ui);
  renderConsole(ui);
  postEffects(ui);
  if (g.winner != null) return showEnd(ui);
  if (ui.busy || ui.aiRunning) return;
  if (g.current === 1 && !g.pending) aiTurn(ui);
  else if (g.pending?.type === 'promote' && g.pending.players[0] === 1) perform(ui, () => promote(g, 1, bestPromotion(g, 1)), { side: 1 });
}

function showEnd(ui) {
  if (ui.done) return;
  ui.done = true;
  const won = ui.g.winner === 0;
  recordBattle(`pokemon/${ui.level}`, won);
  bgm.stop();
  ui.arena.querySelector('.overlay').innerHTML = `
    <div class="bover ${won ? 'win' : 'lose'}"><h2>${won ? '🏆 Victoire !' : 'Défaite…'}</h2><p>${esc(tutoie(ui.g.reason))}</p></div>`;
  setTimeout(() => { if (won) { sfx.win(); fx.confettiRain(); fx.flash('#ffd36b', 0.4, 800); } else sfx.lose(); }, 300);
}

// ---------- Messages et animations ----------

// Le journal du moteur parle de « Toi » à la 3ᵉ personne : on tutoie le joueur dans la boîte de messages.
const TU = { place: 'places', attache: 'attaches', joue: 'joues', envoie: 'envoies', pioche: 'pioches', prend: 'prends', fait: 'fais',
  ajoute: 'ajoutes', récupère: 'récupères', gagne: 'gagnes', commence: 'commences' };
function tutoie(text) {
  return text
    .replace(/: Toi commence/, ': tu commences')
    .replace(/\bToi (place|attache|joue|envoie|pioche|prend|fait|ajoute|récupère|gagne|commence)\b/g, (_, v) => `Tu ${TU[v]}`)
    .replace(/Toi ne peut plus piocher/, 'Tu ne peux plus piocher')
    .replace(/Toi n'a plus de Pokémon/, 'Tu n\'as plus de Pokémon')
    .replace(/^(Tu .*?)\bson Banc\b/, '$1ton Banc').replace(/^(Tu .*?)\bsa (main|défausse)\b/, '$1ta $2');
}

async function say(ui, text) {
  const box = ui.root?.querySelector('.msgbox p');
  if (!box) return;
  text = tutoie(text.replace(/^💥 /, ''));
  ui.skip = false;
  box.parentElement.classList.remove('done');
  for (let i = 1; i <= text.length && !ui.skip && alive(ui); i += 2) {
    box.textContent = text.slice(0, i);
    await sleep(ui.fast ? 6 : 14);
  }
  box.textContent = text;
  box.parentElement.classList.add('done');
  ui.skip = false;
  const end = performance.now() + (ui.fast ? 300 : 700);
  while (performance.now() < end && !ui.skip && alive(ui)) await sleep(25);
  ui.skip = false;
}

function snapshot(g) {
  const slots = {};
  for (const side of [0, 1]) {
    for (const s of [g.players[side].active, ...g.players[side].bench].filter(Boolean)) {
      slots[keyOf(side, s)] = { side, damage: s.damage, energies: s.energies.length, active: s === g.players[side].active };
    }
  }
  return { slots, log: g.log.length };
}

const elOf = (ui, key) => ui.arena.querySelector(`[data-key="${key}"]`);

/** PV qui descendent (ou remontent) jusqu'aux nouvelles valeurs, avec impact sur les cartes touchées. */
async function drain(ui, before) {
  const g = ui.g, after = snapshot(g);
  let any = false;
  for (const [key, b] of Object.entries(before.slots)) {
    const a = after.slots[key];
    if (!a || a.damage === b.damage) continue;
    any = true;
    const [side] = key.split('|').map(Number);
    const s = [g.players[side].active, ...g.players[side].bench].find(x => x && keyOf(side, x) === key);
    const max = maxHp(g, s), from = Math.max(0, max - b.damage), to = Math.max(0, max - a.damage);
    const el = elOf(ui, key);
    const hit = a.damage > b.damage;
    if (el && hit) {
      el.classList.remove('hit'); void el.offsetWidth; el.classList.add('hit');
      el.insertAdjacentHTML('beforeend', `<span class="dmg-pop">-${a.damage - b.damage}</span>`);
    }
    if (b.active && a.active) {
      const box = ui.arena.querySelector(`[data-hp="${side}"]`);
      const bar = box?.querySelector('.bar'), fill = bar?.querySelector('i'), num = box?.querySelector('.hb-num');
      if (fill) fill.style.width = `${(to / max) * 100}%`;
      if (bar) bar.className = `bar ${hpClass(to / max)}`;
      if (side === 0 && from / max > 0.2 && to / max <= 0.2 && to > 0) sfx.lowHp();
      if (num) countTo(num, from, to, max, ui.fast ? 350 : 700);
    } else if (el) {
      const m = el.querySelector('.mbar');
      if (m) { m.className = `mbar ${hpClass(to / max)}`; m.firstElementChild.style.width = `${(to / max) * 100}%`; }
    }
  }
  if (any) await wait(ui, 750);
}

function countTo(el, from, to, max, ms) {
  const t0 = performance.now();
  const step = now => {
    const p = Math.min(1, (now - t0) / ms);
    el.textContent = `${Math.round(from + (to - from) * p)}/${max}`;
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

async function attackAnim(ui, side, before) {
  const g = ui.g;
  const att = ui.arena.querySelector(`.fighter.${side ? 'foe' : 'me'}`);
  const def = ui.arena.querySelector(`.fighter.${side ? 'me' : 'foe'}`);
  if (!att) return drain(ui, before);
  const attCard = card(g, +att.dataset.uid);
  const type = typeOf(attCard), tfx = TYPE_FX[type] ?? TYPE_FX.Incolore;
  ui.arena.classList.add(side ? 'cam-foe' : 'cam-me');
  await wait(ui, 380);
  att.classList.add('lunge');
  sfx.attack(type);
  if (def) {
    const a = fx.center(att.querySelector('.bcard')), d = fx.center(def.querySelector('.bcard'));
    fx.travel(a, d, { colors: tfx.colors, n: 46, ms: ui.fast ? 200 : 380, size: 4, shapes: tfx.shapes.filter(x => x !== 'confetti').concat('dot') });
  }
  await wait(ui, 520);
  ui.arena.classList.remove('cam-me', 'cam-foe');
  ui.arena.classList.add(side ? 'cam-me' : 'cam-foe');
  const dmg = def ? (snapshot(g).slots[def.dataset.key]?.damage ?? 0) - (before.slots[def.dataset.key]?.damage ?? 0) : 0;
  if (def && dmg > 0) {
    const d = fx.center(def.querySelector('.bcard'));
    fx.shockwave(d.x, d.y, tfx.colors[0], { size: 200 + Math.min(200, dmg * 2) });
    fx.burst(d.x, d.y, { n: 50 + Math.min(80, dmg), colors: tfx.colors, speed: 9, shapes: tfx.shapes, life: 55 });
    if (dmg >= 100) { fx.flash(tfx.colors[0], 0.35, 500); ui.arena.classList.add('quake'); setTimeout(() => ui.arena.classList.remove('quake'), 500); }
    sfx.hit(dmg);
  }
  att.classList.remove('lunge');
  await drain(ui, before);
  ui.arena.classList.remove('cam-me', 'cam-foe');
}

async function faint(ui, keys) {
  let any = false;
  for (const key of keys) {
    const el = elOf(ui, key);
    if (!el || el.classList.contains('faint')) continue;
    el.classList.add('faint');
    any = true;
  }
  if (any) { sfx.faint(); await wait(ui, 1000); }
}

async function turnBanner(ui, n, name) {
  const mine = name === ui.g.players[0].name;
  const o = ui.arena.querySelector('.overlay');
  o.insertAdjacentHTML('beforeend', `<div class="tbanner ${mine ? 'me' : 'foe'}"><small>Tour ${n}</small><b>${mine ? 'À toi de jouer !' : `Au tour de ${esc(name)}`}</b></div>`);
  sfx.turn();
  await wait(ui, 1100);
  o.querySelector('.tbanner')?.remove();
}

async function trainerShow(ui, uid) {
  const c = card(ui.g, uid);
  if (!c?.img) return;
  const o = ui.arena.querySelector('.overlay');
  o.insertAdjacentHTML('beforeend', `<div class="tshow"><img src="${c.imgHi ?? c.img}" alt=""></div>`);
  sfx.whoosh(0.15);
  await wait(ui, 1100);
  o.querySelector('.tshow')?.remove();
}

function energyFly(ui, before, side) {
  const g = ui.g, after = snapshot(g);
  const key = Object.keys(after.slots).find(k => after.slots[k].energies > (before.slots[k]?.energies ?? 0));
  if (!key) return;
  const [sd] = key.split('|').map(Number);
  const s = [g.players[sd].active, ...g.players[sd].bench].find(x => x && keyOf(sd, x) === key);
  const type = energyType(card(g, s.energies[s.energies.length - 1]));
  const to = elOf(ui, key);
  if (!to) return;
  const r = ui.arena.getBoundingClientRect();
  const from = side ? { x: r.right - 60, y: r.top + 30 } : { x: r.left + r.width / 2, y: r.bottom + 30 };
  fx.travel(from, fx.center(to), { colors: [TYPE_HEX[type] ?? '#fff', '#ffffff'], n: 22, ms: 250, size: 3.5 });
  sfx.energy(type);
}

/** Rejoue le journal d'une action : messages un par un, avec les animations qui vont avec. */
async function playback(ui, before, { side = 0, action = null, lines = null } = {}) {
  const g = ui.g;
  const list = lines ?? g.log.slice(before.log);
  const after = snapshot(g);
  const gone = Object.keys(before.slots).filter(k => !after.slots[k]);
  let drained = false;
  for (const line of list) {
    if (!alive(ui)) return;
    let m;
    if (/ utilise .+ !$/.test(line)) { await say(ui, line); await attackAnim(ui, side, before); drained = true; continue; }
    if (/subit \d+ dégâts de (poison|brûlure)/.test(line)) { await say(ui, line); await drain(ui, before); drained = true; continue; }
    if (/est K\.O\./.test(line)) { if (!drained) { await drain(ui, before); drained = true; } await faint(ui, gone); await say(ui, line); continue; }
    if ((m = line.match(/^— Tour (\d+) : (.+) —$/))) { await turnBanner(ui, m[1], m[2]); continue; }
    if (/^🏆/.test(line)) continue;
    if (/ attache .+ à /.test(line)) energyFly(ui, before, side);
    if (action?.type === 'trainer' && / joue /.test(line)) await trainerShow(ui, action.uid);
    if (/ sur son Banc\.$/.test(line)) sfx.play();
    if (/bat en retraite/.test(line)) sfx.whoosh(0.2);
    await say(ui, line);
  }
  if (!drained) await drain(ui, before);
  if (gone.length) await faint(ui, gone);
}

/** Joue une action : le moteur change l'état, puis on rejoue les animations, puis on réaffiche. */
async function perform(ui, fn, info = {}) {
  const keepBusy = ui.aiRunning;
  ui.busy = true;
  ui.sel = null; ui.selActions = null; ui.mode = null; ui.view = 'main';
  renderConsole(ui);
  const before = snapshot(ui.g);
  fn();
  await playback(ui, before, info);
  if (!keepBusy) ui.busy = false;
  render(ui);
}

async function aiTurn(ui) {
  const g = ui.g;
  ui.aiRunning = true; ui.busy = true;
  renderConsole(ui);
  await wait(ui, 500);
  for (let guard = 0; guard < 60 && alive(ui) && g.current === 1 && g.winner == null; guard++) {
    if (g.pending) {
      if (g.pending.type === 'promote' && g.pending.players[0] === 1) await perform(ui, () => promote(g, 1, bestPromotion(g, 1)), { side: 1 });
      else break; // c'est au joueur de choisir (son Actif a été mis K.O.)
      continue;
    }
    const action = chooseAction(g, 1, ui.level);
    await perform(ui, () => apply(g, action), { side: 1, action });
    await wait(ui, 200);
  }
  ui.aiRunning = false; ui.busy = false;
  render(ui);
}

async function doSetup(ui) {
  const g = ui.g;
  ui.busy = true;
  renderConsole(ui);
  const logLen = g.log.length;
  setup(g, [ui.setupPick, chooseSetup(g, 1)]);
  ui.setupPick = [];
  renderArena(ui);
  postEffects(ui);
  await wait(ui, 400);
  await say(ui, `${g.players[1].name} envoie ${topCard(g, g.players[1].active).name} !`);
  await say(ui, `Go ! ${topCard(g, g.players[0].active).name} !`);
  await playback(ui, snapshot(g), { lines: g.log.slice(logLen) });
  ui.busy = false;
  render(ui);
}

// ---------- Clics ----------

function bind(ui) {
  const g = ui.g, root = ui.root;
  root.addEventListener('mouseover', e => {
    const t = e.target.closest('[data-uid]'); if (!t) return;
    const uid = +t.dataset.uid;
    if (uid === ui.preview) return;
    ui.preview = uid;
    root.querySelector('.bpreview').innerHTML = previewHtml(ui, uid);
  });
  root.addEventListener('click', e => {
    if (e.target.closest('.msgbox')) { ui.skip = true; return; }
    const t = e.target.closest('button, a, [data-slot]'); if (!t) return;
    if (t.dataset.fast != null) {
      ui.fast = !ui.fast;
      try { localStorage.setItem(FAST_KEY, ui.fast ? '1' : '0'); } catch { /* stockage indisponible */ }
      return renderConsole(ui);
    }
    if (t.dataset.again != null || ui.busy) return;
    // Mise en place
    if (g.pending?.type === 'setup') {
      if (t.dataset.hand != null) {
        const uid = +t.dataset.hand;
        if (!isBasic(card(g, uid))) return;
        ui.setupPick = ui.setupPick.includes(uid) ? ui.setupPick.filter(x => x !== uid) : [...ui.setupPick, uid].slice(0, 6);
        return renderConsole(ui);
      }
      if (t.dataset.setupOk != null && ui.setupPick.length) doSetup(ui);
      return;
    }
    // Remplacement après un K.O.
    if (g.pending?.type === 'promote' && g.pending.players.includes(0)) {
      if (t.dataset.slot) { const [, zone, i] = t.dataset.slot.split('|'); if (zone === 'bench') perform(ui, () => promote(g, 0, +i)); }
      return;
    }
    if (g.current !== 0 || g.winner != null) return;
    if (t.dataset.go) { ui.view = t.dataset.go; return renderConsole(ui); }
    if (t.dataset.cancel != null) { ui.sel = null; ui.mode = null; return render(ui); }
    if (t.dataset.end != null) return perform(ui, () => apply(g, { type: 'end' }));
    if (t.dataset.attack != null) return perform(ui, () => apply(g, { type: 'attack', i: +t.dataset.attack }));
    if (t.dataset.retreat != null) { ui.mode = 'retreat'; return render(ui); }
    if (t.dataset.hand != null) {
      const uid = +t.dataset.hand;
      const name = card(g, uid).name;
      // legalActions ne garde qu'une copie par carte : on retrouve les actions par nom.
      const mine = legalActions(g).filter(a => a.uid != null && card(g, a.uid).name === name).map(a => ({ ...a, uid }));
      if (!mine.length) return;
      if (mine.length === 1 && !mine[0].zone && !mine[0].target?.zone) return perform(ui, () => apply(g, mine[0]), { action: mine[0] });
      ui.sel = uid; ui.selActions = mine;
      return render(ui);
    }
    if (t.dataset.slot) {
      const [side, zone, i] = t.dataset.slot.split('|');
      if (ui.mode === 'retreat' && side === '0' && zone === 'bench') return perform(ui, () => apply(g, { type: 'retreat', i: +i }));
      if (ui.sel != null) {
        const same = (z, idx) => z === zone && (zone === 'active' || idx === +i);
        const a = (ui.selActions ?? []).find(x => (side === '0' && x.zone && same(x.zone, x.i))
          || (x.target && String(x.target.side) === side && same(x.target.zone, x.target.i)));
        if (a) { const act = { ...a, uid: ui.sel }; return perform(ui, () => apply(g, act), { action: act }); }
      }
    }
  });
}
