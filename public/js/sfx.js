// Effets sonores fabriqués dans le navigateur (Web Audio) : aucun fichier à télécharger.
// Bouton son / muet dans la barre du haut, choix enregistré dans le navigateur.
import { icon } from './icons.js';

const KEY = 'allstartcg:sfx';
let on = (() => { try { return localStorage.getItem(KEY) !== 'off'; } catch { return true; } })();
let ctx, out, wet, noiseBuf;

function audio() {
  if (!on) return null;
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16; comp.ratio.value = 5;
    out = ctx.createGain(); out.gain.value = 0.6;
    out.connect(comp).connect(ctx.destination);
    // Réverbération : réponse impulsionnelle fabriquée (bruit qui décroît).
    const len = ctx.sampleRate * 2.4, ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 3;
    }
    const conv = ctx.createConvolver(); conv.buffer = ir;
    wet = ctx.createGain(); wet.gain.value = 0.4;
    wet.connect(conv).connect(out);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const n = noiseBuf.getChannelData(0);
    for (let i = 0; i < n.length; i++) n[i] = Math.random() * 2 - 1;
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

// Le navigateur n'autorise le son qu'après un geste du joueur.
document.addEventListener('pointerdown', () => { if (on && ctx?.state === 'suspended') ctx.resume(); }, true);

const midi = m => 440 * 2 ** ((m - 69) / 12);
const rnd = (a, b) => a + Math.random() * (b - a);

function envelope(g, t, vol, a, d) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
}

function send(node, rev, pan, bus = out) {
  let n = node;
  if (pan && ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = pan; n.connect(p); n = p; }
  n.connect(bus);
  if (rev) { const s = ctx.createGain(); s.gain.value = rev; n.connect(s); s.connect(wet); }
}

/** Note : oscillateur + enveloppe, glissando (f2) et filtre passe-bas (lp → lp2) facultatifs. */
function tone({ f = 440, f2, type = 'sine', at = 0, a = 0.005, d = 0.2, vol = 0.2, rev = 0, pan = 0, detune = 0, lp, lp2, bus } = {}) {
  const c = audio(); if (!c) return;
  const t = c.currentTime + at;
  const o = c.createOscillator(), g = c.createGain();
  o.type = type; o.detune.value = detune;
  o.frequency.setValueAtTime(f, t);
  if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + a + d);
  envelope(g, t, vol, a, d);
  let src = o;
  if (lp) {
    const fl = c.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.setValueAtTime(lp, t);
    if (lp2) fl.frequency.exponentialRampToValueAtTime(lp2, t + a + d * 0.6);
    o.connect(fl); src = fl;
  }
  src.connect(g); send(g, rev, pan, bus);
  o.start(t); o.stop(t + a + d + 0.05);
}

/** Bruit filtré : déchirures, souffles, impacts. */
function noise({ at = 0, a = 0.005, d = 0.2, vol = 0.2, type = 'bandpass', f = 1000, f2, q = 1, rev = 0, pan = 0, bus } = {}) {
  const c = audio(); if (!c) return;
  const t = c.currentTime + at;
  const src = c.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
  const fl = c.createBiquadFilter(); fl.type = type; fl.Q.value = q;
  fl.frequency.setValueAtTime(f, t);
  if (f2) fl.frequency.exponentialRampToValueAtTime(f2, t + a + d);
  const g = c.createGain(); envelope(g, t, vol, a, d);
  src.connect(fl).connect(g); send(g, rev, pan, bus);
  src.start(t, Math.random() * 1.5); src.stop(t + a + d + 0.05);
}

const arp = (notes, step, o = {}) => notes.forEach((m, i) => tone({ ...o, f: midi(m), at: (o.at ?? 0) + i * step }));
const chord = (notes, o = {}) => notes.forEach((m, i) => tone({ ...o, f: midi(m), detune: i % 2 ? 7 : -7 }));
const sparkle = (at = 0, n = 10, base = 96) => {
  for (let i = 0; i < n; i++) tone({ f: midi(base + Math.floor(rnd(0, 14))), at: at + i * 0.055 + rnd(0, 0.03), d: 0.18, vol: 0.022, rev: 0.8, pan: rnd(-0.7, 0.7) });
};
const boom = (k = 1, at = 0) => {
  tone({ f: 150, f2: 32, at, a: 0.004, d: 0.8 * k, vol: 0.55 });
  noise({ type: 'lowpass', f: 900, f2: 60, at, d: 0.55 * k, vol: 0.35 * k });
};

