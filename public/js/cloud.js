// Compte en ligne : connexion Supabase et synchronisation de la sauvegarde entre appareils.
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';
import { getState, mergeStates, onSave, replaceState } from './store.js';

export const cloudEnabled = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

let client, user = null, pushTimer = null;
const listeners = new Set();
export const status = { syncing: false, lastSync: 0, error: '', recovery: false };

/** Prévient l'interface quand la connexion ou la synchro change. */
export const onCloudChange = fn => listeners.add(fn);
const emit = () => { for (const fn of listeners) fn({ user, ...status }); };

async function sb() {
  if (!client) {
    const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm');
    // PKCE : le retour des liens e-mail se fait par ?code=… et ne gêne pas le routeur (#/…).
    client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { flowType: 'pkce' } });
  }
  return client;
}

export const currentUser = () => user;
export const pseudo = () => user?.user_metadata?.pseudo ?? user?.email?.split('@')[0] ?? '';

/** Récupère la sauvegarde du compte, la fusionne avec celle de l'appareil, puis renvoie le résultat en ligne. */
export async function syncNow() {
  if (!user) return;
  status.syncing = true; status.error = ''; emit();
  try {
    const db = await sb();
    const { data, error } = await db.from('saves').select('data').eq('user_id', user.id).maybeSingle();
    if (error) throw error;
    const merged = data?.data ? mergeStates(getState(), data.data) : getState();
    replaceState(merged);
    await push();
    window.dispatchEvent(new Event('allstar:synced'));
  } catch (err) {
    status.error = err.message ?? String(err);
  }
  status.syncing = false; emit();
}

async function push() {
  if (!user) return;
  const db = await sb();
  const { error } = await db.from('saves').upsert({ user_id: user.id, data: getState(), updated_at: new Date().toISOString() });
  if (error) { status.error = error.message; throw error; }
  status.lastSync = Date.now(); status.error = '';
  emit();
}

// Chaque modification (booster ouvert, deck…) part en ligne après un court délai.
onSave(() => {
  if (!user) return;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(() => push().catch(() => {}), 1500);
});
window.addEventListener('pagehide', () => { if (pushTimer) { clearTimeout(pushTimer); push().catch(() => {}); } });

export async function initCloud() {
  if (!cloudEnabled) return;
  try {
    const db = await sb();
    const { data } = await db.auth.getSession();
    user = data.session?.user ?? null;
    emit();
    if (user) await syncNow();
    db.auth.onAuthStateChange((event, session) => {
      const was = user?.id;
      user = session?.user ?? null;
      if (event === 'PASSWORD_RECOVERY') { status.recovery = true; location.hash = '#/compte'; }
      emit();
      if (user && user.id !== was) syncNow();
    });
  } catch (err) {
    status.error = `Connexion au serveur impossible (${err.message})`;
    emit();
  }
}

const FR_ERRORS = [
  [/Invalid login credentials/i, 'E-mail ou mot de passe incorrect.'],
  [/Email not confirmed/i, 'Confirme d\'abord ton e-mail (clique sur le lien reçu).'],
  [/already registered/i, 'Un compte existe déjà avec cet e-mail : connecte-toi.'],
  [/Password should be at least/i, 'Le mot de passe doit faire au moins 6 caractères.'],
  [/rate limit/i, 'Trop d\'essais : réessaie dans quelques minutes.'],
  [/valid email|invalid format/i, 'Adresse e-mail invalide.'],
];
const fr = err => FR_ERRORS.find(([re]) => re.test(err.message))?.[1] ?? err.message;

export async function signUp(email, password, name) {
  const db = await sb();
  const { data, error } = await db.auth.signUp({
    email, password,
    options: { data: { pseudo: name }, emailRedirectTo: location.href.split('#')[0] + '#/compte' },
  });
  if (error) throw new Error(fr(error));
  return { needsConfirm: !data.session };
}

export async function signIn(email, password) {
  const db = await sb();
  const { error } = await db.auth.signInWithPassword({ email, password });
  if (error) throw new Error(fr(error));
}

export async function resetPassword(email) {
  const db = await sb();
  const { error } = await db.auth.resetPasswordForEmail(email, { redirectTo: location.href.split('#')[0] + '#/compte' });
  if (error) throw new Error(fr(error));
}

export async function updatePassword(password) {
  const db = await sb();
  const { error } = await db.auth.updateUser({ password });
  if (error) throw new Error(fr(error));
  status.recovery = false;
  emit();
}

/** Déconnexion : la sauvegarde reste sur cet appareil et dans le compte. */
export async function signOut() {
  clearTimeout(pushTimer);
  await push().catch(() => {});
  const db = await sb();
  await db.auth.signOut();
  user = null;
  emit();
}
