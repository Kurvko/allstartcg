// Petites fonctions d'affichage partagées par les pages.
const euro = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' });
export const fmt = v => (v == null ? '—' : euro.format(v));
export const esc = s => String(s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
export const app = document.getElementById('app');

// Version du site (remplie à la mise en ligne) : force le navigateur à recharger les données après une mise à jour.
const BUILD = document.querySelector('meta[name="build"]')?.content ?? '';
export const versioned = url => (BUILD ? `${url}?v=${BUILD}` : url);
