# ATLANTE : cahier des charges v3 (local-first + Supabase)

Version du 16.11.26. Remplace la v2 du 02.11.26. À enregistrer à la racine du dépôt sous le nom `SPEC.md`.

## 1. Ton rôle et le contexte

Je n'ai aucune formation en programmation. Atlante est mon projet d'apprentissage : à terme, je veux vendre aux PME des apps qui améliorent leurs process de communication, avec des données conformes au RGPD. Je dois donc apprendre les outils et services qu'un développeur d'apps pour PME doit connaître.

Contrainte de temps : ton accès se termine demain. Tu construis donc aujourd'hui une **V1.0 complète, testée et utilisable au quotidien**, sans étapes intermédiaires à valider. Les explications pas à pas viendront ensuite : je décortiquerai le code avec Claude dans mon parcours d'apprentissage. Pour que ce soit possible :

- Tu documentes chaque choix important dans `LECONS.md` (voir section 16).
- Le code est simple, modulaire et commenté en français.
- Tu signales chaque action manuelle qui reste à moi avec l'étiquette **« Action manuelle : »** (où cliquer, quoi copier, dans quel ordre).
- Sur les choix techniques, tu choisis la meilleure solution et tu l'expliques en une ligne. Tu me demandes mon avis seulement si un choix change l'usage ou le sens de l'app.

**Règle fondamentale : coût monétaire zéro.** Aucun service payant, abonnement ou API à la consommation. Si un besoin n'est pas réalisable gratuitement, dis-le et propose une alternative. Ne remplace jamais un besoin en silence par une fonction inférieure.

Suis les règles de `AGENTS.md` et `SICUREZZA_E_MCP.md` joints.

## 2. Objectif

Atlante est ma base de connaissance personnelle, privée et durable. Elle me sert à rassembler, organiser, relier et comparer des informations issues de livres, articles, PDF, sites, notes personnelles et citations, pour construire une compréhension structurée des sujets, auteurs, théories, événements, institutions et courants de pensée, et pour produire des dossiers, des argumentaires et des synthèses.

## 3. Architecture (décisions confirmées)

| Sujet | Décision |
|---|---|
| Principe | **Local-first** : l'app lit et écrit d'abord en local, elle fonctionne sans Internet, puis synchronise avec le serveur quand la connexion revient |
| Type d'app | Web app installable (PWA), hors ligne |
| Interface | React + TypeScript (Vite) |
| Stockage local | IndexedDB, via Dexie.js |
| Serveur de données | **Supabase**, plan gratuit, projet `atlante`, région **Paris (eu-west-3)** |
| Comptes | Supabase Auth, un seul utilisateur (moi). Inscriptions publiques désactivées |
| Sécurité des données | Row Level Security (RLS) activée sur **toutes** les tables : chaque ligne n'est lisible et modifiable que par son propriétaire |
| Recherche | Plein texte locale (MiniSearch ou équivalent) |
| Hébergement de l'app | GitHub Pages, dépôt public `atlante` sur mon compte GitHub (le même que Regia), déploiement par GitHub Actions |
| IA | Pas d'API payante. Bouton « Préparer pour Claude » (section 12) |
| Relation avec Regia | App séparée. Pont prévu plus tard |

**Clés Supabase :** seule la clé publique (publishable ou anon) va dans l'app, ce qui est normal puisque la RLS protège les données. La clé secrète (service_role) ne doit **jamais** apparaître dans le code, le dépôt, les logs ou l'app. Explique-le dans `LECONS.md`.

**Accès réseau :** si ta session ne peut pas joindre Supabase directement, écris les migrations SQL dans `supabase/migrations/` et donne-moi la marche à suivre pour les exécuter dans l'éditeur SQL de Supabase (Action manuelle). Ne déclare jamais une étape faite sans l'avoir vérifiée ; si tu ne peux pas vérifier, dis-moi exactement quoi tester.

**Pause du plan gratuit :** un projet Supabase gratuit sans activité pendant 7 jours est mis en pause (données conservées, réactivation manuelle). L'app doit le gérer proprement : elle continue de fonctionner en local, affiche « Synchro impossible : serveur en pause ou injoignable », et explique comment réactiver le projet.

## 4. Appareils

