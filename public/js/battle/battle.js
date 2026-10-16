// Page Combat : un deck Pokémon contre l'IA (3 niveaux).
import { loadSet } from '../data.js';
import { getDecks, getState, recordBattle } from '../store.js';
import { app, esc } from '../ui.js';
import {
  apply, attackable, canRetreat, card, hpLeft, isBasic, legalActions, maxHp, newGame, promote, retreatCost,
  setup, STATUS_FR, topCard, energyType,
} from './engine.js';
import { chooseAction, chooseSetup, bestPromotion, LEVELS } from './ai.js';
import { buildDeck, basicEnergy, mainTypes } from './build.js';
import { sfx } from '../sfx.js';
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
    const aiDeck = buildDeck(aiPool, types[Math.floor(Math.random() * types.length)], { strength: aiCfg.strength });
    startBattle(mine, aiDeck, choice.level);
  });
}

// ---------- Plateau ----------
function startBattle(myDeck, aiDeck, level) {
  const g = newGame([myDeck, aiDeck], { names: ['Toi', `IA ${LEVELS[level].label}`] });
  const ui = { g, level, sel: null, mode: null, setupPick: [], busy: false, done: false, logShown: 0 };
  app.innerHTML = '<section class="page battle"><div class="board"></div></section>';
  render(ui);
}

const SLOT_ZONES = (g, side) => [
  ...(g.players[side].active ? [{ zone: 'active', i: 0, s: g.players[side].active }] : []),
  ...g.players[side].bench.map((s, i) => ({ zone: 'bench', i, s })),
];

function slotHtml(ui, side, zone, i, s, targets) {
  const g = ui.g;
  if (!s) return `<div class="bslot empty ${zone}"></div>`;
  const c = topCard(g, s);
  const hp = hpLeft(g, s), max = maxHp(g, s);
  const tkey = `${side}|${zone}|${i}`;
  const isTarget = targets.has(tkey);
  return `
    <button class="bslot ${zone} ${isTarget ? 'target' : ''} ${s.status ? `st-${s.status}` : ''}" data-slot="${tkey}" title="${esc(c.name)}">
      <img src="${c.img}" alt="${esc(c.name)}">
      <span class="hpbar"><i style="width:${Math.max(0, (hp / max) * 100)}%"></i></span>
      <span class="hp">${Math.max(0, hp)}/${max}</span>
      ${s.damage ? `<span class="dmg">${s.damage}</span>` : ''}
      <span class="energies">${s.energies.map(uid => dot(energyType(card(g, uid)))).join('')}</span>
      ${s.status ? `<span class="status">${STATUS_FR[s.status]}</span>` : ''}
      ${s.tools.length ? '<span class="tool" title="Outil attaché">🔧</span>' : ''}
    </button>`;
}

function handCard(ui, uid, playable, selected) {
  const c = card(ui.g, uid);
  const art = c.img ? `<img src="${c.img}" alt="${esc(c.name)}">` : `<span class="energy-card" style="--t:${TYPE_HEX[c.play.colors?.[0]] ?? '#999'}">${esc(c.play.colors?.[0] ?? '')}</span>`;
  return `<button class="hcard ${playable ? 'playable' : ''} ${selected ? 'sel' : ''}" data-hand="${uid}" title="${esc(c.name)}">${art}</button>`;
}

