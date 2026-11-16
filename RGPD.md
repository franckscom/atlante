# RGPD : Atlante traité comme l'app d'une PME

Créé le 16.11.26. Document de travail et modèle réutilisable. Ce n'est pas un avis juridique : pour un client, fais relire par un juriste ou par son délégué à la protection des données (DPO).

## 1. Suis-je concerné ?

Pour ton usage strictement personnel, non. Le RGPD ne s'applique pas aux traitements effectués « par une personne physique dans le cadre d'une activité strictement personnelle ou domestique » (article 2, paragraphe 2, point c). Atlante, utilisé seul, pour ta culture, entre dans ce cas.

Dès que la même app sert à une PME (plusieurs salariés, des données de clients ou de prospects), le RGPD s'applique en entier. Ce document est donc écrit comme si Atlante était l'app d'un client. C'est l'exercice.

Les rôles, dans le cas d'un client :

| Rôle | Qui | Ce que ça veut dire |
|---|---|---|
| Responsable de traitement | La PME cliente | Elle décide pourquoi et comment les données sont traitées. Elle répond devant la CNIL. |
| Sous-traitant | Toi (Franckscom), si tu héberges ou administres l'app pour elle | Tu traites les données sur ses instructions. Un contrat de sous-traitance (article 28) est obligatoire entre vous. |
| Sous-traitant ultérieur | Supabase, puis AWS ; GitHub pour la diffusion de l'app | Ils travaillent pour le sous-traitant. Le client doit en être informé et pouvoir s'y opposer. |

Si le client crée lui-même son projet Supabase et son dépôt, et que tu ne fais que livrer le code, tu n'es pas sous-traitant : Supabase est alors son sous-traitant direct. C'est le montage le plus simple pour toi.

## 2. Registre de traitement (modèle, article 30)

