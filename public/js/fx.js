// Effets visuels : fond étoilé animé, particules (explosions, étincelles), flashs, ondes de choc,
// inclinaison 3D des cartes et apparitions au défilement.

const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const isLight = () => document.documentElement.dataset.theme === 'light';
const rnd = (a, b) => a + Math.random() * (b - a);
const TAU = Math.PI * 2;

/** Couleur de chaque rareté (0..5), partagée par les effets. */
export const TIER_COLOR = ['#cfe3ff', '#cfe3ff', '#8bb8ff', '#c58bff', '#ffd36b', '#ff8bd4'];
export const RAINBOW = ['#ff6b8b', '#ffd36b', '#7dffb0', '#6bc8ff', '#b98bff', '#ffffff'];

function fitCanvas(cv, g) {
  const dpr = Math.min(2, devicePixelRatio || 1);
  cv.width = innerWidth * dpr; cv.height = innerHeight * dpr;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
}

// ---------- Fond : poussière d'étoiles en 3D (parallaxe souris et défilement) ----------

function background() {
  const cv = document.createElement('canvas');
  cv.id = 'bg-fx';
  document.body.prepend(cv);
  const g = cv.getContext('2d');
  fitCanvas(cv, g);
  addEventListener('resize', () => fitCanvas(cv, g));
  const n = Math.round(Math.min(150, (innerWidth * innerHeight) / 11000));
  const HUES = [45, 320, 215, 190, 270];
  const stars = Array.from({ length: n }, (_, i) => ({
    x: Math.random(), y: Math.random(), z: 0.15 + Math.random() ** 1.6 * 0.85, tw: Math.random() * TAU, hue: HUES[i % HUES.length],
  }));
  let mx = 0, my = 0, tx = 0, ty = 0, last = performance.now();
  addEventListener('pointermove', e => { tx = e.clientX / innerWidth - 0.5; ty = e.clientY / innerHeight - 0.5; }, { passive: true });

  const frame = now => {
    const dt = Math.min(60, now - last) / 1000;
    last = now;
    mx += (tx - mx) * 0.04; my += (ty - my) * 0.04;
    const W = innerWidth, H = innerHeight, light = isLight(), sy = scrollY;
    g.clearRect(0, 0, W, H);
    for (const s of stars) {
      s.y -= dt * 0.01 * s.z;
      if (s.y < -0.02) { s.y = 1.02; s.x = Math.random(); }
      s.tw += dt * (0.8 + s.z * 2);
      const px = ((s.x * W - mx * 70 * s.z) % W + W) % W;
      const py = ((s.y * H - sy * 0.2 * s.z - my * 50 * s.z) % H + H) % H;
      const a = (0.2 + 0.6 * s.z) * (0.55 + 0.45 * Math.sin(s.tw));
      const r = 0.4 + s.z * 1.7;
      if (s.z > 0.75) {
        g.fillStyle = light ? `hsl(${s.hue} 80% 55% / ${a * 0.08})` : `hsl(${s.hue} 100% 75% / ${a * 0.14})`;
        g.beginPath(); g.arc(px, py, r * 5, 0, TAU); g.fill();
      }
      g.fillStyle = light ? `hsl(${s.hue} 60% 40% / ${a * 0.4})` : `hsl(${s.hue} 100% 88% / ${a})`;
      g.beginPath(); g.arc(px, py, r, 0, TAU); g.fill();
    }
    if (!reduced) requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

// ---------- Particules par-dessus la page ----------

let ov, og, running = false, lastT = 0;
const parts = [];

function overlay() {
  if (ov) return;
  ov = document.createElement('canvas');
  ov.id = 'fx-layer';
  document.body.append(ov);
  og = ov.getContext('2d');
  fitCanvas(ov, og);
  addEventListener('resize', () => fitCanvas(ov, og));
}

function star(g, x, y, r) {
  g.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU, rr = i % 2 ? r * 0.28 : r;
    g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  g.closePath(); g.fill();
}

function loop(now) {
  const k = Math.min(3, (now - lastT) / 16.7 || 1);
  lastT = now;
  og.clearRect(0, 0, innerWidth, innerHeight);
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i];
    p.life -= k;
    if (p.life <= 0) { parts.splice(i, 1); continue; }
    if (p.target) { // aspiration vers un point (charge d'une carte rare)
      p.x += (p.target.x - p.x) * 0.06 * k; p.y += (p.target.y - p.y) * 0.06 * k;
    } else {
      p.vx *= p.drag ** k; p.vy = p.vy * p.drag ** k + p.gravity * k;
      p.x += p.vx * k; p.y += p.vy * k;
    }
    p.rot += p.vr * k;
    const t = p.life / p.max;
    og.globalAlpha = Math.min(1, t * 2);
    og.fillStyle = og.strokeStyle = p.color;
    og.globalCompositeOperation = p.shape === 'confetti' ? 'source-over' : 'lighter';
    if (p.shape === 'spark') {
      og.lineWidth = p.size * t + 0.5;
      og.beginPath(); og.moveTo(p.x, p.y); og.lineTo(p.x - p.vx * 2.6, p.y - p.vy * 2.6); og.stroke();
    } else if (p.shape === 'star') {
      star(og, p.x, p.y, p.size * (0.6 + t));
    } else if (p.shape === 'confetti') {
      og.save(); og.translate(p.x, p.y); og.rotate(p.rot);
      og.scale(1, Math.cos(p.rot * 2.3));
      og.fillRect(-p.size, -p.size * 0.6, p.size * 2, p.size * 1.2);
      og.restore();
    } else {
      og.beginPath(); og.arc(p.x, p.y, p.size * t + 0.3, 0, TAU); og.fill();
    }
  }
  og.globalAlpha = 1;
  og.globalCompositeOperation = 'source-over';
  if (parts.length) requestAnimationFrame(loop);
  else running = false;
}

