# Actions manuelles

Créé le 16.11.26. À faire dans l'ordre. Coche au fur et à mesure.

Durée totale : 30 à 40 minutes.

## A. Serveur Supabase

Tableau de bord : https://supabase.com/dashboard/project/sixqffwcfapinsdzfbxh

- [ ] **A1. Exécuter les deux migrations SQL, dans l'ordre.**
  1. Sur GitHub, ouvre `supabase/migrations/0001_schema_initial.sql`, clique sur « Raw », sélectionne tout, copie.
  2. Dans Supabase : menu de gauche, « SQL Editor », « New query ».
  3. Colle, clique sur « Run ». Supabase affiche un avertissement sur une opération destructive (à cause des `revoke`) : confirme.
  4. Résultat attendu : « Success. No rows returned ».
  5. Recommence les étapes 1 à 4 avec `supabase/migrations/0002_vider_corbeille.sql` (dans une nouvelle requête).
  6. N'exécute chaque fichier qu'une fois. Une seconde exécution échoue sur « already exists », sans dégât.

- [ ] **A2. Vérifier la RLS.**
  1. « New query », colle le contenu de `supabase/migrations/verification.sql`, « Run ».
  2. Résultat attendu : 7 lignes, toutes avec `rls_active = true` ; 4 politiques pour chaque table sauf `atlante_migrations` (0).
  3. Autre contrôle : menu « Advisors », « Security Advisor » ne doit signaler aucune table sans RLS.

- [ ] **A3. Régler les adresses de retour des e-mails.**
  1. « Authentication », « URL Configuration ».
  2. Site URL : `https://franckscom.github.io/atlante/`
  3. Redirect URLs, « Add URL » : `https://franckscom.github.io/atlante/`
  4. « Save ».

- [ ] **A4. Vérifier la connexion par e-mail.** « Authentication », « Sign In / Providers » : « Email » activé, « Confirm email » activé. Aucun autre fournisseur activé.

## B. GitHub

- [ ] **B1. Activer GitHub Pages.** Dépôt `atlante`, « Settings », « Pages », « Build and deployment », Source : « GitHub Actions ».

- [ ] **B2. Fusionner le code dans `main`.** Demande-moi « crée la pull request » (je ne le fais pas sans ton accord), ou fais-le toi-même : onglet « Pull requests », « New pull request », base `main`, compare `claude/atlante-knowledge-base-5n6ocf`, « Create pull request », puis « Merge pull request ».

- [ ] **B3. Vérifier le déploiement.** Onglet « Actions » : l'exécution « Tests et déploiement » sur `main` doit finir en vert (2 à 3 minutes). Puis ouvre https://franckscom.github.io/atlante/.

## C. Compte

- [ ] **C1. Créer ton compte.** Dans l'app : « Réglages », « Créer un compte », e-mail et mot de passe (10 caractères au moins). Mot de passe et connexion : toujours toi.
- [ ] **C2. Confirmer l'e-mail.** Clique sur le lien reçu. Il ramène à l'app. Le serveur d'e-mails intégré de Supabase est limité à quelques messages par heure : si rien n'arrive, regarde les indésirables avant de recommencer.
- [ ] **C3. Se connecter.** « Réglages », e-mail et mot de passe. L'indicateur en haut à droite passe à « Synchronisé ».
- [ ] **C4. Désactiver les inscriptions.** Supabase, « Authentication », « Sign In / Providers », désactive « Allow new users to sign up », « Save ». À faire après C3, pas avant.
- [ ] **C5. Vérifier que les inscriptions sont fermées.** Dans une fenêtre de navigation privée, ouvre l'app, « Réglages », « Créer un compte » avec une autre adresse. Résultat attendu : « Les inscriptions sont désactivées sur ce serveur. »

## D. Tests que je n'ai pas pu faire à ta place

Ma session ne pouvait pas joindre Supabase (réseau fermé). Le SQL a été testé dans un PostgreSQL embarqué et le moteur de synchro contre lui, mais pas contre ton vrai projet.