| Rubrique | Contenu pour Atlante |
|---|---|
| Nom du traitement | Base de connaissance personnelle « Atlante » |
| Responsable | Franck Greco (Franckscom). Pour un client : raison sociale, adresse, contact, DPO s'il y en a un. |
| Finalité | Rassembler, organiser et relier des notes de lecture et des références pour produire des synthèses et des dossiers. Synchroniser ces notes entre les appareils de l'utilisateur. |
| Base légale (article 6) | Exécution du service demandé par l'utilisateur (6.1.b). Pour une PME et ses salariés : intérêt légitime de l'entreprise (6.1.f) ou exécution du contrat de travail, à décider avec le client. |
| Personnes concernées | L'utilisateur du compte. Indirectement : les personnes citées dans les fiches (auteurs, personnalités publiques, parfois des particuliers). |
| Données du compte | Adresse e-mail, mot de passe (stocké haché par Supabase, jamais lisible), dates de création et de dernière connexion. |
| Données techniques | Adresse IP et horodatage dans les journaux de Supabase et de GitHub Pages. |
| Données de contenu | Texte libre des fiches, relations, affirmations, sources. Peut contenir des données personnelles de tiers, selon ce que l'utilisateur écrit. |
| Données sensibles (article 9) | Aucune n'est demandée. Mais le texte est libre, et des domaines comme « Religions », « Politique » ou « Idéologies » concernent des opinions : une fiche sur une personne identifiable peut révéler ses convictions. Pour des personnalités publiques et leurs positions publiques, le risque est faible. Pour une PME : consigne écrite de ne pas ficher les opinions ou la santé de particuliers. |
| Destinataires | L'utilisateur seul. Personne d'autre n'a accès aux données par l'app (RLS). |
| Sous-traitants | Supabase (base de données, authentification, e-mails de compte). GitHub Pages (diffusion des fichiers de l'app ; ne reçoit aucune donnée de contenu). Voir section 4. |
| Transferts hors UE | Données stockées à Paris (AWS eu-west-3). Accès possible depuis les États-Unis par Supabase pour l'assistance et l'exploitation, encadré par les clauses contractuelles types. Voir section 5. |
| Durée de conservation | Tant que l'utilisateur les garde. Une fiche supprimée va à la corbeille ; « Vider la corbeille » l'efface réellement du serveur et des appareils, sans toucher au compte. « Supprimer mon compte » efface tout, immédiatement. Les journaux techniques suivent les durées de Supabase et de GitHub. Pour une PME : fixer une durée après le départ d'un salarié (par exemple, suppression du compte dans les 30 jours). |
| Mesures de sécurité | Section 6. |
| Exercice des droits | Section 7. |

## 3. Minimisation : ce que l'app ne collecte pas

- Aucun outil de mesure d'audience, aucun traceur, aucun cookie publicitaire.
- Aucune police ni script chargé depuis un tiers (pas de Google Fonts, pas de CDN) : ouvrir l'app ne contacte que GitHub Pages et Supabase.
- Aucune image distante affichée dans les fiches : lire une fiche n'envoie aucune requête à un site tiers.
- Pas de nom, pas de téléphone, pas de profil : le compte se limite à une adresse e-mail et un mot de passe.
- Une donnée supprimée ne reste pas indéfiniment : la corbeille se vide réellement, sans supprimer le compte.
- « Préparer pour Claude » n'envoie rien : l'app copie un texte, c'est l'utilisateur qui le colle où il veut. S'il le colle dans un service d'IA, c'est un nouveau traitement, sous sa responsabilité (pour une PME : à encadrer par une consigne).

La session de connexion est gardée dans le stockage local du navigateur, pas dans un cookie. Elle est strictement nécessaire au service demandé : pas de bandeau de consentement à prévoir (exemption prévue par l'article 82 de la loi Informatique et Libertés ; voir les lignes directrices de la CNIL sur les traceurs).

## 4. Supabase : le contrat de sous-traitance (DPA)

**Ce que c'est.** Le DPA (Data Processing Addendum) est le contrat exigé par l'article 28 du RGPD entre toi et Supabase. Il fixe ce que Supabase a le droit de faire des données : les traiter sur tes instructions uniquement, les protéger, t'aider à répondre aux demandes des personnes, te prévenir en cas de fuite, les supprimer à la fin du contrat, et te dire à quels sous-traitants il fait appel.

**Où le trouver.**
- Texte : https://supabase.com/legal/dpa
- Dans le tableau de bord : paramètres de l'organisation « Franckscom », rubrique des documents juridiques (« Legal Documents » ou « Documents »).

**Action manuelle :** ouvre ces deux pages, lis le DPA, et vérifie comment il s'applique à ton compte. Les sources que j'ai consultées ne s'accordent pas : d'anciennes versions devaient être signées et renvoyées, la version actuelle s'appliquerait par l'acceptation des conditions d'utilisation. Je n'ai pas pu ouvrir le site de Supabase depuis ma session pour trancher, ni confirmer que le plan gratuit est couvert. Si le tableau de bord propose de signer le DPA, signe-le et garde le PDF daté. Sinon, pose la question au support et garde la réponse.

Date d'acceptation ou de signature du DPA : DPA Supabase : intégré aux conditions d’utilisation, accepté à la création du compte le 16.11.26 (supabase.com/legal/dpa, consulté le 16.11.26). Le texte ne précise pas les niveaux d’offre : il semble couvrir le plan gratuit, sans le dire explicitement. Contact confidentialité : privacy@supabase.io.

**Ce qu'il couvre.**
- L'engagement de Supabase sur la sécurité et la confidentialité.
- La liste des sous-traitants ultérieurs, dont AWS (hébergement) et le prestataire d'envoi d'e-mails. Elle est publiée par Supabase et peut changer : pour un client, abonne-toi aux notifications de changement si elles sont proposées.
- Les clauses contractuelles types (CCT) de la Commission européenne (décision 2021/914) pour les transferts hors UE.
- La notification des violations de données et la suppression en fin de contrat.

**Ses limites.**
- **Supabase est une société américaine**, et son hébergeur AWS aussi. Choisir la région Paris fixe l'endroit où les données sont stockées. Cela ne change pas la nationalité de ceux qui les administrent.
- **CLOUD Act.** Cette loi américaine de 2018 permet aux autorités des États-Unis d'exiger d'un prestataire américain des données qu'il contrôle, quel que soit le pays où elles sont stockées. Les CCT et le DPA obligent Supabase à contester les demandes illégales et à te prévenir quand la loi le permet. Ils ne peuvent pas empêcher une demande valide en droit américain.
- **Cadre UE-États-Unis.** Depuis la décision d'adéquation du 10 juillet 2023 (Data Privacy Framework), les transferts vers les entreprises américaines certifiées sont autorisés sans CCT. À vérifier : la certification de Supabase sur https://www.dataprivacyframework.gov/list. Ce cadre est contesté et peut être annulé, comme ses deux prédécesseurs (Safe Harbor en 2015, Privacy Shield en 2020). Les CCT restent le filet de sécurité.
- **Plan gratuit.** Pas de sauvegarde, pas d'engagement de disponibilité, mise en pause après 7 jours sans activité. Suffisant pour un usage personnel, pas pour une PME.
- **Les données ne sont pas chiffrées de bout en bout.** Elles sont chiffrées pendant le transport (HTTPS) et sur les disques de Supabase, mais Supabase peut techniquement les lire. La RLS protège contre les autres utilisateurs, pas contre l'hébergeur.

## 5. GitHub Pages

GitHub (filiale de Microsoft, société américaine) diffuse les fichiers de l'app. Il ne reçoit aucune donnée de contenu ni de compte : seulement l'adresse IP et l'horodatage de chaque visite, comme tout hébergeur web. Le dépôt est public, mais il ne contient que du code : aucune donnée personnelle, aucun secret (règle vérifiée, voir `.gitignore`).

Pour un client attentif à la souveraineté : les mêmes fichiers peuvent être servis par n'importe quel hébergeur européen, sans changer une ligne de code.

## 6. Mesures de sécurité (article 32)

| Mesure | Où la voir |
|---|---|
| Cloisonnement par utilisateur : Row Level Security sur toutes les tables | `supabase/migrations/0001_schema_initial.sql`, testée dans `tests/sql.test.ts` |
| Aucun accès sans connexion : droits retirés au rôle anonyme | idem |
| Clé secrète absente du code, du dépôt et de l'app | `src/config.ts` ne contient que la clé publique |
| Inscriptions publiques fermées | Réglage Supabase (ACTIONS_MANUELLES.md, C4) |
| Chiffrement en transit | HTTPS partout (GitHub Pages et Supabase) |
| Sauvegardes chiffrées (AES-GCM 256 bits, clé tirée du mot de passe par PBKDF2) | `src/sauvegarde/chiffrement.ts` |
| Contenu importé nettoyé avant affichage (pas d'exécution de script) | `src/ui/composants/Markdown.tsx` |
| Pas de suppression silencieuse : conflits montrés, corbeille, confirmations | `src/synchro/moteur.ts`, écran « Conflits » |
| Effacement physique limité aux lignes déjà supprimées et à leur propriétaire | `supabase/migrations/0002_vider_corbeille.sql`, testé dans `tests/sql.test.ts` |
| Dépendances limitées, sous licence libre, versions verrouillées | `package-lock.json` |

Points faibles à connaître : la base locale n'est pas chiffrée (protection = verrouillage de session de l'appareil) ; un seul facteur d'authentification (pour une PME, activer la double authentification de Supabase Auth) ; les exports Markdown, JSON et CSV sont en clair.

## 7. Droits des personnes

| Droit | Réponse dans Atlante |
|---|---|
| Accès (article 15) | Tout est visible dans l'app. Export JSON complet. |
| Portabilité (article 20) | Exports JSON (lisible par une machine), CSV et Markdown. |
| Rectification (article 16) | Chaque fiche, champ et relation est modifiable. |
| Effacement d'une donnée précise (article 17) | Supprimer la fiche, puis « Réglages », « Vider la corbeille » : double confirmation, export proposé avant, effacement réel sur le serveur, sur l'appareil, puis sur les autres appareils à leur synchro suivante. Le serveur n'accepte d'effacer que des lignes déjà dans la corbeille. À compléter à la main : détruire les anciens fichiers de sauvegarde et d'export. |
| Effacement de tout (article 17) | « Réglages », « Supprimer mon compte et toutes mes données » : double confirmation, export proposé avant, suppression du compte et de toutes les lignes sur le serveur, effacement de l'appareil. À compléter à la main : effacer les autres appareils et détruire les fichiers de sauvegarde. |
| Personnes citées dans les fiches | Elles n'ont pas de compte. Une demande passerait par le responsable de traitement, qui chercherait leur nom (recherche plein texte) puis corrigerait ou supprimerait les fiches. |

En cas de violation de données (compte piraté, fuite chez un sous-traitant) : pour une PME, notification à la CNIL sous 72 heures si un risque existe pour les personnes (article 33), et tenue d'un registre des incidents.

## 8. Ce que je dirais à un client PME

**Supabase suffit quand :**
- les données sont de sensibilité courante (contacts professionnels, contenus éditoriaux, suivi de projets) ;
- le client accepte un prestataire américain avec stockage dans l'UE, DPA et clauses contractuelles types ;
- il prend un plan payant, qui apporte les sauvegardes quotidiennes et supprime la mise en pause. Le plan gratuit ne convient pas à une entreprise.

**Je recommande un hébergeur européen quand :**
- les données sont sensibles : santé, opinions, données de mineurs, secrets d'affaires, données soumises au secret professionnel ;
- le client est une collectivité, un opérateur public ou un sous-traitant de l'État, ou son propre client exige un hébergement « souverain » (hors de portée du CLOUD Act) ;
- des données de santé sont en jeu : un hébergeur certifié HDS est alors obligatoire en France ;
- le client veut une qualification SecNumCloud ou un contrat de droit français.

**Les options.** Scaleway, OVHcloud et Clever Cloud proposent du PostgreSQL géré en France par des sociétés françaises. Supabase est un logiciel libre : on peut aussi l'installer soi-même chez l'un d'eux, au prix d'un travail d'administration réel. Toutes ces options sont payantes et demandent plus de travail que Supabase en service géré. Tarifs et garanties changent : à comparer au moment du devis, pas avant.

**Ce qui reste vrai dans tous les cas.** L'architecture d'Atlante se transporte : PostgreSQL, RLS, migrations SQL et moteur de synchro ne dépendent pas de Supabase. Seuls `src/synchro/supabase.ts` et `src/synchro/distantSupabase.ts` seraient à réécrire.

## 9. Sources

- Règlement (UE) 2016/679 (RGPD) : https://eur-lex.europa.eu/eli/reg/2016/679/oj
- CNIL, guide du sous-traitant : https://www.cnil.fr/fr/reglement-europeen-protection-donnees/guide-sous-traitant
- CNIL, le registre des activités de traitement : https://www.cnil.fr/fr/RGDP-le-registre-des-activites-de-traitement
- CNIL, cookies et autres traceurs : https://www.cnil.fr/fr/cookies-et-autres-traceurs
- Commission européenne, clauses contractuelles types, décision (UE) 2021/914 : https://eur-lex.europa.eu/eli/dec_impl/2021/914/oj
- Commission européenne, décision d'adéquation du 10 juillet 2023 (Data Privacy Framework) : https://commission.europa.eu/law/law-topic/data-protection/international-dimension-data-protection/eu-us-data-transfers_fr
- Supabase, DPA : https://supabase.com/legal/dpa

Je n'ai pas pu ouvrir les pages de Supabase ni celles de la CNIL depuis ma session (réseau restreint) : vérifie que ces adresses sont toujours valides.
