// Dresseurs adverses du combat : un par partie, choisi selon le niveau et le type de son deck.
// Les portraits sont dessinés en SVG à partir de quelques paramètres (coiffure, chapeau, tenue, expression).

const LINE = 'stroke="#1b1530" stroke-width="2.5" stroke-linejoin="round"';

/** Assombrit (k < 1) ou éclaircit (k > 1) une couleur #rrggbb. */
function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  const f = c => Math.max(0, Math.min(255, Math.round(c * k))).toString(16).padStart(2, '0');
  return `#${f(n >> 16)}${f((n >> 8) & 255)}${f(n & 255)}`;
}

const HAIR_FRONT = {
  short: 'M56 112 C 52 66, 84 54, 104 56 C 130 58, 150 74, 144 112 C 138 96, 128 88, 118 86 C 112 94, 98 96, 86 90 C 76 96, 64 100, 56 112 Z',
  spiky: 'M54 114 L58 84 L44 76 L66 72 L62 52 L84 62 L94 40 L108 58 L126 44 L128 66 L152 60 L142 82 L156 94 L144 112 C 136 94, 122 88, 112 88 C 102 96, 86 96, 78 90 C 68 98, 60 104, 54 114 Z',
  long: 'M56 112 C 54 66, 146 66, 144 112 C 136 92, 124 86, 112 84 C 106 92, 92 96, 82 88 C 72 96, 62 102, 56 112 Z',
  bob: 'M52 128 C 44 64, 156 64, 148 128 C 142 114, 140 100, 132 92 C 116 98, 92 96, 76 88 C 66 98, 58 112, 52 128 Z',
};
HAIR_FRONT.bun = HAIR_FRONT.short;
HAIR_FRONT.ponytail = HAIR_FRONT.short;

const BROWS = {
  calm: ['M74 100 Q83 96 92 99', 'M108 99 Q117 96 126 100'],
  fierce: ['M73 96 L93 103', 'M107 103 L127 96'],
  happy: ['M74 102 Q83 94 92 100', 'M108 100 Q117 94 126 102'],
};

function mouth(kind) {
  if (kind === 'grin') return `<path d="M87 137 Q100 154 113 137 Z" fill="#7a1f2b" ${LINE}/><path d="M89 138.5 L111 138.5 L109.5 142 L90.5 142 Z" fill="#fff"/>`;
  if (kind === 'smirk') return '<path d="M91 142 Q104 147 112 136" stroke="#1b1530" stroke-width="2.6" fill="none" stroke-linecap="round"/>';
  if (kind === 'open') return `<ellipse cx="100" cy="142" rx="6" ry="5" fill="#7a1f2b" ${LINE}/>`;
  return '<path d="M89 139 Q100 149 111 139" stroke="#1b1530" stroke-width="2.6" fill="none" stroke-linecap="round"/>';
}

function hat(kind, color) {
  const dark = shade(color, 0.72);
  if (kind === 'cap') {
    return `<path d="M56 98 C 56 52, 144 52, 144 98 Z" fill="${color}" ${LINE}/>
      <path d="M56 98 C 86 88, 128 90, 164 104 C 132 112, 86 110, 56 98 Z" fill="${dark}" ${LINE}/>
      <circle cx="100" cy="76" r="9" fill="#fff" ${LINE}/><path d="M91 76 L109 76" stroke="#1b1530" stroke-width="2"/>`;
  }
  if (kind === 'beanie') {
    return `<path d="M56 102 C 52 48, 148 48, 144 102 Z" fill="${color}" ${LINE}/>
      <rect x="53" y="90" width="94" height="15" rx="7" fill="${dark}" ${LINE}/><circle cx="100" cy="46" r="9" fill="${shade(color, 1.3)}" ${LINE}/>`;
  }
  if (kind === 'band') {
    return `<path d="M56 93 C 80 84, 120 84, 144 93 L 144 103 C 120 94, 80 94, 56 103 Z" fill="${color}" ${LINE}/>
      <path d="M142 95 L166 86 L162 104 Z" fill="${color}" ${LINE}/>`;
  }
  if (kind === 'crown') {
    return `<path d="M70 72 L76 48 L90 64 L100 40 L110 64 L124 48 L130 72 Z" fill="${color}" ${LINE}/>
      <circle cx="100" cy="58" r="4" fill="#ff6bd6"/><circle cx="82" cy="62" r="3" fill="#6bc8ff"/><circle cx="118" cy="62" r="3" fill="#6bc8ff"/>`;
  }
  return '';
}

