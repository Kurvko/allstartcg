// Télécharge le logo officiel de chaque set Pokémon (TCGdex, en français sinon en anglais),
// retire les marges transparentes et l'enregistre dans public/logos/pokemon/<set>.webp.
// Usage : npm run logos            (seulement les sets sans logo)
//         npm run logos -- --all   (tout retélécharger)
import { access, mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { GAMES } from '../public/js/catalog.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'public', 'logos', 'pokemon');
const all = process.argv.includes('--all');
const exists = f => access(f).then(() => true, () => false);
await mkdir(OUT, { recursive: true });

const missing = [];
for (const set of GAMES.find(g => g.id === 'pokemon').sets) {
  const file = join(OUT, `${set.id}.webp`);
  if (!all && await exists(file)) continue;
  let buffer = null;
  for (const lang of ['fr', 'en']) {
    const res = await fetch(`https://assets.tcgdex.net/${lang}/${set.serie}/${set.id}/logo.webp`);
    if (res.ok) { buffer = Buffer.from(await res.arrayBuffer()); break; }
  }
  if (!buffer) { missing.push(set.id); continue; }
  const webp = await sharp(buffer).trim({ threshold: 1 })
    .resize({ width: 600, height: 260, fit: 'inside', withoutEnlargement: true })
    .extend({ top: 6, bottom: 6, left: 6, right: 6, background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .webp({ quality: 85 }).toBuffer();
  await writeFile(file, webp);
  console.log(`${set.id.padEnd(10)} ${set.name}`);
}
if (missing.length) console.log(`Sans logo (le visuel du booster sera utilisé) : ${missing.join(', ')}`);