PC Windows (Chrome ou Edge), Mac (Chrome, Edge ou Safari), iPhone (Safari, app ajoutée à l'écran d'accueil). Vérifie ce qui est réellement possible sur Safari iOS (stockage, hors ligne, import de fichiers) au lieu de le présumer, et documente les limites.

## 5. Domaines

Libres, modifiables, non exclusifs (une fiche peut appartenir à plusieurs domaines). Domaines de départ (14) :

1. Philosophie et pensée critique
2. Politique, géopolitique et relations internationales
3. Sciences dures
4. Sociologie
5. Sémiologie
6. Technologie et IA
7. Littérature, arts, rhétorique et culture
8. Marketing, communication et stratégie
9. Économie et management
10. Idéologies et doctrines
11. Think tanks et institutions
12. Histoire, civilisations et archéologie
13. Psychologie et sciences cognitives
14. Religions

## 6. Modèle de données

Types de fiches : Personne, Concept, Courant, Œuvre, Organisation, Événement, Méthode, Citation, Source, Note personnelle, Dossier thématique.

Exigences :

- Identifiants stables et uniques (UUID), compatibles avec la synchro.
- Chaque fiche, champ et relation se modifie ou se supprime sans recréer la fiche.
- Relations explicites et nommées entre fiches (« a écrit », « critique », « s'inspire de », « appartient à », « cité dans »…), liste modifiable.
- Date de création et de dernière modification sur chaque élément.
- Champs nécessaires à la synchro : propriétaire, version ou horodatage, suppression logique.
- Modèle extensible, avec migrations versionnées (local et serveur) dès le départ.

## 7. Statut des affirmations et pluralisme

Atlante accueille des sources de toutes orientations, sans hiérarchie entre elles : tout m'intéresse en soi. L'app ne pose **aucune étiquette automatique**, ni morale, ni politique (d'aucun bord), ni idéologique, ni « mainstream » contre « complotiste ».

Les seuls statuts sont ceux que **j'attribue moi-même**, affirmation par affirmation, selon l'état de la preuve :

- Fait vérifiable
- Interprétation ou opinion attribuée à un auteur
- Hypothèse
- Affirmation controversée
- Données insuffisantes ou non vérifiées
- Inférence produite par une IA
- Observation ou conclusion personnelle

Avec, si possible, la source et la page ou la section précise.

## 8. Acquisition des contenus (V1)

- Saisie manuelle des fiches et des notes.
- Enregistrement d'URL et de références bibliographiques.
- Import de fichiers texte et Markdown.
- Détection des doublons possibles avant création (titre, auteur, URL proches).
- Aucun import n'écrase un contenu existant en silence. Provenance et date d'acquisition conservées.

## 9. Recherche et navigation

- Recherche plein texte dans fiches et notes, accessible depuis tous les écrans.
- Filtres combinables : type, auteur, domaine, date, source, statut.
- Navigation d'une fiche à l'autre par les relations.
- Fonctionne hors ligne.

## 10. Synchronisation

- Automatique quand l'app est en ligne et que je suis connecté, plus un bouton « Synchroniser maintenant ».
- Ajouts et mises à jour dans les deux sens.
- Suppressions propagées (une fiche supprimée ne réapparaît pas).
- Conflit (même élément modifié sur deux appareils hors ligne) : l'app me montre les deux versions et je choisis. Pas de « la dernière modification gagne » appliquée en silence.
- Indicateur visible : synchronisé, en attente, hors ligne, erreur, serveur en pause.

## 11. Protection contre la perte et exports

Le plan gratuit de Supabase n'inclut pas de sauvegardes. Il faut donc une copie indépendante :

- Stockage persistant demandé au navigateur, avec affichage du résultat.
- Sauvegarde complète en un clic dans une archive chiffrée par mot de passe (Web Crypto API), avec procédure de récupération réaliste (clé de secours à imprimer) et explication simple : mot de passe et clé perdus = sauvegarde illisible.
- Date de la dernière sauvegarde affichée, alerte au-delà de 7 jours.
- Restauration avec vérification d'intégrité et de version, et aperçu avant d'écraser quoi que ce soit.
- Exports lisibles hors de l'app : Markdown (une fiche par fichier, relations en liens), JSON complet, CSV par type.
- Documentation de ce qui est exporté et de ce qui ne l'est pas.

## 12. IA

Bouton « Préparer pour Claude » sur une fiche ou un dossier : l'app assemble le contenu, les relations, les sources et les statuts dans un texte structuré, copié dans le presse-papiers, que je colle moi-même dans Claude. Aucune API.

Plus tard (hors V1) : réimport des réponses de Claude comme suggestions, validées par moi, avec le statut « Inférence produite par une IA ».

## 13. RGPD : à traiter comme pour un client

Même si je suis le seul utilisateur, construis Atlante comme si c'était l'app d'une PME, pour que j'apprenne la démarche :

- Région UE (Paris) et contrat de sous-traitance (DPA) de Supabase : explique où le trouver et ce qu'il couvre, y compris ses limites (Supabase est une société américaine, hébergée sur AWS ; clauses contractuelles types ; CLOUD Act).
- `RGPD.md` : registre de traitement modèle (finalité, données, base légale, durée de conservation, sous-traitants et sous-traitants ultérieurs, transferts hors UE, mesures de sécurité, exercice des droits).
- Droit d'accès et de portabilité : couverts par les exports.
- Droit à l'effacement : fonction « Supprimer mon compte et toutes mes données », avec double confirmation et proposition d'export avant suppression.
- Minimisation : aucune donnée collectée qui ne sert pas l'usage.
- Une courte section « Ce que je dirais à un client PME » : quand Supabase suffit, et quand recommander un hébergeur européen (Scaleway, OVH, Clever Cloud…), en signalant que ces options sont payantes et à comparer le moment venu.

## 14. Interface

Sobre, lisible, pensée pour de longues sessions de lecture. Modes clair et sombre. Bon affichage sur téléphone comme sur grand écran. Recherche toujours accessible. Fiches détaillées avec relations visibles. Notes faciles à modifier. Dossiers thématiques. Indicateurs de synchro, de sauvegarde et d'import. Confirmation avant toute suppression. Pas de graphe visuel en V1. Interface en français.

## 15. Hors périmètre de la V1

OCR, import de PDF, recherche sémantique, graphe visuel, réimport des réponses de l'IA, pont avec Regia, chiffrement de la base locale, plusieurs utilisateurs, publication dans un store.

## 16. Livrables

1. App déployée sur GitHub Pages, installable, fonctionnant hors ligne, synchronisée avec Supabase.
2. Migrations SQL dans `supabase/migrations/`, avec RLS sur toutes les tables.
3. Tests automatiques essentiels (modèle de données, synchro et conflits, sauvegarde et restauration, exports), réellement exécutés, avec leurs résultats.
4. `README.md` : objectif, architecture, installation, déploiement, sauvegarde, restauration, réactivation de Supabase en pause, reconstruction de l'app à partir de zéro.
5. `LECONS.md` : pour chaque brique (React, Vite, PWA et service worker, IndexedDB et Dexie, Supabase, Auth, RLS, synchro local-first, chiffrement, GitHub Actions et Pages, tests), ce que c'est, pourquoi ce choix, ce qui est réutilisable pour une app client PME, et une question d'auto-vérification. Rédigé simplement, en français.
6. `RGPD.md` (section 13).
7. `ACTIONS_MANUELLES.md` : la liste ordonnée de ce que je dois faire moi-même (réglages Supabase, URL de redirection, désactivation des inscriptions, test sur iPhone…), avec cases à cocher.
8. Rapport final : ce qui est fait, tests exécutés et résultats, limites connues, ce qui reste à faire.

## 17. Règles opératoires

- Aucune commande destructive sans explication et confirmation.
- Interdit dans le dépôt : données personnelles, sauvegardes, mots de passe, clé service_role, tokens.
- Aucun service externe ni coût sans mon accord. GitHub Actions uniquement dans les limites gratuites.
- Ne jamais inventer un résultat de test ou une vérification. Ne jamais déclarer une fonction terminée sans l'avoir testée.
- Dépendances maintenues, documentées, sous licence libre compatible.
- Ne pas me redemander une information déjà présente dans le dépôt ou dans ce document.

## 18. Critère de réussite

Une app personnelle utile, privée, hors ligne, synchronisée, exportable et durable, construite sans coût. Et, pour moi, un code et une documentation qui me permettent d'apprendre à construire des apps conformes au RGPD que je saurai vendre à des PME.