function spawn(p) {
  overlay();
  parts.push({ drag: 0.96, gravity: 0.18, rot: rnd(0, TAU), vr: rnd(-0.3, 0.3), ...p, max: p.life });
  if (!running) { running = true; lastT = performance.now(); requestAnimationFrame(loop); }
}

const pick = list => list[Math.floor(Math.random() * list.length)];

/** Explosion de particules autour d'un point de l'écran. */
export function burst(x, y, { n = 60, colors = ['#fff'], speed = 9, gravity = 0.18, life = 70, size = 3, shapes = ['spark', 'dot'], angle = -Math.PI / 2, spread = TAU, drag = 0.95 } = {}) {
  if (reduced) n = Math.min(n, 12);
  for (let i = 0; i < n; i++) {
    const a = angle + rnd(-spread / 2, spread / 2), v = rnd(0.25, 1) * speed;
    spawn({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: rnd(0.6, 1) * life, color: pick(colors), size: rnd(0.6, 1.4) * size, shape: pick(shapes), gravity, drag });
  }
}

/** Petites étincelles (découpe du booster). */
export const sparks = (x, y, color) => burst(x, y, { n: 5, colors: ['#fff', color], speed: 5, life: 28, size: 2, gravity: 0.35, shapes: ['spark'] });

/** Particules aspirées vers un point pendant `ms` millisecondes. */
export function converge(x, y, { colors = ['#fff'], ms = 1000, rate = 4 } = {}) {
  if (reduced) return;
  const end = performance.now() + ms;
  const tick = () => {
    for (let i = 0; i < rate; i++) {
      const a = rnd(0, TAU), d = rnd(140, 280);
      spawn({ x: x + Math.cos(a) * d, y: y + Math.sin(a) * d, vx: 0, vy: 0, life: 40, color: pick(colors), size: rnd(1.5, 3), shape: Math.random() < 0.3 ? 'star' : 'dot', target: { x, y } });
    }
    if (performance.now() < end) requestAnimationFrame(tick);
  };
  tick();
}

/** Pluie de confettis sur toute la largeur de l'écran. */
export function confettiRain(colors = RAINBOW, n = 140) {
  if (reduced) return;
  for (let i = 0; i < n; i++) {
    spawn({ x: rnd(0, innerWidth), y: rnd(-120, -10), vx: rnd(-1.5, 1.5), vy: rnd(1, 4), life: rnd(140, 220), color: pick(colors), size: rnd(3, 6), shape: 'confetti', gravity: 0.06, drag: 0.99, vr: rnd(-0.15, 0.15) });
  }
}

