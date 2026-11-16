# Atlante

Base de connaissance personnelle, privée et durable : fiches (personnes, concepts, œuvres, sources, citations, notes…), relations nommées entre fiches, affirmations avec statut de preuve, dossiers thématiques.

Version 1.0.0 du 16.11.26. Cahier des charges : [SPEC.md](SPEC.md).

- App : https://franckscom.github.io/atlante/ (après les étapes de [ACTIONS_MANUELLES.md](ACTIONS_MANUELLES.md))
- Pour comprendre le code : [LECONS.md](LECONS.md)
- Protection des données : [RGPD.md](RGPD.md)

## Ce que fait l'app

| Besoin | Réponse |
|---|---|
| Écrire et lire sans Internet | Les données sont d'abord sur l'appareil (IndexedDB). L'app démarre hors ligne (service worker). |
| Retrouver ses données sur PC, Mac, iPhone | Synchronisation avec Supabase (Paris), automatique, plus un bouton « Synchroniser maintenant ». |
| Ne rien perdre en cas de conflit | Si une fiche est modifiée sur deux appareils, les deux versions sont montrées et tu choisis. |
| Ne rien perdre tout court | Sauvegarde chiffrée en un clic, restauration avec aperçu, exports Markdown, JSON, CSV. |
| Garder la main sur le jugement | Aucun statut posé par l'app. 7 statuts de preuve, attribués par toi, affirmation par affirmation. |
| Travailler avec Claude sans API | Bouton « Préparer pour Claude » : texte structuré copié dans le presse-papiers. |

Coût : zéro. Aucun service payant, aucune API à la consommation.

## Architecture

```
Navigateur (PC, Mac, iPhone)
┌──────────────────────────────────────────────┐
│ Interface React (src/ui)                     │
│        │ lit et écrit                        │
│        ▼                                     │
│ Base locale IndexedDB via Dexie (src/donnees)│  ← source de vérité de l'appareil
│        │ lignes marquées « à envoyer »       │
│        ▼                                     │
│ Moteur de synchro (src/synchro)              │
└────────┬─────────────────────────────────────┘
         │ HTTPS, quand il y a du réseau et une session
         ▼
Supabase, région Paris : Auth + PostgreSQL avec RLS (supabase/migrations)
```

Fichiers servis par GitHub Pages (aucun serveur à moi). Mise en cache par un service worker pour le hors ligne.

### Plan du dépôt

| Chemin | Rôle |
|---|---|
| `src/modele/` | Types de fiches, statuts, tables : le vocabulaire de l'app |
| `src/donnees/` | Base locale, écritures (`depot.ts`), recherche, doublons, import |
| `src/synchro/` | Moteur de synchro, connexion Supabase, état affiché |
| `src/sauvegarde/` | Chiffrement (Web Crypto), sauvegarde, restauration |
| `src/exports/`, `src/ia/` | Markdown, CSV, ZIP, « Préparer pour Claude » |
| `src/ui/` | Écrans et composants React |
| `supabase/migrations/` | SQL du serveur : tables, RLS, suppression de compte, vidage de la corbeille |
| `tests/` | Tests automatiques (Vitest) |
| `tests-navigateur/` | Parcours complet dans un vrai navigateur (Playwright) |
| `.github/workflows/` | Tests et déploiement automatiques |

### Modèle de données

Six tables, identiques en local et sur le serveur : `fiches`, `domaines`, `types_relation`, `relations`, `affirmations`, `dossier_fiches`.

