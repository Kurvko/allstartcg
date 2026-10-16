// Pokédex, Sets et Cartes : toute la base de cartes, avec ce que tu possèdes (inspiré de TCG Collector).
import { GAMES, findSet } from './catalog.js';
import { loadIndex } from './data.js';
import { getState } from './store.js';
import { app, esc, fmt, versioned, cardArt } from './ui.js';

const PAGE = 120;
const cache = new Map();
const getJson = url => {
  if (!cache.has(url)) cache.set(url, fetch(versioned(url)).then(r => (r.ok ? r.json() : Promise.reject(new Error(`${url} : HTTP ${r.status}`)))).catch(err => { cache.delete(url); throw err; }));
  return cache.get(url);
};

const gameOf = id => GAMES.find(g => g.id === id) ?? GAMES[0];
const sprite = n => `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${n}.png`;
const artwork = n => `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${n}.png`;
const dexNo = n => `#${String(n).padStart(4, '0')}`;
const GENS = ['Kanto', 'Johto', 'Hoenn', 'Sinnoh', 'Unys', 'Kalos', 'Alola', 'Galar', 'Paldea'];

/** Toutes les cartes d'un jeu, avec leur set, leur rareté (tier) et le nombre possédé. */
async function loadCards(gameId) {
  const rows = await getJson(`data/cards/${gameId}.json`);
  const { collection } = getState();
  const game = gameOf(gameId);
  const order = new Map(game.sets.map((s, i) => [s.id, i]));
  return rows.map(r => {
    const setKey = `${gameId}/${r.s}`;
    const set = findSet(setKey)?.set;
    return {
      ...r, setKey, set, order: order.get(r.s) ?? 0,
      owned: collection[setKey]?.[r.i] ?? 0,
      tier: set?.tiers[r.r] ?? 0,
    };
  }).filter(c => c.set);
}

// Objet carte attendu par la fenêtre de détail.
const asCard = c => ({
  id: c.i, name: c.n, num: c.u, rarity: c.r, price: c.p, tier: c.tier, img: c.m, sport: c.x,
  imgHi: c.m.replace('/low.webp', '/high.webp').replace('_400w', '_in_1000x1000').replace('image_url_small', 'image_url'),
});

function thumb(c) {
  return `
    <button class="thumb tier-${c.tier} ${c.owned ? '' : 'missing'}" data-key="${esc(c.setKey)}|${esc(c.i)}">
      ${cardArt(asCard(c))}
      ${c.owned > 1 ? `<span class="count">×${c.owned}</span>` : ''}
      <span class="thumb-info"><span>${esc(c.n)}</span><b>${fmt(c.p)}</b></span>
    </button>`;
}

function tabs(base, current) {
  return `<nav class="game-tabs">${GAMES.map(g => `<a href="#/${base}/${g.id}" class="${g.id === current ? 'on' : ''}" style="--c:${g.color}">${esc(g.short ?? g.name)}</a>`).join('')}</nav>`;
}

function bindCards(root, cards, game, openModal) {
  const byKey = new Map(cards.map(c => [`${c.setKey}|${c.i}`, c]));
  root.addEventListener('click', e => {
    const b = e.target.closest('[data-key]'); if (!b) return;
    const c = byKey.get(b.dataset.key);
    if (c) openModal?.(asCard(c), game, c.owned);
  });
}

const segHtml = (name, options, current) =>
  `<div class="seg" data-seg="${name}">${options.map(([v, l]) => `<button data-v="${esc(v)}" class="${String(v) === String(current) ? 'on' : ''}">${l}</button>`).join('')}</div>`;

function bindSegs(root, state, redraw) {
  root.querySelectorAll('[data-seg]').forEach(seg => seg.addEventListener('click', e => {
    const b = e.target.closest('[data-v]'); if (!b) return;
    seg.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
    state[seg.dataset.seg] = b.dataset.v;
    state.shown = state.page ?? PAGE;
    redraw();
  }));
}

// ---------- Pokédex ----------

const dexState = { q: '', gen: 'all', show: 'all', mode: 'unique', shown: 240, page: 240 };

