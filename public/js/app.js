import { GAMES, MAX_PACKS, REFILL_MS, findSet } from './catalog.js';
import { loadPacks, loadSet, openPack, collectionSummary, loadIndex } from './data.js';
import { getState, packsLeft, nextPackIn, owned, recordPack, recordValue, resetAll, isFav, toggleFav, getFavorites } from './store.js';
import { app, esc, fmt, cardArt } from './ui.js';
import { initCloud } from './cloud.js';
import { viewAccount, accountBadge } from './account.js';
import { viewDecks } from './decks.js';
import { viewPokedex, viewSets, viewCards } from './library.js';
import { viewBattle } from './battle/battle.js';
import { sfx } from './sfx.js';
import * as fx from './fx.js';

const { TIER_COLOR } = fx;

const PACKS = await loadPacks(); // { "pokemon/base1": ["packs/pokemon/base1-0.webp", …] }
const modal = document.getElementById('modal');

// ---------- Utilitaires ----------

const RARITY_LABEL = r => r.replace(/_/g, ' ');
const sleep = ms => new Promise(r => setTimeout(r, ms));

const duration = ms => {
  const h = Math.floor(ms / 3.6e6), m = Math.floor(ms / 6e4) % 60, s = Math.floor(ms / 1000) % 60;
  return `${h ? `${h}h ` : ''}${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s`;
};
const REFILL_LABEL = `${Math.floor(REFILL_MS / 3.6e6)}h${String((REFILL_MS / 6e4) % 60).padStart(2, '0')}`; // « 1h30 »

// Prochain booster d'un jeu (ou de n'importe quel jeu si gameId est vide). Mis à jour chaque seconde.
function nextPackText(gameId) {
  const waits = (gameId ? [gameId] : GAMES.map(g => g.id)).map(nextPackIn).filter(Boolean);
  return waits.length ? duration(Math.min(...waits) + 999) : 'Stock plein';
}
const countdown = (gameId = '') => `<b class="countdown" data-game="${gameId}">${nextPackText(gameId)}</b>`;
// Stock d'un jeu : « 3 / 8 · +1 dans 42m 10s » ou « 8 / 8 · stock plein », mis à jour quand un booster se recharge.
const leftTag = gameId => `<b class="left" data-game="${gameId}">${packsLeft(gameId)}</b>`;
const refillText = gameId => (nextPackIn(gameId) ? ` · +1 dans ${countdown(gameId)}` : ' · stock plein');
const stockLine = gameId => `${leftTag(gameId)} / ${MAX_PACKS}<span class="refill" data-game="${gameId}">${refillText(gameId)}</span>`;

function preload(urls, timeout = 5000) {
  return Promise.race([
    Promise.all(urls.map(src => new Promise(done => { const img = new Image(); img.onload = img.onerror = done; img.src = src; }))),
    sleep(timeout),
  ]);
}

// Cartes sport (sans prix) : on compare la rareté, puis les stars du set.
const cardScore = (c, set) => c.price ?? (c.tier * 10 + (set?.stars?.includes(c.name) ? 5 : 0) + (c.img ? 1 : 0)) / 1000;
const bestOf = (cards, set) => cards.reduce((a, b) => (cardScore(b, set) > cardScore(a, set) ? b : a));
const chaseCard = (data, set) => bestOf(data.cards, set);
// Prix affiché seulement s'il existe (pas de prix pour les cartes sport).
const priceTag = p => (p == null ? '' : fmt(p));

async function refreshTotal() {
  const { value } = await collectionSummary();
  recordValue(value);
  document.getElementById('total-value').textContent = fmt(value);
  return value;
}

// ---------- Composants ----------

// Booster : vrai visuel s'il existe (public/packs), sinon booster dessiné avec la carte phare.
function packHtml(game, set, art, { big = false, img = null } = {}) {
  if (img) return `<div class="pack-real ${big ? 'pack-big' : ''}"><img src="${img}" alt="Booster ${esc(set.name)}" loading="lazy"></div>`;
  return `
    <div class="pack ${big ? 'pack-big' : ''}" style="--c:${game.color};--a:${game.accent}">
      <div class="pack-cut"><div class="crimp"></div></div>
      <div class="pack-body">
        <div class="pack-game">${esc(game.short ?? game.name)}</div>
        <div class="pack-art">${art ? `<img src="${art}" alt="" loading="lazy">` : ''}</div>
        <div class="pack-set">${esc(set.name)}</div>
        <div class="pack-meta">${set.slots.length} cartes · ${set.year}</div>
      </div>
      <div class="crimp crimp-bottom"></div>
    </div>`;
}

// Dos de carte : le vrai dos du jeu, sinon un dos dessiné.
const backFace = game => (game.back
  ? `<div class="face face-back real"><img src="${game.back}" alt=""></div>`
  : `<div class="face face-back"><span>✦</span><small>${esc(game.short ?? game.name)}</small></div>`);

const dots = gameId => `<span class="dots" data-game="${gameId}">${dotsInner(gameId)}</span>`;
const dotsInner = gameId => {
  const left = packsLeft(gameId);
  return Array.from({ length: MAX_PACKS }, (_, i) => `<i class="${i < left ? 'on' : ''}"></i>`).join('');
};

function cardThumb(card, count, { missing = false, setKey = '' } = {}) {
  return `
    <button class="thumb tier-${card.tier} ${missing ? 'missing' : ''}" data-card="${esc(card.id)}" data-set="${esc(setKey)}">
      ${cardArt(card)}
      ${favBadge(setKey, card.id)}
      ${count > 1 ? `<span class="count">×${count}</span>` : ''}
      <span class="thumb-info"><span>${esc(card.name)}</span><b>${card.sport ? esc(RARITY_LABEL(card.rarity)) : fmt(card.price)}</b></span>
    </button>`;
}

// Petite étoile sur les vignettes des cartes favorites.
const favBadge = (setKey, id) => `<span class="fav-badge" data-fav="${esc(setKey)}|${esc(id)}" ${setKey && isFav(setKey, id) ? '' : 'hidden'}>★</span>`;
const favButton = on => (on ? '★ Dans tes favoris' : '☆ Ajouter aux favoris');

