import { GAMES, DAILY_PACKS, findSet } from './catalog.js';
import { loadPacks, loadSet, openPack, collectionSummary } from './data.js';
import { getState, packsLeft, owned, recordPack, recordValue, resetAll } from './store.js';
import { app, esc, fmt, cardArt } from './ui.js';
import { initCloud } from './cloud.js';
import { viewAccount, accountBadge } from './account.js';
import { viewDecks } from './decks.js';
import { viewPokedex, viewSets, viewCards } from './library.js';
import { viewBattle } from './battle/battle.js';

const PACKS = await loadPacks(); // { "pokemon/base1": ["packs/pokemon/base1-0.webp", …] }
const modal = document.getElementById('modal');

// ---------- Utilitaires ----------

const RARITY_LABEL = r => r.replace(/_/g, ' ');
const sleep = ms => new Promise(r => setTimeout(r, ms));

function untilMidnight() {
  const now = new Date();
  const ms = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1) - now;
  const h = Math.floor(ms / 3.6e6), m = Math.floor(ms / 6e4) % 60, s = Math.floor(ms / 1000) % 60;
  return `${h}h ${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s`;
}

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

function dots(gameId) {
  const left = packsLeft(gameId);
  return `<span class="dots" title="${left} booster(s) restant(s) aujourd'hui">${
    Array.from({ length: DAILY_PACKS }, (_, i) => `<i class="${i < left ? 'on' : ''}"></i>`).join('')
  }</span>`;
}

function cardThumb(card, count, { missing = false } = {}) {
  return `
    <button class="thumb tier-${card.tier} ${missing ? 'missing' : ''}" data-card="${esc(card.id)}">
      ${cardArt(card)}
      ${count > 1 ? `<span class="count">×${count}</span>` : ''}
      <span class="thumb-info"><span>${esc(card.name)}</span><b>${card.sport ? esc(RARITY_LABEL(card.rarity)) : fmt(card.price)}</b></span>
    </button>`;
}