/** Portrait d'un Dresseur (buste), en SVG. */
export function portrait(look = {}) {
  const L = {
    skin: '#f6d2b5', hair: 'short', hairColor: '#3b2a20', hat: 'none', hatColor: '#e5484d', outfit: '#3e7bff', accent: '#ffd36b',
    eyes: '#2a2440', brows: 'calm', mouth: 'smile', acc: 'none', blush: false, ...look,
  };
  const hairDark = shade(L.hairColor, 0.7);
  const eye = x => `<ellipse cx="${x}" cy="118" rx="7" ry="9.5" fill="${L.eyes}"/><ellipse cx="${x}" cy="122" rx="4.5" ry="4.5" fill="${shade(L.eyes, 1.6)}"/>
    <circle cx="${x + 2.5}" cy="114" r="2.6" fill="#fff"/><path d="M${x - 9} 110 Q ${x} 104 ${x + 9} 110" stroke="#1b1530" stroke-width="3" fill="none" stroke-linecap="round"/>`;
  return `<svg class="portrait" viewBox="0 0 200 240" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    ${L.hat === 'hood' ? `<path d="M42 122 C 38 46, 162 46, 158 122 L 162 180 L 38 180 Z" fill="${L.hatColor}" ${LINE}/>` : ''}
    ${L.hair === 'long' ? `<path d="M50 104 C 44 50, 156 50, 150 104 L 158 198 C 134 212, 66 212, 42 198 Z" fill="${L.hairColor}" ${LINE}/>` : ''}
    ${L.hair === 'ponytail' ? `<path d="M136 80 C 176 84, 182 142, 162 176 C 150 152, 150 120, 134 104 Z" fill="${L.hairColor}" ${LINE}/>` : ''}
    <path d="M22 240 C 26 192, 58 170, 100 168 C 142 170, 174 192, 178 240 Z" fill="${L.outfit}" ${LINE}/>
    <path d="M100 168 C 142 170, 174 192, 178 240 L 122 240 Z" fill="#00000022"/>
    <path d="M80 170 L100 202 L120 170" fill="none" stroke="${L.accent}" stroke-width="7" stroke-linejoin="round"/>
    <circle cx="140" cy="210" r="11" fill="${L.accent}" ${LINE}/><circle cx="140" cy="210" r="4" fill="#fff"/>
    <path d="M86 136 L86 172 C 94 180, 106 180, 114 172 L114 136 Z" fill="${L.skin}" ${LINE}/>
    <path d="M86 148 C 96 160, 104 160, 114 148 L114 138 L86 138 Z" fill="#00000022"/>
    ${L.acc === 'scarf' ? `<path d="M72 164 C 90 180, 110 180, 128 164 L 134 178 C 112 194, 88 194, 66 178 Z" fill="${L.accent}" ${LINE}/><path d="M116 182 L128 216 L112 213 Z" fill="${L.accent}" ${LINE}/>` : ''}
    <ellipse cx="60" cy="118" rx="8" ry="11" fill="${L.skin}" ${LINE}/><ellipse cx="140" cy="118" rx="8" ry="11" fill="${L.skin}" ${LINE}/>
    <path d="M60 104 C 60 68, 140 68, 140 104 L 140 120 C 140 150, 122 162, 100 162 C 78 162, 60 150, 60 120 Z" fill="${L.skin}" ${LINE}/>
    ${eye(83)}${eye(117)}
    <path d="${BROWS[L.brows][0]}" stroke="${hairDark}" stroke-width="3.5" fill="none" stroke-linecap="round"/>
    <path d="${BROWS[L.brows][1]}" stroke="${hairDark}" stroke-width="3.5" fill="none" stroke-linecap="round"/>
    ${mouth(L.mouth)}
    ${L.blush ? '<ellipse cx="72" cy="133" rx="7" ry="3.5" fill="#ff7a8a" opacity=".45"/><ellipse cx="128" cy="133" rx="7" ry="3.5" fill="#ff7a8a" opacity=".45"/>' : ''}
    ${L.hair === 'bun' ? `<circle cx="100" cy="50" r="17" fill="${L.hairColor}" ${LINE}/>` : ''}
    <path d="${HAIR_FRONT[L.hair] ?? HAIR_FRONT.short}" fill="${L.hairColor}" ${LINE}/>
    <path d="M78 70 Q92 62 106 64" stroke="#ffffff55" stroke-width="4" fill="none" stroke-linecap="round"/>
    ${hat(L.hat, L.hatColor)}
    ${L.acc === 'glasses' ? '<g fill="#bfe3ff40" stroke="#1b1530" stroke-width="3"><rect x="70" y="107" width="26" height="21" rx="7"/><rect x="104" y="107" width="26" height="21" rx="7"/></g><path d="M96 116 L104 116" stroke="#1b1530" stroke-width="3"/>' : ''}
    ${L.acc === 'earring' ? `<circle cx="58" cy="132" r="3.5" fill="${L.accent}" ${LINE}/><circle cx="142" cy="132" r="3.5" fill="${L.accent}" ${LINE}/>` : ''}
  </svg>`;
}