let lastRip = 0, lastHover = 0;

export const sfx = {
  get on() { return on; },

  click() { tone({ f: 1500, f2: 750, type: 'triangle', d: 0.05, vol: 0.05 }); },
  hover() {
    const now = performance.now();
    if (now - lastHover < 70) return;
    lastHover = now;
    tone({ f: 2600, d: 0.035, vol: 0.012 });
  },
  whoosh(vol = 0.16) { noise({ type: 'bandpass', f: 280, f2: 2600, q: 1.1, a: 0.12, d: 0.32, vol }); },

  /** Le booster arrive : souffle + scintillement. */
  packIn() {
    noise({ type: 'bandpass', f: 2400, f2: 300, q: 1, a: 0.2, d: 0.5, vol: 0.12 });
    arp([84, 88, 91, 96], 0.07, { type: 'triangle', d: 0.35, vol: 0.035, rev: 0.6, at: 0.25 });
  },
  /** Petit bout de déchirure, joué pendant le glisser (plus le geste est rapide, plus c'est fort). */
  rip(speed = 1) {
    const now = performance.now();
    if (now - lastRip < 28) return;
    lastRip = now;
    const s = Math.min(1, speed);
    noise({ type: 'bandpass', f: rnd(1600, 4800), q: rnd(1.5, 4), d: rnd(0.025, 0.07), vol: 0.06 + 0.22 * s, pan: rnd(-0.3, 0.3) });
  },
  /** Déchirure complète du haut du booster. */
  tear() {
    noise({ type: 'highpass', f: 1200, f2: 5200, a: 0.01, d: 0.3, vol: 0.32 });
    for (let i = 0; i < 9; i++) noise({ type: 'bandpass', f: rnd(1800, 5000), q: 3, at: rnd(0, 0.28), d: rnd(0.02, 0.05), vol: rnd(0.1, 0.25) });
    tone({ f: 220, f2: 60, at: 0.3, d: 0.18, vol: 0.25 });
  },
  /** La lumière sort du booster : plus la meilleure carte est rare, plus c'est intense. */
  burstOut(tier = 0) {
    noise({ type: 'bandpass', f: 400, f2: 5000, q: 0.8, a: 0.05, d: 0.6, vol: 0.18 });
    if (tier >= 3) arp([72, 79, 84, 91], 0.05, { type: 'triangle', d: 0.5, vol: 0.04, rev: 0.7 });
    if (tier >= 4) { boom(0.7); sparkle(0.2, 8); }
  },
  flip() {
    noise({ type: 'highpass', f: 2800, d: 0.045, vol: 0.16 });
    tone({ f: 280, f2: 120, d: 0.09, vol: 0.12 });
  },
  deal() { noise({ type: 'highpass', f: 3200, d: 0.03, vol: 0.05, pan: rnd(-0.4, 0.4) }); },
  tick() { tone({ f: rnd(1900, 2300), type: 'triangle', d: 0.025, vol: 0.025 }); },
  coin() {
    tone({ f: midi(83), type: 'square', d: 0.06, vol: 0.035, lp: 4000 });
    tone({ f: midi(88), type: 'square', at: 0.06, d: 0.3, vol: 0.035, lp: 4000, rev: 0.3 });
  },
  newCard() {
    tone({ f: midi(88), d: 0.3, vol: 0.05, rev: 0.5 });
    tone({ f: midi(95), at: 0.08, d: 0.4, vol: 0.045, rev: 0.5 });
  },

  /** Montée de tension avant une carte rare (durée en secondes). */
  charge(tier, dur) {
    const top = tier >= 5 ? 8 : tier >= 4 ? 5 : 3;
    tone({ type: 'sawtooth', f: 90, f2: 90 * top, a: dur, d: 0.06, vol: 0.05, lp: 500, lp2: 5000 });
    noise({ type: 'bandpass', f: 300, f2: 7000, q: 2.5, a: dur, d: 0.05, vol: 0.14 });
    if (tier >= 4) for (let t = 0; t < dur - 0.15; t += tier >= 5 ? 0.32 : 0.45) tone({ f: 70, f2: 38, at: t, d: 0.16, vol: 0.4 });
  },

  /** Révélation d'une carte selon sa rareté (0 à 5). */
  reveal(tier) {
    if (tier <= 1) return tone({ f: midi(76), d: 0.18, vol: 0.045, rev: 0.2 });
    if (tier === 2) return arp([79, 86], 0.07, { type: 'triangle', d: 0.35, vol: 0.05, rev: 0.35 });
    if (tier === 3) {
      arp([76, 79, 83, 88], 0.06, { type: 'triangle', d: 0.5, vol: 0.055, rev: 0.55 });
      return sparkle(0.25, 6);
    }
    if (tier === 4) {
      boom(1);
      arp([72, 76, 79, 84, 88, 91], 0.05, { type: 'triangle', d: 0.6, vol: 0.06, rev: 0.6 });
      chord([60, 67, 72, 76], { at: 0.3, type: 'sawtooth', lp: 900, lp2: 3200, a: 0.06, d: 1.8, vol: 0.03, rev: 0.6 });
      return sparkle(0.35, 12);
    }
    // Tier 5 : la totale.
    boom(1.5);
    noise({ type: 'highpass', f: 6000, f2: 1500, a: 0.01, d: 1.2, vol: 0.12, rev: 0.6 });
    arp([72, 76, 79, 84, 88, 91, 96, 100], 0.045, { type: 'triangle', d: 0.7, vol: 0.06, rev: 0.7 });
    chord([48, 60, 67, 72, 76, 79], { at: 0.35, type: 'sawtooth', lp: 500, lp2: 4500, a: 0.12, d: 2.8, vol: 0.032, rev: 0.8 });
    chord([84, 88, 91], { at: 0.4, type: 'sine', a: 0.2, d: 2.4, vol: 0.03, rev: 0.9 });
    sparkle(0.4, 22, 91);
    boom(0.6, 0.9);
  },

  // Combat
  play() { noise({ type: 'bandpass', f: 1800, f2: 900, d: 0.08, vol: 0.1 }); tone({ f: 520, f2: 760, d: 0.08, vol: 0.04, type: 'triangle' }); },
  hit(dmg = 30) {
    const k = Math.min(1.4, 0.6 + dmg / 120);
    noise({ type: 'lowpass', f: 2400, f2: 180, d: 0.28 * k, vol: 0.38 });
    tone({ f: 190, f2: 45, d: 0.3 * k, vol: 0.4 });
  },
  ko() {
    tone({ type: 'square', f: 523, f2: 90, d: 0.7, vol: 0.05, lp: 1800 });
    noise({ type: 'lowpass', f: 900, f2: 80, d: 0.7, vol: 0.28 });
  },
  win() {
    arp([72, 76, 79], 0.12, { type: 'square', d: 0.16, vol: 0.04, lp: 3500 });
    chord([72, 76, 79, 84], { at: 0.38, type: 'sawtooth', lp: 1200, lp2: 4000, a: 0.03, d: 1.6, vol: 0.035, rev: 0.6 });
    sparkle(0.4, 16);
  },
  lose() { arp([67, 63, 60, 55], 0.22, { type: 'triangle', d: 0.45, vol: 0.06, rev: 0.4 }); },
  /** Une carte entre sur le terrain (façon Poké Ball qui s'ouvre). */
  sendOut() {
    tone({ f: 900, f2: 300, type: 'triangle', d: 0.12, vol: 0.06 });
    noise({ type: 'bandpass', f: 1200, f2: 6000, q: 1, at: 0.1, a: 0.02, d: 0.35, vol: 0.18 });
    arp([84, 91, 96], 0.05, { at: 0.12, type: 'sine', d: 0.3, vol: 0.04, rev: 0.6 });
  },
  evolve() {
    for (let i = 0; i < 10; i++) tone({ f: midi(60 + i * 3), at: i * 0.07, type: 'triangle', d: 0.18, vol: 0.04, rev: 0.5 });
    chord([72, 76, 79, 84], { at: 0.75, type: 'sine', a: 0.05, d: 1.4, vol: 0.04, rev: 0.8 });
    sparkle(0.75, 10);
  },
  faint() {
    tone({ f: 600, f2: 70, type: 'square', d: 0.9, vol: 0.05, lp: 1600, lp2: 300 });
    noise({ type: 'lowpass', f: 1500, f2: 100, a: 0.2, d: 0.7, vol: 0.18 });
  },
  /** Bips quand la barre de PV passe au rouge. */
  lowHp() { for (let i = 0; i < 4; i++) tone({ f: 1760, type: 'square', at: i * 0.16, d: 0.07, vol: 0.025, lp: 4000 }); },
  turn() { arp([79, 84], 0.09, { type: 'triangle', d: 0.25, vol: 0.05, rev: 0.4 }); },
  energy(type) {
    const base = { Feu: 62, Eau: 74, Plante: 67, Électrique: 86, Psy: 79, Combat: 55, Obscurité: 58, Métal: 81, Dragon: 64 }[type] ?? 72;
    arp([base + 12, base + 19, base + 24], 0.05, { type: 'sine', d: 0.25, vol: 0.05, rev: 0.5 });
  },
  /** Un Dresseur repère le joueur : courte fanfare avant le combat. */
  encounter() {
    noise({ type: 'bandpass', f: 300, f2: 4000, q: 0.8, a: 0.4, d: 0.1, vol: 0.2 });
    arp([76, 75, 76, 75, 76, 71, 74, 72, 69], 0.075, { type: 'square', d: 0.09, vol: 0.035, lp: 3200, at: 0.3 });
    chord([45, 57, 64, 69], { at: 1.0, type: 'sawtooth', lp: 1500, a: 0.01, d: 0.9, vol: 0.04, rev: 0.5 });
    boom(0.8, 1.0);
  },
  /** Attaque surpuissante : plan rapproché sur la carte. */
  cutin() {
    noise({ type: 'bandpass', f: 200, f2: 6000, q: 0.7, a: 0.25, d: 0.25, vol: 0.25 });
    chord([60, 67, 72], { at: 0.2, type: 'sawtooth', lp: 800, lp2: 5000, a: 0.05, d: 0.9, vol: 0.04, rev: 0.6 });
    tone({ f: 80, f2: 160, type: 'sawtooth', a: 0.4, d: 0.3, vol: 0.06, lp: 900 });
    sparkle(0.3, 8);
  },
  superEff() { arp([79, 84, 88], 0.06, { type: 'square', d: 0.15, vol: 0.035, lp: 4000 }); },
  zap() { noise({ type: 'highpass', f: 2500, d: 0.12, vol: 0.3 }); tone({ type: 'sawtooth', f: 1200, f2: 90, d: 0.18, vol: 0.06, lp: 5000 }); },
  /** Bruit d'attaque selon le type (avant l'impact). */
  attack(type) {
    switch (type) {
      case 'Feu': noise({ type: 'lowpass', f: 600, f2: 3000, a: 0.15, d: 0.5, vol: 0.3 }); break;
      case 'Eau': for (let i = 0; i < 8; i++) tone({ f: rnd(500, 1400), f2: rnd(1500, 2600), at: i * 0.05, d: 0.06, vol: 0.05 }); break;
      case 'Électrique': for (let i = 0; i < 6; i++) noise({ type: 'highpass', f: 3000, at: i * 0.06, d: 0.04, vol: 0.2 }); tone({ type: 'sawtooth', f: 80, f2: 160, d: 0.4, vol: 0.06, lp: 2000 }); break;
      case 'Psy': tone({ type: 'sine', f: 300, f2: 1200, a: 0.3, d: 0.3, vol: 0.08, rev: 0.6 }); tone({ type: 'sine', f: 310, f2: 1250, a: 0.3, d: 0.3, vol: 0.06 }); break;
      case 'Plante': noise({ type: 'bandpass', f: 2500, f2: 800, q: 3, d: 0.4, vol: 0.2 }); break;
      default: noise({ type: 'bandpass', f: 400, f2: 3000, q: 1.2, a: 0.1, d: 0.25, vol: 0.22 });
    }
  },
};

