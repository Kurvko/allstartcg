// Catalogue des jeux et des sets. Partagé entre le site et scripts/fetch-data.mjs.
// Pour ajouter un set : ajoute une entrée ici, puis relance `npm run fetch`.
//
// slots : composition d'un booster. Chaque slot est une liste de [rareté, poids].
// tiers : rareté -> niveau 0..5 (sert au tri et aux effets visuels).

import { POKEMON_SETS } from './pokemon-sets.js';

export const DAILY_PACKS = 10; // boosters par jeu et par jour
export const USD_TO_EUR = 0.92;
// packPrice : prix indicatif (EUR) d'un booster scellé, pour le compteur « argent économisé ».
// group : intitulé de la série, pour regrouper les sets sur la page du jeu.
// variants : [regex sur le nom, rareté] — pour les versions alternatives que la source range dans la rareté de base.

const C = (n, rarity) => Array.from({ length: n }, () => [[rarity, 1]]);

// ---------- Pokémon : sets générés (npm run discover), composition selon l'époque ----------

// rareté -> [niveau, poids dans l'emplacement « rare »]
const PK_RARITIES = {
  None: [0, 0], Common: [0, 0], Uncommon: [1, 0],
  Rare: [2, 60], 'Rare Holo': [3, 22], 'Holo Rare': [3, 22],
  'Holo Rare V': [3, 12], 'Double rare': [3, 14], 'ACE SPEC Rare': [3, 5],
  'Rare Holo LV.X': [4, 6], 'Rare PRIME': [4, 6], LEGEND: [4, 3],
  'Holo Rare VMAX': [4, 5], 'Holo Rare VSTAR': [4, 5], 'Ultra Rare': [4, 5], 'Full Art Trainer': [4, 3],
  'Amazing Rare': [4, 4], 'Radiant Rare': [4, 4], 'Shiny rare': [4, 10], 'Shiny rare V': [4, 4],
  'Illustration rare': [4, 8], 'Classic Collection': [4, 8],
  'Shiny rare VMAX': [5, 1.5], 'Shiny Ultra Rare': [5, 1.5], 'Secret Rare': [5, 1.5],
  'Special illustration rare': [5, 1.8], 'Hyper rare': [5, 0.8], 'Black White Rare': [5, 1], 'Mega Hyper Rare': [5, 0.3],
  // Libellés renvoyés par TCGdex en français
  Commune: [0, 0], 'Peu Commune': [1, 0], 'Rare Prime': [4, 6], 'LÉGENDE': [4, 3],
  'Magnifique rare': [5, 1.5], Magnifique: [4, 4], 'Radieux Rare': [4, 4], 'HIGH-TECH rare': [3, 5],
  'Illustration spéciale rare': [5, 1.8], 'Chromatique ultra rare': [5, 1.5], 'Rare Noir Blanc': [5, 1],
  'Méga Hyper Rare': [5, 0.3], 'Mega Attack Rare': [4, 3], 'Pikachu Rare': [4, 6], 'Futuristic Rare': [5, 0.8], 'RGB Rare': [5, 0.8],
};
const PK_TIERS = Object.fromEntries(Object.entries(PK_RARITIES).map(([r, [tier]]) => [r, tier]));
const PK_HIT = Object.entries(PK_RARITIES).filter(([, [, w]]) => w > 0).map(([r, [, w]]) => [r, w]);
const PK_REVERSE = [['Commune', 50], ['Peu Commune', 35], ['Common', 50], ['Uncommon', 35], ['Rare', 12], ['Rare Holo', 3], ['Holo Rare', 3]];
// Une commune/peu commune manquante (sets spéciaux) bascule sur la rareté suivante.
const PK_C = [['Commune', 100], ['Common', 100], ['Peu Commune', 1], ['Rare', 0.1]];
const PK_U = [['Peu Commune', 100], ['Uncommon', 100], ['Commune', 1], ['Rare', 0.1]];
const pkSlots = (c, u, rev) => [
  ...Array.from({ length: c }, () => PK_C), ...Array.from({ length: u }, () => PK_U),
  ...Array.from({ length: rev }, () => PK_REVERSE), PK_HIT,
];
// époque -> composition et prix indicatif du booster scellé
const PK_ERAS = {
  base: { slots: pkSlots(7, 3, 0), price: 120 }, neo: { slots: pkSlots(7, 3, 0), price: 150 },
  ecard: { slots: pkSlots(5, 2, 1), price: 150 }, ex: { slots: pkSlots(5, 3, 1), price: 60 },
  dp: { slots: pkSlots(5, 3, 1), price: 40 }, pl: { slots: pkSlots(5, 3, 1), price: 40 },
  hgss: { slots: pkSlots(5, 3, 1), price: 30 }, col: { slots: pkSlots(5, 3, 1), price: 30 },
  bw: { slots: pkSlots(6, 3, 1), price: 10 }, xy: { slots: pkSlots(6, 3, 1), price: 7 },
  sm: { slots: pkSlots(6, 3, 1), price: 6 }, swsh: { slots: pkSlots(6, 3, 1), price: 5 },
  sv: { slots: pkSlots(4, 3, 2), price: 6 }, me: { slots: pkSlots(4, 3, 2), price: 6 },
};
const PK_PRICE_OVERRIDE = { base1: 300 };