function openModal(card, game, count, setKey) {
  modal.innerHTML = `
    <div class="modal-inner" style="--c:${game.color}">
      <div class="tilt tier-${card.tier}">${cardArt(card, { hi: true, lazy: false })}<div class="shine"></div></div>
      <div class="modal-info">
        <h2>${esc(card.name)}</h2>
        <p class="muted">${esc(RARITY_LABEL(card.rarity))}${card.num ? ` · n° ${esc(card.num)}` : ''}</p>
        ${card.price == null ? `<p class="muted">${esc(card.sport?.team ?? '')}${card.sport?.pos ? ` · ${esc(card.sport.pos)}` : ''}</p>` : `<p class="modal-price">${fmt(card.price)}</p>`}
        <p class="muted">${count ? `Tu en possèdes ${count}` : 'Pas encore dans ta collection'}</p>
        <div class="row modal-actions">
          ${setKey ? `<button class="btn fav-btn ${isFav(setKey, card.id) ? 'on' : ''}" data-fav-toggle>${favButton(isFav(setKey, card.id))}</button>` : ''}
          <button class="btn ghost" data-close>Fermer</button>
        </div>
      </div>
    </div>`;
  modal.hidden = false;
  sfx.whoosh(0.1);
  bindTilt(modal.querySelector('.tilt'));
  modal.querySelector('[data-fav-toggle]')?.addEventListener('click', e => {
    const on = toggleFav(setKey, card.id);
    e.currentTarget.classList.toggle('on', on);
    e.currentTarget.textContent = favButton(on);
    document.querySelectorAll(`.fav-badge[data-fav="${CSS.escape(`${setKey}|${card.id}`)}"]`).forEach(b => { b.hidden = !on; });
  });
}

modal.addEventListener('click', e => {
  if (e.target === modal || e.target.closest('[data-close]')) modal.hidden = true;
});
document.addEventListener('keydown', e => { if (e.key === 'Escape') modal.hidden = true; });

function bindTilt(el) {
  el.addEventListener('pointermove', e => {
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
    el.style.setProperty('--rx', `${(0.5 - y) * 16}deg`);
    el.style.setProperty('--ry', `${(x - 0.5) * 18}deg`);
    el.style.setProperty('--mx', `${x * 100}%`);
    el.style.setProperty('--my', `${y * 100}%`);
  });
  el.addEventListener('pointerleave', () => { el.style.setProperty('--rx', '0deg'); el.style.setProperty('--ry', '0deg'); });
}

// ---------- Vues ----------

async function viewHome() {
  const { rows, value } = await collectionSummary();
  const byKey = Object.fromEntries(rows.map(r => [r.key, r]));
  const leftNow = GAMES.reduce((s, g) => s + packsLeft(g.id), 0);
  const showcase = await showcaseCards();

  app.innerHTML = `
    <section class="hero">
      <h1>Ouvre des boosters. <em>Sans dépenser un centime.</em></h1>
      <p>Jusqu'à ${MAX_PACKS} boosters gratuits par jeu, et un nouveau toutes les ${REFILL_LABEL}. Collectionne, complète tes sets, et regarde ta collection prendre de la valeur au prix réel du marché.</p>
      <div class="hero-main">
        <div class="hero-side">
          <div class="hero-stats">
            <div><b class="left" data-game="*">${leftNow}</b><span>boosters dispo maintenant</span></div>
            <div><b>${fmt(value)}</b><span>valeur de ta collection</span></div>
            <div>${countdown()}<span>prochain booster</span></div>
          </div>
          <div class="hero-cta">
            <button class="btn primary big" data-random ${leftNow ? '' : 'disabled'}>✦ Ouvrir un booster au hasard</button>
            <a class="btn ghost" href="#/collection">Ma collection</a>
          </div>
        </div>
        ${showcase.length ? `
        <div class="showcase" aria-label="Les cartes les plus chères du site">
          <div class="sc3d-stage">
            <div class="ring" style="--n:${showcase.length}">
              ${showcase.map((c, i) => `
                <a class="sc3d" href="#/open/${c.key}" style="--i:${i}" title="${esc(c.name)} · ${fmt(c.price)}">
                  <img class="sc3d-front" src="${c.img}" alt="${esc(c.name)}" loading="lazy">
                  <span class="sc3d-back" ${c.back ? `style="background-image:url('${c.back}')"` : ''}></span>
                </a>`).join('')}
            </div>
          </div>
          <div class="showcase-floor"></div>
        </div>` : ''}
      </div>
    </section>
    ${GAMES.map(game => {
      const sets = newestFirst(game.sets);
      // Tuiles logo (plus larges, 4 par ligne) : 7 sets + « voir tout » = 2 lignes pleines.
      const shown = sets.slice(0, game.tileStyle === 'logo' ? 7 : HOME_SETS);
      return `
      <section class="game" style="--c:${game.color};--a:${game.accent}">
        <div class="game-head">
          <h2><a href="#/game/${game.id}">${esc(game.name)}</a></h2>
          ${dots(game.id)}
          <span class="muted">${stockLine(game.id)}</span>
          <a class="see-all" href="#/game/${game.id}">${sets.length} set${sets.length > 1 ? 's' : ''} →</a>
        </div>
        <div class="set-row ${game.tileStyle === 'logo' ? 'logos' : ''}">
          ${shown.map(set => setTile(game, set, byKey[`${game.id}/${set.id}`])).join('')}
          ${sets.length > shown.length ? `
            <a class="set-tile more-tile" href="#/game/${game.id}">
              <span>+${sets.length - shown.length}</span><small>Voir tous les sets ${esc(game.short ?? game.name)}</small>
            </a>` : ''}
        </div>
      </section>`;
    }).join('')}`;

  app.querySelector('[data-random]')?.addEventListener('click', () => {
    const open = rows.filter(r => !r.missing && packsLeft(r.game.id) > 0);
    if (open.length) location.hash = `#/open/${open[Math.floor(Math.random() * open.length)].key}`;
  });
}

// Carrousel 3D de l'accueil : les cartes phares les plus chères (une par carte, sans les cartes sport).
async function showcaseCards() {
  const index = await loadIndex();
  const seen = new Set();
  return Object.entries(index)
    .map(([key, m]) => ({ key, ...m.chase, game: findSet(key)?.game }))
    .filter(c => c.img && c.price && c.game && !c.game.sport)
    .sort((a, b) => b.price - a.price)
    .filter(c => !seen.has(c.name) && seen.add(c.name))
    .slice(0, 10)
    .map(c => ({ ...c, back: c.game.back }));
}

