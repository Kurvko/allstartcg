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

// ---------- Taux de drop ----------
// Poids = pourcentage par booster pour l'emplacement concerné (sources : études de pulls TCGplayer,
// Elite Fourum, Card Shop Live ; chiffres officiels Riftbound et Wizards ; voir README).
// Une rareté absente d'un set est ignorée et les poids restants sont renormalisés.

// ---------- Pokémon : sets générés (npm run discover), composition selon l'époque ----------

// Niveau visuel (0..5) des raretés TCGdex, libellés anglais et français.
const PK_TIERS = {
  None: 0, Common: 0, Commune: 0, Uncommon: 1, 'Peu Commune': 1,
  Rare: 2, 'Rare Holo': 3, 'Holo Rare': 3, 'Holo Rare V': 3, 'Double rare': 3, 'HIGH-TECH rare': 3, 'ACE SPEC Rare': 3,
  'Rare Holo LV.X': 4, 'Rare Prime': 4, 'Rare PRIME': 4, 'LÉGENDE': 4, LEGEND: 4, 'Holo Rare VMAX': 4, 'Holo Rare VSTAR': 4,
  'Ultra Rare': 4, Magnifique: 4, 'Radieux Rare': 4, 'Shiny rare': 4, 'Illustration rare': 4, 'Mega Attack Rare': 4, 'Pikachu Rare': 4,
  'Magnifique rare': 5, 'Illustration spéciale rare': 5, 'Chromatique ultra rare': 5, 'Hyper rare': 5, 'Rare Noir Blanc': 5,
  'Méga Hyper Rare': 5, 'Futuristic Rare': 5, 'RGB Rare': 5,
};
const PK_C = [['Commune', 100], ['Common', 100], ['Peu Commune', 1], ['Rare', 0.1]];
const PK_U = [['Peu Commune', 100], ['Uncommon', 100], ['Commune', 1], ['Rare', 0.1]];
const PK_REVERSE = [['Commune', 50], ['Peu Commune', 35], ['Rare', 15], ['Rare Holo', 3], ['Holo Rare', 3]];
const rep = (n, slot) => Array.from({ length: n }, () => slot);

// Emplacement « rare » par époque : le reste du pourcentage va à la rare simple.
const PK_RARE = {
  wotc: [['Rare', 66.7], ['Rare Holo', 33.3]],
  ecard: [['Rare', 65], ['Holo Rare', 33], ['Rare Holo', 2]],
  ex: [['Rare', 64], ['Rare Holo', 36]],
  exOld: [['Rare', 64], ['Holo Rare', 28], ['Rare Holo', 8]], // EX Rubis & Saphir → Légendes Oubliées : « Rare Holo » = cartes ex
  dp: [['Rare', 62], ['Rare Holo', 33], ['Rare Holo LV.X', 4]],
  pl: [['Rare', 59], ['Holo Rare', 33], ['Rare Holo LV.X', 5], ['Rare Holo', 3]],
  hgss: [['Rare', 50], ['Holo Rare', 28], ['Rare Prime', 14], ['LÉGENDE', 6], ['Rare Holo', 2.8], ['Ultra Rare', 0.9]],
  col: [['Rare', 67], ['Holo Rare', 33]],
  bw: [['Rare', 95.8], ['Ultra Rare', 2.8], ['Magnifique rare', 1.4]], // EX et holos rangés dans « Rare » par TCGdex
  xy: [['Rare', 79.6], ['Ultra Rare', 19], ['Magnifique rare', 1.4]], // Ultra Rare = EX + full art
  sm: [['Rare', 80.3], ['Ultra Rare', 15.4], ['Magnifique rare', 2.3], ['Rare Holo', 2]], // Ultra Rare = GX + full art
  swsh: [
    ['Rare', 42], ['Holo Rare', 22], ['Holo Rare V', 14.3], ['Holo Rare VMAX', 5.6], ['Holo Rare VSTAR', 5.6],
    ['Magnifique', 5.7], ['Radieux Rare', 4.7], ['Ultra Rare', 3.9], ['Magnifique rare', 2], ['Rare Holo', 1],
  ],
  sv: [['Rare', 76.6], ['Double rare', 14], ['Ultra Rare', 6.7], ['Hyper rare', 1.85], ['Rare Noir Blanc', 0.5], ['Mega Attack Rare', 0]],
  me: [['Rare', 67.5], ['Double rare', 20.3], ['Ultra Rare', 8.3], ['Mega Attack Rare', 3.4], ['Méga Hyper Rare', 0.1]],
};
// Écarlate et Violet / Méga-Évolution : 2ᵉ reverse pouvant devenir Illustration rare ou Illustration spéciale rare.
const PK_SV_HIT2 = [
  ['Commune', 42], ['Peu Commune', 30], ['Rare', 12], ['HIGH-TECH rare', 4],
  ['Illustration rare', 8], ['Illustration spéciale rare', 2.5],
  ['Shiny rare', 25], ['Chromatique ultra rare', 7.7], // Destinées de Paldea
  ['Pikachu Rare', 8], ['RGB Rare', 0.8], ['Futuristic Rare', 0.5], // 30ᵉ Anniversaire (estimation)
];
const PK_ME_HIT2 = PK_SV_HIT2.map(([r, w]) => [r, r === 'Illustration spéciale rare' ? 1.1 : r === 'Illustration rare' ? 10.7 : w]);

