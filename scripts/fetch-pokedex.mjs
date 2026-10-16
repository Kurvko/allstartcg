// Télécharge la liste des Pokémon (n°, nom français, génération) depuis PokéAPI → public/data/pokedex.json.
// Usage : npm run pokedex (à relancer quand une nouvelle génération sort)
import { writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const query = `{ s: pokemon_v2_pokemonspecies(order_by: {id: asc}) {
  id generation_id
  fr: pokemon_v2_pokemonspeciesnames(where: {language_id: {_eq: 5}}) { name }
  en: pokemon_v2_pokemonspeciesnames(where: {language_id: {_eq: 9}}) { name }
} }`;

const res = await fetch('https://beta.pokeapi.co/graphql/v1beta', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'User-Agent': 'AllStarTCG/0.1 (projet perso)' },
  body: JSON.stringify({ query }),
});
if (!res.ok) throw new Error(`PokéAPI : HTTP ${res.status}`);
const { data } = await res.json();
// [n°, nom FR, génération]
const dex = data.s.map(p => [p.id, p.fr[0]?.name ?? p.en[0]?.name ?? `#${p.id}`, p.generation_id]);
await writeFile(join(ROOT, 'public', 'data', 'pokedex.json'), JSON.stringify(dex));
console.log(`pokedex.json : ${dex.length} Pokémon (génération ${Math.max(...dex.map(d => d[2]))} max)`);