const HOME_SETS = 5;
// Les catalogues sont chronologiques : on inverse puis on trie par année (tri stable).
const newestFirst = sets => [...sets].reverse().sort((a, b) => b.year - a.year);

// Tuile « logo » façon opecards.fr : logo officiel du set sur fond clair, nombre de cartes, nom et code.
function logoTile(game, set, row) {
  const [code, title] = set.name.includes(' – ') ? set.name.split(' – ') : [set.id, set.name];
  const pct = row.total ? Math.round((row.unique / row.total) * 100) : 0;
  const pack = PACKS[row.key]?.[0];
  return `
    <a class="set-tile logo-tile ${row.missing ? 'disabled' : ''}" href="#/open/${row.key}" data-name="${esc(set.name.toLowerCase())}">
      <div class="lt-logo ${set.logo ? '' : 'pack'}"><img src="${set.logo ?? pack ?? ''}" ${set.logo && pack ? `data-fallback="${pack}"` : ''} alt="${esc(title)}" loading="lazy"></div>
      <span class="lt-count">${row.total} cartes</span>
      <h3>${esc(title)}</h3>
      <small class="lt-code">${esc(code.replace('-', '').toUpperCase())} · ${set.year}</small>
      <div class="progress"><i style="width:${pct}%"></i></div>
      <div class="set-tile-info"><span>${set.lang === 'en' ? '<i class="flag-en" title="Version anglaise uniquement"></i>' : '<i class="flag-fr" title="Version française"></i>'} ${row.unique}/${row.total}</span><b>${fmt(row.value)}</b></div>
    </a>`;
}

function setTile(game, set, row) {
  if (game.tileStyle === 'logo') return logoTile(game, set, row);
  if (row.missing) {
    return `<div class="set-tile disabled">${packHtml(game, set, '')}<p class="muted">Données absentes — lance <code>npm run fetch</code></p></div>`;
  }
  const pct = Math.round((row.unique / row.total) * 100);
  return `
    <a class="set-tile" href="#/open/${row.key}" data-name="${esc(set.name.toLowerCase())}">
      ${packHtml(game, set, row.meta.chase.img, { img: PACKS[row.key]?.[0] })}
      <h3 class="set-name">${esc(set.name)}</h3>
      <div class="progress"><i style="width:${pct}%"></i></div>
      <div class="set-tile-info"><span>${row.unique}/${row.total} cartes</span>${game.sport ? "" : `<b>${fmt(row.value)}</b>`}</div>
    </a>`;
}

async function viewGame(gameId) {
  const game = GAMES.find(g => g.id === gameId);
  if (!game) return viewNotFound();
  const { rows } = await collectionSummary();
  const byKey = Object.fromEntries(rows.map(r => [r.key, r]));
  const groups = new Map();
  for (const set of newestFirst(game.sets)) {
    const label = set.group ?? 'Sets';
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label).push(set);
  }

  app.innerHTML = `
    <section class="page" style="--c:${game.color};--a:${game.accent}">
      <a href="#/" class="back">← Tous les jeux</a>
      <div class="page-head">
        <div><h1>${esc(game.name)}</h1><p class="muted">${game.sets.length} sets · boosters : ${stockLine(game.id)}</p></div>
        <input class="search" type="search" placeholder="Rechercher un set…" aria-label="Rechercher un set">
      </div>
      ${[...groups].map(([label, sets]) => `
        <div class="set-group">
          ${groups.size > 1 ? `<h2>${esc(label)} <span class="muted">${sets[sets.length - 1].year}–${sets[0].year}</span></h2>` : ''}
          <div class="set-row ${game.tileStyle === 'logo' ? 'logos' : ''}">${sets.map(set => setTile(game, set, byKey[`${game.id}/${set.id}`])).join('')}</div>
        </div>`).join('')}
      <p class="muted no-result" hidden>Aucun set ne correspond.</p>
    </section>`;

  app.querySelector('.search').addEventListener('input', e => {
    const q = e.target.value.trim().toLowerCase();
    let any = false;
    app.querySelectorAll('.set-group').forEach(g => {
      let visible = 0;
      g.querySelectorAll('.set-tile').forEach(t => {
        const show = !q || (t.dataset.name ?? '').includes(q);
        t.hidden = !show;
        visible += show;
      });
      g.hidden = !visible;
      any ||= visible > 0;
    });
    app.querySelector('.no-result').hidden = any;
  });
}