const PK_ERAS = {
  base: { slots: [...rep(7, PK_C), ...rep(3, PK_U), PK_RARE.wotc], price: 120 },
  neo: { slots: [...rep(7, PK_C), ...rep(3, PK_U), PK_RARE.wotc], price: 150 },
  ecard: { slots: [...rep(5, PK_C), ...rep(2, PK_U), PK_REVERSE, PK_RARE.ecard], price: 150 },
  ex: { slots: [...rep(5, PK_C), ...rep(2, PK_U), PK_REVERSE, PK_RARE.ex], price: 60 },
  dp: { slots: [...rep(5, PK_C), ...rep(3, PK_U), PK_REVERSE, PK_RARE.dp], price: 40 },
  pl: { slots: [...rep(5, PK_C), ...rep(3, PK_U), PK_REVERSE, PK_RARE.pl], price: 40 },
  hgss: { slots: [...rep(5, PK_C), ...rep(3, PK_U), PK_REVERSE, PK_RARE.hgss], price: 30 },
  col: { slots: [...rep(5, PK_C), ...rep(3, PK_U), PK_REVERSE, PK_RARE.col], price: 30 },
  bw: { slots: [...rep(5, PK_C), ...rep(3, PK_U), PK_REVERSE, PK_RARE.bw], price: 10 },
  xy: { slots: [...rep(5, PK_C), ...rep(3, PK_U), PK_REVERSE, PK_RARE.xy], price: 7 },
  sm: { slots: [...rep(5, PK_C), ...rep(3, PK_U), PK_REVERSE, PK_RARE.sm], price: 6 },
  swsh: { slots: [...rep(5, PK_C), ...rep(3, PK_U), PK_REVERSE, PK_RARE.swsh], price: 5 },
  sv: { slots: [...rep(4, PK_C), ...rep(3, PK_U), PK_REVERSE, PK_SV_HIT2, PK_RARE.sv], price: 6 },
  me: { slots: [...rep(4, PK_C), ...rep(3, PK_U), PK_REVERSE, PK_ME_HIT2, PK_RARE.me], price: 6 },
};
// Sets dont les taux s'écartent de leur époque.
const PK_SET_SLOTS = {
  ...Object.fromEntries(['ex1', 'ex2', 'ex3', 'ex4', 'ex5'].map(id => [id, [...rep(5, PK_C), ...rep(2, PK_U), PK_REVERSE, PK_RARE.exOld]])),
  // Évolutions Prismatiques : pas d'Illustration rare, SIR 1/45, Hyper rare 1/152.
  'sv08.5': [...rep(4, PK_C), ...rep(3, PK_U), PK_REVERSE,
    [['Commune', 50], ['Peu Commune', 33], ['Rare', 10], ['HIGH-TECH rare', 3.4], ['Illustration spéciale rare', 2.2]],
    [['Rare', 78.3], ['Double rare', 15], ['Ultra Rare', 6], ['Hyper rare', 0.66]]],
};
const PK_PRICE_OVERRIDE = { base1: 300 };

