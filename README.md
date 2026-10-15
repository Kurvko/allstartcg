# AllStar TCG

Ouvre gratuitement des boosters de tous les TCG, collectionne, et regarde ta collection prendre de la valeur au prix réel du marché. Pas d'achat, jamais.

**En ligne :** https://kurvko.github.io/allstartcg/ (mis à jour automatiquement à chaque push sur `main`).

## Lancer le site

```
npm start
```
puis ouvre http://localhost:5173

## Nouvelles extensions Pokémon

```
npm run discover            # met à jour la liste des sets Pokémon sortis en français
npm run fetch -- --missing  # télécharge seulement les sets pas encore présents
```

Pour One Piece, ajoute la ligne du set dans [public/js/catalog.js](public/js/catalog.js) (code, `tcgGroup` TCGCSV, nom FR, année, prix du booster).

## Visuels des boosters

```
npm run packs              # télécharge les vrais boosters (images TCGplayer), retire le fond blanc → public/packs/
npm run packs -- --missing # seulement les sets qui n'ont pas encore de visuel
```

## Taux de drop

Les compositions et taux de chaque booster sont dans [public/js/catalog.js](public/js/catalog.js) (`slots`, poids = % par booster).
Ils reprennent les taux réels connus : études de pulls TCGplayer, Elite Fourum et Card Shop Live pour Pokémon,
chiffres officiels de Riot pour Riftbound et de Wizards pour Magic, moyennes de boîtes pour One Piece, Dragon Ball et Lorcana.
Bandai, The Pokémon Company, Konami et Ravensburger ne publient pas leurs taux : ce sont donc des moyennes observées.

Pour vérifier un set : `npm run rates -- pokemon/sv03.5 onepiece/OP09` (simule 20 000 boosters).

## Mettre à jour les prix

```
npm run fetch            # tous les sets
npm run fetch -- magic   # un seul jeu
```
Relance-le de temps en temps (une fois par semaine par exemple) : la valeur de ta collection suit le marché.

## Ajouter un set ou un jeu

1. Ajoute une entrée dans [public/js/catalog.js](public/js/catalog.js) : id du set, raretés (`tiers`) et composition du booster (`slots`).
2. Lance `npm run fetch`. Le script signale les raretés qui manquent dans `tiers`.

Sources : TCGdex (Pokémon), Scryfall (Magic), YGOPRODeck (Yu-Gi-Oh!), Lorcast (Lorcana), OPTCG API (One Piece), TCGCSV (Dragon Ball Super, Riftbound).

TCGCSV couvre tous les jeux vendus sur TCGplayer : pour un nouveau jeu, trouve son `category` et le `group` du set sur https://tcgcsv.com/tcgplayer/categories puis utilise `source: 'tcgcsv'`.

## Règles

- 10 boosters par jeu et par jour (`DAILY_PACKS`), remis à zéro à minuit.
- Le tirage est enregistré dès l'ouverture : recharger la page ne relance pas un booster.
- Réinitialiser la collection ne rend pas les boosters du jour.
- La collection est enregistrée dans le navigateur (localStorage) : elle est propre à ce navigateur.