async function viewOpen(setKey) {
  const found = findSet(setKey);
  if (!found) return viewNotFound();
  const { game, set } = found;
  const data = await loadSet(setKey);
  const chase = chaseCard(data, set);

  app.innerHTML = `
    <section class="open" style="--c:${game.color};--a:${game.accent}">
      <div class="open-head">
        <a href="#/game/${game.id}" class="back">← ${esc(game.short ?? game.name)}</a>
        <div><h1>${esc(set.name)}</h1><p class="muted">${esc(game.name)} · ${set.year} · ${data.cards.length} cartes · carte phare : ${esc(chase.name)}${chase.price == null ? ` (${esc(RARITY_LABEL(chase.rarity))})` : ` (${fmt(chase.price)})`}</p></div>
        <div class="open-quota"></div>
      </div>
      <div class="stage"></div>
    </section>`;

  const stage = app.querySelector('.stage');
  const quota = app.querySelector('.open-quota');
  const updateQuota = () => {
    quota.innerHTML = `${dots(game.id)}<span class="quota-text">${stockLine(game.id)}</span>`;
  };
  // Une illustration au hasard parmi les versions du booster.
  const arts = PACKS[setKey] ?? [];
  const packImg = () => arts[Math.floor(Math.random() * arts.length)];

  // ---------- 1. Le booster en 3D ----------
  const showPack = () => {
    updateQuota();
    stage.revealNext = null;
    const left = packsLeft(game.id);
    if (left <= 0) {
      stage.innerHTML = `
        <div class="pack-stage" data-wait="${game.id}">
          ${packHtml(game, set, chase.img, { big: true, img: packImg() })}
          <div class="limit">
            <h3>Plus de booster pour l'instant ⏳</h3>
            <p>Ton prochain booster ${esc(game.name)} arrive dans ${countdown(game.id)}.</p>
            <p class="muted">Un booster se recharge toutes les ${REFILL_LABEL}, jusqu'à ${MAX_PACKS} en stock. En attendant, ouvre ceux des autres jeux ou admire ta collection.</p>
            <div class="row"><a class="btn" href="#/collection/${setKey}">Voir ma collection</a><a class="btn ghost" href="#/">Autres jeux</a></div>
          </div>
        </div>`;
      return;
    }
    const img = packImg();
    stage.innerHTML = `
      <div class="scene">
        <div class="rays"></div>
        <div class="aura"></div>
        <div class="pack3d-wrap">
          <div class="pack3d">
            <div class="p-front">
              ${img ? `<img class="p-size" src="${img}" alt="">` : `<div class="p-size p-fake">${packHtml(game, set, chase.img)}</div>`}
              <div class="p-body">${img ? `<img src="${img}" alt="Booster ${esc(set.name)}">` : packHtml(game, set, chase.img)}</div>
              <div class="p-top">${img ? `<img src="${img}" alt="">` : packHtml(game, set, chase.img)}</div>
              <div class="p-shine"${img ? ` style="-webkit-mask-image:url('${img}');mask-image:url('${img}')"` : ''}></div>
              <div class="p-cut"><i></i></div>
              <div class="p-light"><i></i></div>
            </div>
            <div class="p-back">${img ? `<img src="${img}" alt="">` : ''}<span>✦</span></div>
          </div>
        </div>
        <div class="stack"></div>
      </div>
      <div class="open-actions">
        <button class="btn primary big" data-open>✂ Ouvrir le booster</button>
        <p class="muted hint">Glisse le long du haut du booster pour le déchirer · ou appuie sur Espace</p>
      </div>`;
    sfx.packIn();

    const scene = stage.querySelector('.scene');
    const pack = stage.querySelector('.pack3d');
    const cut = stage.querySelector('.p-cut i');

    // Inclinaison qui suit la souris.
    scene.addEventListener('pointermove', e => {
      if (scene.classList.contains('opening')) return;
      const r = scene.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
      pack.style.setProperty('--ry', `${x * 34}deg`);
      pack.style.setProperty('--rx', `${-y * 22}deg`);
      pack.style.setProperty('--mx', `${(x + 0.5) * 100}%`);
    });
    scene.addEventListener('pointerleave', () => { pack.style.setProperty('--ry', '0deg'); pack.style.setProperty('--rx', '0deg'); });

    // Déchirure au glisser le long du haut. Écouté sur la scène : en 3D, le clic n'atteint pas toujours le booster lui-même.
    let drag = null;
    scene.addEventListener('pointerdown', e => {
      const r = pack.getBoundingClientRect();
      const inX = e.clientX >= r.left - 20 && e.clientX <= r.right + 20;
      const inTop = e.clientY >= r.top - 20 && e.clientY - r.top <= r.height * 0.3;
      if (!inX || !inTop || scene.classList.contains('opening')) return;
      e.preventDefault();
      drag = { x0: e.clientX, x: e.clientX, w: r.width, left: r.left, y: r.top + r.height * 0.13 };
      scene.setPointerCapture(e.pointerId);
      scene.classList.add('cutting');
    });
    scene.addEventListener('pointermove', e => {
      if (!drag) return;
      const p = Math.min(1, Math.abs(e.clientX - drag.x0) / (drag.w * 0.8));
      const speed = Math.abs(e.clientX - drag.x) / 18;
      drag.x = e.clientX;
      cut.style.width = `${p * 100}%`;
      if (speed > 0.05) {
        sfx.rip(speed);
        fx.sparks(Math.min(drag.left + drag.w, Math.max(drag.left, e.clientX)), drag.y, game.color);
      }
      if (p >= 1) { drag = null; tear(); }
    });
    const release = () => {
      if (!drag) return;
      drag = null;
      scene.classList.remove('cutting');
      cut.style.width = '0';
    };
    scene.addEventListener('pointerup', release);
    scene.addEventListener('pointercancel', release);
    scene.addEventListener('dragstart', e => e.preventDefault()); // empêche de « glisser » l'image du booster
    stage.querySelector('[data-open]').addEventListener('click', tear);
  };

  // ---------- 2. Ouverture ----------
  let busy = false;
  const tear = async () => {
    if (busy || packsLeft(game.id) <= 0 || !stage.querySelector('.pack3d')) return;
    busy = true;
    const cards = await openPack(setKey);
    const fresh = recordPack(game.id, setKey, cards); // enregistré tout de suite : recharger la page ne relance pas le tirage
    updateQuota();
    // La lumière qui sort du booster annonce la meilleure carte (bleu, violet, or, arc-en-ciel).
    const top = Math.max(...cards.map(c => c.tier));

    const scene = stage.querySelector('.scene');
    const pack = stage.querySelector('.pack3d');
    stage.querySelector('.open-actions').innerHTML = '<p class="muted hint">…</p>';
    const cut = stage.querySelector('.p-cut i');
    scene.style.setProperty('--beam', TIER_COLOR[top]);
    scene.classList.add('opening', `beam-${top}`);
    pack.style.setProperty('--ry', '0deg');
    pack.style.setProperty('--rx', '0deg');
    cut.style.transition = 'width .35s ease-out';
    cut.style.width = '100%';
    sfx.tear();
    const loading = preload(cards.map(c => c.img).filter(Boolean));
    await sleep(380);
    scene.classList.add('torn');                // la languette s'arrache, la lumière jaillit
    const lip = stage.querySelector('.p-light').getBoundingClientRect();
    const beamColors = top >= 5 ? fx.RAINBOW : ['#fff', TIER_COLOR[top]];
    fx.burst(lip.left + lip.width / 2, lip.top + lip.height / 2, {
      n: 40 + top * 18, colors: beamColors, speed: 7 + top, angle: -Math.PI / 2, spread: Math.PI * 0.9, shapes: ['spark', 'star', 'dot'],
    });
    if (top >= 4) fx.flash(TIER_COLOR[top], top >= 5 ? 0.55 : 0.35, 700);
    sfx.burstOut(top);
    await Promise.all([loading, sleep(top >= 4 ? 1000 : 650)]);
    buildStack(cards, fresh);
    scene.classList.add('emerge');              // les cartes sortent, le booster tombe
    sfx.whoosh();
    cards.forEach((_, i) => setTimeout(sfx.deal, 120 + i * 30));
    await sleep(1300);
    scene.classList.add('ready');
    busy = false;
  };

  // ---------- 3. Révélation carte par carte ----------
  const buildStack = (cards, fresh) => {
    const stack = stage.querySelector('.stack');
    stack.innerHTML = `
      <div class="stack-rays"></div>
      ${cards.map((c, i) => `
        <div class="scard tier-${c.tier}" style="--i:${i};--n:${cards.length}" data-i="${i}">
          <div class="scard-inner">
            ${backFace(game)}
            <div class="face front">${cardArt(c, { lazy: false })}<div class="shine"></div></div>
          </div>
        </div>`).join('')}
      <div class="scard-label" hidden></div>`;
    stage.querySelector('.open-actions').innerHTML = `
      <div class="tray"></div>
      <div class="row">
        <span class="muted counter">0 / ${cards.length}</span>
        <button class="btn" data-next>Carte suivante</button>
        <button class="btn ghost" data-all>Tout révéler</button>
      </div>
      <p class="muted hint">Clique sur le paquet ou appuie sur Espace pour retourner la carte du dessus</p>`;

    // « Nouveau » seulement sur le premier exemplaire d'une carte jamais eue.
    const isNew = i => fresh.has(cards[i].id) && cards.findIndex(x => x.id === cards[i].id) === i;
    const els = [...stack.querySelectorAll('.scard')];
    const label = stack.querySelector('.scard-label');
    const tray = stage.querySelector('.tray');
    const counter = stage.querySelector('.counter');
    let current = -1;   // carte affichée face visible
    let flipping = false;
    let shownTop = -1;  // meilleure rareté déjà révélée (pour « Tout révéler »)

    // La carte retournée suit la souris en 3D, avec reflet holographique.
    stack.addEventListener('pointermove', e => {
      const r = stack.getBoundingClientRect();
      const x = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
      stack.style.setProperty('--tx', `${(0.5 - y) * 22}deg`);
      stack.style.setProperty('--ty', `${(x - 0.5) * 26}deg`);
      stack.style.setProperty('--mx', `${x * 100}%`);
      stack.style.setProperty('--my', `${y * 100}%`);
    });
    stack.addEventListener('pointerleave', () => { stack.style.setProperty('--tx', '0deg'); stack.style.setProperty('--ty', '0deg'); });

    const toTray = i => {
      const el = els[i];
      el.classList.add('gone');
      const c = cards[i];
      tray.insertAdjacentHTML('beforeend',
        `<button class="tray-card tier-${c.tier}" data-i="${i}" title="${esc(c.name)} · ${c.price == null ? esc(c.rarity) : fmt(c.price)}">${cardArt(c)}</button>`);
    };

    const next = async () => {
      if (flipping) return;
      if (current >= 0) { toTray(current); sfx.whoosh(0.07); }
      if (current === cards.length - 1) return finish();
      flipping = true;
      current++;
      const el = els[current], c = cards[current];
      label.hidden = true;
      delete stack.dataset.glow;
      el.classList.add('top');
      // Suspense : les grosses cartes s'illuminent et aspirent la lumière avant d'être retournées.
      if (c.tier >= 3) {
        const ms = c.tier >= 5 ? 1900 : c.tier >= 4 ? 1300 : 700;
        el.classList.add('charging');
        if (c.tier >= 4) stage.closest('.open')?.classList.add('focus');
        stack.dataset.charge = c.tier;
        const { x, y } = fx.center(el);
        fx.converge(x, y, { colors: c.tier >= 5 ? fx.RAINBOW : ['#fff', TIER_COLOR[c.tier]], ms: ms - 150, rate: c.tier });
        sfx.charge(c.tier, ms / 1000);
        await sleep(ms);
        delete stack.dataset.charge;
      }
      // Or et arc-en-ciel : la carte tournoie avant de se poser face visible.
      const spin = c.tier >= 4;
      if (spin) el.classList.add('spin');
      el.classList.add('flipped');
      sfx.flip();
      setTimeout(() => el.classList.add('live'), spin ? 1180 : 620);
      await sleep(spin ? 560 : 230);
      stage.closest('.open')?.classList.remove('focus');
      shownTop = Math.max(shownTop, c.tier);
      celebrate(el, c.tier);
      if (c.tier >= 2) stack.dataset.glow = c.tier;
      await sleep(200);
      label.innerHTML = `<span>${esc(RARITY_LABEL(c.rarity))}</span><b>${priceTag(c.price)}</b>${isNew(current) ? '<em>✦ Nouvelle carte</em>' : ''}`;
      label.className = `scard-label tier-${c.tier}`;
      label.hidden = false;
      if (isNew(current)) setTimeout(() => sfx.newCard(), 150);
      counter.textContent = `${current + 1} / ${cards.length}`;
      flipping = false;
    };

    stack.addEventListener('click', next);
    stage.querySelector('[data-next]').addEventListener('click', next);
    stage.querySelector('[data-all]').addEventListener('click', () => finish());
    tray.addEventListener('click', e => {
      const b = e.target.closest('[data-i]'); if (!b) return;
      const c = cards[+b.dataset.i];
      openModal(c, game, owned(setKey)[c.id], setKey);
    });
    stage.revealNext = next;

    // ---------- 4. Récapitulatif ----------
    const finish = () => {
      stage.revealNext = null;
      const total = cards.reduce((s, c) => s + (c.price ?? 0), 0);
      const best = bestOf(cards, set);
      const bestI = cards.indexOf(best);
      const left = packsLeft(game.id);
      const worth = best.price != null && set.packPrice && total >= set.packPrice;
      stage.innerHTML = `
        <div class="reveal">
          <div class="cards">
            ${cards.map((c, i) => `
              <div class="flip open tier-${c.tier} ${i === bestI ? 'best' : ''}" style="--i:${i}" data-i="${i}">
                <div class="flip-inner">
                  ${backFace(game)}
                  <div class="face front tilt">${cardArt(c, { lazy: false })}<div class="shine"></div></div>
                </div>
                <div class="flip-label"><span>${esc(RARITY_LABEL(c.rarity))}</span><b>${priceTag(c.price)}</b></div>
                <div class="flip-tags">${i === bestI ? '<span class="best-tag">★ Meilleure</span>' : ''}${isNew(i) ? '<span class="new">✦ Nouveau</span>' : ''}</div>
              </div>`).join('')}
          </div>
          <div class="reveal-bar">
            <div class="summary">
              ${best.price == null ? '' : `<div><span class="muted">Valeur du booster</span><b class="count-up" data-to="${total}">${fmt(0)}</b>${worth ? '<small class="good">Rentabilisé !</small>' : ''}</div>`}
              <div><span class="muted">Meilleure carte</span><b>${esc(best.name)} · ${best.price == null ? esc(RARITY_LABEL(best.rarity)) : fmt(best.price)}</b></div>
              <div><span class="muted">Nouvelles cartes</span><b>${fresh.size}</b></div>
            </div>
            <div class="row">
              ${left > 0 ? `<button class="btn primary big" data-again>Booster suivant (${left} restant${left > 1 ? 's' : ''})</button>` : `<button class="btn" data-again>Prochain booster dans ${countdown(game.id)}</button>`}
              <a class="btn ghost" href="#/collection/${setKey}">Voir la collection</a>
            </div>
          </div>
        </div>`;
      stage.querySelectorAll('.flip').forEach(el => {
        bindTilt(el.querySelector('.tilt'));
        el.addEventListener('click', () => openModal(cards[+el.dataset.i], game, owned(setKey)[cards[+el.dataset.i].id], setKey));
      });
      stage.querySelector('[data-again]')?.addEventListener('click', showPack);
      cards.forEach((_, i) => setTimeout(sfx.deal, 80 + i * 55));
      countUp(stage.querySelector('.count-up'), 300 + cards.length * 55);
      // « Tout révéler » avant la meilleure carte : on la fête quand même.
      if (best.tier >= 3 && shownTop < best.tier) {
        setTimeout(() => {
          const el = stage.querySelector('.flip.best');
          if (el) celebrate(el, best.tier);
        }, 450 + bestI * 55);
      }
      refreshTotal();
    };
  };

  // Effets de révélation selon la rareté.
  const celebrate = (el, tier) => {
    sfx.reveal(tier);
    if (tier < 3) return;
    const { x, y } = fx.center(el);
    const colors = tier >= 5 ? fx.RAINBOW : ['#fff', TIER_COLOR[tier]];
    fx.shockwave(x, y, TIER_COLOR[tier], { size: 160 + tier * 40 });
    fx.burst(x, y, { n: tier >= 5 ? 220 : tier >= 4 ? 130 : 60, colors, speed: 6 + tier * 2, shapes: ['spark', 'star', 'dot'], life: 60 + tier * 10 });
    if (tier >= 4) {
      fx.flash(TIER_COLOR[tier], tier >= 5 ? 0.85 : 0.45, tier >= 5 ? 900 : 600);
      fx.flare(y, TIER_COLOR[tier], tier >= 5 ? 1200 : 900);
      fx.burst(x, y, { n: 60, colors, speed: 14, shapes: ['confetti'], gravity: 0.25, life: 120, size: 5, drag: 0.97 });
    }
    if (tier >= 5) {
      setTimeout(() => fx.shockwave(x, y, '#fff', { size: 520, ms: 1000 }), 180);
      setTimeout(() => fx.confettiRain(), 250);
      const open = stage.closest('.open');
      open?.classList.add('quake');
      setTimeout(() => open?.classList.remove('quake'), 900);
    }
  };

  stage.tear = tear;
  stage.showPack = showPack;
  showPack();
}