// ---------- Musique de combat (composition originale, jouée en direct) ----------
// La mineur, 150 BPM, 4 mesures en boucle : basse, arpèges, batterie.
const STEP = 60 / 150 / 4;
const CHORDS = [[57, 60, 64], [53, 57, 60], [55, 59, 62], [52, 56, 59]]; // Am, F, G, E
const LEAD = [0, 1, 2, 1, 2, 3, 2, 1];
let music = null;

function musicStep(step, t) {
  const c = ctx, bar = Math.floor(step / 16) % 4, s16 = step % 16, chord = CHORDS[bar];
  const at = t - c.currentTime, bus = music.bus;
  // Batterie
  if (s16 % 8 === 0) tone({ f: 130, f2: 42, at, d: 0.16, vol: 0.5, bus });
  if (s16 % 8 === 4) noise({ type: 'bandpass', f: 1800, q: 0.8, at, d: 0.12, vol: 0.22, bus });
  if (s16 % 2 === 0) noise({ type: 'highpass', f: 7000, at, d: 0.03, vol: s16 % 4 ? 0.05 : 0.08, bus });
  // Basse : croches avec saut d'octave
  if (s16 % 2 === 0) tone({ f: midi(chord[0] - 24 + (s16 % 4 ? 12 : 0)), type: 'triangle', at, d: STEP * 1.8, vol: 0.2, bus });
  // Arpèges
  const k = LEAD[s16 % 8], note = chord[k % 3] + 12 + (k >= 3 ? 12 : 0) + (s16 >= 8 && bar % 2 ? 12 : 0);
  tone({ f: midi(note), type: 'square', at, d: STEP * 0.9, vol: 0.022, lp: 2600, bus });
  // Mélodie longue sur les temps forts
  if (s16 === 0) tone({ f: midi(chord[2] + 24), type: 'sawtooth', at, a: 0.02, d: STEP * 7, vol: 0.02, lp: 1800, bus });
  if (s16 === 8) tone({ f: midi(chord[1] + 24), type: 'sawtooth', at, a: 0.02, d: STEP * 7, vol: 0.02, lp: 1800, bus });
}