/** Centre d'un élément à l'écran. */
export function center(el) {
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

// ---------- Flash et onde de choc ----------

export function flash(color = '#fff', strength = 0.8, ms = 600) {
  const d = document.createElement('div');
  d.className = 'fx-flash';
  d.style.cssText = `--fc:${color};--fo:${strength};--fd:${ms}ms`;
  document.body.append(d);
  setTimeout(() => d.remove(), ms + 50);
}

export function shockwave(x, y, color = '#fff', { size = 220, ms = 700 } = {}) {
  const d = document.createElement('div');
  d.className = 'fx-ring';
  d.style.cssText = `left:${x}px;top:${y}px;--fc:${color};--fs:${size}px;--fd:${ms}ms`;
  document.body.append(d);
  setTimeout(() => d.remove(), ms + 50);
}

/** Éclat lumineux horizontal (lens flare) à la hauteur d'un point. */
export function flare(y, color = '#fff', ms = 900) {
  const d = document.createElement('div');
  d.className = 'fx-flare';
  d.style.cssText = `top:${y}px;--fc:${color};--fd:${ms}ms`;
  document.body.append(d);
  setTimeout(() => d.remove(), ms + 50);
}

// ---------- Inclinaison 3D + reflet holographique au survol ----------

const TILT = '.thumb, .set-tile, .binder, .deck-tile, .sc3d-stage';
let cur = null, ev = null, raf = 0;

function resetTilt(el) {
  if (!el) return;
  el.classList.remove('tilting');
  for (const p of ['--rx', '--ry', '--mx', '--my']) el.style.removeProperty(p);
}

function applyTilt() {
  raf = 0;
  const el = ev?.target.closest?.(TILT) ?? null;
  if (el !== cur) { resetTilt(cur); cur = el; }
  if (!el) return;
  const r = el.getBoundingClientRect();
  const x = Math.min(1, Math.max(0, (ev.clientX - r.left) / r.width));
  const y = Math.min(1, Math.max(0, (ev.clientY - r.top) / r.height));
  el.style.setProperty('--rx', `${((0.5 - y) * 16).toFixed(2)}deg`);
  el.style.setProperty('--ry', `${((x - 0.5) * 18).toFixed(2)}deg`);
  el.style.setProperty('--mx', `${(x * 100).toFixed(1)}%`);
  el.style.setProperty('--my', `${(y * 100).toFixed(1)}%`);
  el.classList.add('tilting');
}

document.addEventListener('pointermove', e => {
  if (e.pointerType !== 'mouse' || reduced) return;
  ev = e;
  raf ||= requestAnimationFrame(applyTilt);
}, { passive: true });
document.addEventListener('pointerleave', () => { resetTilt(cur); cur = null; });

// ---------- Apparition au défilement ----------
// Les éléments glissent en douceur quand ils entrent à l'écran (ajoutés automatiquement après chaque page).

const RV = '.hero, .game, .set-tile, .binder, .kpis > div, .deck-tile, .set-line, .dex-entry, .grid:not(.pool-grid) > .thumb, .card-cell, .pick, .panel, .chart, .table, .page-head, .toolbar';
const io = 'IntersectionObserver' in window && !reduced && new IntersectionObserver(entries => {
  let k = 0;
  for (const e of entries) {
    if (!e.isIntersecting) continue;
    e.target.style.setProperty('--rv-d', `${Math.min(k++, 14) * 35}ms`);
    e.target.classList.add('rv-in');
    io.unobserve(e.target);
  }
}, { rootMargin: '0px 0px -4% 0px' });

function revealIn(root) {
  if (!io) return;
  const els = root.matches?.(RV) ? [root] : [];
  els.push(...root.querySelectorAll(RV));
  for (const el of els) {
    if (el.classList.contains('rv')) continue;
    el.classList.add('rv');
    io.observe(el);
  }
}

// ---------- Démarrage ----------

background();
const app = document.getElementById('app');
if (io && app) {
  let queued = new Set();
  new MutationObserver(list => {
    for (const m of list) for (const n of m.addedNodes) if (n.nodeType === 1) queued.add(n);
    requestAnimationFrame(() => {
      const nodes = queued; queued = new Set();
      nodes.forEach(n => n.isConnected && revealIn(n));
    });
  }).observe(app, { childList: true, subtree: true });
}
