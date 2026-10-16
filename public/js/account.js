// Page « Mon compte » : connexion, inscription et état de la synchronisation.
import { cloudEnabled, currentUser, pseudo, status, onCloudChange, signIn, signUp, signOut, resetPassword, updatePassword, syncNow } from './cloud.js';
import { getState } from './store.js';
import { app, esc } from './ui.js';
import { icon } from './icons.js';

const timeAgo = t => {
  if (!t) return 'jamais';
  const s = Math.round((Date.now() - t) / 1000);
  if (s < 10) return 'à l\'instant';
  if (s < 60) return `il y a ${s} s`;
  if (s < 3600) return `il y a ${Math.round(s / 60)} min`;
  return new Date(t).toLocaleString('fr-FR');
};

/** Bouton du compte dans la barre du haut. */
export function accountBadge() {
  const pill = document.getElementById('account-pill');
  const draw = () => {
    const user = currentUser();
    pill.classList.toggle('in', Boolean(user));
    pill.classList.toggle('warn', Boolean(user && status.error));
    pill.innerHTML = user
      ? `<span class="avatar">${esc(pseudo().slice(0, 1).toUpperCase())}</span><span class="who">${esc(pseudo())}</span>`
      : 'Se connecter';
    pill.title = user ? (status.error ? `Synchro en erreur : ${status.error}` : 'Collection sauvegardée en ligne') : 'Sauvegarde ta collection en ligne';
  };
  draw();
  onCloudChange(() => {
    draw();
    if (location.hash.startsWith('#/compte') && !app.querySelector('form :focus')) viewAccount();
  });
}

function localSummary() {
  const st = getState();
  const cards = Object.values(st.collection).reduce((s, set) => s + Object.values(set).reduce((a, n) => a + n, 0), 0);
  const packs = Object.values(st.totalPacks).reduce((s, n) => s + n, 0);
  return `${cards} cartes · ${packs} boosters ouverts · ${Object.keys(st.decks).length} deck(s)`;
}

export async function viewAccount() {
  if (!cloudEnabled) {
    app.innerHTML = `
      <section class="page narrow">
        <h1>Mon compte</h1>
        <div class="panel">
          <p><b>Les comptes ne sont pas encore activés sur ce site.</b></p>
          <p class="muted">Ta collection est enregistrée dans ce navigateur (${esc(localSummary())}).
          Pour la retrouver sur tous tes appareils, l'administrateur du site doit relier un projet Supabase
          (voir « Comptes en ligne » dans le README).</p>
        </div>
      </section>`;
    return;
  }

  const user = currentUser();
  if (user && status.recovery) return viewNewPassword();
  if (user) {
    app.innerHTML = `
      <section class="page narrow">
        <h1>Mon compte</h1>
        <div class="panel account-card">
          <span class="avatar big">${esc(pseudo().slice(0, 1).toUpperCase())}</span>
          <div>
            <h2>${esc(pseudo())}</h2>
            <p class="muted">${esc(user.email)}</p>
          </div>
        </div>
        <div class="panel">
          <h3>Sauvegarde en ligne</h3>
          <p>${status.syncing ? `${icon('hourglass')} Synchronisation…` : status.error ? `${icon('triangle-alert')} <span class="bad">${esc(status.error)}</span>` : `${icon('circle-check')} Collection sauvegardée — ${timeAgo(status.lastSync)}`}</p>
          <p class="muted">${esc(localSummary())}. Chaque booster ouvert est enregistré automatiquement :
          connecte-toi avec le même compte sur ton téléphone ou un autre ordinateur pour retrouver ta collection.</p>
          <div class="row-btns">
            <button class="btn" data-sync ${status.syncing ? 'disabled' : ''}>Synchroniser maintenant</button>
            <button class="btn ghost" data-logout>Se déconnecter</button>
          </div>
        </div>
      </section>`;
    app.querySelector('[data-sync]').addEventListener('click', () => syncNow());
    app.querySelector('[data-logout]').addEventListener('click', async () => { await signOut(); viewAccount(); });
    return;
  }

  let mode = 'login';
  const draw = (msg = '', isError = false) => {
    app.innerHTML = `
      <section class="page narrow">
        <h1>${mode === 'signup' ? 'Créer un compte' : mode === 'forgot' ? 'Mot de passe oublié' : 'Se connecter'}</h1>
        <p class="muted">Ton compte sauvegarde ta collection, tes stats et tes decks en ligne : tu ne perds plus rien,
        même si tu vides ton navigateur ou changes d'appareil. Ce qui est déjà sur cet appareil (${esc(localSummary())}) est ajouté au compte.</p>
        <form class="panel auth-form" novalidate>
          ${mode === 'signup' ? '<label>Pseudo<input name="name" required maxlength="24" autocomplete="nickname"></label>' : ''}
          <label>E-mail<input name="email" type="email" required autocomplete="email"></label>
          ${mode !== 'forgot' ? `<label>Mot de passe<input name="password" type="password" required minlength="6" autocomplete="${mode === 'signup' ? 'new-password' : 'current-password'}"></label>` : ''}
          ${msg ? `<p class="${isError ? 'bad' : 'good'}">${esc(msg)}</p>` : ''}
          <button class="btn primary" type="submit">${mode === 'signup' ? 'Créer mon compte' : mode === 'forgot' ? 'Recevoir un lien' : 'Se connecter'}</button>
          <p class="auth-links">
            ${mode !== 'login' ? '<a href="#" data-mode="login">J\'ai déjà un compte</a>' : '<a href="#" data-mode="signup">Créer un compte</a> · <a href="#" data-mode="forgot">Mot de passe oublié ?</a>'}
          </p>
        </form>
      </section>`;
    const form = app.querySelector('form');
    form.querySelectorAll('[data-mode]').forEach(a => a.addEventListener('click', e => { e.preventDefault(); mode = a.dataset.mode; draw(); }));
    form.addEventListener('submit', async e => {
      e.preventDefault();
      const f = Object.fromEntries(new FormData(form));
      const btn = form.querySelector('[type=submit]');
      btn.disabled = true;
      try {
        if (mode === 'signup') {
          if (!f.name.trim()) throw new Error('Choisis un pseudo.');
          const { needsConfirm } = await signUp(f.email.trim(), f.password, f.name.trim());
          if (needsConfirm) { mode = 'login'; return draw('Compte créé ! Clique sur le lien reçu par e-mail pour l\'activer, puis connecte-toi.'); }
        } else if (mode === 'forgot') {
          await resetPassword(f.email.trim());
          return draw('Si un compte existe pour cet e-mail, un lien pour changer le mot de passe vient d\'être envoyé.');
        } else {
          await signIn(f.email.trim(), f.password);
        }
      } catch (err) {
        draw(err.message, true);
      }
    });
  };
  draw();
}

function viewNewPassword() {
  app.innerHTML = `
    <section class="page narrow">
      <h1>Nouveau mot de passe</h1>
      <form class="panel auth-form">
        <label>Nouveau mot de passe<input name="password" type="password" required minlength="6" autocomplete="new-password"></label>
        <p class="msg"></p>
        <button class="btn primary" type="submit">Enregistrer</button>
      </form>
    </section>`;
  const form = app.querySelector('form');
  form.addEventListener('submit', async e => {
    e.preventDefault();
    try {
      await updatePassword(new FormData(form).get('password'));
      viewAccount();
    } catch (err) {
      form.querySelector('.msg').className = 'bad';
      form.querySelector('.msg').textContent = err.message;
    }
  });
}
