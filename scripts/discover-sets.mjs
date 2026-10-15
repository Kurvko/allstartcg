// Génère public/js/pokemon-sets.js : la liste des sets Pokémon sortis en français (TCGdex, langue fr).
// Usage : npm run discover   (à relancer quand une nouvelle extension sort)
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const OUT = fileURLToPath(new URL('../public/js/pokemon-sets.js', import.meta.url));
const SKIP_SERIES = new Set(['tcgp', 'mc', 'tk', 'misc', 'pop']); // Pocket (mobile), McDo, kits dresseur, divers, POP
// Promos, énergies, sous-sets insérés dans les boosters d'un autre set (Galerie de Dresseurs, Coffre Étincelant…)
// xy0 (Bienvenue à Kalos) : cartes sans rareté, vendu en deck et non en booster.
const SKIP_ID = /p$|^(wp|np|sve|mee|xya|xy0|rc|sma)$|tg$|gg$|sv$|cc$|-c$/;
const today = new Date().toISOString().slice(0, 10);

const get = async url => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  return res.json();
};

const brief = await get('https://api.tcgdex.net/v2/fr/sets');
const sets = [];
for (let i = 0; i < brief.length; i += 10) {
  sets.push(...await Promise.all(brief.slice(i, i + 10).map(s => get(`https://api.tcgdex.net/v2/fr/sets/${s.id}`))));
}

const kept = sets
  .filter(s => !SKIP_SERIES.has(s.serie?.id) && !SKIP_ID.test(s.id) && !/promo/i.test(s.name))
  .filter(s => s.releaseDate && s.releaseDate <= today && s.cardCount.total >= 18)
  .sort((a, b) => a.releaseDate.localeCompare(b.releaseDate))
  .map(s => ({ id: s.id, name: s.name, serie: s.serie.id, serieName: s.serie.name, date: s.releaseDate }));

await writeFile(OUT, `// Généré par scripts/discover-sets.mjs — ne pas modifier à la main.
export const POKEMON_SETS = ${JSON.stringify(kept, null, 1)};
`);
console.log(`${kept.length} sets Pokémon FR écrits dans public/js/pokemon-sets.js`);