function openModal(card, game, count) {
  modal.innerHTML = `
    <div class="modal-inner" style="--c:${game.color}">
      <div class="tilt tier-${card.tier}">${cardArt(card, { hi: true, lazy: false })}<div class="shine"></div></div>
      <div class="modal-info">
        <h2>${esc(card.name)}</h2>
        <p class="muted">${esc(RARITY_LABEL(card.rarity))}${card.num ? ` · n° ${esc(card.num)}` : ''}</p>
        ${card.price == null ? `<p class="muted">${esc(card.sport?.team ?? '')}${card.sport?.pos ? ` · ${esc(card.sport.pos)}` : ''}</p>` : `<p class="modal-price">${fmt(card.price)}</p>`}
        <p class="muted">${count ? `Tu en possèdes ${count}` : 'Pas encore dans ta collection'}</p>
        <button class="btn ghost" data-close>Fermer</button>
      </div>
    </div>`;
  modal.hidden = false;
  bindTilt(modal.querySelector('.tilt'));
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

function confetti(origin, color) {
  const r = origin.getBoundingClientRect();
  for (let i = 0; i < 40; i++) {
    const p = document.createElement('i');
    p.className = 'confetti';
    p.style.left = `${r.left + r.width / 2}px`;
    p.style.top = `${r.top + r.height / 2}px`;
    p.style.background = i % 3 ? color : `hsl(${Math.random() * 360} 90% 65%)`;
    p.style.setProperty('--dx', `${(Math.random() - 0.5) * 520}px`);
    p.style.setProperty('--dy', `${(Math.random() - 0.8) * 420}px`);
    p.style.setProperty('--rot', `${Math.random() * 720}deg`);
    document.body.append(p);
    setTimeout(() => p.remove(), 1400);
  }
}

// ---------- Vues ----------

async function viewHome() {
  const { rows, value } = await collectionSummary();
  const byKey = Object.fromEntries(rows.map(r => [r.key, r]));
  const leftToday = GAMES.reduce((s, g) => s + packsLeft(g.id), 0);

  app.innerHTML = `
    <section class="hero">
      <h1>Ouvre des boosters.<br><em>Sans dépenser un centime.</em></h1>
      <p>${DAILY_PACKS} boosters gratuits par jeu et par jour. Collectionne, complète tes sets, et regarde ta collection prendre de la valeur au prix réel du marché.</p>
      <div class="hero-stats">
        <div><b>${leftToday}</b><span>boosters dispo aujourd'hui</span></div>
        <div><b>${fmt(value)}</b><span>valeur de ta collection</span></div>
        <div><b class="countdown">${untilMidnight()}</b><span>avant les nouveaux boosters</span></div>
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
          <span class="muted">${packsLeft(game.id)} / ${DAILY_PACKS} aujourd'hui</span>
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
        <div><h1>${esc(game.name)}</h1><p class="muted">${game.sets.length} sets · ${packsLeft(game.id)} / ${DAILY_PACKS} boosters restants aujourd'hui</p></div>
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
    quota.innerHTML = `${dots(game.id)}<span class="quota-text">${packsLeft(game.id)} / ${DAILY_PACKS} restants aujourd'hui</span>`;
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
        <div class="pack-stage">
          ${packHtml(game, set, chase.img, { big: true, img: packImg() })}
          <div class="limit">
            <h3>C'est tout pour aujourd'hui 🌙</h3>
            <p>Tes ${DAILY_PACKS} boosters ${esc(game.name)} du jour sont ouverts. Les prochains arrivent dans <b class="countdown">${untilMidnight()}</b>.</p>
            <p class="muted">Tu peux encore ouvrir les boosters des autres jeux, ou admirer ta collection.</p>
            <div class="row"><a class="btn" href="#/collection/${setKey}">Voir ma collection</a><a class="btn ghost" href="#/">Autres jeux</a></div>
          </div>
        </div>`;
      return;
    }
    const img = packImg();
    stage.innerHTML = `
      <div class="scene">
        <div class="pack3d-wrap">
          <div class="pack3d">
            <div class="p-front">
              ${img ? `<img class="p-size" src="${img}" alt="">` : `<div class="p-size p-fake">${packHtml(game, set, chase.img)}</div>`}
              <div class="p-body">${img ? `<img src="${img}" alt="Booster ${esc(set.name)}">` : packHtml(game, set, chase.img)}</div>
              <div class="p-top">${img ? `<img src="${img}" alt="">` : packHtml(game, set, chase.img)}</div>
              <div class="p-shine"${img ? ` style="-webkit-mask-image:url('${img}');mask-image:url('${img}')"` : ''}></div>
              <div class="p-cut"><i></i></div>
            </div>
            <div class="p-back">${img ? `<img src="${img}" alt="">` : ''}<span>✦</span></div>
          </div>
        </div>
        <div class="stack"></div>
      </div>
      <div class="open-actions">
        <button class="btn primary" data-open>✂ Ouvrir le booster</button>
        <p class="muted hint">Glisse le long du haut du booster pour le déchirer · ou appuie sur Espace</p>
      </div>`;

    const scene = stage.querySelector('.scene');
    const pack = stage.querySelector('.pack3d');
    const cut = stage.querySelector('.p-cut i');

    // Inclinaison qui suit la souris.
    scene.addEventListener('pointermove', e => {
      if (scene.classList.contains('opening')) return;
      const r = scene.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
      pack.style.setProperty('--ry', `${x * 30}deg`);
      pack.style.setProperty('--rx', `${-y * 20}deg`);
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
      drag = { x0: e.clientX, w: r.width };
      scene.setPointerCapture(e.pointerId);
      scene.classList.add('cutting');
    });
    scene.addEventListener('pointermove', e => {
      if (!drag) return;
      const p = Math.min(1, Math.abs(e.clientX - drag.x0) / (drag.w * 0.8));
      cut.style.width = `${p * 100}%`;
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

    const scene = stage.querySelector('.scene');
    const pack = stage.querySelector('.pack3d');
    stage.querySelector('.open-actions').innerHTML = '<p class="muted hint">…</p>';
    const cut = stage.querySelector('.p-cut i');
    scene.classList.add('opening');
    pack.style.setProperty('--ry', '0deg');
    pack.style.setProperty('--rx', '0deg');
    cut.style.transition = 'width .35s ease-out';
    cut.style.width = '100%';
    const loading = preload(cards.map(c => c.img).filter(Boolean));
    await sleep(380);
    scene.classList.add('torn');                // la languette s'arrache
    await Promise.all([loading, sleep(650)]);
    buildStack(cards, fresh);
    scene.classList.add('emerge');              // les cartes sortent, le booster tombe
    await sleep(1100);
    scene.classList.add('ready');
    busy = false;
  };

  // ---------- 3. Révélation carte par carte ----------
  const buildStack = (cards, fresh) => {
    const stack = stage.querySelector('.stack');
    stack.innerHTML = `
      ${cards.map((c, i) => `
        <div class="scard tier-${c.tier}" style="--i:${i};--n:${cards.length}" data-i="${i}">
          <div class="scard-inner">
            ${backFace(game)}
            <div class="face front">${cardArt(c, { lazy: false })}<div class="shine"></div>
              ${fresh.has(c.id) ? '<span class="new">NOUVEAU</span>' : ''}</div>
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

    const els = [...stack.querySelectorAll('.scard')];
    const label = stack.querySelector('.scard-label');
    const tray = stage.querySelector('.tray');
    const counter = stage.querySelector('.counter');
    let current = -1;   // carte affichée face visible
    let flipping = false;

    const toTray = i => {
      const el = els[i];
      el.classList.add('gone');
      const c = cards[i];
      tray.insertAdjacentHTML('beforeend',
        `<button class="tray-card tier-${c.tier}" data-i="${i}" title="${esc(c.name)} · ${c.price == null ? esc(c.rarity) : fmt(c.price)}">${cardArt(c)}</button>`);
    };

    const next = async () => {
      if (flipping) return;
      if (current >= 0) toTray(current);
      if (current === cards.length - 1) return finish();
      flipping = true;
      current++;
      const el = els[current], c = cards[current];
      label.hidden = true;
      el.classList.add('top');
      // Suspense : les grosses cartes s'illuminent avant d'être retournées.
      if (c.tier >= 3) {
        el.classList.add('charging');
        await sleep(c.tier >= 5 ? 1300 : c.tier >= 4 ? 950 : 600);
      }
      el.classList.add('flipped');
      if (c.tier >= 4) setTimeout(() => confetti(el, game.color), 280);
      if (c.tier >= 5) setTimeout(() => stage.closest('.open').classList.add('quake'), 200);
      setTimeout(() => stage.closest('.open')?.classList.remove('quake'), 900);
      await sleep(420);
      label.innerHTML = `<span>${esc(RARITY_LABEL(c.rarity))}</span><b>${priceTag(c.price)}</b>${fresh.has(c.id) ? '<em>Nouvelle carte</em>' : ''}`;
      label.className = `scard-label tier-${c.tier}`;
      label.hidden = false;
      counter.textContent = `${current + 1} / ${cards.length}`;
      flipping = false;
    };

    stack.addEventListener('click', next);
    stage.querySelector('[data-next]').addEventListener('click', next);
    stage.querySelector('[data-all]').addEventListener('click', () => finish());
    tray.addEventListener('click', e => {
      const b = e.target.closest('[data-i]'); if (!b) return;
      const c = cards[+b.dataset.i];
      openModal(c, game, owned(setKey)[c.id]);
    });
    stage.revealNext = next;

    // ---------- 4. Récapitulatif ----------
    const finish = () => {
      stage.revealNext = null;
      const total = cards.reduce((s, c) => s + (c.price ?? 0), 0);
      const best = bestOf(cards, set);
      const left = packsLeft(game.id);
      stage.innerHTML = `
        <div class="reveal">
          <div class="cards">
            ${cards.map((c, i) => `
              <div class="flip open tier-${c.tier}" style="--i:${i}" data-i="${i}">
                <div class="flip-inner">
                  ${backFace(game)}
                  <div class="face front tilt">${cardArt(c, { lazy: false })}<div class="shine"></div>
                    ${fresh.has(c.id) ? '<span class="new">NOUVEAU</span>' : ''}</div>
                </div>
                <div class="flip-label"><span>${esc(RARITY_LABEL(c.rarity))}</span><b>${priceTag(c.price)}</b></div>
              </div>`).join('')}
          </div>
          <div class="reveal-bar">
            <div class="summary">
              ${best.price == null ? '' : `<div><span class="muted">Valeur du booster</span><b>${fmt(total)}</b></div>`}
              <div><span class="muted">Meilleure carte</span><b>${esc(best.name)} · ${best.price == null ? esc(RARITY_LABEL(best.rarity)) : fmt(best.price)}</b></div>
              <div><span class="muted">Nouvelles cartes</span><b>${fresh.size}</b></div>
            </div>
            <div class="row">
              ${left > 0 ? `<button class="btn primary" data-again>Booster suivant (${left} restant${left > 1 ? 's' : ''})</button>` : `<span class="muted">Plus de boosters ${esc(game.name)} aujourd'hui.</span>`}
              <a class="btn ghost" href="#/collection/${setKey}">Voir la collection</a>
            </div>
          </div>
        </div>`;
      stage.querySelectorAll('.flip').forEach(el => {
        bindTilt(el.querySelector('.tilt'));
        el.addEventListener('click', () => openModal(cards[+el.dataset.i], game, owned(setKey)[cards[+el.dataset.i].id]));
      });
      stage.querySelector('[data-again]')?.addEventListener('click', showPack);
      refreshTotal();
    };
  };

  stage.tear = tear;
  showPack();
}

async function viewCollection() {
  const { rows, value, count } = await collectionSummary();
  app.innerHTML = `
    <section class="page">
      <h1>Ma collection</h1>
      <p class="muted">${count} cartes · valeur totale <b class="accent">${fmt(value)}</b></p>
      ${GAMES.map(game => {
        const mine = rows.filter(r => r.game === game && r.unique > 0).sort((a, b) => b.value - a.value);
        if (!mine.length) return '';
        return `
          <h2 style="color:${game.color}">${esc(game.name)}</h2>
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
          <button data-v="all" class="on">Toutes</button><button data-v="owned">Possédées</button><button data-v="missing">Manquantes</button>
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
    grid.innerHTML = cards.map(c => cardThumb(c, col[c.id] ?? 0, { missing: !col[c.id] })).join('') ||
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
    openModal(data.byId.get(b.dataset.card), game, col[b.dataset.card]);
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
          return card ? `<div style="--c:${game.color}">${cardThumb(card, 0)}</div>` : '';
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
    openModal(card, game, owned(pull.setKey)[pull.id]);
  });
  app.querySelector('[data-reset]').addEventListener('click', () => {
    if (confirm('Effacer toute ta collection et tes statistiques ? (Les boosters déjà ouverts aujourd\'hui restent comptés.)')) {
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
setInterval(() => document.querySelectorAll('.countdown').forEach(el => { el.textContent = untilMidnight(); }), 1000);

route();
refreshTotal();
accountBadge();
// Sauvegarde du compte récupérée : on réaffiche la page avec la collection à jour.
window.addEventListener('allstar:synced', () => { refreshTotal(); if (!app.querySelector('.stage, form')) route(); });
initCloud();
