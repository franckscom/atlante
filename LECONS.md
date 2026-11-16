# Leçons : comprendre Atlante brique par brique

Créé le 16.11.26. À lire avec le code ouvert à côté. Chaque brique suit le même plan : ce que c'est, pourquoi ce choix, ce qui resservira pour une app de PME, où regarder dans le code, une question pour vérifier que tu as compris (réponse en fin de document).

Ordre de lecture conseillé : 1, 2, 4, 5, 7, 8, puis le reste.

## Vue d'ensemble en une phrase

L'app écrit d'abord dans une base rangée dans le navigateur, puis recopie les changements vers un serveur PostgreSQL quand le réseau est là, et chaque ligne du serveur n'est visible que par son propriétaire.

## 1. React

**Ce que c'est.** Une bibliothèque JavaScript pour construire une interface à partir de composants. Un composant est une fonction qui reçoit des données et renvoie ce qu'il faut afficher. Quand les données changent, React redessine seul les parties concernées.

**Pourquoi ce choix.** C'est la bibliothèque la plus utilisée : documentation abondante, et Claude la connaît très bien, ce qui compte quand on apprend avec lui. TypeScript s'y ajoute : c'est JavaScript avec des types, c'est-à-dire que l'éditeur signale une erreur (un champ mal nommé, une valeur oubliée) avant même de lancer l'app.

**Réutilisable pour une PME.** Tout. Un formulaire de contact, un tableau de suivi, un écran de validation : ce sont des composants. Ceux d'Atlante (`Confirmation`, `SelecteurFiche`, `IndicateurSynchro`) se reprennent tels quels.

**Dans le code.** `src/ui/pages/PageDomaines.tsx` est le plus court : commence par lui. `useState` garde une valeur entre deux affichages ; `useDonnees()` donne les données de la base.

**Question 1.** Dans `PageDomaines.tsx`, après un clic sur « Ajouter », aucune ligne ne demande de réafficher la liste. Pourquoi le nouveau domaine apparaît-il quand même ?

## 2. Vite

**Ce que c'est.** L'outil qui transforme les fichiers sources (`src/`, en TypeScript, éclatés en dizaines de fichiers) en quelques fichiers compacts que le navigateur sait lire (`dist/`). En développement, il recharge la page à chaque enregistrement.

**Pourquoi ce choix.** Standard actuel, rapide, presque sans configuration : tout tient dans `vite.config.ts`.

**Réutilisable pour une PME.** La même base de projet pour toute app web. Le résultat (`dist/`) n'est que des fichiers statiques : n'importe quel hébergeur peut les servir, y compris gratuit.

**Dans le code.** `vite.config.ts`, `package.json` (rubrique `scripts`), `index.html`.

**Question 2.** Pourquoi `base: '/atlante/'` dans `vite.config.ts` ? Que se passerait-il sans cette ligne sur GitHub Pages ?

## 3. PWA et service worker

**Ce que c'est.** Une PWA (Progressive Web App) est un site qui s'installe comme une app : icône, plein écran, démarrage hors ligne. Deux pièces le permettent. Le manifeste décrit l'app (nom, icônes, couleurs). Le service worker est un petit programme que le navigateur garde en mémoire : il intercepte les demandes de fichiers et répond depuis son cache quand il n'y a pas de réseau.

**Pourquoi ce choix.** Une seule app pour Windows, Mac et iPhone, sans store, sans frais de publication. Le service worker est généré par `vite-plugin-pwa` : on ne l'écrit pas à la main.

**Réutilisable pour une PME.** Une app interne pour des commerciaux en déplacement ou un stand sans réseau. Limite à annoncer au client : sur iPhone, pas de synchro en arrière-plan, et l'installation se fait à la main par le menu Partager.

**Dans le code.** Bloc `VitePWA` de `vite.config.ts` ; `BandeauxGlobaux` dans `src/ui/App.tsx` pour le bouton « Mettre à jour ».

**Piège à connaître.** Le service worker met en cache l'app, pas les données. Les données sont dans IndexedDB (brique 4). Ce sont deux mécanismes séparés.

**Question 3.** Tu publies une correction. Un utilisateur ouvre l'app : il voit encore l'ancienne version. Est-ce un bug ? Que doit-il faire ?

## 4. IndexedDB et Dexie