export const bgm = {
  start() {
    if (music) return;
    const c = audio(); if (!c) return;
    const bus = c.createGain(); bus.gain.value = 0.45; bus.connect(out);
    music = { bus, step: 0, next: c.currentTime + 0.15 };
    music.timer = setInterval(() => {
      if (!on || !music) return;
      while (music.next < ctx.currentTime + 0.3) {
        musicStep(music.step, music.next);
        music.next += STEP;
        music.step = (music.step + 1) % 64;
      }
    }, 60);
  },
  stop() {
    if (!music) return;
    clearInterval(music.timer);
    const { bus } = music;
    bus.gain.setTargetAtTime(0, ctx.currentTime, 0.2);
    setTimeout(() => bus.disconnect(), 1200);
    music = null;
  },
};

/** Bouton son / muet de la barre du haut. */
function soundButton() {
  const btn = document.getElementById('sfx-btn');
  if (!btn) return;
  const show = () => {
    btn.innerHTML = icon(on ? 'volume-2' : 'volume-x');
    btn.title = on ? 'Son activé (clic pour couper)' : 'Son coupé (clic pour activer)';
    btn.setAttribute('aria-label', btn.title);
    btn.classList.toggle('off', !on);
  };
  btn.addEventListener('click', () => {
    on = !on;
    try { localStorage.setItem(KEY, on ? 'on' : 'off'); } catch { /* stockage indisponible */ }
    if (!on && ctx) ctx.suspend();
    show();
    sfx.click();
  });
  show();
}

// Petits bruits d'interface : clic sur les boutons et liens, survol des cartes et des boosters.
const CLICKABLE = '.btn, .topbar nav a, .seg button, .pick, .game-tabs a, .theme-btn:not(#sfx-btn), .account-pill, .see-all, .back, .value-pill';
document.addEventListener('click', e => {
  if (e.target.closest?.(CLICKABLE)) sfx.click();
  else if (e.target.closest?.('.set-tile, .binder, .deck-tile, .set-line, .dex-entry')) sfx.whoosh(0.08);
}, true);
let hovered = null;
document.addEventListener('pointerover', e => {
  if (e.pointerType !== 'mouse') return;
  const el = e.target.closest?.('.set-tile, .thumb, .sc3d, .btn.primary');
  if (el && el !== hovered) sfx.hover();
  hovered = el;
});

soundButton();