- [ ] **D1. Synchro réelle.** Sur le PC, crée une fiche. Attends « Synchronisé ». Dans Supabase, « Table Editor », table `fiches` : la ligne est là, `owner_id` rempli.
- [ ] **D2. Deuxième appareil.** Sur le Mac ou l'iPhone, ouvre l'app, connecte-toi : la fiche arrive. Il doit y avoir 14 domaines, pas 28.
- [ ] **D3. Mise à jour et suppression.** Modifie la fiche sur l'appareil 2 : le changement arrive sur le 1 (clique sur « Synchroniser maintenant » ou reviens sur l'onglet). Supprime-la sur le 1 : elle disparaît du 2 et ne revient pas.
- [ ] **D4. Conflit.** Coupe le réseau des deux appareils. Modifie le contenu de la même fiche des deux côtés, différemment. Rétablis le réseau sur le 1, attends « Synchronisé », puis sur le 2. Résultat attendu sur le 2 : indicateur « 1 conflit », écran avec les deux versions. Choisis-en une et vérifie qu'elle s'impose sur les deux appareils.
- [ ] **D5. Accès anonyme fermé.** Dans un terminal, sans être connecté :

  ```bash
  curl "https://sixqffwcfapinsdzfbxh.supabase.co/rest/v1/fiches?select=*" -H "apikey: sb_publishable_kNLCBP67Zjs8luWKEAC66g_WKlgjF9a"
  ```

  Résultat attendu : une erreur « permission denied » ou une liste vide `[]`. Jamais tes fiches.
- [ ] **D6. Sauvegarde et restauration.** « Sauvegarde et exports » : crée la clé de secours, **imprime-la**, fais une sauvegarde. Puis teste la restauration du fichier avec le mot de passe (l'aperçu doit annoncer tout « identique »), et une fois avec la clé de secours.
- [ ] **D7. Vider la corbeille.** Crée une fiche d'essai, attends « Synchronisé », supprime-la. Sur le second appareil, vérifie qu'elle est dans la corbeille (« Réglages »). Sur le premier : « Réglages », « Vider la corbeille… », les deux étapes. Dans Supabase, « Table Editor », table `fiches` : la ligne a disparu. Sur le second appareil, après « Synchroniser maintenant », la corbeille est vide.
- [ ] **D8. Suppression de compte (facultatif, destructif).** À ne tester que si tu acceptes de refaire C1 à C4 : il faut rouvrir les inscriptions pour recréer le compte. Fais une sauvegarde avant.

### Si D1 échoue

- Indicateur « Erreur », détail « permission denied » ou « relation does not exist » : une migration de A1 n'a pas été exécutée, ou pas en entier. Refais A1, puis A2.
- Détail « schema must be one of… » ou erreur 404 sur `/rest/v1/` : dans Supabase, « Project Settings », « Data API », vérifie que l'API est activée et que le schéma `public` est exposé.
- « Serveur en pause ou injoignable » alors que le projet est actif : vérifie l'URL du projet dans `src/config.ts`.
- Dans tous les cas : « Réglages », « Synchronisation », « Détail technique », et envoie-moi le message affiché.

## E. iPhone

- [ ] **E1. Installer.** Safari, https://franckscom.github.io/atlante/, bouton Partager, « Sur l'écran d'accueil ». Ouvre l'app depuis l'icône et connecte-toi (l'app installée a son propre stockage, distinct de Safari).
- [ ] **E2. Hors ligne.** Mode avion, ferme l'app, rouvre-la : elle démarre, les fiches sont là, l'indicateur affiche « Hors ligne ». Crée une note, désactive le mode avion : elle part.
- [ ] **E3. Stockage persistant.** « Sauvegarde et exports », bloc « Stockage sur cet appareil » : note ce que l'app affiche (accordé ou non).
- [ ] **E4. Import.** « Import », choisis un fichier .txt ou .md depuis l'app Fichiers.
- [ ] **E5. Sauvegarde.** « Sauvegarder maintenant » : la feuille de partage doit proposer « Enregistrer dans Fichiers ».
- [ ] **E6. Préparer pour Claude.** Sur une fiche, appuie sur le bouton, colle dans l'app Claude.
- [ ] **E7. Mot de passe oublié.** Le lien reçu par e-mail s'ouvre dans Safari, pas dans l'app installée : choisis le nouveau mot de passe dans Safari, puis connecte-toi dans l'app avec.

Si un de ces points échoue, note lequel et ce qui s'affiche : c'est une correction à demander.

## F. RGPD

- [ ] **F1. Lire et accepter le DPA de Supabase.** Voir RGPD.md, section 4. Garde une copie datée du document.
- [ ] **F2. Compléter RGPD.md** avec la date d'acceptation du DPA.

## G. Habitudes

- [ ] Ouvrir l'app au moins une fois par semaine (évite la pause de Supabase).
- [ ] Une sauvegarde chiffrée par semaine, rangée hors de l'appareil. L'app te le rappelle au-delà de 7 jours.