Chaque ligne porte : `id` (UUID créé sur l'appareil), `owner_id` (propriétaire, rempli par le serveur), `created_at`, `updated_at`, `deleted_at` (suppression logique), `rev` (numéro de révision donné par le serveur). En local s'ajoute `_modifie` (1 = à envoyer).

## Installation sur un ordinateur de développement

Il faut [Node.js](https://nodejs.org) 22 ou plus récent.

```bash
git clone https://github.com/franckscom/atlante.git
```

```bash
cd atlante
```

```bash
npm ci
```

```bash
npm run dev
```

L'app s'ouvre sur http://localhost:5173/atlante/.

| Commande | Effet |
|---|---|
| `npm run dev` | App en développement, rechargée à chaque modification |
| `npm test` | Tests automatiques |
| `npm run build` | Vérification des types puis construction dans `dist/` |
| `npm run preview` | Sert `dist/` comme en production (http://localhost:4173/atlante/) |
| `npm run test:navigateur` | Parcours complet dans Chromium (après `npm run build`, demande Playwright) |

## Déploiement

Automatique. Chaque envoi sur la branche `main` lance `.github/workflows/deploiement.yml` : installation, tests, construction, publication sur GitHub Pages. Si un test échoue, rien n'est publié. Les autres branches lancent les tests sans publier.

Réglage à faire une fois : dépôt GitHub, Settings, Pages, Source : « GitHub Actions ».

Après une publication, l'app ouverte affiche « Une nouvelle version d'Atlante est prête » avec un bouton « Mettre à jour ».

## Sauvegarde

Écran « Sauvegarde et exports ».

1. Première fois : l'app crée une **clé de secours** (32 caractères). Imprime-la et range-la loin de l'ordinateur.
2. Choisis un mot de passe (10 caractères au moins), clique sur « Sauvegarder maintenant ».
3. Un fichier `atlante_sauvegarde_JJ.MM.AA.atlante` est téléchargé. Range-le hors de l'appareil.

Le fichier s'ouvre avec le mot de passe **ou** la clé de secours. Les deux perdus : la sauvegarde est illisible, par personne, pour toujours. C'est le prix d'un chiffrement sérieux : il n'existe pas de porte de service.

L'app affiche la date de la dernière sauvegarde et alerte au-delà de 7 jours.

Le plan gratuit de Supabase ne fait pas de sauvegarde : ce fichier est la seule copie indépendante.

## Restauration

1. « Sauvegarde et exports », « Restaurer une sauvegarde » : choisis le fichier, saisis le mot de passe ou la clé de secours.
2. L'app vérifie l'intégrité et la version, puis affiche un **aperçu** : par type d'élément, combien sont absents de l'appareil, identiques, différents, présents ici seulement. Rien n'est modifié à ce stade.
3. Choisis : « Ajouter ce qui manque » (ne touche à rien d'existant), « Fusionner », ou « Revenir à l'état sauvegardé » (ce qui n'est pas dans la sauvegarde part à la corbeille, pas à la destruction).
4. Confirme. Les données restaurées repartent vers le serveur à la synchro suivante. Si le serveur a une version différente, elle apparaît en conflit au lieu d'être écrasée.

## Réactiver Supabase en pause

Un projet gratuit sans activité pendant 7 jours est mis en pause. Les données sont conservées. L'app continue de fonctionner sur l'appareil et affiche « Synchro impossible : serveur en pause ou injoignable ».

1. Ouvre https://supabase.com/dashboard/project/sixqffwcfapinsdzfbxh et connecte-toi.
2. Clique sur « Restore project » (ou « Resume project »).
3. Attends quelques minutes.
4. Dans Atlante : Réglages, « Synchroniser maintenant ». Les modifications en attente partent.

Attention : un projet en pause n'est restaurable que pendant une durée limitée (90 jours selon l'annonce de Supabase, à vérifier dans leur documentation). Au-delà, il faut reconstruire le serveur (section suivante). Ouvrir l'app une fois par semaine suffit à éviter la pause.

Sources : [Supabase, Project Pausing](https://supabase.com/docs/guides/platform/free-project-pausing), [annonce sur les 90 jours](https://supabase.com/changelog/27497-paused-free-plan-projects-are-restorable-for-90-days).

## Reconstruire l'app à partir de zéro

Cas : projet Supabase perdu, ou nouvelle installation complète.

1. **Serveur.** Crée un projet Supabase (région Paris). Dans l'éditeur SQL, exécute les fichiers de `supabase/migrations/` dans l'ordre de leur numéro. Règle l'authentification comme dans [ACTIONS_MANUELLES.md](ACTIONS_MANUELLES.md).
2. **Réglages de l'app.** Dans `src/config.ts`, remplace l'URL du projet et la clé **publique**. Jamais la clé secrète.
3. **Hébergement.** Dépôt GitHub public nommé `atlante`, Pages réglé sur « GitHub Actions », envoi sur `main`. Si le dépôt porte un autre nom, change `base`, `start_url`, `scope` et `navigateFallback` dans `vite.config.ts`.
4. **Données.** Sur un appareil qui a encore ses données : connecte-toi au nouveau compte après avoir utilisé « Effacer les données de cet appareil » puis restauré ta dernière sauvegarde. Sur un appareil vide : restaure la sauvegarde, connecte-toi, la synchro remplit le nouveau serveur.

## Limites connues de la V1

- **Synchro uniquement quand l'app est ouverte.** Pas de synchro en arrière-plan (impossible sur iPhone).
- **iPhone (Safari).** Voir le tableau ci-dessous.
- **Base locale non chiffrée** (hors périmètre V1) : qui a accès à ta session sur l'appareil a accès aux données. La clé de secours y est aussi enregistrée, pour pouvoir chiffrer chaque sauvegarde sans la redemander.
- **Corbeille vidée à la main.** Une suppression envoie à la corbeille (c'est ce qui la propage aux autres appareils). « Réglages », « Vider la corbeille » efface réellement ces données du serveur, de l'appareil, puis des autres appareils à leur synchro suivante. Les anciens fichiers de sauvegarde et d'export les contiennent encore : à détruire soi-même. Restaurer une ancienne sauvegarde les ramènerait dans la corbeille.
- **Fiche effacée ici, modifiée hors ligne ailleurs.** Si un autre appareil avait modifié la fiche sans avoir synchronisé, il la recrée à sa synchro suivante : l'app préfère faire réapparaître une fiche que perdre un travail en silence.
- **Images distantes non affichées** dans les contenus Markdown (aucune requête vers un tiers à la lecture).
- **Listes fermées côté serveur.** Ajouter un type de fiche ou un statut demande une migration SQL (voir LECONS.md).
- **Pas de** : PDF, OCR, recherche sémantique, graphe, réimport des réponses de Claude, pont avec Regia (hors périmètre, SPEC section 15).

### Safari sur iPhone : ce qui est possible

Je n'ai pas pu tester sur un iPhone réel depuis ma session. Ce tableau vient de la documentation de WebKit et de MDN ; la liste de tests à faire toi-même est dans ACTIONS_MANUELLES.md.

| Sujet | État | Source |
|---|---|---|
| Installation | Pas de bouton « Installer ». Safari, Partager, « Sur l'écran d'accueil ». | Comportement d'iOS |
| Hors ligne | Service worker pris en charge. | MDN |
| Stockage | Depuis iOS 17, une app de l'écran d'accueil a le même quota que le site dans Safari (jusqu'à environ 60 % du disque par origine). | [WebKit, Updates to Storage Policy](https://webkit.org/blog/14403/updates-to-storage-policy/), [MDN, quotas](https://developer.mozilla.org/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria) |
| Effacement après 7 jours | Dans Safari (onglet), les données d'un site non visité pendant 7 jours d'utilisation du navigateur peuvent être effacées. Les apps de l'écran d'accueil ne sont pas soumises à cette règle. **Donc : installe l'app sur l'écran d'accueil.** | [Forum Apple](https://developer.apple.com/forums/thread/710157) |
| Stockage persistant | `navigator.storage.persist()` existe ; WebKit décide seul, selon des critères comme l'installation sur l'écran d'accueil. Des refus systématiques sont signalés. L'app affiche le résultat réel. | WebKit (même article), [bug 271401](https://bugs.webkit.org/show_bug.cgi?id=271401) |
| Données Safari et app installée | L'app installée a son propre stockage : des fiches saisies dans l'onglet Safari n'apparaissent dans l'app installée qu'après synchro. | À vérifier sur ton iPhone |
| Import de fichiers | Par l'app Fichiers, via le bouton de choix de fichier. | À vérifier sur ton iPhone |
| Téléchargements | Dans l'app installée, l'app passe par la feuille de partage (« Enregistrer dans Fichiers »). | À vérifier sur ton iPhone |
| Presse-papiers | Copie possible après un appui sur un bouton. En cas de refus, l'app affiche le texte à copier à la main. | À vérifier sur ton iPhone |

## Dépendances

Toutes sous licence libre, gratuites. Livrées dans l'app : React (MIT), React Router (MIT), Dexie et dexie-react-hooks (Apache 2.0), supabase-js (MIT), MiniSearch (MIT), fflate (MIT), marked (MIT), DOMPurify (Apache 2.0 ou MPL 2.0). Outils de développement : Vite, vite-plugin-pwa, TypeScript, Vitest, fake-indexeddb, PGlite, Playwright.

## Licence

Code sous licence MIT.