function pokemonSet(s) {
  const era = PK_ERAS[s.serie] ?? PK_ERAS.sv;
  return {
    id: s.id, name: s.name, year: +s.date.slice(0, 4), group: s.serieName, source: 'tcgdex', lang: 'fr', serie: s.serie,
    packPrice: PK_PRICE_OVERRIDE[s.id] ?? era.price, tiers: PK_TIERS, slots: era.slots,
  };
}

// Une rareté absente d'un set est ignorée et les poids restants sont renormalisés.
const YGO_TIERS = { Common: 0, 'Short Print': 0, 'Super Short Print': 1, Rare: 2, 'Super Rare': 3, 'Ultra Rare': 4, 'Secret Rare': 5 };
const YGO_SLOTS = [
  ...Array.from({ length: 8 }, () => [['Common', 85], ['Short Print', 12], ['Super Short Print', 3]]),
  [['Rare', 70], ['Super Rare', 17], ['Ultra Rare', 9], ['Secret Rare', 4]],
];

// One Piece (TCGCSV) : les versions alternatives sont dans le nom de la carte.
const OP_VARIANTS = [
  [/\((Dash Pack|Double Pack Set[^)]*|Pre-Release|Release Event)\)/i, 'Promo'], // hors booster
  [/\((Manga|Gold|Super Alternate Art|Super Leader Alternate Art|Special Foil)\)/i, 'Manga'],
  [/\((SP|Wanted Poster)\)/i, 'SP'],
  [/\((Parallel|Alternate Art|Full Art|Pandaman Art)\)/i, 'AA'],
  [/\((Jolly Roger Foil|Textured Foil)\)/i, 'Foil'],
];
const OP_TIERS = { C: 0, UC: 1, Foil: 2, R: 2, L: 2, SR: 3, AA: 4, SEC: 5, SP: 5, TR: 5, Manga: 5 };
const OP_SLOTS = [
  ...Array.from({ length: 7 }, () => [['C', 100], ['UC', 1]]),
  ...Array.from({ length: 3 }, () => [['UC', 100], ['C', 1]]), // les Extra Boosters n'ont pas de peu communes
  [['C', 45], ['L', 25], ['R', 15], ['Foil', 30]],
  [['R', 70], ['SR', 18], ['AA', 7], ['SEC', 2.5], ['SP', 1.5], ['TR', 0.6], ['Manga', 0.4]],
];
// Premium Boosters (PRB) : rééditions, plusieurs foils par booster, cartes Gold/Manga en chase.
const PRB_SLOTS = [
  ...Array.from({ length: 6 }, () => [['C', 20], ['UC', 40], ['R', 40]]),
  ...Array.from({ length: 3 }, () => [['Foil', 75], ['SR', 25]]),
  [['SR', 60], ['AA', 30], ['SEC', 5], ['SP', 2.5], ['Manga', 2.5]],
];

const DBFW_VARIANTS = [[/\(Super Alternate Art\)/i, 'Super Alt Art'], [/\(Alternate Art\)/i, 'Alt Art']];
const DBFW_TIERS ={ Common: 0, Uncommon: 1, Leader: 2, Rare: 2, 'Super Rare': 3, 'Alt Art': 4, 'Secret Rare': 5, 'Super Alt Art': 5 };
const DBFW_SLOTS = [
  ...C(7, 'Common'), ...C(3, 'Uncommon'),
  [['Common', 55], ['Leader', 45]],
  [['Rare', 72], ['Super Rare', 18], ['Alt Art', 7], ['Secret Rare', 2.5], ['Super Alt Art', 0.5]],
];

