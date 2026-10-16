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
npm run packs -- pokemon/me05 onepiece  # seulement ces sets / ce jeu
```

## Logos des sets

Les tuiles des sets Pokémon et One Piece affichent le logo officiel du set (un booster s'il n'y a pas de logo) :
- Pokémon : [public/logos/pokemon/](public/logos/pokemon/), logos TCGdex en français. Pour les nouveaux sets : `npm run logos`.
- One Piece : [public/logos/onepiece/](public/logos/onepiece/) (`<code du set>.webp`), logos français et anglais repris d'[opecards.fr](https://www.opecards.fr/series).

## Dos des cartes

Les dos officiels de chaque jeu sont dans [public/backs/](public/backs/) (`<jeu>.webp`, 500×698).
Sources : Scryfall (Magic), YGOPRODeck (Yu-Gi-Oh!), pokemontcg.io (Pokémon), site officiel Bandai (Dragon Ball Fusion World),
Wikipédia (Lorcana, One Piece, Riftbound). Pour en changer un, remplace le fichier en gardant le même nom.

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

Sources : TCGdex (Pokémon), Scryfall (Magic), YGOPRODeck (Yu-Gi-Oh!), Lorcast (Lorcana), TCGCSV (One Piece, Dragon Ball Super, Riftbound).

TCGCSV couvre tous les jeux vendus sur TCGplayer : pour un nouveau jeu, trouve son `category` et le `group` du set sur https://tcgcsv.com/tcgplayer/categories puis utilise `source: 'tcgcsv'`.

## Cartes sport (basket, football)

Ce ne sont pas des TCG : il n'existe pas de base gratuite de cartes sport avec images. Les cartes sont donc **dessinées par le site** (photo du joueur, logo et couleurs du club, numéro, poste, cadre selon la rareté), sans prix.

```
npm run sports   # effectifs ESPN → public/data/basketball|soccer, boosters et dos dessinés
```

- Effectifs, logos et photos NBA : API publique ESPN. Photos des footballeurs : Wikipédia / Wikimedia Commons (licences libres).
- Raretés : Base (ou Rookie / Espoir), Argent, Bleu /199, Or /10, Noir 1/1. Booster de 8 cartes : 6 bases, 1 base ou Argent, 1 parallèle garanti.
- Ajouter une ligue : une entrée dans `GAMES` ([public/js/catalog.js](public/js/catalog.js)) avec `source: 'espn'` et le code ESPN de la ligue (`soccer/esp.1`, `soccer/ita.1`, `soccer/ger.1`…).

## Comptes en ligne (Supabase)

Sans configuration, la collection reste dans le navigateur. Pour activer les comptes (collection, stats et decks synchronisés sur tous les appareils) :

1. Crée un projet gratuit sur https://supabase.com (région Europe).
2. **SQL Editor → New query** : colle le contenu de [supabase/schema.sql](supabase/schema.sql) puis **Run**.
3. **Authentication → URL Configuration** : mets `https://kurvko.github.io/allstartcg/` dans *Site URL* et ajoute aussi `http://localhost:5173/` dans *Redirect URLs*.
4. **Project Settings → API** : copie *Project URL* et la clé *anon public* dans [public/js/config.js](public/js/config.js).

La clé *anon* est publique par conception : chaque joueur ne peut lire et modifier que sa propre sauvegarde (règles RLS).
Au moment de la connexion, ce qui est sur l'appareil est fusionné avec le compte. Le stock de boosters prend le plus entamé des deux, donc changer d'appareil ne redonne pas de boosters.

## Decks

Page **Decks** : construction avec les cartes de sa collection, vérification des règles de chaque jeu ([public/js/decks.js](public/js/decks.js), `RULES`),
et decks conseillés générés à partir de ce qu'on possède (lignées d'évolution Pokémon, couleurs du Leader One Piece / Dragon Ball, domaines de la Légende Riftbound, 2 encres Lorcana, 2 couleurs Magic).
Les Énergies de base (Pokémon) et terrains de base (Magic) sont illimités, comme dans la réalité.

## Règles

- Boosters en stock rechargeable, par jeu : 8 au maximum (`MAX_PACKS`), un de plus toutes les 1h30 (`REFILL_MS`), donc stock plein en 12 h.
- Le tirage est enregistré dès l'ouverture : recharger la page ne relance pas un booster.
- Réinitialiser la collection ne recharge pas le stock de boosters.
- Sans compte, la collection est enregistrée dans le navigateur (localStorage). Avec un compte, elle est aussi sauvegardée en ligne.

## Favoris

Dans la fenêtre d'une carte (partout sur le site) : **☆ Ajouter aux favoris**. Les favoris ont une étoile sur leur vignette, un filtre « ★ Favoris » dans chaque set de la collection, et leur page **Favoris** (cartes possédées ou encore à chasser). Ils sont synchronisés avec le compte.

## Combat Pokémon contre l'IA

Page **Combat** : un deck Pokémon (de ta collection, ou un deck de démo) contre l'IA, en 3 niveaux.
- Règles : [public/js/battle/engine.js](public/js/battle/engine.js) (Actif / Banc, Énergies, évolutions, Dresseurs, retraite, faiblesse / résistance, états spéciaux, Récompenses).
- Effets des cartes lus dans le texte français : [public/js/battle/effects.js](public/js/battle/effects.js). Seuls les plus courants sont simulés.
- IA : [public/js/battle/ai.js](public/js/battle/ai.js). Facile = au hasard, Normal = meilleur coup testé sur une copie de la partie (avec erreurs), Difficile = sans erreur et en anticipant l'attaque adverse.
- Les données de combat (attaques, faiblesses, retraite…) viennent de TCGdex via `npm run fetch -- pokemon`.

## Effets et sons

- [public/js/fx.js](public/js/fx.js) : fond étoilé animé, particules (explosions, étincelles, confettis), flashs et ondes de choc, inclinaison 3D avec reflet holographique au survol des cartes et des boosters, apparition des éléments au défilement.
- [public/js/sfx.js](public/js/sfx.js) : tous les sons sont fabriqués par le navigateur (Web Audio), sans fichier audio. Bouton 🔊 / 🔇 dans la barre du haut.
- Ouverture d'un booster : la lumière qui sort du booster prend la couleur de la meilleure carte (bleu, violet, or, arc-en-ciel) ; les cartes rares se chargent avant d'être retournées.