function render(ui) {
  const g = ui.g;
  const board = app.querySelector('.board');
  if (!board) return;
  const me = g.players[0], foe = g.players[1];
  const myTurn = g.current === 0 && !g.pending && g.winner == null;
  const actions = myTurn && !ui.busy ? legalActions(g) : [];

  // Cibles possibles selon la sélection en cours.
  const targets = new Set();
  let banner = '';
  if (g.pending?.type === 'setup') {
    banner = ui.setupPick.length ? 'Ajoute des Pokémon de base sur ton Banc (facultatif), puis valide.' : 'Choisis ton Pokémon Actif parmi tes Pokémon de base.';
  } else if (g.pending?.type === 'promote' && g.pending.players.includes(0)) {
    banner = 'Ton Pokémon Actif est K.O. : choisis un Pokémon de ton Banc.';
    me.bench.forEach((_, i) => targets.add(`0|bench|${i}`));
  } else if (ui.mode === 'retreat') {
    banner = `Retraite (coût ${retreatCost(g, me.active)}) : choisis le Pokémon qui passe Actif.`;
    me.bench.forEach((_, i) => targets.add(`0|bench|${i}`));
  } else if (ui.sel != null) {
    for (const a of ui.selActions ?? []) {
      if (a.zone) targets.add(`0|${a.zone}|${a.i}`);
      if (a.target) targets.add(`${a.target.side}|${a.target.zone}|${a.target.zone === 'active' ? 0 : a.target.i}`);
    }
    banner = `${card(g, ui.sel).name} : choisis une cible.`;
  } else if (!myTurn && g.winner == null) banner = `${foe.name} réfléchit…`;

  const playableUids = new Set(actions.filter(a => a.uid != null).map(a => a.uid));
  // Les cartes identiques sont regroupées dans legalActions : on autorise toutes les copies.
  const playableNames = new Set([...playableUids].map(uid => card(g, uid).name));
  const atk = myTurn && me.active ? attackable(g, 0).map(x => x.i) : [];
  const setupBasics = g.pending?.type === 'setup';

  board.innerHTML = `
    <div class="bside foe">
      <div class="binfo"><b>${esc(foe.name)}</b> · Main ${foe.hand.length} · Deck ${foe.deck.length} · Défausse ${foe.discard.length}
        <span class="prizes">${'<i></i>'.repeat(foe.prizes.length)}</span></div>
      <div class="bench">${[0, 1, 2, 3, 4].map(i => slotHtml(ui, 1, 'bench', i, foe.bench[i], targets)).join('')}</div>
      <div class="activezone">${slotHtml(ui, 1, 'active', 0, foe.active, targets)}</div>
    </div>
    <div class="bmid">
      <div class="turnline">${g.winner != null ? '' : `Tour ${g.turn} · ${g.current === 0 ? '<b class="accent">à toi de jouer</b>' : esc(foe.name)}`}${g.stadium ? ` · Stade : ${esc(card(g, g.stadium.uid).name)}` : ''}</div>
      ${banner ? `<div class="banner">${esc(banner)}</div>` : ''}
      <div class="blog">${g.log.slice(-7).map(l => `<p>${esc(l)}</p>`).join('')}</div>
      <div class="bactions">
        ${setupBasics ? `<button class="btn primary" data-setup-ok ${ui.setupPick.length ? '' : 'disabled'}>Valider</button>` : ''}
        ${myTurn ? (topCard(g, me.active).play.atk ?? []).map((a, i) => `
          <button class="btn atk ${atk.includes(i) ? '' : 'off'}" data-attack="${i}" ${atk.includes(i) ? '' : 'disabled'} title="${esc(a.e ?? '')}">
            <span class="cost">${(a.c ?? []).map(dot).join('')}</span> ${esc(a.n)} <b>${esc(String(a.d ?? ''))}</b></button>`).join('') : ''}
        ${myTurn && canRetreat(g, 0) ? `<button class="btn ghost" data-retreat>Retraite (${retreatCost(g, me.active)})</button>` : ''}
        ${ui.sel != null || ui.mode ? '<button class="btn ghost" data-cancel>Annuler</button>' : ''}
        ${myTurn ? '<button class="btn" data-end>Fin du tour</button>' : ''}
      </div>
    </div>
    <div class="bside me">
      <div class="activezone">${slotHtml(ui, 0, 'active', 0, me.active, targets)}</div>
      <div class="bench">${[0, 1, 2, 3, 4].map(i => slotHtml(ui, 0, 'bench', i, me.bench[i], targets)).join('')}</div>
      <div class="binfo"><b>Toi</b> · Deck ${me.deck.length} · Défausse ${me.discard.length} <span class="prizes">${'<i></i>'.repeat(me.prizes.length)}</span></div>
      <div class="hand">${me.hand.map(uid => handCard(ui, uid,
        setupBasics ? isBasic(card(g, uid)) && !ui.setupPick.includes(uid) : playableNames.has(card(g, uid).name) && playableUids.size > 0,
        ui.sel === uid || ui.setupPick.includes(uid))).join('')}</div>
    </div>
    <aside class="bpreview">${ui.preview ? previewHtml(ui, ui.preview) : '<p>Survole une carte pour la voir en grand.</p>'}</aside>
    ${g.winner != null ? `
      <div class="bover ${g.winner === 0 ? 'win' : 'lose'}">
        <h2>${g.winner === 0 ? '🏆 Victoire !' : 'Défaite…'}</h2>
        <p>${esc(g.reason)}</p>
        <p class="row-btns"><a class="btn primary" href="#/combat" data-again>Rejouer</a></p>
      </div>` : ''}`;

  const logBox = board.querySelector('.blog');
  if (logBox) logBox.scrollTop = logBox.scrollHeight;
  feedback(ui, board);
  bind(ui);
  if (g.winner != null && !ui.done) { ui.done = true; recordBattle(`pokemon/${ui.level}`, g.winner === 0); }
  if (g.current === 1 && !g.pending && g.winner == null && !ui.busy) aiTurn(ui);
  if (g.pending?.type === 'promote' && g.pending.players[0] === 1) { promote(g, 1, bestPromotion(g, 1)); render(ui); }
}

