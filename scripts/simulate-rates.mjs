// Ouvre N boosters virtuels par set et affiche la fréquence observée de chaque rareté (« 1 booster sur X »).
// Sert à vérifier que les taux du catalogue donnent bien les taux réels.
// Usage : node scripts/simulate-rates.mjs pokemon/sv08 onepiece/OP09 ...  [--packs 20000]
import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findSet } from '../public/js/catalog.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const packsArg = args.indexOf('--packs');
const N = packsArg >= 0 ? +args[packsArg + 1] : 20000;
const keys = args.filter((a, i) => !a.startsWith('--') && i !== packsArg + 1);

function pickWeighted(entries) {
  const total = entries.reduce((s, [, w]) => s + w, 0);
  let roll = Math.random() * total;
  for (const [value, w] of entries) if ((roll -= w) < 0) return value;
  return entries[entries.length - 1][0];
}

for (const key of keys) {
  const { set } = findSet(key);
  const { cards } = JSON.parse(await readFile(join(ROOT, 'public', 'data', `${key}.json`), 'utf8'));
  const present = new Set(cards.map(c => c.rarity));
  const packsWith = {};
  for (let n = 0; n < N; n++) {
    const seen = new Set();
    for (const slot of set.slots) {
      const available = slot.filter(([r]) => present.has(r));
      if (available.length) seen.add(pickWeighted(available));
    }
    for (const r of seen) packsWith[r] = (packsWith[r] ?? 0) + 1;
  }
  console.log(`\n${key} — ${set.name} (${set.slots.length} cartes, ${N} boosters)`);
  for (const [r, n] of Object.entries(packsWith).sort((a, b) => a[1] - b[1])) {
    if ((set.tiers[r] ?? 0) < 2) continue;
    console.log(`  ${r.padEnd(28)} ${(100 * n / N).toFixed(2).padStart(6)} %   1 booster sur ${(N / n).toFixed(1)}`);
  }
}
