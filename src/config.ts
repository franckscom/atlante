// Réglages de l'app.
//
// La clé ci-dessous est la clé PUBLIQUE (« publishable ») de Supabase. Elle a le droit
// d'être dans le code et dans un dépôt public : à elle seule, elle ne donne accès à rien,
// car chaque table est protégée par la Row Level Security (voir supabase/migrations).
// La clé SECRÈTE (« service_role » ou « secret ») ne doit JAMAIS apparaître ici.
export const SUPABASE_URL = 'https://sixqffwcfapinsdzfbxh.supabase.co';
export const SUPABASE_CLE_PUBLIQUE = 'sb_publishable_kNLCBP67Zjs8luWKEAC66g_WKlgjF9a';

// Adresse du tableau de bord, pour réactiver le projet s'il est en pause.
export const SUPABASE_TABLEAU_DE_BORD = 'https://supabase.com/dashboard/project/sixqffwcfapinsdzfbxh';

export const VERSION_APP = '1.0.0';

// Alerte si la dernière sauvegarde chiffrée date de plus de 7 jours.
export const JOURS_ALERTE_SAUVEGARDE = 7;