function pokemonSet(s) {
  const era = PK_ERAS[s.serie] ?? PK_ERAS.sv;
  return {
    id: s.id, name: s.name, year: +s.date.slice(0, 4), date: s.date, group: s.serieName, source: 'tcgdex', lang: 'fr', serie: s.serie,
    packPrice: PK_PRICE_OVERRIDE[s.id] ?? era.price, tiers: PK_TIERS, slots: PK_SET_SLOTS[s.id] ?? era.slots,
  };
}

// ---------- Yu-Gi-Oh! : 9 cartes = 8 communes + 1 rare ou mieux ----------
// Short Prints ≈ 1/3 de la fréquence d'une commune, Super Short Prints ≈ 1/6.
const YGO_TIERS = { Common: 0, 'Short Print': 0, 'Super Short Print': 1, Rare: 2, 'Super Rare': 3, 'Ultra Rare': 4, 'Secret Rare': 5 };
const YGO_SLOTS = [
  ...rep(8, [['Common', 93], ['Short Print', 6.5], ['Super Short Print', 0.5]]),
  [['Rare', 72], ['Super Rare', 16.7], ['Ultra Rare', 8.3], ['Secret Rare', 3]],
];

// ---------- One Piece : 12 cartes, une Rare ou mieux garantie, Leader 1 booster sur 2 ----------
const OP_VARIANTS = [
  [/\((Dash Pack|Double Pack Set[^)]*|Pre-Release|Release Event)\)/i, 'Promo'], // hors booster
  [/\((Manga|Gold|Super Alternate Art|Super Leader Alternate Art|Special Foil)\)/i, 'Manga'],
  [/\((SP|Wanted Poster)\)/i, 'SP'],
  [/\((Parallel|Alternate Art|Full Art|Pandaman Art)\)/i, 'AA'],
  [/\((Jolly Roger Foil|Textured Foil)\)/i, 'Foil'],
];
const OP_TIERS = { C: 0, UC: 1, Foil: 2, R: 2, L: 2, SR: 3, AA: 4, SEC: 5, SP: 5, TR: 5, Manga: 5 };
const OP_SLOTS = [
  ...rep(6, [['C', 100], ['UC', 1]]),
  ...rep(3, [['UC', 100], ['C', 1]]), // les Extra Boosters n'ont pas de peu communes
  [['C', 50], ['L', 50]],
  [['R', 100]],
  // SR 1/3, Alt Art 1/12, SEC 1/50, SP 1/160, Treasure Rare 1/288, Manga ≈ 1/700
  [['R', 58.6], ['SR', 30], ['AA', 8.3], ['SEC', 2], ['SP', 0.6], ['TR', 0.35], ['Manga', 0.15]],
];
// Premium Boosters (PRB) : 10 cartes, rééditions, au moins un foil ou une parallèle par booster.
const PRB_SLOTS = [
  ...rep(6, [['C', 20], ['UC', 40], ['R', 40]]),
  ...rep(3, [['Foil', 85], ['SR', 15]]),
  [['SR', 55], ['AA', 35], ['SEC', 6], ['SP', 2], ['Manga', 2]],
];

// ---------- Dragon Ball Super Fusion World : 12 cartes, une Rare ou mieux garantie ----------
const DBFW_VARIANTS = [[/\(Super Alternate Art\)/i, 'Super Alt Art'], [/\(Alternate Art\)/i, 'Alt Art']];
const DBFW_TIERS = { Common: 0, Uncommon: 1, Leader: 2, Rare: 2, 'Super Rare': 3, 'Alt Art': 4, 'Secret Rare': 5, 'Super Alt Art': 5 };
const DBFW_SLOTS = [
  ...C(7, 'Common'), ...C(3, 'Uncommon'),
  [['Common', 67], ['Leader', 33]], // environ un Leader de chaque par boîte
  [['Rare', 67.7], ['Super Rare', 23], ['Alt Art', 6], ['Secret Rare', 3], ['Super Alt Art', 0.3]],
];