// Riftbound : 7 communes, 3 peu communes, 2 rares ou épiques, 1 emplacement foil
// (Showcase ≈ 1 booster sur 12, Signature ≈ 1 sur 200).
const RIFT_VARIANTS = [[/\(Signature\)/i, 'Signature']];
const RIFT_TIERS ={ Common: 0, Uncommon: 1, Rare: 2, Epic: 3, Showcase: 4, Signature: 5 };
const RIFT_SLOTS = [
  ...C(7, 'Common'), ...C(3, 'Uncommon'),
  [['Rare', 80], ['Epic', 20]],
  [['Rare', 80], ['Epic', 20]],
  [['Common', 45], ['Uncommon', 25], ['Rare', 15], ['Epic', 7], ['Showcase', 7.5], ['Signature', 0.5]],
];

export const GAMES = [
  {
    id: 'pokemon',
    name: 'Pokémon',
    color: '#ffcb05',
    accent: '#3d7dca',
    sets: POKEMON_SETS.map(pokemonSet),
  },
  {
    id: 'magic',
    name: 'Magic: The Gathering',
    color: '#e87b2a',
    accent: '#6b3d1d',
    sets: [
      {
        id: 'lea', packPrice: 20000, name: 'Alpha', year: 1993, source: 'scryfall',
        tiers: { common: 0, uncommon: 1, rare: 4 },
        slots: [...C(11, 'common'), ...C(3, 'uncommon'), [['rare', 1]]],
      },
      {
        id: 'blb', packPrice: 6, name: 'Bloomburrow', year: 2024, source: 'scryfall',
        tiers: { common: 0, uncommon: 1, rare: 3, mythic: 5 },
        slots: [
          ...C(7, 'common'), ...C(3, 'uncommon'),
          [['common', 40], ['uncommon', 40], ['rare', 15], ['mythic', 5]],
          [['rare', 6], ['mythic', 1]],
        ],
      },
    ],
  },
  {
    id: 'yugioh',
    name: 'Yu-Gi-Oh!',
    color: '#b28cff',
    accent: '#3b2470',
    sets: [
      {
        id: 'LOB', packPrice: 150, name: 'Legend of Blue Eyes White Dragon', year: 2002, source: 'ygoprodeck',
        tiers: YGO_TIERS,
        slots: YGO_SLOTS,
      },
      {
        id: 'MRD', packPrice: 120, name: 'Metal Raiders', year: 2002, source: 'ygoprodeck',
        tiers: YGO_TIERS,
        slots: YGO_SLOTS,
      },
    ],
  },
  {
    id: 'lorcana',
    name: 'Disney Lorcana',
    color: '#d9b45a',
    accent: '#1d2a5a',
    sets: [
      {
        id: '1', packPrice: 12, name: 'The First Chapter', year: 2023, source: 'lorcast',
        tiers: { Common: 0, Uncommon: 1, Rare: 2, Super_rare: 3, Legendary: 4, Enchanted: 5 },
        slots: [
          ...C(6, 'Common'), ...C(3, 'Uncommon'),
          [['Rare', 68], ['Super_rare', 24], ['Legendary', 8]],
          [['Rare', 68], ['Super_rare', 24], ['Legendary', 8]],
          [['Common', 50], ['Uncommon', 30], ['Rare', 12], ['Super_rare', 5], ['Legendary', 2], ['Enchanted', 1]],
        ],
      },
    ],
  },
  {
    id: 'onepiece',
    name: 'One Piece',
    color: '#e23b3b',
    accent: '#1b3a6b',
    sets: [
      {
        id: 'OP-01', packPrice: 12, name: 'Romance Dawn (VO)', year: 2022, group: 'Version anglaise', source: 'optcg',
        tiers: { C: 0, UC: 1, R: 2, L: 2, SR: 3, AA: 4, SEC: 5 },
        slots: [
          ...C(7, 'C'), ...C(3, 'UC'),
          [['C', 70], ['L', 30]],
          [['R', 74], ['SR', 17], ['AA', 6], ['SEC', 3]],
        ],
      },
      // Sets sortis en français (VF lancée le 7 février 2025 avec OP-09).
      ...[
        ['OP09', 23589, 'OP-09 – Les Nouveaux Empereurs', 2025, 6],
        ['PRB01', 23496, 'PRB-01 – The Best', 2025, 15],
        ['OP10', 23766, 'OP-10 – Sang Royal', 2025, 6],
        ['EB02', 23834, 'EB-02 – Anime 25th Collection', 2025, 8],
        ['OP11', 24241, 'OP-11 – Des Poings Vifs comme l\'Éclair', 2025, 6],
        ['PRB02', 24305, 'PRB-02 – The Best Vol. 2', 2025, 15],
        ['OP12', 24302, 'OP-12 – L\'Héritage du Maître', 2025, 6],
        ['OP13', 24303, 'OP-13 – Successeurs', 2025, 6],
        ['OP14', 24537, 'OP-14 – Les Sept de la Mer d\'Azur', 2026, 6],
        ['EB03', 24545, 'EB-03 – Heroines Edition', 2026, 8],
        ['OP15', 24637, 'OP-15 – Aventure sur l\'Île de Dieu', 2026, 6],
        ['OP16', 24664, 'OP-16 – L\'Heure de la Bataille Décisive', 2026, 6],
        ['OP17', 24736, 'OP-17 – Les Guerriers les plus Puissants au Monde', 2026, 6],
      ].map(([id, group, name, year, packPrice]) => ({
        id, name, year, packPrice, group: 'Version française', source: 'tcgcsv', category: 68, tcgGroup: group,
        tiers: OP_TIERS, slots: id.startsWith('PRB') ? PRB_SLOTS : OP_SLOTS, variants: OP_VARIANTS,
      })),
    ],
  },
  {
    id: 'dragonball',
    name: 'Dragon Ball Super',
    color: '#ff8a1e',
    accent: '#1c3f8f',
    sets: [
      {
        id: 'FB01', packPrice: 8, name: 'Fusion World – Awakened Pulse', year: 2024, source: 'tcgcsv', category: 80, tcgGroup: 23401, variants: DBFW_VARIANTS,
        tiers: DBFW_TIERS,
        slots: DBFW_SLOTS,
      },
      {
        id: 'FB10', packPrice: 9, name: 'Fusion World – Cross Force', year: 2026, source: 'tcgcsv', category: 80, tcgGroup: 24604, variants: DBFW_VARIANTS,
        tiers: DBFW_TIERS,
        slots: DBFW_SLOTS,
      },
      {
        id: 'B01', packPrice: 15, name: 'Masters – Galactic Battle', year: 2017, source: 'tcgcsv', category: 27, tcgGroup: 1962,
        tiers: { Common: 0, Uncommon: 1, Rare: 2, 'Super Rare': 3, 'Special Rare': 5 },
        slots: [...C(8, 'Common'), ...C(3, 'Uncommon'), [['Rare', 70], ['Super Rare', 25], ['Special Rare', 5]]],
      },
    ],
  },
  {
    id: 'riftbound',
    name: 'Riftbound (League of Legends)',
    short: 'Riftbound', // nom affiché sur le booster
    color: '#3fd0e0',
    accent: '#2a1650',
    sets: [
      { id: 'OGN', packPrice: 12, name: 'Origins', year: 2025, source: 'tcgcsv', category: 89, tcgGroup: 24344, tiers: RIFT_TIERS, slots: RIFT_SLOTS, variants: RIFT_VARIANTS },
      { id: 'SFD', packPrice: 9, name: 'Spiritforged', year: 2026, source: 'tcgcsv', category: 89, tcgGroup: 24519, tiers: RIFT_TIERS, slots: RIFT_SLOTS, variants: RIFT_VARIANTS },
      { id: 'VEN', packPrice: 7, name: 'Vendetta', year: 2026, source: 'tcgcsv', category: 89, tcgGroup: 24698, tiers: RIFT_TIERS, slots: RIFT_SLOTS, variants: RIFT_VARIANTS },
    ],
  },
];

export function findSet(setKey) {
  for (const game of GAMES) {
    for (const set of game.sets) {
      if (setKey === `${game.id}/${set.id}`) return { game, set };
    }
  }
  return null;
}

export const allSets = () => GAMES.flatMap(game => game.sets.map(set => ({ game, set, key: `${game.id}/${set.id}` })));