export async function viewPokedex(path, { openModal } = {}) {
  if (path) return viewPokemon(+path, openModal);
  app.innerHTML = '<section class="page"><h1>Pokédex</h1><p class="muted">Chargement des cartes…</p></section>';
  const [dex, cards] = await Promise.all([getJson('data/pokedex.json'), loadCards('pokemon')]);
  const per = new Map();
  for (const c of cards) for (const n of c.d ?? []) {
    const p = per.get(n) ?? per.set(n, { total: 0, unique: 0, copies: 0 }).get(n);
    p.total++;
    if (c.owned) { p.unique++; p.copies += c.owned; }
  }
  const caught = dex.filter(([n]) => per.get(n)?.unique).length;
  const withCards = dex.filter(([n]) => per.get(n)?.total).length;

  app.innerHTML = `
    <section class="page dex-page" style="--c:#ffcb05;--a:#3d7dca">
      <div class="page-head">
        <div><h1>Pokédex</h1><p class="muted">Tous les Pokémon et leurs cartes : complète ton Pokédex en ouvrant des boosters.</p></div>
      </div>
      <div class="kpis">
        <div><span>Pokémon attrapés</span><b class="accent">${caught}<small> / ${withCards}</small></b><span class="progress"><i style="width:${(caught / (withCards || 1)) * 100}%"></i></span></div>
        <div><span>Cartes Pokémon différentes</span><b>${cards.filter(c => c.d && c.owned).length}<small> / ${cards.filter(c => c.d).length}</small></b></div>
      </div>
      <div class="toolbar">
        <input type="search" placeholder="Nom ou numéro…" data-q value="${esc(dexState.q)}">
        ${segHtml('show', [['all', 'Tous'], ['owned', 'Attrapés'], ['missing', 'Manquants']], dexState.show)}
        ${segHtml('mode', [['unique', 'Cartes différentes'], ['copies', 'Exemplaires']], dexState.mode)}
      </div>
      <div class="toolbar">${segHtml('gen', [['all', 'Toutes les générations'], ...GENS.map((g, i) => [i + 1, `${i + 1}G · ${g}`])], dexState.gen)}</div>
      <div class="dex-grid"></div>
      <p class="more-line"></p>
    </section>`;

  const root = app.querySelector('.dex-page');
  const grid = root.querySelector('.dex-grid');
  const draw = () => {
    const q = dexState.q.toLowerCase();
    const list = dex.filter(([n, name, gen]) => {
      const p = per.get(n);
      if (dexState.gen !== 'all' && gen !== +dexState.gen) return false;
      if (dexState.show === 'owned' && !p?.unique) return false;
      if (dexState.show === 'missing' && p?.unique) return false;
      return !q || name.toLowerCase().includes(q) || String(n) === q.replace(/^#0*/, '');
    });
    grid.innerHTML = list.slice(0, dexState.shown).map(([n, name]) => {
      const p = per.get(n) ?? { total: 0, unique: 0, copies: 0 };
      const have = dexState.mode === 'copies' ? p.copies : p.unique;
      const pct = p.total ? Math.min(100, (p.unique / p.total) * 100) : 0;
      return `
        <a class="dex-entry ${p.unique ? 'caught' : ''} ${p.total ? '' : 'nocard'}" href="#/pokedex/${n}" title="${esc(name)}">
          <img src="${sprite(n)}" alt="" loading="lazy" width="96" height="96">
          <span class="dex-no">${dexNo(n)}</span>
          <b class="dex-name">${esc(name)}</b>
          <span class="dex-count">${have}${dexState.mode === 'copies' ? ' ex.' : ` / ${p.total}`}</span>
          <span class="progress"><i style="width:${pct}%"></i></span>
        </a>`;
    }).join('') || '<p class="muted">Aucun Pokémon ne correspond.</p>';
    root.querySelector('.more-line').innerHTML = list.length > dexState.shown ? `<button class="btn ghost" data-more>Afficher plus (${list.length - dexState.shown})</button>` : '';
  };
  draw();
  bindSegs(root, dexState, draw);
  root.querySelector('[data-q]').addEventListener('input', e => { dexState.q = e.target.value.trim(); dexState.shown = 240; draw(); });
  root.addEventListener('click', e => { if (e.target.closest('[data-more]')) { dexState.shown += 240; draw(); } });
}

async function viewPokemon(n, openModal) {
  const [dex, all] = await Promise.all([getJson('data/pokedex.json'), loadCards('pokemon')]);
  const entry = dex.find(d => d[0] === n);
  if (!entry) { app.innerHTML = '<section class="page"><h1>Pokémon introuvable</h1><a class="btn" href="#/pokedex">Retour au Pokédex</a></section>'; return; }
  const [, name, gen] = entry;
  const cards = all.filter(c => c.d?.includes(n)).sort((a, b) => b.order - a.order || a.u.localeCompare(b.u, 'fr', { numeric: true }));
  const owned = cards.filter(c => c.owned);
  const value = owned.reduce((s, c) => s + c.p * c.owned, 0);
  const prev = dex.find(d => d[0] === n - 1), next = dex.find(d => d[0] === n + 1);
  let show = 'all';

  app.innerHTML = `
    <section class="page mon-page" style="--c:#ffcb05;--a:#3d7dca">
      <a href="#/pokedex" class="back">← Pokédex</a>
      <div class="mon-head">
        <img class="mon-art" src="${artwork(n)}" alt="${esc(name)}">
        <div>
          <p class="muted">${dexNo(n)} · ${gen}<sup>e</sup> génération (${GENS[gen - 1] ?? ''})</p>
          <h1>${esc(name)}</h1>
          <div class="kpis">
            <div><span>Cartes possédées</span><b class="accent">${owned.length}<small> / ${cards.length}</small></b><span class="progress"><i style="width:${(owned.length / (cards.length || 1)) * 100}%"></i></span></div>
            <div><span>Valeur</span><b>${fmt(value)}</b></div>
          </div>
          <p class="mon-nav">
            ${prev ? `<a class="btn ghost" href="#/pokedex/${prev[0]}">← ${esc(prev[1])}</a>` : ''}
            ${next ? `<a class="btn ghost" href="#/pokedex/${next[0]}">${esc(next[1])} →</a>` : ''}
          </p>
        </div>
      </div>
      <div class="toolbar">${segHtml('show', [['all', `Toutes (${cards.length})`], ['owned', `Possédées (${owned.length})`], ['missing', `Manquantes (${cards.length - owned.length})`]], show)}</div>
      <div class="grid cards-grid"></div>
    </section>`;
  const root = app.querySelector('.mon-page');
  const grid = root.querySelector('.cards-grid');
  const draw = () => {
    const list = cards.filter(c => show === 'all' || (show === 'owned' ? c.owned : !c.owned));
    grid.innerHTML = list.map(c => `<div class="card-cell">${thumb(c)}<small>${esc(c.set.name)} · ${esc(c.u)}</small></div>`).join('')
      || '<p class="muted">Aucune carte de ce Pokémon dans les sets du site pour l\'instant.</p>';
  };
  draw();
  bindSegs(root, { set show(v) { show = v; } }, draw);
  bindCards(root, cards, gameOf('pokemon'), openModal);
}

// ---------- Sets ----------

export async function viewSets(gameId) {
  const game = gameOf(gameId || 'pokemon');
  const [index, packs] = await Promise.all([loadIndex(), getJson('data/packs.json').catch(() => ({}))]);
  const { collection } = getState();
  const groups = new Map();
  for (const set of [...game.sets].reverse()) {
    const label = set.group ?? 'Sets';
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label).push(set);
  }
  const logo = set => set.logo ?? (game.id === 'pokemon' ? `https://assets.tcgdex.net/fr/${set.serie}/${set.id}/logo.webp` : packs[`${game.id}/${set.id}`]?.[0]);
  const owned = game.sets.reduce((s, set) => s + Object.keys(collection[`${game.id}/${set.id}`] ?? {}).length, 0);
  const total = game.sets.reduce((s, set) => s + (index[`${game.id}/${set.id}`]?.total ?? 0), 0);

  app.innerHTML = `
    <section class="page" style="--c:${game.color};--a:${game.accent}">
      <h1>Sets</h1>
      ${tabs('sets', game.id)}
      <p class="muted">${game.sets.length} sets · ${owned} / ${total} cartes différentes possédées</p>
      ${[...groups].map(([label, sets]) => `
        ${groups.size > 1 ? `<h2 class="serie">${esc(label)} <small>${sets.length} sets</small></h2>` : ""}
        <div class="set-list">${sets.map(set => {
          const key = `${game.id}/${set.id}`;
          const n = Object.keys(collection[key] ?? {}).length;
          const t = index[key]?.total ?? 0;
          const pct = t ? Math.round((n / t) * 100) : 0;
          const img = logo(set);
          return `
            <a class="set-line ${pct === 100 ? 'done' : ''}" href="#/collection/${key}">
              <span class="set-logo ${set.logo ? 'light' : game.id === 'pokemon' ? '' : 'pack'}">${img ? `<img src="${img}" alt="" loading="lazy">` : ''}</span>
              <span class="set-meta"><b>${esc(set.name)}</b><small class="muted">${set.date ? new Date(set.date).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }) : set.year} · ${t} cartes</small></span>
              <span class="set-prog"><span>${n} / ${t}${pct === 100 ? ' ✓' : ''}</span><span class="progress"><i style="width:${pct}%"></i></span></span>
            </a>`;
        }).join('')}</div>`).join('')}
    </section>`;
}

