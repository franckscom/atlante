// Connexion à Supabase : le client et les fonctions de compte.
import { createClient } from '@supabase/supabase-js';
import { SUPABASE_CLE_PUBLIQUE, SUPABASE_URL } from '../config';

/**
 * Les liens envoyés par e-mail (confirmation, mot de passe oublié) ramènent à l'app avec des
 * paramètres après le « # ». On note leur nature AVANT que Supabase ne les lise et ne les efface.
 */
const diese = typeof window !== 'undefined' ? window.location.hash : '';
export const retourLienEmail = {
  present: /access_token=|error_description=|error=/.test(diese),
  recuperation: /type=recovery/.test(diese),
  erreur: /error_description=([^&]+)/.exec(diese)?.[1]?.replace(/\+/g, ' ') ?? null,
};

export const supabase = createClient(SUPABASE_URL, SUPABASE_CLE_PUBLIQUE, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});

/** Adresse publique de l'app, utilisée comme adresse de retour dans les e-mails. */
export function adresseApp(): string {
  return window.location.origin + import.meta.env.BASE_URL;
}

export async function connecter(email: string, motDePasse: string) {
  const { error } = await supabase.auth.signInWithPassword({ email, password: motDePasse });
  if (error) throw error;
}

export async function creerCompte(email: string, motDePasse: string): Promise<'connecte' | 'confirmer_email'> {
  const { data, error } = await supabase.auth.signUp({ email, password: motDePasse, options: { emailRedirectTo: adresseApp() } });
  if (error) throw error;
  return data.session ? 'connecte' : 'confirmer_email';
}

export async function deconnecter() {
  // « local » : ferme la session sur cet appareil seulement, et fonctionne même hors ligne.
  await supabase.auth.signOut({ scope: 'local' });
}

export async function demanderNouveauMotDePasse(email: string) {
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: adresseApp() });
  if (error) throw error;
}

export async function changerMotDePasse(nouveau: string) {
  const { error } = await supabase.auth.updateUser({ password: nouveau });
  if (error) throw error;
}

/** Droit à l'effacement : supprime le compte et toutes ses données sur le serveur. */
export async function supprimerCompteServeur() {
  const { error } = await supabase.rpc('supprimer_mon_compte');
  if (error) throw error;
}

/** Traduit les messages d'erreur les plus courants de Supabase Auth. */
export function messageErreurCompte(e: unknown): string {
  const m = e instanceof Error ? e.message : String(e);
  if (/Invalid login credentials/i.test(m)) return 'E-mail ou mot de passe incorrect.';
  if (/Email not confirmed/i.test(m)) return "Adresse e-mail pas encore confirmée : clique sur le lien reçu par e-mail.";
  if (/Signups not allowed|signup is disabled/i.test(m)) return 'Les inscriptions sont désactivées sur ce serveur.';
  if (/already registered/i.test(m)) return 'Un compte existe déjà avec cette adresse.';
  if (/Password should be/i.test(m)) return 'Mot de passe trop court ou trop simple.';
  if (/rate limit|too many/i.test(m)) return 'Trop de tentatives. Réessaie dans quelques minutes.';
  if (/fetch|network/i.test(m)) return 'Serveur injoignable : pas de connexion, ou projet Supabase en pause.';
  return m;
}