// Compteur qui monte jusqu'à la valeur du booster, avec un petit bruit de pièces.
function countUp(el, delay = 0) {
  if (!el) return;
  const to = +el.dataset.to, ms = 900;
  setTimeout(() => {
    const t0 = performance.now();
    let lastTick = 0;
    const step = now => {
      const p = Math.min(1, (now - t0) / ms), v = to * (1 - (1 - p) ** 3);
      el.textContent = fmt(v);
      if (now - lastTick > 70 && p < 1) { sfx.tick(); lastTick = now; }
      if (p < 1) requestAnimationFrame(step);
      else { sfx.coin(); el.classList.add('done'); }
    };
    requestAnimationFrame(step);
  }, delay);
}

async function viewCollection() {
  const { rows, value, count } = await collectionSummary();
  app.innerHTML = `
    <section class="page">
      <h1>Ma collection</h1>
      <p class="muted">${count} cartes · valeur totale <b class="accent">${fmt(value)}</b> · <a class="accent" href="#/favoris">★ Mes favoris (${getFavorites().length})</a></p>
      ${GAMES.map(game => {
        const mine = rows.filter(r => r.game === game && r.unique > 0).sort((a, b) => b.value - a.value);
        if (!mine.length) return '';
        return `
          <h2 class="game-title" style="--c:${game.color}">${esc(game.name)}</h2>
          <div class="binder-list">${mine.map(r => `
            <a class="binder" href="#/collection/${r.key}" style="--c:${r.game.color};--a:${r.game.accent}">
              <div class="binder-art"><img src="${r.meta.chase.img}" alt="" loading="lazy"></div>
              <div class="binder-body">
                <small>${r.set.year}</small>
                <h3>${esc(r.set.name)}</h3>
                <div class="progress"><i style="width:${Math.round((r.unique / r.total) * 100)}%"></i></div>
                <div class="set-tile-info"><span>${r.unique}/${r.total} · ${r.count} cartes</span><b>${fmt(r.value)}</b></div>
              </div>
            </a>`).join('')}
          </div>`;
      }).join('') || '<p>Ta collection est vide. <a class="accent" href="#/">Ouvre ton premier booster →</a></p>'}
    </section>`;
}

