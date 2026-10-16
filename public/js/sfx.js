// Effets sonores fabriqués dans le navigateur (Web Audio) : aucun fichier à télécharger.
// Bouton 🔊 / 🔇 dans la barre du haut, choix enregistré dans le navigateur.

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

function send(node, rev, pan) {
  let n = node;
  if (pan && ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = pan; n.connect(p); n = p; }
  n.connect(out);
  if (rev) { const s = ctx.createGain(); s.gain.value = rev; n.connect(s); s.connect(wet); }
}

/** Note : oscillateur + enveloppe, glissando (f2) et filtre passe-bas (lp → lp2) facultatifs. */
function tone({ f = 440, f2, type = 'sine', at = 0, a = 0.005, d = 0.2, vol = 0.2, rev = 0, pan = 0, detune = 0, lp, lp2 } = {}) {
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
  src.connect(g); send(g, rev, pan);
  o.start(t); o.stop(t + a + d + 0.05);
}

/** Bruit filtré : déchirures, souffles, impacts. */
function noise({ at = 0, a = 0.005, d = 0.2, vol = 0.2, type = 'bandpass', f = 1000, f2, q = 1, rev = 0, pan = 0 } = {}) {
  const c = audio(); if (!c) return;
  const t = c.currentTime + at;
  const src = c.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
  const fl = c.createBiquadFilter(); fl.type = type; fl.Q.value = q;
  fl.frequency.setValueAtTime(f, t);
  if (f2) fl.frequency.exponentialRampToValueAtTime(f2, t + a + d);
  const g = c.createGain(); envelope(g, t, vol, a, d);
  src.connect(fl).connect(g); send(g, rev, pan);
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
};

/** Bouton 🔊 / 🔇 de la barre du haut. */
function soundButton() {
  const btn = document.getElementById('sfx-btn');
  if (!btn) return;
  const show = () => {
    btn.textContent = on ? '🔊' : '🔇';
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