// Sons et impacts : on compare avec l'affichage précédent (dégâts reçus, K.O., cartes jouées, fin de partie).
function feedback(ui, board) {
  const g = ui.g, prev = ui.fx;
  const now = { dmg: {}, prizes: g.players.map(p => p.prizes.length), hand: g.players.map(p => p.hand.length) };
  for (const side of [0, 1]) {
    for (const { zone, i, s } of SLOT_ZONES(g, side)) {
      const key = `${side}|${s.stack[0]}`;
      now.dmg[key] = s.damage;
      const diff = s.damage - (prev?.dmg[key] ?? s.damage);
      if (diff <= 0) continue;
      const el = board.querySelector(`[data-slot="${side}|${zone}|${zone === 'active' ? 0 : i}"]`);
      if (!el) continue;
      el.classList.add('hit');
      el.insertAdjacentHTML('beforeend', `<span class="dmg-pop">-${diff}</span>`);
      const { x, y } = fx.center(el);
      fx.burst(x, y, { n: 26, colors: ['#fff', '#ffb347', '#e5484d'], speed: 7, shapes: ['spark', 'star'], life: 40 });
      sfx.hit(diff);
    }
  }
  if (prev) {
    if (now.prizes.some((n, side) => n < prev.prizes[side])) setTimeout(() => sfx.ko(), 250);
    else if (now.hand.some((n, side) => n < prev.hand[side])) sfx.play();
  }
  if (g.winner != null && !ui.fxDone) {
    ui.fxDone = true;
    if (g.winner === 0) { setTimeout(() => { sfx.win(); fx.confettiRain(); }, 400); } else setTimeout(() => sfx.lose(), 400);
  }
  ui.fx = now;
}

function previewHtml(ui, uid) {
  const c = card(ui.g, uid);
  if (!c.img) return `<p><b>${esc(c.name)}</b></p>`;
  const atks = (c.play.atk ?? []).map(a => `<p class="atk-text"><b>${esc(a.n)}</b> ${esc(String(a.d ?? ''))}${a.e ? ` — ${esc(a.e)}` : ''}</p>`).join('');
  return `<img src="${c.imgHi ?? c.img}" alt="${esc(c.name)}">${atks}${c.play.text ? `<p class="atk-text">${esc(c.play.text)}</p>` : ''}`;
}