async function viewCollectionSet(setKey) {
  const found = findSet(setKey);
  if (!found) return viewNotFound();
  const { game, set } = found;
  const data = await loadSet(setKey);
  const col = owned(setKey);
  let filter = 'all', sort = 'num';

  app.innerHTML = `
    <section class="page" style="--c:${game.color};--a:${game.accent}">
      <a href="#/collection" class="back">← Collection</a>
      <div class="page-head">
        <div><h1>${esc(set.name)}</h1><p class="muted summary-line"></p></div>
        <a class="btn primary" href="#/open/${setKey}">Ouvrir un booster</a>
      </div>
      <div class="toolbar">
        <div class="seg" data-filter>
          <button data-v="all" class="on">Toutes</button><button data-v="owned">Possédées</button><button data-v="missing">Manquantes</button><button data-v="fav">★ Favoris</button>
        </div>
        <select data-sort>
          <option value="num">Numéro</option><option value="price">Prix ↓</option><option value="tier">Rareté ↓</option>
        </select>
      </div>
      <div class="grid"></div>
    </section>`;

  const unique = Object.keys(col).filter(id => data.byId.has(id)).length;
  const value = Object.entries(col).reduce((s, [id, n]) => s + (data.byId.get(id)?.price ?? 0) * n, 0);
  app.querySelector('.summary-line').innerHTML =
    `${esc(game.name)} · ${unique}/${data.cards.length} cartes (${Math.round((unique / data.cards.length) * 100)} %)${game.sport ? '' : ` · valeur <b class="accent">${fmt(value)}</b>`}`;

  const grid = app.querySelector('.grid');
  const draw = () => {
    let cards = data.cards.slice();
    if (filter === 'owned') cards = cards.filter(c => col[c.id]);
    if (filter === 'missing') cards = cards.filter(c => !col[c.id]);
    if (sort === 'price') cards.sort((a, b) => (b.price ?? 0) - (a.price ?? 0));
    if (sort === 'tier') cards.sort((a, b) => b.tier - a.tier || (b.price ?? 0) - (a.price ?? 0));
    if (filter === 'fav') cards = cards.filter(c => isFav(setKey, c.id));
    grid.innerHTML = cards.map(c => cardThumb(c, col[c.id] ?? 0, { missing: !col[c.id], setKey })).join('') ||
      '<p class="muted">Rien ici pour l\'instant.</p>';
  };
  app.querySelector('[data-filter]').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    filter = b.dataset.v;
    app.querySelectorAll('[data-filter] button').forEach(x => x.classList.toggle('on', x === b));
    draw();
  });
  app.querySelector('[data-sort]').addEventListener('change', e => { sort = e.target.value; draw(); });
  grid.addEventListener('click', e => {
    const b = e.target.closest('[data-card]'); if (!b) return;
    openModal(data.byId.get(b.dataset.card), game, col[b.dataset.card], setKey);
  });
  draw();
}