**Ce que c'est.** IndexedDB est une base de données intégrée à tous les navigateurs, rangée sur l'appareil. Son interface d'origine est pénible ; Dexie est une bibliothèque qui la rend simple : `bd.fiches.get(id)`, `bd.fiches.where('type').equals('source')`.

**Pourquoi ce choix.** C'est le seul stockage du navigateur fait pour des milliers d'enregistrements structurés (le `localStorage` est limité à quelques mégaoctets de texte). Dexie apporte les migrations versionnées et `useLiveQuery`, qui prévient l'interface à chaque changement.

**Réutilisable pour une PME.** Tout outil qui doit marcher sans réseau : relevés sur le terrain, prise de commande, inventaire.

**Dans le code.** `src/donnees/db.ts` (tables, index, migrations) et `src/donnees/depot.ts` (toutes les écritures).

**Deux règles posées dans Atlante.**
- Toutes les écritures passent par `depot.ts`, qui marque la ligne `_modifie = 1`. Sans cette discipline, une modification pourrait ne jamais partir vers le serveur.
- On ne supprime jamais vraiment : on remplit `deleted_at` (suppression logique). C'est ce qui permet à la suppression d'atteindre les autres appareils, et d'avoir une corbeille.

**Migrations.** `this.version(1).stores({...})` décrit le schéma. Pour le faire évoluer, on ajoute `this.version(2)`, sans toucher à la version 1 : un appareil resté en version 1 saura ainsi se mettre à niveau.

**Question 4.** Pourquoi une fiche supprimée reste-t-elle dans la base avec une date dans `deleted_at`, au lieu d'être effacée ?

## 5. Supabase

**Ce que c'est.** Un service qui fournit, prêt à l'emploi : une base PostgreSQL, une interface HTTP générée automatiquement à partir des tables (pas de serveur à programmer), et la gestion des comptes. Le code de Supabase est libre.

**Pourquoi ce choix.** Plan gratuit suffisant pour un utilisateur, région Paris, et surtout PostgreSQL : une base standard, que tu retrouveras chez tous les hébergeurs. Ce que tu apprends ici (SQL, RLS, migrations) ne dépend pas de Supabase.

**Réutilisable pour une PME.** Le serveur complet d'une app métier en une après-midi. À condition de passer à un plan payant (sauvegardes, pas de mise en pause) et de traiter le RGPD (voir RGPD.md).

**Dans le code.** `supabase/migrations/0001_schema_initial.sql` (le serveur est décrit ici, pas dans des clics), `src/synchro/supabase.ts`, `src/synchro/distantSupabase.ts`.

**Les deux clés : le point à ne jamais rater.**

| | Clé publique (« publishable », autrefois « anon ») | Clé secrète (« secret », autrefois « service_role ») |
|---|---|---|
| Où elle vit | Dans l'app, donc visible par tous. C'est normal. | Sur un serveur que tu contrôles. Jamais dans une app, un dépôt, un journal, un message. |
| Ce qu'elle permet | Se présenter à la porte. Ensuite, la RLS décide. | Tout. Elle passe outre la RLS. |
| Si elle fuit | Rien : elle est déjà publique. | Toutes les données de tous les utilisateurs sont exposées. Il faut la révoquer tout de suite. |

Atlante n'utilise pas la clé secrète, nulle part. Une app qui en a besoin côté navigateur est mal conçue.

**Migrations SQL.** Chaque changement du serveur est un fichier numéroté dans `supabase/migrations/`. On n'édite jamais un fichier déjà exécuté : on en ajoute un. Exemple, pour ajouter un type de fiche « Lieu » : un fichier `0002_type_lieu.sql` qui remplace la contrainte `check` de la colonne `type`, plus l'ajout de `lieu` dans `src/modele/types.ts`. Le serveur d'abord, l'app ensuite.

**Question 5.** Un prestataire te propose de « simplifier » en mettant la clé service_role dans l'app pour éviter d'écrire des politiques RLS. Que réponds-tu ?

## 6. Auth

**Ce que c'est.** La partie de Supabase qui gère les comptes : création, connexion, mot de passe oublié. Après connexion, l'app reçoit un jeton (JWT), sorte de badge signé qui dit « je suis l'utilisateur n° X », valable une heure et renouvelé automatiquement. Chaque requête envoie ce badge.