// ---------- Riftbound (chiffres officiels Riot) ----------
// 7 communes, 3 peu communes, 2 rares (Épique 1 booster sur 4), 1 foil (Showcase ≈ 1/12, Signature 1/720).
const RIFT_VARIANTS = [[/\(Signature\)/i, 'Signature']];
const RIFT_TIERS = { Common: 0, Uncommon: 1, Rare: 2, Epic: 3, Showcase: 4, Signature: 5 };
const RIFT_SLOTS = [
  ...C(7, 'Common'), ...C(3, 'Uncommon'),
  [['Rare', 87.5], ['Epic', 12.5]],
  [['Rare', 87.5], ['Epic', 12.5]],
  [['Common', 57], ['Uncommon', 28], ['Rare', 3.7], ['Epic', 1.5], ['Showcase', 9.7], ['Signature', 0.14]],
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
        id: 'lea', packPrice: 20000, name: 'Alpha (Édition limitée)', apiName: 'Alpha', year: 1993, source: 'scryfall',
        tiers: { common: 0, uncommon: 1, rare: 4 },
        slots: [...C(11, 'common'), ...C(3, 'uncommon'), [['rare', 1]]],
      },
      {
        id: 'blb', packPrice: 6, name: 'Bloomburrow', year: 2024, source: 'scryfall',
        tiers: { common: 0, uncommon: 1, rare: 3, mythic: 5 },
        // Play Booster : 6 communes, 3 peu communes, 1 joker, 1 rare/mythique (mythique ≈ 1/7.5), 1 foil de n'importe quelle rareté.
        slots: [
          ...C(6, 'common'), ...C(3, 'uncommon'),
          [['common', 42], ['uncommon', 40], ['rare', 15], ['mythic', 3]],
          [['rare', 86.5], ['mythic', 13.5]],
          [['common', 70], ['uncommon', 23], ['rare', 6], ['mythic', 1]],
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
        id: 'LOB', packPrice: 150, name: 'La Légende du Dragon Blanc aux Yeux Bleus', apiName: 'Legend of Blue Eyes White Dragon', year: 2002, source: 'ygoprodeck',
        tiers: YGO_TIERS,
        slots: YGO_SLOTS,
      },
      {
        id: 'MRD', packPrice: 120, name: 'Métal Raiders', apiName: 'Metal Raiders', year: 2002, source: 'ygoprodeck',
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
        id: '1', packPrice: 12, name: 'Premier Chapitre', apiName: 'The First Chapter', year: 2023, source: 'lorcast',
        tiers: { Common: 0, Uncommon: 1, Rare: 2, Super_rare: 3, Legendary: 4, Enchanted: 5 },
        // 6 communes, 3 peu communes, 2 rares ou mieux (Super Rare ≈ 1/3,4, Légendaire ≈ 1/8 par booster), 1 foil (Enchanted ≈ 1/96).
        slots: [
          ...C(6, 'Common'), ...C(3, 'Uncommon'),
          [['Rare', 78.5], ['Super_rare', 15], ['Legendary', 6.5]],
          [['Rare', 78.5], ['Super_rare', 15], ['Legendary', 6.5]],
          [['Common', 55], ['Uncommon', 28], ['Rare', 10], ['Super_rare', 4], ['Legendary', 2], ['Enchanted', 1]],
        ],
      },
    ],
  },
  {
    id: 'onepiece',
    name: 'One Piece',
    color: '#e23b3b',
    accent: '#1b3a6b',
    tileStyle: 'logo', // tuiles façon opecards.fr au lieu des boosters
    sets: [
      // Sets jamais sortis en français (avant le lancement de la VF) : version anglaise uniquement.
      ...[
        ['OP01', 3188, 'OP-01 – Romance Dawn', 2022, 15],
        ['OP02', 17698, 'OP-02 – Paramount War', 2023, 9],
        ['OP03', 22890, 'OP-03 – Pillars of Strength', 2023, 9],
        ['OP04', 23024, 'OP-04 – Kingdoms of Intrigue', 2023, 8],
        ['OP05', 23213, 'OP-05 – Awakening of the New Era', 2023, 12],
        ['OP06', 23272, 'OP-06 – Wings of the Captain', 2024, 8],
        ['EB01', 23333, 'EB-01 – Memorial Collection', 2024, 12],
        ['OP07', 23387, 'OP-07 – 500 Years in the Future', 2024, 7],
        ['OP08', 23462, 'OP-08 – Two Legends', 2024, 6],
      ].map(([id, group, name, year, packPrice]) => ({
        id, name, year, packPrice, lang: 'en', group: 'Exclusifs version anglaise', source: 'tcgcsv', category: 68, tcgGroup: group,
        tiers: OP_TIERS, slots: OP_SLOTS, variants: OP_VARIANTS,
      })),
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
        // Logo officiel français du set (public/logos/onepiece, repris d'opecards.fr).
        id, name, year, packPrice, lang: 'fr', group: 'Version française', source: 'tcgcsv', category: 68, tcgGroup: group, logo: `logos/onepiece/${id}.webp`,
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
        id: 'FB01', packPrice: 8, name: 'Fusion World – Awakened Pulse (VO)', year: 2024, source: 'tcgcsv', category: 80, tcgGroup: 23401, variants: DBFW_VARIANTS,
        tiers: DBFW_TIERS,
        slots: DBFW_SLOTS,
      },
      {
        id: 'FB10', packPrice: 9, name: 'Fusion World – Cross Force (VO)', year: 2026, source: 'tcgcsv', category: 80, tcgGroup: 24604, variants: DBFW_VARIANTS,
        tiers: DBFW_TIERS,
        slots: DBFW_SLOTS,
      },
      {
        id: 'B01', packPrice: 15, name: 'Masters – Galactic Battle (VO)', year: 2017, source: 'tcgcsv', category: 27, tcgGroup: 1962,
        tiers: { Common: 0, Uncommon: 1, Rare: 2, 'Super Rare': 3, 'Special Rare': 5 },
        // 12 cartes : 8 communes, 3 peu communes, 1 Rare ou mieux (par boîte ≈ 12 R, 8 SR, 4 SPR).
        slots: [...C(8, 'Common'), ...C(3, 'Uncommon'), [['Rare', 50], ['Super Rare', 33.3], ['Special Rare', 16.7]]],
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
      { id: 'OGN', packPrice: 12, name: 'Origines', year: 2025, source: 'tcgcsv', category: 89, tcgGroup: 24344, tiers: RIFT_TIERS, slots: RIFT_SLOTS, variants: RIFT_VARIANTS },
      { id: 'SFD', packPrice: 9, name: 'Armes spirituelles', year: 2026, source: 'tcgcsv', category: 89, tcgGroup: 24519, tiers: RIFT_TIERS, slots: RIFT_SLOTS, variants: RIFT_VARIANTS },
      { id: 'VEN', packPrice: 7, name: 'Vendetta', year: 2026, source: 'tcgcsv', category: 89, tcgGroup: 24698, tiers: RIFT_TIERS, slots: RIFT_SLOTS, variants: RIFT_VARIANTS },
    ],
  },
];

// Ordre d'affichage des jeux partout sur le site.
const GAME_ORDER = ['pokemon', 'onepiece', 'dragonball', 'yugioh', 'riftbound', 'lorcana', 'magic'];
GAMES.sort((a, b) => GAME_ORDER.indexOf(a.id) - GAME_ORDER.indexOf(b.id));

// Dos officiel des cartes de chaque jeu (public/backs/<jeu>.webp).
for (const game of GAMES) game.back = `backs/${game.id}.webp`;

export function findSet(setKey) {
  for (const game of GAMES) {
    for (const set of game.sets) {
      if (setKey === `${game.id}/${set.id}`) return { game, set };
    }
  }
  return null;
}

export const allSets = () => GAMES.flatMap(game => game.sets.map(set => ({ game, set, key: `${game.id}/${set.id}` })));