// ---------- Cartes ----------

const cardState = { q: '', set: 'all', rarity: 'all', show: 'all', sort: 'price', shown: PAGE };
let cardGame = null;

export async function viewCards(gameId, { openModal } = {}) {
  const game = gameOf(gameId || 'pokemon');
  if (cardGame !== game.id) Object.assign(cardState, { q: '', set: 'all', rarity: 'all', shown: PAGE });
  cardGame = game.id;
  app.innerHTML = `<section class="page"><h1>Cartes</h1>${tabs('cartes', game.id)}<p class="muted">Chargement…</p></section>`;
  const cards = await loadCards(game.id);
  const rarities = [...new Set(cards.map(c => c.r))].sort((a, b) => (game.sets[0].tiers[a] ?? 0) - (game.sets[0].tiers[b] ?? 0) || a.localeCompare(b));
  const ownedCount = cards.filter(c => c.owned).length;

  app.innerHTML = `
    <section class="page cards-page" style="--c:${game.color};--a:${game.accent}">
      <h1>Cartes</h1>
      ${tabs('cartes', game.id)}
      <p class="muted">${cards.length.toLocaleString('fr-FR')} cartes ${esc(game.name)} · ${ownedCount.toLocaleString('fr-FR')} possédées</p>
      <div class="toolbar">
        <input type="search" placeholder="Chercher une carte…" data-q value="${esc(cardState.q)}">
        <select data-sel="set"><option value="all">Tous les sets</option>${[...game.sets].reverse().map(s => `<option value="${esc(s.id)}" ${cardState.set === s.id ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select>
        <select data-sel="rarity"><option value="all">Toutes les raretés</option>${rarities.map(r => `<option ${cardState.rarity === r ? 'selected' : ''}>${esc(r)}</option>`).join('')}</select>
        <select data-sel="sort">
          ${[['price', 'Prix décroissant'], ['price-asc', 'Prix croissant'], ['new', 'Plus récentes'], ['old', 'Plus anciennes'], ['name', 'Nom (A → Z)']].map(([v, l]) => `<option value="${v}" ${cardState.sort === v ? 'selected' : ''}>${l}</option>`).join('')}
        </select>
      </div>
      <div class="toolbar">${segHtml('show', [['all', 'Toutes'], ['owned', 'Possédées'], ['missing', 'Manquantes']], cardState.show)}<span class="muted result-count"></span></div>
      <div class="grid cards-grid"></div>
      <p class="more-line"></p>
    </section>`;

  const root = app.querySelector('.cards-page');
  const grid = root.querySelector('.cards-grid');
  const SORTS = {
    price: (a, b) => b.p - a.p,
    'price-asc': (a, b) => a.p - b.p,
    new: (a, b) => b.order - a.order || a.u.localeCompare(b.u, 'fr', { numeric: true }),
    old: (a, b) => a.order - b.order || a.u.localeCompare(b.u, 'fr', { numeric: true }),
    name: (a, b) => a.n.localeCompare(b.n, 'fr'),
  };
  const draw = () => {
    const q = cardState.q.toLowerCase();
    const list = cards.filter(c => (cardState.set === 'all' || c.s === cardState.set)
      && (cardState.rarity === 'all' || c.r === cardState.rarity)
      && (cardState.show === 'all' || (cardState.show === 'owned' ? c.owned : !c.owned))
      && (!q || c.n.toLowerCase().includes(q))).sort(SORTS[cardState.sort]);
    root.querySelector('.result-count').textContent = `${list.length.toLocaleString('fr-FR')} résultat(s)`;
    grid.innerHTML = list.slice(0, cardState.shown).map(c => `<div class="card-cell">${thumb(c)}<small>${esc(c.set.name)} · ${esc(c.u)}</small></div>`).join('')
      || '<p class="muted">Aucune carte ne correspond.</p>';
    root.querySelector('.more-line').innerHTML = list.length > cardState.shown ? `<button class="btn ghost" data-more>Afficher plus (${(list.length - cardState.shown).toLocaleString('fr-FR')})</button>` : '';
  };
  draw();
  bindSegs(root, cardState, draw);
  root.querySelector('[data-q]').addEventListener('input', e => { cardState.q = e.target.value.trim(); cardState.shown = PAGE; draw(); });
  root.querySelectorAll('[data-sel]').forEach(sel => sel.addEventListener('change', () => { cardState[sel.dataset.sel] = sel.value; cardState.shown = PAGE; draw(); }));
  root.addEventListener('click', e => { if (e.target.closest('[data-more]')) { cardState.shown += PAGE; draw(); } });
  bindCards(root, cards, game, openModal);
}