function bind(ui) {
  const g = ui.g;
  const board = app.querySelector('.board');
  board.onmouseover = e => {
    const t = e.target.closest('[data-hand], [data-slot]'); if (!t) return;
    let uid;
    if (t.dataset.hand != null) uid = +t.dataset.hand;
    else { const [side, zone, i] = t.dataset.slot.split('|'); const p = g.players[+side]; const sl = zone === 'active' ? p.active : p.bench[+i]; if (sl) uid = sl.stack[sl.stack.length - 1]; }
    if (uid == null || uid === ui.preview) return;
    ui.preview = uid;
    const box = board.querySelector('.bpreview');
    if (box) box.innerHTML = previewHtml(ui, uid);
  };
  board.onclick = e => {
    const t = e.target.closest('button, a'); if (!t || ui.busy) return;
    if (t.dataset.again != null) return;
    // Mise en place
    if (g.pending?.type === 'setup') {
      if (t.dataset.hand != null) {
        const uid = +t.dataset.hand;
        if (!isBasic(card(g, uid))) return;
        ui.setupPick = ui.setupPick.includes(uid) ? ui.setupPick.filter(x => x !== uid) : [...ui.setupPick, uid].slice(0, 6);
        return render(ui);
      }
      if (t.dataset.setupOk != null) { setup(g, [ui.setupPick, chooseSetup(g, 1)]); ui.setupPick = []; return render(ui); }
      return;
    }
    // Remplacement après un KO
    if (g.pending?.type === 'promote' && g.pending.players.includes(0)) {
      if (t.dataset.slot) { const [, zone, i] = t.dataset.slot.split('|'); if (zone === 'bench') { promote(g, 0, +i); render(ui); } }
      return;
    }
    if (g.current !== 0 || g.winner != null) return;
    if (t.dataset.cancel != null) { ui.sel = null; ui.mode = null; return render(ui); }
    if (t.dataset.end != null) { ui.sel = null; ui.mode = null; apply(g, { type: 'end' }); return render(ui); }
    if (t.dataset.attack != null) { ui.sel = null; apply(g, { type: 'attack', i: +t.dataset.attack }); return render(ui); }
    if (t.dataset.retreat != null) { ui.sel = null; ui.mode = 'retreat'; return render(ui); }
    const actions = legalActions(g);
    if (t.dataset.hand != null) {
      const uid = +t.dataset.hand;
      const name = card(g, uid).name;
      // legalActions ne garde qu'une copie par carte : on retrouve les actions par nom.
      const mine = actions.filter(a => a.uid != null && card(g, a.uid).name === name).map(a => ({ ...a, uid }));
      if (!mine.length) return;
      if (mine.length === 1 && !mine[0].zone && !(mine[0].target && mine[0].target.zone)) { apply(g, mine[0]); ui.sel = null; return render(ui); }
      ui.sel = uid; ui.selActions = mine;
      return render(ui);
    }
    if (t.dataset.slot) {
      const [side, zone, i] = t.dataset.slot.split('|');
      if (ui.mode === 'retreat' && side === '0' && zone === 'bench') { ui.mode = null; apply(g, { type: 'retreat', i: +i }); return render(ui); }
      if (ui.sel != null) {
        const a = (ui.selActions ?? []).find(x => (x.zone === zone && (zone === 'active' || x.i === +i) && side === '0')
          || (x.target && String(x.target.side) === side && x.target.zone === zone && (zone === 'active' || x.target.i === +i)));
        if (a) { apply(g, { ...a, uid: ui.sel }); ui.sel = null; return render(ui); }
      }
    }
  };
}

async function aiTurn(ui) {
  const g = ui.g;
  ui.busy = true;
  await sleep(700);
  for (let guard = 0; guard < 60 && g.current === 1 && g.winner == null; guard++) {
    if (g.pending) {
      if (g.pending.type === 'promote' && g.pending.players[0] === 1) promote(g, 1, bestPromotion(g, 1));
      else break; // c'est au joueur de choisir (son Actif a été mis K.O.)
      render(ui); await sleep(500); continue;
    }
    const action = chooseAction(g, 1, ui.level);
    apply(g, action);
    render(ui);
    await sleep(action.type === 'attack' ? 1100 : 650);
  }
  ui.busy = false;
  render(ui);
}

