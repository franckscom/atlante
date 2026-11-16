// Parcours de bout en bout dans un vrai navigateur (Chromium, via Playwright).
// Lancement : npm run build && npm run test:navigateur
// Supabase n'est PAS contacté : ses réponses sont simulées (succès, puis projet en pause).
const { chromium } = require('playwright');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const URL_APP = 'http://localhost:4173/atlante/';
const captures = process.env.CAPTURES; // dossier facultatif pour des captures d'écran
let etapes = 0;
function ok(condition, libelle) {
  if (!condition) throw new Error('ÉCHEC : ' + libelle);
  etapes++;
  console.log('  ✓ ' + libelle);
}
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');

(async () => {
  const serveur = spawn('npx', ['vite', 'preview', '--port', '4173', '--strictPort'], { stdio: 'ignore', detached: true });
  await new Promise((r) => setTimeout(r, 2500));
  const navigateur = await chromium.launch();
  const erreursConsole = [];
  try {
    const contexte = await navigateur.newContext({ acceptDownloads: true, permissions: ['clipboard-read', 'clipboard-write'], viewport: { width: 1200, height: 900 } });
    // Faux Supabase. modeServeur : 'ok' ou 'pause'.
    let modeServeur = 'ok';
    let rev = 0;
    const recues = [];
    const effacees = [];
    const lignes = new Map();
    await contexte.route('**/*.supabase.co/**', async (route) => {
      const req = route.request();
      const url = req.url();
      if (url.includes('/auth/v1/token')) {
        const exp = Math.floor(Date.now() / 1000) + 3600;
        const jeton = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: 'u-test', exp, role: 'authenticated' })}.signature`;
        return route.fulfill({ json: { access_token: jeton, token_type: 'bearer', expires_in: 3600, expires_at: exp, refresh_token: 'r', user: { id: 'u-test', email: 'test@exemple.fr', aud: 'authenticated', role: 'authenticated' } } });
      }
      if (url.includes('/auth/v1/logout')) return route.fulfill({ status: 204, body: '' });
      if (url.includes('/rest/v1/')) {
        if (modeServeur === 'pause') return route.fulfill({ status: 540, json: { message: 'Project paused' } });
        const table = url.split('/rest/v1/')[1].split('?')[0];
        const idsUrl = decodeURIComponent(url.split('?')[1] || '').match(/[0-9a-f]{8}-[0-9a-f-]{27}/g) || [];
        if (req.method() === 'GET') {
          // « Quels identifiants existent encore ? » : on répond d'après ce que le faux serveur a reçu. Sinon : rien de nouveau.
          return route.fulfill({ json: url.includes('id=in.') ? idsUrl.filter((id) => lignes.has(id)).map((id) => ({ id })) : [] });
        }
        if (req.method() === 'POST') {
          const ligne = { ...JSON.parse(req.postData()), owner_id: 'u-test', rev: ++rev };
          lignes.set(ligne.id, ligne);
          recues.push(table);
          return route.fulfill({ status: 201, json: ligne });
        }
        if (req.method() === 'PATCH') {
          const ligne = { ...lignes.get(idsUrl[0]), ...JSON.parse(req.postData()), id: idsUrl[0], owner_id: 'u-test', rev: ++rev };
          lignes.set(ligne.id, ligne);
          return route.fulfill({ json: [ligne] });
        }
        if (req.method() === 'DELETE') {
          for (const id of idsUrl) lignes.delete(id);
          effacees.push(...idsUrl);
          return route.fulfill({ json: idsUrl.map((id) => ({ id })) });
        }
      }
      return route.fulfill({ status: 404, json: {} });
    });
    const page = await contexte.newPage();
    page.on('console', (m) => m.type() === 'error' && erreursConsole.push(m.text()));
    page.on('pageerror', (e) => erreursConsole.push(String(e)));
    const capture = async (nom) => captures && page.screenshot({ path: path.join(captures, nom + '.png'), fullPage: true });

    console.log('Démarrage');
    await page.goto(URL_APP);
    await page.getByRole('heading', { name: 'Atlante est vide' }).waitFor();
    await page.goto(URL_APP + '#/domaines');
    await page.getByText('Religions').waitFor();
    ok((await page.locator('ul.liste > li').count()) === 14, '14 domaines de départ');
    await capture('01-domaines');

    console.log('Fiches');
    await page.goto(URL_APP + '#/nouvelle?type=personne');
    await page.getByLabel('Nom', { exact: true }).fill('Antonio Gramsci');
    await page.getByLabel('Naissance', { exact: true }).fill('1891');
    await page.getByLabel('Philosophie et pensée critique').check();
    await page.getByLabel('Sociologie').check();
    await page.getByRole('button', { name: 'Créer la fiche' }).click();
    await page.getByRole('heading', { name: 'Antonio Gramsci', level: 1 }).waitFor();
    ok(await page.getByText('Sociologie').isVisible(), 'fiche créée avec deux domaines');
    const urlGramsci = page.url();

    await page.goto(URL_APP + '#/nouvelle?type=oeuvre');
    await page.getByLabel('Titre', { exact: true }).fill('Cahiers de prison');
    await page.getByLabel('Auteur', { exact: true }).fill('Antonio Gramsci');
    await page.getByLabel(/^Date/).fill('1948');
    await page.getByLabel(/^Contenu/).fill("# Thèse\n\nL'**hégémonie** culturelle précède la prise du pouvoir.");
    await page.getByRole('button', { name: 'Créer la fiche' }).click();
    await page.getByRole('heading', { name: 'Cahiers de prison', level: 1 }).waitFor();
    ok(await page.locator('.lecture strong', { hasText: 'hégémonie' }).isVisible(), 'contenu Markdown affiché');

    console.log('Doublons');
    await page.goto(URL_APP + '#/nouvelle?type=oeuvre');
    await page.getByLabel('Titre', { exact: true }).fill('cahiers de prison');
    await page.getByText('Doublon possible').waitFor();
    ok(await page.getByRole('button', { name: 'Créer quand même' }).isVisible(), 'doublon signalé avant création');

    console.log('Affirmation et relation');
    await page.goto(urlGramsci);
    await page.getByRole('button', { name: 'Ajouter une affirmation' }).click();
    await page.getByLabel('Affirmation', { exact: true }).fill('Arrêté en 1926 par le régime fasciste');
    await page.getByLabel(/^Statut/).selectOption('fait');
    await page.getByLabel('Source (fiche existante)').fill('cahiers');
    await page.getByRole('button', { name: /Cahiers de prison/ }).click();
    await page.getByLabel('Page ou section', { exact: true }).fill('préface');
    await page.getByRole('button', { name: 'Ajouter', exact: true }).click();
    await page.getByText('Fait vérifiable').waitFor();
    ok(await page.getByText('Arrêté en 1926 par le régime fasciste').isVisible(), 'affirmation avec statut et source');

    await page.getByRole('button', { name: 'Ajouter une relation' }).click();
    await page.getByLabel('Relation', { exact: true }).selectOption({ label: 'a écrit' });
    await page.getByLabel('Fiche liée', { exact: true }).fill('cahiers');
    await page.getByRole('button', { name: /Cahiers de prison/ }).click();
    await page.getByRole('button', { name: 'Ajouter la relation' }).click();
    await page.locator('section', { hasText: 'Relations' }).getByRole('link', { name: 'Cahiers de prison' }).click();
    await page.getByRole('heading', { name: 'Cahiers de prison', level: 1 }).waitFor();
    ok(await page.getByText('écrit par').isVisible(), 'relation lisible dans l\'autre sens, navigation par la relation');
    await capture('02-fiche');

    console.log('Dossier');
    await page.goto(URL_APP + '#/nouvelle?type=dossier');
    await page.getByLabel('Titre', { exact: true }).fill('Hégémonie culturelle');
    await page.getByRole('button', { name: 'Créer la fiche' }).click();
    await page.getByLabel('Ajouter une fiche au dossier').fill('gram');
    await page.getByRole('button', { name: /Antonio Gramsci/ }).click();
    await page.getByRole('heading', { name: 'Fiches du dossier (1)' }).waitFor();
    ok(true, 'dossier thématique avec une fiche');
    await page.getByRole('button', { name: 'Préparer pour Claude' }).click();
    await page.getByText('Texte copié').waitFor();
    const pressePapiers = await page.evaluate(() => navigator.clipboard.readText());
    ok(pressePapiers.includes('# Hégémonie culturelle (Dossier thématique)') && pressePapiers.includes('[Fait vérifiable] Arrêté en 1926'), '« Préparer pour Claude » copié dans le presse-papiers');

    console.log('Recherche et filtres');
    await page.getByRole('searchbox', { name: 'Rechercher dans les fiches' }).fill('hegemonie');
    await page.getByText('2 résultats').waitFor();
    ok(true, 'recherche plein texte sans accent depuis un autre écran');
    await page.goto(URL_APP + '#/fiches?type=oeuvre&auteur=gramsci');
    await page.getByText('1 résultat').waitFor();
    ok(await page.getByRole('link', { name: 'Cahiers de prison' }).isVisible(), 'filtres combinés');
    await capture('03-liste');

    console.log('Synchro (serveur simulé)');
    await page.goto(URL_APP + '#/reglages');
    await page.getByLabel('Adresse e-mail').fill('test@exemple.fr');
    await page.getByLabel('Mot de passe', { exact: true }).fill('mot-de-passe-de-test');
    await page.getByRole('button', { name: 'Se connecter' }).click();
    await page.getByText('Connecté :').waitFor();
    await page.locator('header .synchro.ok').waitFor({ timeout: 15000 });
    ok(recues.filter((t) => t === 'fiches').length === 3 && recues.includes('relations') && recues.includes('affirmations') && recues.includes('dossier_fiches'), 'toutes les lignes envoyées au serveur, indicateur « Synchronisé »');
    ok(recues.indexOf('domaines') < recues.indexOf('fiches') && recues.indexOf('fiches') < recues.indexOf('relations'), 'ordre d\'envoi respecté');

    modeServeur = 'pause';
    await page.goto(URL_APP + '#/nouvelle?type=note');
    await page.getByLabel('Titre', { exact: true }).fill('Note écrite pendant la pause');
    await page.getByRole('button', { name: 'Créer la fiche' }).click();
    await page.locator('header .synchro.erreur', { hasText: 'Serveur en pause' }).waitFor({ timeout: 15000 });
    await page.goto(URL_APP + '#/reglages');
    await page.getByText('Synchro impossible : serveur en pause ou injoignable').waitFor();
    ok(await page.getByText('Restore project').isVisible(), 'serveur en pause : message et marche à suivre, la note est gardée en local');
    await capture('04-pause');
    modeServeur = 'ok';
    await page.getByRole('button', { name: 'Synchroniser maintenant' }).click();
    await page.locator('header .synchro.ok').waitFor({ timeout: 15000 });
    ok(recues.filter((t) => t === 'fiches').length === 4, 'reprise après la pause : la note en attente est envoyée');

    console.log('Hors ligne');
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.waitForFunction(() => !!navigator.serviceWorker.controller || true);
    await page.reload(); // le service worker contrôle maintenant la page
    await contexte.setOffline(true);
    await page.reload();
    await page.goto(URL_APP + '#/fiches');
    await page.getByRole('link', { name: 'Cahiers de prison' }).waitFor();
    ok(await page.locator('header .synchro', { hasText: 'Hors ligne' }).isVisible(), 'l\'app démarre et affiche les fiches sans réseau');
    await page.goto(URL_APP + '#/nouvelle?type=note');
    await page.getByLabel('Titre', { exact: true }).fill('Note hors ligne');
    await page.getByRole('button', { name: 'Créer la fiche' }).click();
    await page.getByRole('heading', { name: 'Note hors ligne', level: 1 }).waitFor();
    await page.locator('header .synchro').hover();
    ok((await page.locator('header .synchro').getAttribute('title')).includes('1 en attente'), 'écriture hors ligne, modification en attente');
    await contexte.setOffline(false);
    await page.locator('header .synchro.ok').waitFor({ timeout: 15000 });
    ok(true, 'retour en ligne : synchro automatique');

    console.log('Sauvegarde chiffrée');
    const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'atlante-'));
    await page.goto(URL_APP + '#/sauvegarde');
    await page.getByRole('button', { name: 'Créer ma clé de secours' }).click();
    const cle = (await page.locator('.cle-secours').innerText()).trim();
    ok(/^([A-Z2-9]{4}-){7}[A-Z2-9]{4}$/.test(cle), 'clé de secours affichée');
    await page.getByLabel("J'ai imprimé ou recopié ma clé de secours.").check();
    await page.getByRole('button', { name: 'Continuer' }).click();
    await page.locator('#s-mdp').fill('phrase secrete de test');
    await page.getByLabel('Le même, une seconde fois').fill('phrase secrete de test');
    const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Sauvegarder maintenant' }).click()]);
    const fichier = path.join(dossier, dl.suggestedFilename());
    await dl.saveAs(fichier);
    const brut = fs.readFileSync(fichier, 'utf8');
    ok(/^atlante_sauvegarde_\d\d\.\d\d\.\d\d\.atlante$/.test(dl.suggestedFilename()) && !brut.includes('Gramsci') && JSON.parse(brut).format === 'atlante-sauvegarde', 'fichier chiffré téléchargé (contenu illisible en clair)');
    await page.getByText('Dernière sauvegarde :').getByText('il y a 0 jour').waitFor();
    ok(true, 'date de dernière sauvegarde affichée');

    console.log('Exports');
    for (const [bouton, motif] of [['Markdown (une fiche par fichier)', /^atlante_markdown_.*\.zip$/], ['JSON complet', /^atlante_export_.*\.json$/], ['CSV par type', /^atlante_csv_.*\.zip$/]]) {
      const [d] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: bouton }).click()]);
      const f = path.join(dossier, d.suggestedFilename());
      await d.saveAs(f);
      ok(motif.test(d.suggestedFilename()) && fs.statSync(f).size > 200, 'export ' + bouton);
    }

    console.log('Suppression, corbeille, restauration');
    await page.goto(urlGramsci);
    await page.locator('article > .actions button.danger').click();
    await page.getByRole('dialog').getByRole('button', { name: 'Supprimer' }).click();
    await page.getByRole('heading', { name: 'Fiches', level: 1 }).waitFor();
    ok((await page.getByRole('link', { name: 'Antonio Gramsci' }).count()) === 0, 'suppression après confirmation');
    await page.goto(URL_APP + '#/reglages');
    await page.locator('section', { hasText: 'Corbeille' }).getByText('Antonio Gramsci').waitFor();
    ok(true, 'fiche présente dans la corbeille');

    await page.getByRole('button', { name: 'Effacer les données de cet appareil' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Effacer cet appareil' }).click();
    await page.getByText('Données locales effacées.').waitFor();
    await page.goto(URL_APP + '#/fiches');
    await page.getByRole('heading', { name: 'Atlante est vide' }).waitFor();
    ok(true, 'appareil effacé');

    await page.goto(URL_APP + '#/sauvegarde');
    await page.getByLabel('Fichier de sauvegarde (.atlante)').setInputFiles(fichier);
    await page.locator('#r-secret').fill('mauvais mot de passe');
    await page.getByRole('button', { name: "Ouvrir et afficher l'aperçu" }).click();
    await page.getByText('Mot de passe incorrect.').waitFor();
    ok(true, 'mauvais mot de passe refusé');
    await page.getByLabel('Avec la clé de secours').check();
    await page.getByLabel('Clé de secours', { exact: true }).fill(cle.toLowerCase());
    await page.getByRole('button', { name: "Ouvrir et afficher l'aperçu" }).click();
    await page.getByText('Fichier intact et lisible').waitFor();
    await capture('05-apercu-restauration');
    ok((await page.locator('table.simple tbody tr', { hasText: 'Fiches' }).first().locator('td').nth(1).innerText()) === '5', 'aperçu avant restauration (ouverture par la clé de secours)');
    await page.getByRole('button', { name: 'Restaurer…' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Restaurer' }).click();
    await page.getByText('Restauration terminée').waitFor();
    await page.goto(urlGramsci);
    await page.getByRole('heading', { name: 'Antonio Gramsci', level: 1 }).waitFor();
    ok(await page.getByText('Arrêté en 1926 par le régime fasciste').isVisible(), 'restauration complète : fiche, affirmation et relations revenues');

    console.log('Import');
    const md = path.join(dossier, 'note de lecture.md');
    fs.writeFileSync(md, '# Cahiers de prison\n\nTexte importé.');
    const txt = path.join(dossier, 'idee.txt');
    fs.writeFileSync(txt, 'Une idée notée vite.');
    await page.goto(URL_APP + '#/import');
    await page.getByLabel('Fichiers à importer').setInputFiles([md, txt]);
    await page.getByText('Doublon possible').waitFor();
    ok(await page.getByRole('button', { name: 'Créer 1 fiche' }).isVisible(), 'import : doublon détecté et non coché d\'office');
    await page.getByRole('button', { name: 'Créer 1 fiche' }).click();
    await page.getByText('1 fiche créée').waitFor();
    await page.getByRole('link', { name: 'idee' }).click();
    await page.getByText('Fichier importé : idee.txt').waitFor();
    ok(true, 'import : fiche créée avec provenance');

    console.log('Vider la corbeille');
    await page.goto(URL_APP + '#/fiches?q=idee');
    await page.getByRole('link', { name: 'idee' }).click();
    await page.locator('article > .actions button.danger').click();
    await page.getByRole('dialog').getByRole('button', { name: 'Supprimer' }).click();
    await page.getByRole('heading', { name: 'Fiches', level: 1 }).waitFor();
    await page.goto(URL_APP + '#/reglages');
    await page.getByLabel('Adresse e-mail').fill('test@exemple.fr');
    await page.getByLabel('Mot de passe', { exact: true }).fill('mot-de-passe-de-test');
    await page.getByRole('button', { name: 'Se connecter' }).click();
    await page.locator('header .synchro.ok').waitFor({ timeout: 15000 });
    const corbeille = page.locator('section', { hasText: 'Corbeille' });
    await corbeille.getByText('idee').waitFor();
    await corbeille.getByRole('button', { name: 'Vider la corbeille…' }).click();
    await corbeille.getByText('Étape 1 sur 2').waitFor();
    ok(await corbeille.getByRole('link', { name: 'Aller à Sauvegarde et exports' }).isVisible(), 'vider la corbeille : export proposé avant');
    await corbeille.getByRole('button', { name: 'Continuer sans exporter' }).click();
    const boutonVider = corbeille.getByRole('button', { name: 'Vider définitivement la corbeille' });
    ok(await boutonVider.isDisabled(), 'vider la corbeille : seconde confirmation exigée');
    await corbeille.getByLabel('Écris VIDER en majuscules').fill('VIDER');
    await boutonVider.click();
    await corbeille.getByText('définitivement du serveur et de cet appareil').waitFor();
    await corbeille.getByText('La corbeille est vide.').waitFor();
    const restes = await page.evaluate(() => new Promise((res) => {
      const o = indexedDB.open('atlante');
      o.onsuccess = () => { const r = o.result.transaction('fiches').objectStore('fiches').getAll(); r.onsuccess = () => res(r.result.filter((f) => f.deleted_at || f.titre === 'idee').length); };
    }));
    ok(restes === 0 && effacees.length > 0, 'corbeille vidée : lignes effacées de la base locale et demande d\'effacement envoyée au serveur');
    await page.goto(URL_APP + '#/fiches');
    await page.getByRole('link', { name: 'Cahiers de prison' }).first().waitFor();
    ok(true, 'les fiches vivantes sont toujours là');

    console.log('Téléphone et mode sombre');
    const mobile = await navigateur.newContext({ viewport: { width: 390, height: 844 }, colorScheme: 'dark', storageState: await contexte.storageState() });
    await mobile.route('**/*.supabase.co/**', (r) => r.abort());
    const pm = await mobile.newPage();
    await pm.goto(URL_APP + '#/domaines');
    await pm.getByText('Religions').waitFor();
    const deborde = await pm.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    ok(!deborde, 'pas de défilement horizontal à 390 px');
    ok((await pm.evaluate(() => getComputedStyle(document.body).backgroundColor)) === 'rgb(22, 23, 26)', 'mode sombre appliqué');
    if (captures) await pm.screenshot({ path: path.join(captures, '06-mobile-sombre.png'), fullPage: true });

    const graves = erreursConsole.filter((e) => !/Failed to load resource|net::ERR|supabase|AuthRetryableFetchError|fetch/i.test(e));
    ok(graves.length === 0, 'aucune erreur JavaScript' + (graves.length ? ' : ' + graves.join(' | ') : ''));
    console.log(`\nParcours réussi : ${etapes} vérifications.`);
  } finally {
    await navigateur.close();
    try { process.kill(-serveur.pid); } catch {}
  }
})().catch((e) => {
  console.error('\n' + e.message);
  process.exit(1);
});