async function viewStats() {
  const { rows, value, count } = await collectionSummary();
  const state = getState();
  const packs = Object.values(state.totalPacks).reduce((s, n) => s + n, 0);
  const saved = Object.entries(state.totalPacks).reduce((s, [key, n]) => s + (findSet(key)?.set.packPrice ?? 0) * n, 0);
  const hist = Object.entries(state.history).sort(([a], [b]) => a.localeCompare(b));

  app.innerHTML = `
    <section class="page">
      <h1>Statistiques</h1>
      <div class="kpis">
        <div><span>Valeur de la collection</span><b class="accent">${fmt(value)}</b></div>
        <div><span>Cartes</span><b>${count}</b></div>
        <div><span>Boosters ouverts</span><b>${packs}</b></div>
        <div title="Prix indicatif des boosters scellés que tu aurais dû acheter"><span>Argent économisé (estim.)</span><b class="good">${fmt(saved)}</b></div>
      </div>
      <h2>Évolution de la valeur</h2>
      ${chart(hist)}
      <h2>Meilleurs tirages</h2>
      <div class="grid">
        ${state.bestPulls.map(p => {
          const { game } = findSet(p.setKey) ?? {};
          const card = rows.find(r => r.key === p.setKey)?.data?.byId.get(p.id);
          return card ? `<div style="--c:${game.color}">${cardThumb(card, 0, { setKey: p.setKey })}</div>` : '';
        }).join('') || '<p class="muted">Ouvre ton premier booster !</p>'}
      </div>
      <h2>Par set</h2>
      <table class="table">
        <thead><tr><th>Set</th><th>Boosters</th><th>Complétion</th><th>Valeur</th></tr></thead>
        <tbody>${rows.filter(r => r.unique > 0 || state.totalPacks[r.key]).map(r => `
          <tr><td><a href="#/collection/${r.key}">${esc(r.game.name)} — ${esc(r.set.name)}</a></td>
          <td>${state.totalPacks[r.key] ?? 0}</td><td>${r.unique}/${r.total}</td><td>${fmt(r.value)}</td></tr>`).join('')}
        </tbody>
      </table>
      <p class="danger-zone"><button class="btn ghost" data-reset>Réinitialiser ma collection</button></p>
    </section>`;

  app.querySelector('.grid').addEventListener('click', e => {
    const b = e.target.closest('[data-card]'); if (!b) return;
    const pull = state.bestPulls.find(p => p.id === b.dataset.card);
    const { game } = findSet(pull.setKey);
    const card = rows.find(r => r.key === pull.setKey).data.byId.get(pull.id);
    openModal(card, game, owned(pull.setKey)[pull.id], pull.setKey);
  });
  app.querySelector('[data-reset]').addEventListener('click', () => {
    if (confirm('Effacer toute ta collection et tes statistiques ? (Ton stock de boosters ne se recharge pas pour autant.)')) {
      resetAll();
      route();
    }
  });
}

