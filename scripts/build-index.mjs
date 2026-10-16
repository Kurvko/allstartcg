// Construit, à partir des sets déjà téléchargés, un index léger de toutes les cartes de chaque jeu
// (public/data/cards/<jeu>.json) utilisé par les pages Cartes et Pokédex. Lancé après npm run fetch.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GAMES } from '../public/js/catalog.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
await mkdir(join(ROOT, 'public', 'data', 'cards'), { recursive: true });

for (const game of GAMES) {
  const rows = [];
  for (const set of game.sets) {
    let cards;
    try { ({ cards } = JSON.parse(await readFile(join(ROOT, 'public', 'data', game.id, `${set.id}.json`), 'utf8'))); } catch { continue; }
    for (const c of cards) {
      // s = set, i = id, n = nom, u = numéro, r = rareté, m = image, p = prix, d = n° Pokédex, k = type de carte
      const row = { s: set.id, i: c.id, n: c.name, u: c.num, r: c.rarity, m: c.img, p: c.price ?? (c.sport ? null : 0), k: c.play?.kind };
      if (c.play?.dex?.length) row.d = c.play.dex;
      if (c.sport) row.x = c.sport;
      rows.push(row);
    }
  }
  await writeFile(join(ROOT, 'public', 'data', 'cards', `${game.id}.json`), JSON.stringify(rows));
  console.log(`cards/${game.id}.json : ${rows.length} cartes`);
}