/** Le joueur, pour l'écran de face-à-face. */
export const PLAYER_LOOK = { hair: 'short', hairColor: '#4a2c1a', hat: 'cap', hatColor: '#e5484d', outfit: '#2f6fe0', accent: '#ffd36b', brows: 'fierce', mouth: 'smile' };

const T = (title, name, type, look, quotes) => ({ title, name, type, look, quotes, full: `${title} ${name}` });

export const TRAINERS = {
  facile: [
    T('Gamin', 'Théo', 'Plante', { hairColor: '#6b3f1f', hat: 'cap', hatColor: '#30a46c', outfit: '#f5c518', accent: '#30a46c', brows: 'happy', mouth: 'grin', blush: true }, {
      intro: 'Mes Pokémon Plante sont les plus forts du quartier !', ko: 'Hein ? Déjà K.O. ?!', taunt: 'Ha ! Tu as vu ça ?',
      win: 'J\'ai gagné ! Je vais le dire à tout le monde !', lose: 'Oh non… Je vais m\'entraîner encore plus !',
    }),
    T('Fillette', 'Lily', 'Eau', { hair: 'ponytail', hairColor: '#e8a33c', hat: 'band', hatColor: '#3e8bff', outfit: '#ff8bd4', accent: '#3e8bff', blush: true, skin: '#f9dcc4' }, {
      intro: 'Tu veux voir mes Pokémon Eau ? Ils sont trop mignons !', ko: 'Mais euh ! C\'est pas juste !', taunt: 'Plouf ! Hi hi !',
      win: 'Youpi ! J\'ai gagné !', lose: 'Bravo… Tu es vraiment doué !',
    }),
    T('Scout', 'Malo', 'Combat', { hair: 'spiky', hairColor: '#2a2a2a', hat: 'band', hatColor: '#e5484d', outfit: '#c2703d', accent: '#ffd36b', brows: 'fierce', mouth: 'grin', skin: '#e0ac80' }, {
      intro: 'Un vrai scout ne recule jamais ! En garde !', ko: 'Aïe ! Bien joué…', taunt: 'Et bim ! Entraînement réussi !',
      win: 'Victoire ! Le badge du courage est à moi !', lose: 'Je reviendrai plus fort, promis !',
    }),
    T('Pique-niqueuse', 'Nina', 'Électrique', { hair: 'bob', hairColor: '#ffd36b', outfit: '#7c5cff', accent: '#f5c518', blush: true, acc: 'earring' }, {
      intro: 'Un petit combat avant le goûter ?', ko: 'Oups, court-circuit !', taunt: 'Ça grésille, hein ?',
      win: 'Trop bien ! On refait ça quand tu veux !', lose: 'Tu m\'as complètement électrisée !',
    }),
  ],
  normal: [
    T('Topdresseur', 'Hugo', 'Feu', { hair: 'spiky', hairColor: '#c0392b', outfit: '#2a2f45', accent: '#ff6b3d', brows: 'fierce', mouth: 'smirk', acc: 'scarf' }, {
      intro: 'Mon équipe Feu va réduire tes cartes en cendres !', ko: 'Tch… Tu tiens la chaleur, toi.', taunt: 'Ça brûle, pas vrai ?',
      win: 'Rien ne résiste à mes flammes !', lose: 'Tu as éteint mon feu… Respect.',
    }),
    T('Topdresseuse', 'Inès', 'Psy', { hair: 'long', hairColor: '#6b3fa0', outfit: '#c58bff', accent: '#ff6bd6', mouth: 'smirk', acc: 'earring', eyes: '#7a2a8a' }, {
      intro: 'J\'ai déjà vu l\'issue de ce combat. Elle ne te plaira pas.', ko: 'Je n\'avais pas prévu ça…', taunt: 'Exactement comme je l\'avais vu.',
      win: 'Les cartes ne mentent jamais.', lose: 'Mon intuition m\'a trahie… Bien joué.',
    }),
    T('Pêcheur', 'Yvon', 'Eau', { hairColor: '#5a5a5a', hat: 'beanie', hatColor: '#1a6fb0', outfit: '#e39b12', accent: '#3e8bff', mouth: 'grin', skin: '#d9a07a' }, {
      intro: 'Ça mord ! Enfin un adversaire à ma taille !', ko: 'Il m\'a échappé, celui-là !', taunt: 'Belle prise !',
      win: 'Une pêche miraculeuse !', lose: 'Le gros poisson, c\'était toi…',
    }),
    T('Ingénieure', 'Clara', 'Métal', { hair: 'bun', hairColor: '#2b2b3a', outfit: '#95a5a6', accent: '#3e7bff', acc: 'glasses' }, {
      intro: 'J\'ai optimisé chaque carte de ce deck. Montre-moi ce que tu vaux.', ko: 'Une erreur de calcul…', taunt: 'Résultat conforme aux prévisions.',
      win: 'Efficacité : cent pour cent.', lose: 'Je dois revoir mes plans. Impressionnant.',
    }),
  ],
  difficile: [
    T('Championne', 'Aria', 'Psy', { hair: 'long', hairColor: '#e8e8f5', hat: 'crown', hatColor: '#ffd36b', outfit: '#4b2a8f', accent: '#ff6bd6', mouth: 'smirk', eyes: '#c03aa0', acc: 'earring' }, {
      intro: 'Bienvenue dans mon Arène. Peu en ressortent victorieux.', ko: 'Intéressant… Tu es plus fort que prévu.', taunt: 'Tu ne peux rien contre mon esprit.',
      win: 'Reviens quand tu seras prêt.', lose: 'Tu as mérité ma reconnaissance, Dresseur.',
    }),
    T('Champion', 'Ignis', 'Feu', { hair: 'spiky', hairColor: '#ff6b3d', hat: 'band', hatColor: '#2a2a2a', outfit: '#8a1f1f', accent: '#ffb347', brows: 'fierce', mouth: 'grin', acc: 'scarf', skin: '#e0ac80' }, {
      intro: 'Je suis le Champion Ignis ! Prépare-toi à brûler !', ko: 'Grr ! Tu as du cran !', taunt: 'Mes flammes ne s\'éteignent jamais !',
      win: 'Le feu triomphe toujours !', lose: 'Quel combat ! Tu as allumé quelque chose en moi.',
    }),
    T('Maître Dragon', 'Kaïto', 'Dragon', { hair: 'long', hairColor: '#1b2a4a', outfit: '#c8a03b', accent: '#3a2a5c', brows: 'fierce', mouth: 'smirk', acc: 'scarf' }, {
      intro: 'Les dragons ne s\'inclinent devant personne. Montre ta force.', ko: 'Hmph. Pas mal.', taunt: 'Sens la puissance des dragons !',
      win: 'Les dragons règnent toujours.', lose: 'Tu as dompté mes dragons… Incroyable.',
    }),
    T('Championne', 'Nyx', 'Obscurité', { hair: 'bob', hairColor: '#1a1a2e', hat: 'hood', hatColor: '#2e2440', outfit: '#3a2a5c', accent: '#b98bff', mouth: 'smirk', eyes: '#b98bff' }, {
      intro: 'Dans l\'ombre, personne ne t\'entendra perdre.', ko: 'Tu vois dans le noir, toi…', taunt: 'Les ténèbres t\'engloutissent.',
      win: 'Retourne d\'où tu viens.', lose: 'La lumière gagne, cette fois…',
    }),
    T('Champion', 'Volt', 'Électrique', { hair: 'spiky', hairColor: '#f5c518', hat: 'cap', hatColor: '#2a2f45', outfit: '#f5c518', accent: '#2a2f45', brows: 'fierce', mouth: 'grin' }, {
      intro: 'Cent mille volts de pure puissance ! Tu es prêt ?', ko: 'Une baisse de tension… temporaire !', taunt: 'Ça, c\'est du courant !',
      win: 'Foudroyé ! Comme prévu !', lose: 'Tu m\'as mis à plat… Bravo !',
    }),
  ],
};

/** Choisit un Dresseur du niveau dont le type existe dans la réserve de cartes (sinon le premier type disponible). */
export function pickTrainer(level, types) {
  const list = TRAINERS[level] ?? TRAINERS.normal;
  const ok = list.filter(t => types.includes(t.type));
  if (ok.length) return ok[Math.floor(Math.random() * ok.length)];
  const t = list[Math.floor(Math.random() * list.length)];
  return { ...t, type: types[0] ?? t.type };
}