**Pourquoi ce choix.** Écrire soi-même la gestion des mots de passe est le meilleur moyen de créer une faille. Supabase stocke les mots de passe hachés (transformés de façon irréversible) : personne ne peut les lire, pas même Supabase.

**Réutilisable pour une PME.** Tel quel, avec en plus la double authentification et, selon le client, la connexion par son annuaire d'entreprise.

**Dans le code.** `src/synchro/supabase.ts` (connexion, création, mot de passe oublié), bloc `Compte` de `src/ui/pages/PageReglages.tsx`.

**Choix faits ici.** Inscriptions fermées après la création de ton compte : même si quelqu'un trouve l'app, il ne peut pas créer de compte. Les liens reçus par e-mail ramènent à l'adresse déclarée dans Supabase (« Site URL ») : si elle est fausse, la confirmation échoue.

**Question 6.** L'adresse de l'app et la clé publique sont visibles par tout le monde. Qu'est-ce qui empêche un inconnu de lire tes fiches ?

## 7. RLS (Row Level Security)

**Ce que c'est.** Une fonction de PostgreSQL : pour chaque table, des règles disent quelles lignes chaque utilisateur peut lire ou écrire. La règle d'Atlante tient en une ligne : `owner_id = auth.uid()`, « le propriétaire de la ligne est la personne connectée ». La vérification est faite par la base elle-même, pour chaque requête, quoi que demande l'app.

**Pourquoi ce choix.** Avec Supabase, le navigateur parle directement à la base. Sans RLS, n'importe qui pourrait tout lire avec la clé publique. La RLS est donc la serrure, pas une option. Avantage : la sécurité ne dépend pas du code de l'app, qui peut contenir des erreurs.

**Réutilisable pour une PME.** C'est le cœur d'une app à plusieurs utilisateurs. La règle change (« les membres de la même équipe », « le commercial chargé du client »), le principe reste.

**Dans le code.** Section 3 de `0001_schema_initial.sql`. Les tests de `tests/sql.test.ts` jouent Alice et Bob : Bob essaie de lire, de modifier et de s'attribuer les fiches d'Alice, et échoue à chaque fois.

**Trois protections empilées dans Atlante.**
1. `revoke all … from anon` : un visiteur non connecté n'a aucun droit sur les tables.
2. Les politiques RLS : un utilisateur connecté ne voit que ses lignes.
3. Un déclencheur empêche de changer le propriétaire d'une ligne après coup.

**Réflexe à garder.** Une table créée sans `enable row level security` est ouverte. Après chaque migration, exécuter `supabase/migrations/verification.sql`.

**Question 7.** Tu ajoutes une table `brouillons` et tu oublies d'activer la RLS. L'app fonctionne parfaitement. Où est le problème, et comment l'aurais-tu vu ?

## 8. Synchro local-first

**Ce que c'est.** « Local-first » : l'appareil est la référence, le serveur est une copie qui relie les appareils. On lit et on écrit en local, tout de suite, avec ou sans réseau. Un moteur de synchro s'occupe ensuite de mettre tout le monde d'accord.

**Pourquoi ce choix.** L'app reste utilisable dans le train, pendant une panne, ou quand le serveur gratuit est en pause. Le prix : il faut gérer le cas où deux appareils ont modifié la même chose.

**Comment ça marche dans Atlante.**
- Le serveur numérote chaque écriture avec un compteur qui ne fait que monter : la révision (`rev`).
- **Recevoir.** L'appareil demande : « donne-moi tout ce qui a une révision supérieure à la dernière que je connais ».
- **Envoyer.** Pour chaque ligne modifiée, l'appareil dit : « mets à jour cette ligne, à condition que sa révision soit toujours celle que je connaissais ». Si un autre appareil est passé entre-temps, la révision a changé, la mise à jour ne touche rien : c'est un conflit.
- **Conflit.** Les deux versions sont gardées et montrées. Tu choisis. Si les deux appareils ont fait exactement la même modification, il n'y a rien à choisir et l'app ne dérange pas.

**Ce que l'app ne fait pas, exprès.** « La dernière modification gagne », la solution courante, écrase une des deux versions sans le dire, en se fiant à l'horloge des appareils. Pour une base de connaissance, perdre un paragraphe en silence est inacceptable.

