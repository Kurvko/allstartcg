// Télécharge les images libres de droits (CC0) utilisées par le combat :
// - décors de combat peints par Nidhoggn (https://opengameart.org/content/backgrounds-3) → public/battle/bg-<n>.webp
// - personnages « Toon Characters 1 » de Kenney (https://opengameart.org/content/toon-characters-1) → public/trainers/<perso>-<pose>.webp
// Usage : npm run battle-assets            (seulement ce qui manque)
//         npm run battle-assets -- --all   (tout retélécharger)
import { access, mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateRawSync } from 'node:zlib';
import sharp from 'sharp';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BG_OUT = join(ROOT, 'public', 'battle');
const TR_OUT = join(ROOT, 'public', 'trainers');
const all = process.argv.includes('--all');
const exists = f => access(f).then(() => true, () => false);

const BG_URL = n => `https://opengameart.org/sites/default/files/battleback${n}.png`;
const KENNEY_ZIP = 'https://opengameart.org/sites/default/files/kenney_toonCharacters1.zip';
const CHARACTERS = {
  malePerson: 'Male person', femalePerson: 'Female person', maleAdventurer: 'Male adventurer',
  femaleAdventurer: 'Female adventurer', robot: 'Robot', zombie: 'Zombie',
};
const POSES = ['idle', 'talk', 'cheer1', 'hurt', 'down', 'back', 'interact', 'think'];

async function download(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

/** Lecture minimale d'une archive zip : { chemin → contenu } (fichiers stockés ou compressés « deflate »). */
function unzip(buf) {
  const files = new Map();
  let end = buf.length - 22;
  while (end >= 0 && buf.readUInt32LE(end) !== 0x06054b50) end--;
  if (end < 0) throw new Error('Archive zip illisible');
  let p = buf.readUInt32LE(end + 16);
  const count = buf.readUInt16LE(end + 10);
  for (let i = 0; i < count; i++) {
    const method = buf.readUInt16LE(p + 10), size = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28), extraLen = buf.readUInt16LE(p + 30), commentLen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen);
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const raw = buf.subarray(start, start + size);
    if (!name.endsWith('/')) files.set(name, method === 8 ? inflateRawSync(raw) : raw);
    p += 46 + nameLen + extraLen + commentLen;
  }
  return files;
}

await mkdir(BG_OUT, { recursive: true });
await mkdir(TR_OUT, { recursive: true });

// Décors
for (let n = 1; n <= 10; n++) {
  const file = join(BG_OUT, `bg-${n}.webp`);
  if (!all && await exists(file)) continue;
  const png = await download(BG_URL(n));
  await writeFile(file, await sharp(png).flatten({ background: '#000' }).webp({ quality: 82 }).toBuffer());
  console.log(`décor ${n}`);
}

// Personnages
const needed = [];
for (const id of Object.keys(CHARACTERS)) for (const pose of POSES) {
  const file = join(TR_OUT, `${id}-${pose}.webp`);
  if (all || !await exists(file)) needed.push({ id, pose, file });
}
if (needed.length) {
  const zip = unzip(await download(KENNEY_ZIP));
  for (const { id, pose, file } of needed) {
    const entry = [...zip.keys()].find(k => k.endsWith(`${CHARACTERS[id]}/PNG/Poses HD/character_${id}_${pose}.png`));
    if (!entry) { console.log(`introuvable : ${id} ${pose}`); continue; }
    await writeFile(file, await sharp(zip.get(entry)).webp({ quality: 92, alphaQuality: 100 }).toBuffer());
  }
  console.log(`${needed.length} poses de personnages`);
}
console.log('Images du combat à jour (licence CC0 : Nidhoggn pour les décors, Kenney pour les personnages).');
