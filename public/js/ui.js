// Petites fonctions d'affichage partagées par les pages.
const euro = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' });
export const fmt = v => (v == null ? '—' : euro.format(v));
export const esc = s => String(s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
export const app = document.getElementById('app');

// Version du site (remplie à la mise en ligne) : force le navigateur à recharger les données après une mise à jour.
const BUILD = document.querySelector('meta[name="build"]')?.content ?? '';
export const versioned = url => (BUILD ? `${url}?v=${BUILD}` : url);

// ---------- Visuel d'une carte ----------
// Cartes TCG : l'image officielle. Cartes sport : carte dessinée (photo du joueur, club, cadre selon la rareté).
const SPORT_FRAME = { Base: 'base', Rookie: 'young', Espoir: 'young', Argent: 'silver', 'Bleu /199': 'blue', 'Or /10': 'gold', 'Noir 1/1': 'black' };
const SERIAL = { 'Bleu /199': '/199', 'Or /10': '/10', 'Noir 1/1': '1/1' };

export function cardArt(card, { hi = false, lazy = true } = {}) {
  const src = (hi ? card.imgHi : card.img) || '';
  const load = lazy ? 'loading="lazy"' : '';
  if (!card.sport) return `<img src="${src}" alt="${esc(card.name)}" ${load}>`;
  const s = card.sport;
  const frame = SPORT_FRAME[card.rarity] ?? 'base';
  return `
    <span class="sc sc-${frame}" style="--t1:${s.c1};--t2:${s.c2}">
      <span class="sc-bg"></span>
      ${s.logo ? `<img class="sc-wm" src="${s.logo}" alt="" ${load}>` : ''}
      ${src ? `<img class="sc-photo" src="${src}" alt="${esc(card.name)}" ${load}>` : '<span class="sc-none"></span>'}
      <span class="sc-top">${card.num ? `<b>${esc(card.num)}</b>` : '<b></b>'}${s.logo ? `<img src="${s.logo}" alt="${esc(s.team)}" ${load}>` : ''}</span>
      ${frame === 'young' ? `<span class="sc-rc">${card.rarity === 'Rookie' ? 'RC' : 'ESPOIR'}</span>` : ''}
      ${SERIAL[card.rarity] ? `<span class="sc-serial">${SERIAL[card.rarity]}</span>` : ''}
      <span class="sc-foot"><b>${esc(card.name)}</b><small>${esc(s.team)}${s.pos ? ` · ${esc(s.pos)}` : ''}</small></span>
    </span>`;
}
