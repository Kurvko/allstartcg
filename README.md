# AllStar TCG

Ouvre gratuitement des boosters de tous les TCG, collectionne, et regarde ta collection prendre de la valeur au prix réel du marché. Pas d'achat, jamais.

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