function chart(points) {
  if (points.length < 2) return '<p class="muted">Le graphique apparaîtra à partir de ton deuxième jour de collection.</p>';
  const W = 800, H = 220, P = 28;
  const vals = points.map(([, v]) => v);
  const max = Math.max(...vals), min = Math.min(0, ...vals);
  const x = i => P + (i / (points.length - 1)) * (W - 2 * P);
  const y = v => H - P - ((v - min) / (max - min || 1)) * (H - 2 * P);
  const line = points.map(([, v], i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('');
  return `
    <svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Évolution de la valeur de la collection">
      <path d="${line}L${x(points.length - 1)},${H - P}L${x(0)},${H - P}Z" class="area"/>
      <path d="${line}" class="line"/>
      ${points.map(([d, v], i) => `<circle cx="${x(i)}" cy="${y(v)}" r="3.5"><title>${d} : ${fmt(v)}</title></circle>`).join('')}
      <text x="${P}" y="${H - 6}">${points[0][0]}</text>
      <text x="${W - P}" y="${H - 6}" text-anchor="end">${points[points.length - 1][0]}</text>
      <text x="${W - P}" y="${y(max) - 8}" text-anchor="end">${fmt(max)}</text>
    </svg>`;
}

async function viewFavorites() {
  const items = (await Promise.all(getFavorites().map(async f => {
    const found = findSet(f.setKey);
    if (!found) return null;
    try {
      const card = (await loadSet(f.setKey)).byId.get(f.id);
      return card && { ...f, ...found, card };
    } catch { return null; }
  }))).filter(Boolean);
  const byGame = GAMES.map(g => [g, items.filter(x => x.game === g)]).filter(([, list]) => list.length);
  app.innerHTML = `
    <section class="page favorites">
      <a href="#/collection" class="back">← Collection</a>
      <h1>★ Mes favoris</h1>
      <p class="muted">${items.length ? `${items.length} carte${items.length > 1 ? 's' : ''} · ` : ''}Ouvre une carte et clique sur « ☆ Ajouter aux favoris » pour la retrouver ici, que tu l'aies déjà ou que tu la chasses encore.</p>
      ${byGame.map(([game, list]) => `
        <h2 class="game-title" style="--c:${game.color}">${esc(game.name)}</h2>
        <div class="grid">${list.map(x => {
          const n = owned(x.setKey)[x.id] ?? 0;
          return cardThumb(x.card, n, { missing: !n, setKey: x.setKey })
            .replace('<span class="thumb-info">', `<span class="thumb-set">${esc(x.set.name)}</span><span class="thumb-info">`);
        }).join('')}</div>`).join('') || '<p>Aucun favori pour l’instant.</p>'}
    </section>`;
  app.querySelector('.favorites').addEventListener('click', e => {
    const b = e.target.closest('[data-card]'); if (!b) return;
    const x = items.find(i => i.setKey === b.dataset.set && i.id === b.dataset.card);
    if (x) openModal(x.card, x.game, owned(x.setKey)[x.id], x.setKey);
  });
}

function viewNotFound() {
  app.innerHTML = '<section class="page"><h1>Page introuvable</h1><a class="btn" href="#/">Retour aux boosters</a></section>';
}

// ---------- Routeur ----------

let routeSeq = 0, routeDone = 0;

async function route() {
  const seq = ++routeSeq;
  modal.hidden = true;
  const path = location.hash.replace(/^#\/?/, '');
  const [page, ...rest] = path.split('/');
  const setKey = rest.join('/');
  document.querySelectorAll('[data-nav]').forEach(a => a.classList.toggle('on',
    a.dataset.nav === (['open', 'game', ''].includes(page) ? 'home' : page)));
  try {
    if (!page) await viewHome();
    else if (page === 'game') await viewGame(setKey);
    else if (page === 'open') await viewOpen(setKey);
    else if (page === 'collection') await (setKey ? viewCollectionSet(setKey) : viewCollection());
    else if (page === 'stats') await viewStats();
    else if (page === 'favoris') await viewFavorites();
    else if (page === 'decks') await viewDecks(setKey, { openModal });
    else if (page === 'compte') await viewAccount();
    else if (page === 'combat') await viewBattle();
    else if (page === 'pokedex') await viewPokedex(setKey, { openModal });
    else if (page === 'sets') await viewSets(setKey);
    else if (page === 'cartes') await viewCards(setKey, { openModal });
    else viewNotFound();
  } catch (err) {
    app.innerHTML = `<section class="page"><h1>Oups</h1><p>${esc(err.message)}</p></section>`;
  }
  // Une page lente (ex. accueil) a fini après un changement de page : on réaffiche la page demandée.
  if (seq < routeSeq) { if (routeDone === routeSeq) route(); return; }
  routeDone = seq;
  window.scrollTo(0, 0);
}

window.addEventListener('hashchange', route);
// Scan français absent chez TCGdex : on retente avec le scan anglais, puis on masque l'image.
document.addEventListener('error', e => {
  const img = e.target;
  if (!(img instanceof HTMLImageElement)) return;
  // Logo de set absent : visuel du booster à la place.
  if (img.dataset.fallback) { img.src = img.dataset.fallback; img.parentElement.classList.add('pack'); delete img.dataset.fallback; return; }
  if (img.src.includes('assets.tcgdex.net/fr/')) img.src = img.src.replace('/fr/', '/en/');
  else img.style.visibility = 'hidden';
}, true);
document.addEventListener('keydown', e => {
  if (e.code !== 'Space' || !modal.hidden || e.target.matches('input, select, textarea, button')) return;
  const stage = app.querySelector('.stage');
  if (!stage) return;
  e.preventDefault();
  if (stage.revealNext) stage.revealNext();
  else if (stage.querySelector('[data-open]')) stage.tear();
});
// Chaque seconde : comptes à rebours, et mise à jour du stock quand un booster se recharge.
let lastLeft = GAMES.map(g => packsLeft(g.id)).join();
setInterval(() => {
  document.querySelectorAll('.countdown').forEach(el => { el.textContent = nextPackText(el.dataset.game); });
  const left = GAMES.map(g => packsLeft(g.id)).join();
  if (left === lastLeft) return;
  lastLeft = left;
  document.querySelectorAll('.left[data-game]').forEach(el => {
    el.textContent = el.dataset.game === '*' ? GAMES.reduce((n, g) => n + packsLeft(g.id), 0) : packsLeft(el.dataset.game);
  });
  document.querySelectorAll('.dots[data-game]').forEach(el => { el.innerHTML = dotsInner(el.dataset.game); });
  document.querySelectorAll('.refill[data-game]').forEach(el => { el.innerHTML = refillText(el.dataset.game); });
  // Écran « plus de booster » : le booster revenu s'affiche tout seul.
  const stage = app.querySelector('.stage');
  const wait = stage?.querySelector('[data-wait]');
  if (wait && packsLeft(wait.dataset.wait) > 0) stage.showPack();
}, 1000);

route();
refreshTotal();
accountBadge();
// Sauvegarde du compte récupérée : on réaffiche la page avec la collection à jour.
window.addEventListener('allstar:synced', () => { refreshTotal(); if (!app.querySelector('.stage, form')) route(); });
initCloud();