**Réutilisable pour une PME.** Toute app de terrain. Avant de proposer cette architecture, pose la question au client : deux personnes peuvent-elles modifier la même fiche en même temps ? Si oui, souvent, une app classique toujours connectée est plus simple et plus sûre.

**Dans le code.** `src/synchro/moteur.ts` (environ 200 lignes, tout le principe y est), `src/synchro/distant.ts` (ce que le moteur attend d'un serveur), `tests/synchro.test.ts` (chaque scénario y est joué avec deux appareils).

**Idée de conception à retenir.** Le moteur ne connaît pas Supabase. Il parle à un « distant » défini par quatre fonctions. En production c'est Supabase, dans les tests c'est un faux serveur en mémoire ou un vrai PostgreSQL embarqué. C'est ce qui rend la synchro testable sans réseau, et transportable chez un autre hébergeur.

**Question 8.** Sur le PC tu corriges le titre d'une fiche ; sur l'iPhone, hors ligne, tu la supprimes. Que se passe-t-il quand l'iPhone retrouve le réseau ?

## 9. Chiffrement (Web Crypto)

**Ce que c'est.** Web Crypto est la boîte à outils de chiffrement intégrée aux navigateurs. Atlante s'en sert pour les sauvegardes : le fichier produit est illisible sans le mot de passe ou la clé de secours.

**Pourquoi ce choix.** Intégrée, vérifiée par les éditeurs de navigateurs, sans bibliothèque à ajouter. Règle de base : on n'invente jamais son propre algorithme, on assemble des briques reconnues.

**Les trois briques utilisées.**
- **AES-GCM 256 bits** chiffre les données et vérifie en même temps qu'elles n'ont pas été modifiées. Un seul caractère changé dans le fichier et l'ouverture échoue : c'est le contrôle d'intégrité.
- **PBKDF2** transforme un mot de passe en clé de chiffrement, en répétant un calcul 600 000 fois. Pour toi, une demi-seconde. Pour quelqu'un qui essaie des milliards de mots de passe, des années.
- **L'enveloppe.** Les données sont chiffrées avec une clé tirée au hasard. Cette clé est ensuite chiffrée deux fois : par le mot de passe, et par la clé de secours. L'un ou l'autre ouvre la sauvegarde.

**La conséquence à expliquer à tout client.** Un chiffrement sérieux n'a pas de « mot de passe oublié ». Mot de passe et clé de secours perdus : les données sont perdues. D'où la clé de secours à imprimer.

**Réutilisable pour une PME.** Export chiffré de données clients, coffre de documents, sauvegarde hors ligne. Et l'argument commercial qui va avec : « même moi, je ne peux pas lire vos sauvegardes ».

**Dans le code.** `src/sauvegarde/chiffrement.ts`, `tests/sauvegarde.test.ts`.

**Question 9.** Un client te demande d'ajouter un bouton « J'ai perdu mon mot de passe et ma clé de secours, renvoyez-moi mes données ». Que réponds-tu ?

## 10. GitHub Actions et GitHub Pages

**Ce que c'est.** GitHub Pages sert gratuitement des fichiers statiques depuis un dépôt. GitHub Actions exécute des tâches automatiques à chaque envoi de code : ici, installer, tester, construire, publier.

**Pourquoi ce choix.** Gratuit pour un dépôt public, et la publication devient un non-événement : tu envoies le code, l'app est en ligne trois minutes plus tard. Si un test échoue, rien n'est publié.

**Réutilisable pour une PME.** Le même fichier de déploiement, pour n'importe quelle app. Pour un client, dépôt privé (Pages demande alors un plan payant) ou autre hébergeur de fichiers statiques.

**Dans le code.** `.github/workflows/deploiement.yml`.

**Dépôt public : la règle.** Tout ce qui est dans le dépôt est lisible par tous, pour toujours (l'historique garde tout). Donc : aucune donnée personnelle, aucune sauvegarde, aucun mot de passe, aucune clé secrète. Le fichier `.gitignore` empêche d'y ajouter par erreur une sauvegarde ou un export.

**Question 10.** Tu ajoutes par erreur ta clé secrète dans un fichier, tu l'envoies sur GitHub, tu t'en aperçois et tu supprimes la ligne dans un nouvel envoi. Est-ce réglé ?

## 11. Tests

**Ce que c'est.** Du code qui vérifie le code. Chaque test prépare une situation, exécute une action, et compare le résultat à ce qui est attendu. On les relance à chaque modification : si quelque chose casse, on le sait tout de suite.

**Pourquoi ce choix.** La synchro et la sauvegarde sont des mécanismes où une erreur détruit des données sans prévenir. On ne peut pas les vérifier « à l'œil ». Vitest est l'outil de test qui va avec Vite.

**Trois niveaux dans Atlante.**
1. **Tests de logique** (`tests/`, 51 tests, 3 secondes) : modèle, doublons, recherche, synchro avec deux appareils simulés, chiffrement, restauration, exports.
2. **Tests du SQL** (`tests/sql.test.ts`) : la migration est exécutée dans un vrai PostgreSQL embarqué (PGlite), avec deux utilisateurs, pour vérifier que la RLS tient.
3. **Parcours dans un vrai navigateur** (`tests-navigateur/parcours.cjs`, 34 vérifications) : Playwright pilote Chromium comme le ferait un utilisateur, y compris hors ligne et avec un serveur « en pause ».

**Ce que les tests ne prouvent pas.** Ils tournent contre un faux Supabase et un PostgreSQL embarqué, pas contre ton vrai projet, ni sur un vrai iPhone. D'où la partie D et E de ACTIONS_MANUELLES.md. Savoir dire ce qu'un test ne couvre pas fait partie du métier.

**Réutilisable pour une PME.** C'est ce qui te permet de modifier l'app d'un client six mois plus tard sans peur. Et de lui montrer un rapport : « voici ce qui est vérifié à chaque livraison ».

**Dans le code.** Lis `tests/synchro.test.ts` : les titres des tests forment la liste de ce que la synchro garantit.

**Question 11.** Tous les tests passent. Peux-tu dire au client que l'app n'a aucun bug ?

## Réponses

1. La liste vient de `useDonnees()`, branché sur `useLiveQuery` : Dexie signale chaque changement de la base et React redessine. L'écran reflète la base, on ne le met jamais à jour à la main.
2. GitHub Pages sert l'app dans le sous-dossier `/atlante/`. Sans `base`, la page chercherait ses fichiers à la racine du site, ne les trouverait pas, et resterait blanche.
3. Non. Le service worker sert d'abord la version en cache, puis découvre la nouvelle en arrière-plan. L'app affiche alors « Une nouvelle version est prête » : un clic sur « Mettre à jour ».
4. Pour que la suppression se propage. Si la ligne disparaissait, l'autre appareil, qui l'a encore, la renverrait au serveur à la synchro suivante et la fiche ressusciterait. La date dans `deleted_at` est une information comme une autre, qui se synchronise.
5. Non. Cette clé passe outre toutes les protections, et tout ce qui est dans une app est lisible par ses utilisateurs : ce serait donner la base entière à n'importe qui. Les politiques RLS ne sont pas une formalité, elles sont la sécurité.
6. La RLS (brique 7) et la fermeture des inscriptions. Sans compte, aucun droit sur les tables. Avec un compte qui ne serait pas le tien, uniquement ses propres lignes.
7. Toute personne connectée (ou même anonyme, selon les droits accordés) peut lire et modifier les brouillons de tous. L'app ne montre rien d'anormal parce qu'elle ne demande que les siens. On le voit avec `verification.sql`, avec le « Security Advisor » de Supabase, ou avec un test à deux utilisateurs.
8. L'iPhone reçoit d'abord la version du PC, constate que la fiche a été modifiée des deux côtés de façon différente, et ouvre un conflit : « version de cet appareil : supprimée » face à « version du serveur : nouveau titre ». Rien n'est perdu tant que tu n'as pas choisi.
9. Que c'est impossible par construction, et que c'est une qualité : si je pouvais les lui renvoyer, un pirate ou un employé indélicat le pourrait aussi. La parade se prépare avant : clé de secours imprimée, rangée au coffre, et procédure écrite.
10. Non. L'historique du dépôt conserve l'ancienne version du fichier, et des robots parcourent GitHub en continu à la recherche de clés. Il faut révoquer la clé tout de suite dans Supabase et en créer une nouvelle. Nettoyer l'historique vient après, et ne suffit pas.
11. Non. Tu peux dire que les comportements listés sont vérifiés à chaque livraison. Un test prouve qu'un cas prévu fonctionne ; il ne dit rien des cas auxquels personne n'a pensé.
